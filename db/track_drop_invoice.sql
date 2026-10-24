-- Track My Request: remove invoice and GRIR from the agent's reach.
--
-- The invoice data is not trustworthy. Invoices are not logged properly in
-- SAP, so anything derived from them - payment state, days past due, amounts
-- outstanding, and the whole GR/IR matching half - reads as fact while being
-- wrong. A wrong payment status is worse than no payment status, because
-- nobody goes and checks a confident answer.
--
-- So the tracked lifecycle now ENDS AT THE GOODS RECEIPT. PR -> approval ->
-- PO -> approval -> GRN. Nothing after that.
--
-- This drops the two views and the two PO columns that carried it. It does NOT
-- touch core.ap_aging or core.ub_grir: the raw tables stay loaded, because the
-- data is still wanted for analysis later and because supplier_directory reads
-- vendor NAMES (not amounts) from them. Only the agent's view of it goes.
--
-- Idempotent. Safe to run more than once.

BEGIN;

-- ── 1. The two views leave the rebuild entirely ──────────────────────────────
DELETE FROM core.view_defs WHERE view_name IN ('invoice', 'grir_open');

DROP VIEW IF EXISTS track.invoice   CASCADE;
DROP VIEW IF EXISTS track.grir_open CASCADE;

-- ── 2. po_line loses its two invoice quantity columns ────────────────────────
--
-- Patched by rewriting the SQL stored in view_defs rather than retyping the
-- view, so the rest of a long definition cannot drift while this one change is
-- made. po_draft, po_open and po_pending_release are SELECT * over po_line, so
-- they lose the columns with it.
DO $patch$
DECLARE
    original text;
    patched  text;
BEGIN
    SELECT create_sql INTO original FROM core.view_defs WHERE view_name = 'po_line';
    IF original IS NULL THEN
        RAISE EXCEPTION 'core.view_defs has no row for po_line';
    END IF;

    patched := replace(
        original,
        E'  sc.invoiced_qty,\n  sc.still_inv_qty                               AS uninvoiced_qty,\n',
        ''
    );

    IF patched = original THEN
        -- Already patched, or the definition moved. Either way, say which:
        -- silently doing nothing here is how a half-applied change survives.
        IF original ILIKE '%invoiced_qty%' THEN
            RAISE EXCEPTION 'po_line still mentions invoiced_qty but the expected text was not found - patch by hand';
        END IF;
        RAISE NOTICE 'po_line already has no invoice columns, nothing to do';
    ELSE
        UPDATE core.view_defs SET create_sql = patched WHERE view_name = 'po_line';
        RAISE NOTICE 'po_line: invoice quantity columns removed';
    END IF;
END
$patch$;

-- ── 3. The column dictionary forgets them too ────────────────────────────────
-- Otherwise /admin/columns still lists them and core.rebuild_track_views()
-- replays COMMENTs onto columns that no longer exist.
DELETE FROM ai.column_docs
 WHERE object_schema = 'track'
   AND (object_name IN ('invoice', 'grir_open')
        OR (object_name IN ('po_line', 'po_draft', 'po_open', 'po_pending_release')
            AND column_name IN ('invoiced_qty', 'uninvoiced_qty')));

COMMIT;

-- ── 4. Rebuild, so the change is live rather than merely recorded ────────────
SELECT core.rebuild_track_views();

-- ── 5. Prove it ──────────────────────────────────────────────────────────────
SELECT 'views remaining' AS check, string_agg(table_name, ', ' ORDER BY table_name) AS value
  FROM information_schema.tables WHERE table_schema = 'track'
UNION ALL
SELECT 'invoice-ish columns left',
       coalesce(string_agg(table_name || '.' || column_name, ', '), '(none)')
  FROM information_schema.columns
 WHERE table_schema = 'track'
   AND (column_name ILIKE '%invoic%' OR column_name ILIKE '%grir%'
        OR column_name ILIKE '%paid%' OR column_name ILIKE '%payment%')
UNION ALL
SELECT 'column_guide rows', count(*)::text FROM track.column_guide
UNION ALL
SELECT 'po_line rows', count(*)::text FROM track.po_line;
