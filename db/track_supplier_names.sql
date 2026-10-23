-- =====================================================================
-- Supplier NAMES on the purchase order views.
--
-- WHY
-- po_line carried supplier_num and no name, so "the last thing we
-- ordered from DHL" could not be answered by matching a name against
-- purchase orders at all. The agent had to guess a supplier code, and on
-- 23 Oct it guessed 0001100283 - Kardisi Co., a machine shop - and
-- reported it as DHL.
--
-- Worse, "DHL" is not one code. There are at least seven, including DHL
-- GLOBAL FORWARDING entries for Abu Dhabi, Kuwait and Algeria. Any
-- answer built on a single guessed code is narrower than the question,
-- which is also why an earlier round marked that question as passing.
--
-- THE SOURCE
-- Names exist on three loaded tables and nowhere else. 4,240 of the
-- 4,378 suppliers appearing on purchase orders can be named from them.
-- ap_aging is preferred because it is 100% populated; zmb5oa next; then
-- ub_grir, which is 89% populated.
--
-- ORDERING: this view reads core tables, NOT the track views that expose
-- the same data, so it can sit at apply_order 5 and be available to
-- po_line at 20. Reading track.invoice (92) would be a dependency cycle.
-- =====================================================================

INSERT INTO core.view_defs (view_name, apply_order, create_sql, note) VALUES
('supplier_directory', 5, $v$
CREATE VIEW track.supplier_directory AS
SELECT DISTINCT ON (code) code, name
FROM (
  SELECT vendor   AS code, vendor_name          AS name, 1 AS pref FROM core.ap_aging
  UNION ALL
  SELECT supplier AS code, supplier_name        AS name, 2 AS pref FROM core.zmb5oa
  UNION ALL
  SELECT vendor   AS code, vendor_creditor_name AS name, 3 AS pref FROM core.ub_grir
) s
WHERE coalesce(code, '') <> '' AND coalesce(name, '') <> ''
ORDER BY code, pref
$v$, 'SAP supplier code to readable name, assembled from the three sources that carry a name. One row per code. Covers 4,240 of the 4,378 suppliers on purchase orders.')
ON CONFLICT (view_name) DO UPDATE SET
  apply_order = EXCLUDED.apply_order,
  create_sql  = EXCLUDED.create_sql,
  note        = EXCLUDED.note;

-- ---------------------------------------------------------------------
-- po_line gains supplier_name. The three views built on SELECT * FROM
-- po_line - po_draft, po_pending_release, po_open - inherit it for free,
-- and so does request_lifecycle, which aggregates po_line.
--
-- Patched by rewriting the STORED definition rather than retyping it, so
-- this cannot silently revert an edit made since. db/track_schema.sql
-- has been stale before and reintroduced a fixed bug that way.
-- ---------------------------------------------------------------------
DO $patch$
DECLARE sql text;
BEGIN
  SELECT create_sql INTO sql FROM core.view_defs WHERE view_name = 'po_line';

  IF sql IS NULL THEN
    RAISE EXCEPTION 'po_line is not registered in core.view_defs';
  END IF;

  IF position('supplier_name' IN sql) > 0 THEN
    RAISE NOTICE 'po_line already has supplier_name, nothing to do';
    RETURN;
  END IF;

  -- Name sits straight after the code it resolves.
  sql := replace(sql,
    '  sc.supplier_num,',
    '  sc.supplier_num,' || chr(10) ||
    '  sd.name                                        AS supplier_name,');

  sql := replace(sql,
    'FROM core.supplychain sc',
    'FROM core.supplychain sc' || chr(10) ||
    'LEFT JOIN track.supplier_directory sd ON sd.code = sc.supplier_num');

  IF position('supplier_name' IN sql) = 0 THEN
    RAISE EXCEPTION 'patch did not apply: po_line did not contain the expected supplier_num line';
  END IF;

  UPDATE core.view_defs SET create_sql = sql WHERE view_name = 'po_line';
END
$patch$;

SELECT core.rebuild_track_views() AS views_rebuilt;
