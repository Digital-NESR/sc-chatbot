-- =====================================================================
-- track schema - the Track My Request agent's view of the data.
--
-- WHY THIS EXISTS
-- The raw tables in core.* are shared with Materials AI. Pointing two
-- agents at the same table names is how an orchestrator gets confused:
-- both agents claim the same objects and the router has nothing to tell
-- them apart. So Track My Request never sees core.*. It sees track.*,
-- which exposes request lifecycle concepts (open PR, draft PO, receipt
-- state) under names Materials AI has no reason to touch.
--
-- One copy of the data, two vocabularies.
--
-- THE TRAP THIS FILE WORKS AROUND
-- core.publish_all() runs "DROP TABLE IF EXISTS core.<t>" with no
-- CASCADE when a table loads in full mode. A view sitting on that table
-- makes the DROP fail, which fails the nightly load. supplychain and
-- purchase_requisation are incremental today and so merge rather than
-- swap, but a forced full reload (p_full) still swaps them, and that is
-- exactly the recovery path we rely on.
--
-- So the views are not created by hand. They are registered in
-- core.view_defs and rebuilt as part of the load, the same way indexes
-- and column comments already are. Edit them HERE, never with a bare
-- CREATE VIEW, or the next full load will revert you.
-- =====================================================================

CREATE SCHEMA IF NOT EXISTS track;

CREATE TABLE IF NOT EXISTS core.view_defs (
  view_name   text PRIMARY KEY,
  apply_order int  NOT NULL DEFAULT 100,
  create_sql  text NOT NULL,
  note        text
);

COMMENT ON TABLE core.view_defs IS
  'Definitions of the track.* views. Replayed by core.rebuild_track_views() after every publish, because a full swap drops anything depending on a core table.';

-- Dropped in reverse dependency order; CASCADE covers views built on views.
CREATE OR REPLACE FUNCTION core.drop_track_views() RETURNS int
LANGUAGE plpgsql AS $fn$
DECLARE r record; n int := 0;
BEGIN
  FOR r IN SELECT view_name FROM core.view_defs ORDER BY apply_order DESC LOOP
    EXECUTE format('DROP VIEW IF EXISTS track.%I CASCADE', r.view_name);
    n := n + 1;
  END LOOP;
  RETURN n;
END $fn$;

CREATE OR REPLACE FUNCTION core.rebuild_track_views() RETURNS int
LANGUAGE plpgsql AS $fn$
DECLARE r record; n int := 0;
BEGIN
  FOR r IN SELECT view_name, create_sql FROM core.view_defs ORDER BY apply_order LOOP
    BEGIN
      -- Dropped immediately before its own create, ascending, so this is
      -- safe to run whether or not the views are already there. CASCADE
      -- is harmless in this order: a view's dependents always sort after
      -- it and so have not been rebuilt yet.
      EXECUTE format('DROP VIEW IF EXISTS track.%I CASCADE', r.view_name);
      EXECUTE r.create_sql;
      n := n + 1;
    EXCEPTION WHEN OTHERS THEN
      -- A broken view must never abort a data load. Record and carry on;
      -- load_log is where the loader already reports per-table status.
      INSERT INTO core.load_log(table_name, rows_staged, rows_expected, status, finished_at)
        VALUES ('track.' || r.view_name, NULL, NULL, 'VIEW FAILED: ' || SQLERRM, now());
    END;
  END LOOP;
  RETURN n;
END $fn$;

-- ---------------------------------------------------------------------
-- View definitions
-- ---------------------------------------------------------------------
DELETE FROM core.view_defs;

INSERT INTO core.view_defs (view_name, apply_order, create_sql, note) VALUES

('pr_line', 10, $v$
CREATE VIEW track.pr_line AS
SELECT
  pr.purchase_requisition                                   AS pr_number,
  pr.item_of_requisition                                    AS pr_item,
  pr.purchase_requisition || '-' || pr.item_of_requisition  AS pr_line_key,
  pr.material,
  pr.short_text                                             AS description,
  pr.plant,
  pr.material_group,
  pr.item_category,
  pr.quantity                                               AS qty_requested,
  pr.quantity_ordered                                       AS qty_on_po,
  pr.unit_of_measure,
  pr.requisitioner,
  pr.created_by,
  pr.requisition_date,
  pr.delivery_date                                          AS requested_delivery_date,
  pr.purchasing_group,
  pr.purchasing_group_description,
  pr.fixed_vendor,
  pr.desired_vendor,
  -- SAP EBAN processing status. Self-validating: every 'N' line has
  -- quantity_ordered = 0 and every 'B' line carries a PO reference.
  CASE pr.processing_status
    WHEN 'N' THEN 'Open'
    WHEN 'B' THEN 'Converted to PO'
    WHEN 'A' THEN 'RFQ created'
    ELSE 'Unknown'
  END                                                       AS conversion_state,
  -- release_date is populated on EVERY row and is NOT an approval flag.
  -- pr_release_date_final is: present on 100% of fully-approved lines
  -- and on under 1% of lines with no release status at all.
  CASE
    WHEN pr.pr_release_date_final IS NOT NULL      THEN 'Fully Released'
    WHEN coalesce(pr.release_status, '') <> ''     THEN 'Under Release'
    ELSE 'Not Submitted'
  END                                                       AS release_state,
  pr.release_status,
  pr.release_strategy,
  pr.pr_release_date_final                                  AS fully_released_on,
  coalesce(pr.deletion_indicator, '') <> ''                 AS is_deleted,
  coalesce(pr.closed, '') <> ''                             AS is_closed,
  (CURRENT_DATE - pr.requisition_date::date)                AS age_days,
  pr.purchase_order_date,
  pr.loaded_at
FROM core.purchase_requisation pr
$v$, 'One row per purchase requisition line, with conversion and release state resolved.'),

('po_line', 20, $v$
CREATE VIEW track.po_line AS
SELECT
  sc.purchase_doc                                AS po_number,
  sc.item                                        AS po_item,
  sc.purchase_doc || '-' || sc.item              AS po_line_key,
  nullif(sc.purchase_req, '')                    AS pr_number,
  sc.material,
  sc.short_text                                  AS description,
  sc.material_desc,
  sc.plant,
  sc.plant_desc,
  sc.mat_group,
  sc.supplier_num,
  sc.supplier_country,
  sc.pu_doc_type,
  sc.item_cat,
  sc.order_qty,
  sc.delv_qty                                    AS received_qty,
  sc.still_delv_qty                              AS outstanding_qty,
  sc.invoiced_qty,
  sc.still_inv_qty                               AS uninvoiced_qty,
  sc.order_unit,
  sc.net_order_value,
  sc.net_order_val_usd,
  sc.currency,
  sc.created_on                                  AS po_created_on,
  sc.document_date,
  sc.delv_date                                   AS delivery_date,
  sc.supplier_promise_date,
  sc.statistical_delv_date,
  sc.gr_posting_date,
  sc.gr_document_date,
  sc.last_migo,
  sc.inco1,
  sc.incoterms_text,
  -- Three release states, grounded in the data: blank status carries no
  -- release indicator at all (never entered a strategy) = Draft;
  -- 'Not Approved'/frgke B is in a strategy but unapproved = Under
  -- Release; 'Approved'/frgke G has a release date on 99.99% of lines.
  CASE
    WHEN coalesce(sc.status, '') = ''  THEN 'Draft'
    WHEN sc.status = 'Not Approved'    THEN 'Under Release'
    WHEN sc.status = 'Approved'        THEN 'Released'
    ELSE sc.status
  END                                            AS release_state,
  sc.status                                      AS raw_status,
  sc.frgke,
  sc.count_release,
  sc.po_first_release_date,
  sc.po_release_date,
  -- Outstanding quantity decides, NOT delivered quantity. 338k lines are
  -- item category 9 service lines: ordered qty 1, delivered qty 0, nothing
  -- outstanding, and a GR posting date on 96% of them. Receipt there is a
  -- service entry sheet, not a quantity. Judging by delv_qty alone labels
  -- every one of them "awaiting receipt" when they are finished.
  CASE
    WHEN coalesce(sc.still_delv_qty, 0) > 0
     AND coalesce(sc.delv_qty, 0)       > 0 THEN 'Partially Received'
    WHEN coalesce(sc.still_delv_qty, 0) > 0 THEN 'Awaiting Receipt'
    WHEN coalesce(sc.delv_qty, 0)       > 0
      OR sc.gr_posting_date IS NOT NULL     THEN 'Fully Received'
    ELSE 'Closed, nothing received'
  END                                            AS receipt_state,
  -- Quantities on these lines are not comparable with material lines.
  (sc.item_cat = '9')                            AS is_service_line,
  coalesce(sc.deletion_indicator, '') <> ''      AS is_deleted,
  (CURRENT_DATE - sc.created_on::date)           AS age_days,
  sc.loaded_at
FROM core.supplychain sc
$v$, 'One row per purchase order line, with release and receipt state resolved.'),

('open_pr', 30, $v$
CREATE VIEW track.open_pr AS
SELECT * FROM track.pr_line
WHERE conversion_state = 'Open'
  AND NOT is_deleted
  AND NOT is_closed
$v$, 'Requisition lines not yet converted to a purchase order, excluding deleted and closed.'),

('pr_pending_release', 40, $v$
CREATE VIEW track.pr_pending_release AS
SELECT * FROM track.pr_line
WHERE release_state <> 'Fully Released'
  AND NOT is_deleted
  AND NOT is_closed
$v$, 'Requisition lines still awaiting final approval.'),

('po_draft', 50, $v$
CREATE VIEW track.po_draft AS
SELECT * FROM track.po_line
WHERE release_state = 'Draft'
  AND NOT is_deleted
$v$, 'Purchase orders created but never submitted for approval.'),

('po_pending_release', 60, $v$
CREATE VIEW track.po_pending_release AS
SELECT * FROM track.po_line
WHERE release_state = 'Under Release'
  AND NOT is_deleted
$v$, 'Purchase orders submitted for approval but not yet fully released.'),

('po_open', 70, $v$
CREATE VIEW track.po_open AS
SELECT * FROM track.po_line
WHERE release_state = 'Released'
  AND coalesce(outstanding_qty, 0) > 0
  AND NOT is_deleted
$v$, 'Released purchase orders with quantity still to be delivered.'),

('request_lifecycle', 80, $v$
CREATE VIEW track.request_lifecycle AS
SELECT
  pr.pr_number,
  pr.pr_item,
  pr.pr_line_key,
  pr.material,
  pr.description,
  pr.plant,
  pr.requisitioner,
  pr.requisition_date,
  pr.qty_requested,
  pr.conversion_state,
  pr.release_state                       AS pr_release_state,
  pr.fully_released_on                   AS pr_released_on,
  pr.age_days                            AS pr_age_days,
  po.po_numbers,
  po.po_line_count,
  po.po_created_on,
  po.po_release_state,
  po.suppliers,
  po.order_qty,
  po.received_qty,
  po.outstanding_qty,
  po.receipt_state,
  po.earliest_delivery_date,
  po.latest_gr_posting_date,
  CASE
    WHEN pr.is_deleted OR pr.is_closed           THEN 'Cancelled or closed'
    WHEN po.po_numbers IS NULL                   THEN
      CASE WHEN pr.release_state = 'Fully Released'
           THEN 'PR approved, awaiting PO'
           ELSE 'PR awaiting approval' END
    WHEN po.po_release_state = 'Draft'              THEN 'PO drafted, not submitted'
    WHEN po.po_release_state = 'Under Release'      THEN 'PO awaiting approval'
    WHEN po.receipt_state = 'Fully Received'        THEN 'Received'
    WHEN po.receipt_state = 'Partially Received'    THEN 'Partially received'
    WHEN po.receipt_state = 'Closed, nothing received' THEN 'Closed without receipt'
    ELSE 'On order, awaiting delivery'
  END                                    AS overall_stage
FROM track.pr_line pr
-- Grouped once and hash-joined, NOT a correlated LATERAL. As a LATERAL
-- this re-probed supplychain for all 744k requisition lines: a single
-- PR lookup took ~3s and a whole-table aggregate did not finish in nine
-- minutes. Aggregating first costs one pass and the planner still pushes
-- a pr_number predicate down into the group, so point lookups stay fast.
LEFT JOIN (
  SELECT
    p.pr_number,
    string_agg(DISTINCT p.po_number, ', ')    AS po_numbers,
    count(*)::int                             AS po_line_count,
    min(p.po_created_on)                      AS po_created_on,
    min(p.delivery_date)                      AS earliest_delivery_date,
    max(p.gr_posting_date)                    AS latest_gr_posting_date,
    string_agg(DISTINCT p.supplier_num, ', ') AS suppliers,
    sum(p.order_qty)                          AS order_qty,
    sum(p.received_qty)                       AS received_qty,
    sum(p.outstanding_qty)                    AS outstanding_qty,
    -- Worst state wins: one unapproved line holds up the whole request.
    CASE
      WHEN bool_or(p.release_state = 'Draft')         THEN 'Draft'
      WHEN bool_or(p.release_state = 'Under Release') THEN 'Under Release'
      ELSE 'Released'
    END                                       AS po_release_state,
    CASE
      WHEN sum(coalesce(p.outstanding_qty, 0)) > 0
       AND sum(coalesce(p.received_qty, 0))    > 0 THEN 'Partially Received'
      WHEN sum(coalesce(p.outstanding_qty, 0)) > 0 THEN 'Awaiting Receipt'
      WHEN sum(coalesce(p.received_qty, 0))    > 0
        OR max(p.gr_posting_date) IS NOT NULL      THEN 'Fully Received'
      ELSE 'Closed, nothing received'
    END                                       AS receipt_state
  FROM track.po_line p
  WHERE NOT p.is_deleted
    AND p.pr_number IS NOT NULL
  GROUP BY p.pr_number
) po ON po.pr_number = pr.pr_number
$v$, 'End-to-end: one row per requisition line with its purchase orders and receipt progress rolled up.');

-- ---------------------------------------------------------------------
-- The lifecycle join needs this index; without it the LATERAL degrades
-- to a sequential scan of supplychain per requisition line.
-- Registered in index_defs so build_indexes recreates it after a swap.
-- ---------------------------------------------------------------------
UPDATE core.load_config
   SET index_defs = (
         SELECT array_agg(DISTINCT d ORDER BY d)
         FROM unnest(coalesce(index_defs, ARRAY[]::text[]) || ARRAY['(purchase_req)']) AS d)
 WHERE pg_table = 'supplychain';

CREATE INDEX IF NOT EXISTS supplychain_purchase_req_idx ON core.supplychain (purchase_req);

-- ---------------------------------------------------------------------
-- Make the loader view-aware.
--
-- Identical to the definition in schema.sql except for the two PERFORM
-- calls marked below. Views are torn down before any table is touched
-- and rebuilt once every table has been published, so a full swap can
-- neither fail on a dependency nor leave the views behind.
--
-- Unconditional on purpose: deciding per-table which views depend on
-- what is exactly the kind of bookkeeping that rots. Recreating eight
-- views costs milliseconds.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION core.publish_all(p_expected jsonb, p_tables text[] DEFAULT NULL::text[], p_full text[] DEFAULT NULL::text[])
 RETURNS TABLE(tbl text, staged bigint, expected bigint, action text)
 LANGUAGE plpgsql
AS $function$
DECLARE
  r record; n bigint; e bigint; ix int; cm int; is_full boolean;
  j text; nullchk text; has_null boolean; del bigint;
BEGIN
  PERFORM core.drop_track_views();   -- <<< added: views block an uncascaded DROP

  FOR r IN SELECT lc.pg_table AS t, coalesce(lc.load_mode,'full') AS mode, lc.key_cols
           FROM core.load_config lc
           WHERE lc.enabled AND (p_tables IS NULL OR lc.pg_table = ANY(p_tables))
           ORDER BY lc.load_order LOOP
    tbl := r.t;
    e := (p_expected ->> r.t)::bigint;
    expected := e;
    is_full := r.mode = 'full' OR (p_full IS NOT NULL AND r.t = ANY(p_full));

    IF to_regclass('core_stg.' || quote_ident(r.t)) IS NULL THEN
      staged := NULL; action := 'no staging table';
    ELSE
      EXECUTE format('SELECT count(*) FROM core_stg.%I', r.t) INTO n;
      staged := n;

      IF e IS NULL THEN
        action := 'no expected count';
      ELSIF n <> e THEN
        action := 'SKIPPED count mismatch';
      ELSIF is_full AND n = 0 THEN
        action := 'SKIPPED empty staging';
      ELSIF is_full THEN
        -- Indexes and comments are both built on the clone BEFORE it is moved
        -- into place, because neither survives CREATE TABLE ... LIKE.
        ix := core.build_indexes('core_stg', r.t);
        cm := core.apply_comments('core_stg', r.t);
        EXECUTE format('DROP TABLE IF EXISTS core.%I', r.t);
        EXECUTE format('ALTER TABLE core_stg.%I SET SCHEMA core', r.t);
        action := 'swapped (' || ix || ' indexes, ' || cm || ' comments)';
      ELSIF r.key_cols IS NULL THEN
        action := 'SKIPPED incremental without key_cols';
      ELSE
        -- Plain equality so the DELETE can use the key index. IS NOT DISTINCT
        -- FROM is NULL-safe but not indexable, and turned this into a hash
        -- join that spilled to temp files.
        SELECT string_agg(format('%I IS NULL', k), ' OR ')
          INTO nullchk FROM unnest(r.key_cols) AS k;
        EXECUTE format('SELECT EXISTS(SELECT 1 FROM core_stg.%I WHERE %s)', r.t, nullchk)
          INTO has_null;

        IF has_null THEN
          SELECT string_agg(format('t.%I IS NOT DISTINCT FROM s.%I', k, k), ' AND ')
            INTO j FROM unnest(r.key_cols) AS k;
        ELSE
          SELECT string_agg(format('t.%I = s.%I', k, k), ' AND ')
            INTO j FROM unnest(r.key_cols) AS k;
        END IF;

        EXECUTE format('DELETE FROM core.%I t USING core_stg.%I s WHERE %s', r.t, r.t, j);
        GET DIAGNOSTICS del = ROW_COUNT;
        EXECUTE format('INSERT INTO core.%I SELECT * FROM core_stg.%I', r.t, r.t);
        EXECUTE format('DROP TABLE core_stg.%I', r.t);
        -- The live table object survives a merge, so its comments do too; this
        -- only re-asserts them in case the stored descriptions changed.
        cm := core.apply_comments('core', r.t);
        action := 'merged (' || n || ' in, ' || del || ' replaced, +' || (n - del) || ' new'
                  || CASE WHEN has_null THEN ', null-safe join' ELSE '' END || ')';
      END IF;
    END IF;

    INSERT INTO core.load_log(table_name, rows_staged, rows_expected, status, finished_at)
      VALUES (r.t, staged, e, action, now());
    RETURN NEXT;
  END LOOP;

  PERFORM core.rebuild_track_views();  -- <<< added: put them back
END $function$;

SELECT core.rebuild_track_views() AS views_created;
