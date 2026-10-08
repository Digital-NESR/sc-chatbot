-- =====================================================================
-- track schema, second wave: the six new sources.
--
-- Registered in core.view_defs like the others, so publish_all rebuilds
-- them after every load. Edit HERE, never with a bare CREATE VIEW.
-- See db/README.md.
-- =====================================================================

INSERT INTO core.view_defs (view_name, apply_order, create_sql, note) VALUES

('goods_receipt', 15, $v$
CREATE VIEW track.goods_receipt AS
SELECT
  g.purchase_order                        AS po_number,
  g.purchase_order_item                   AS po_item,
  g.purchase_order || '-' || g.purchase_order_item AS po_line_key,
  g.posting_date,
  g.gr_entry_date,
  g.movement_type,
  g.reversed_gr,
  (g.reversed_gr = 'Reversed')            AS is_reversal,
  g.total_quantity                        AS gross_qty,
  g.received_reversed                     AS net_qty,
  g.plant,
  g.loaded_at
FROM core.gr_data g
$v$, 'One row per goods receipt EVENT, attributed to a PO line. Partial deliveries appear individually; reversals are explicit.'),

('pr_waiting_with', 90, $v$
CREATE VIEW track.pr_waiting_with AS
SELECT
  r.pr_number,
  r.pr_line_number                        AS pr_item,
  r.pr_type,
  r.requester,
  r.full_name                             AS requester_name,
  r.with_whom                             AS waiting_with,
  r.pr_submission                         AS submitted_on,
  r.pr_release_date                       AS last_approved_on,
  r.days_since_pr_submission              AS days_waiting,
  r.days_since_last_release                AS days_since_last_step,
  r.material_group,
  r.plant,
  r.company_code,
  r.country,
  r.segment,
  r.loaded_at
FROM core.pr_release r
WHERE coalesce(r.deletion_indicator,'') = ''
$v$, 'Requisitions still awaiting approval and the approver holding them. waiting_with is an employee id.'),

('po_waiting_with', 91, $v$
CREATE VIEW track.po_waiting_with AS
SELECT
  r.po_number,
  r.po_line_number                        AS po_item,
  r.pr_number,
  r.pr_line_number                        AS pr_item,
  r.po_type,
  r.buyer,
  r.full_name                             AS buyer_name,
  r.with_whom                             AS waiting_with,
  r.po_creation_date                      AS created_on,
  r.po_submission_date                    AS submitted_on,
  r.po_release_date                       AS last_approved_on,
  r.po_days_since_creation                AS days_waiting,
  r.po_days_since_last_release            AS days_since_last_step,
  r.item_category,
  r.material_group,
  r.plant,
  r.company_code,
  r.country,
  r.segment,
  r.loaded_at
FROM core.po_release r
WHERE coalesce(r.deletion_indicator,'') = ''
$v$, 'Purchase orders still awaiting approval and the approver holding them. waiting_with is an employee id.'),

('invoice', 92, $v$
CREATE VIEW track.invoice AS
SELECT
  a.purchasing_document                   AS po_number,
  a.document_number                       AS invoice_doc,
  a.invoice_ref,
  a.document_type,
  a.document_type_description,
  a.vendor,
  a.vendor_name,
  a.posting_date,
  a.document_date,
  a.baseline_date,
  a.due_on,
  a.payment_term,
  a.transaction_currency                  AS currency,
  a.invoice_amount,
  a.payment_amount,
  a.invoice_balance,
  -- invoice_balance is the column that answers "has it been paid".
  CASE
    WHEN coalesce(a.invoice_balance, 0) = 0                          THEN 'Paid'
    WHEN coalesce(a.payment_amount, 0) <> 0                          THEN 'Partially paid'
    WHEN a.due_on IS NOT NULL AND a.due_on < CURRENT_DATE            THEN 'Overdue'
    ELSE 'Open'
  END                                     AS payment_state,
  a.duedate_agingdays                     AS days_past_due,
  a.baseline_agingdays,
  a.payable_category,
  a.company_code,
  a.country,
  a.segment,
  a.loaded_at
FROM core.ap_aging a
$v$, 'Supplier invoices against a purchase order, with a resolved payment state. Loaded PO-linked only.'),

('grir_open', 93, $v$
CREATE VIEW track.grir_open AS
SELECT
  g.purchasing_doc                        AS po_number,
  g.item                                  AS po_item,
  g.document_number,
  g.fiscal_year,
  g.document_type,
  g.document_type_desc,
  g.posting_date,
  g.document_date,
  g.vendor,
  g.vendor_creditor_name                  AS vendor_name,
  g.amnt_in_bal_tr_crcy                   AS amount,
  g.transaction_currency                  AS currency,
  g.aging_buckets                         AS age_days,
  g.aging_groups                          AS age_band,
  g.plant_code                            AS plant,
  g.company_code,
  g.country,
  g.loaded_at
FROM core.ub_grir g
$v$, 'Open GR/IR items: received but not invoiced, or invoiced but not received. Cleared entries are not loaded at all.'),

('in_transit', 94, $v$
CREATE VIEW track.in_transit AS
SELECT
  z.purchasing_document                   AS po_number,
  z.item                                  AS po_item,
  z.purchasing_document || '-' || z.item  AS po_line_key,
  z.material,
  z.material_description,
  z.supplier,
  z.supplier_name,
  z.status                                AS delivery_status,
  z.delivery_completed,
  z.order_quantity,
  z.fully_delivered_quantity              AS received_qty,
  z.intransit_quantity,
  z.intransit_amount,
  z.not_collected_quantity,
  z.not_collected_amount,
  z.plant,
  z.plant_name,
  z.company_code,
  z.country_name,
  z.loaded_at
FROM core.zmb5oa z
$v$, 'Open purchase order lines with the only in-transit quantity the platform has. NOT shipment tracking - no AWB, container or bill of lading exists anywhere.'),

('approval_chain', 95, $v$
CREATE VIEW track.approval_chain AS
SELECT
  s.release_group,
  s.release_strategy,
  s.release_code                          AS approval_step,
  s.approver,
  s.email                                 AS approver_email,
  s.min_value,
  s.max_value,
  s.document_type,
  s.plant,
  s.purchasing_group,
  s.loaded_at
FROM core.release_strategy s
$v$, 'Who approves which step of which release strategy, and between what values. approver_email is personal data - use for one document, never in bulk.')

ON CONFLICT (view_name) DO UPDATE SET
  apply_order = EXCLUDED.apply_order,
  create_sql  = EXCLUDED.create_sql,
  note        = EXCLUDED.note;

-- ---------------------------------------------------------------------
-- request_lifecycle gains "who is it sitting with". That is the question
-- the agent is asked most often and it was previously unanswerable.
-- Both joins are against small tables - 33,743 and 4,647 rows - so they
-- are cheap hash joins, not a repeat of the LATERAL mistake.
-- ---------------------------------------------------------------------
-- apply_order moved past the two waiting_with views it now depends on.
-- rebuild_track_views creates in ascending order, so a dependency must sort
-- BEFORE its dependant or the create fails - which is exactly what happened
-- on the first attempt, caught and logged rather than aborting the load.
UPDATE core.view_defs SET apply_order = 100 WHERE view_name = 'request_lifecycle';

UPDATE core.view_defs SET create_sql = $v$
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
  -- Who is holding it right now, from the under-release tables. NULL once
  -- a document is signed, which is correct: nobody is holding it.
  prw.waiting_with                       AS pr_waiting_with,
  prw.days_waiting                       AS pr_days_waiting,
  pow.waiting_with                       AS po_waiting_with,
  pow.days_waiting                       AS po_days_waiting,
  coalesce(pow.waiting_with, prw.waiting_with) AS waiting_with,
  CASE
    WHEN pr.is_deleted OR pr.is_closed              THEN 'Cancelled or closed'
    WHEN po.po_numbers IS NULL                      THEN
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
LEFT JOIN (
  SELECT pr_number, min(waiting_with) waiting_with, max(days_waiting) days_waiting
  FROM track.pr_waiting_with GROUP BY pr_number
) prw ON prw.pr_number = pr.pr_number
LEFT JOIN (
  SELECT pr_number, min(waiting_with) waiting_with, max(days_waiting) days_waiting
  FROM track.po_waiting_with WHERE pr_number IS NOT NULL GROUP BY pr_number
) pow ON pow.pr_number = pr.pr_number
$v$
WHERE view_name = 'request_lifecycle';

SELECT core.rebuild_track_views() AS views_rebuilt;
