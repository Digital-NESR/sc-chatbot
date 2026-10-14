-- =====================================================================
-- F10: stop pr_waiting_with / po_waiting_with naming an approver for a
-- document that has already been signed.
--
-- MEASURED on 14 Oct 2026:
--   po_waiting_with  3,187 lines / 959 POs, of which 858 lines / 276 POs
--                    (29% of POs) are already 'Released' in po_line.
--   pr_waiting_with  723 lines / 174 PRs already 'Fully Released'.
--
-- WHY. The two sides refresh on different clocks. po_release and
-- pr_release are their own semantic models and last loaded 13 Oct 11:06;
-- supplychain and purchase_requisation merge daily and loaded 14 Oct
-- 09:21. So for most of a day the under-release snapshot still lists
-- documents that supplychain already knows are approved. PO 5150009248
-- is the worked example: released 12 Oct, still sitting in po_release's
-- snapshot taken 13 Oct.
--
-- Trap 4 in the agent prompt covers the OPPOSITE case - po_line says
-- Under Release but po_waiting_with has no row - and tells the agent not
-- to conclude the document is approved. Nothing covered this direction,
-- and it is the more damaging one: it sends a requester to chase a
-- colleague over an order that was signed days ago.
--
-- THE FIX. Exclude a line once po_line / pr_line says it is released.
-- That side carries an actual release DATE rather than a snapshot flag,
-- so it is the stronger evidence, and the filter can only ever remove
-- rows the other side has positively confirmed as done. If supplychain
-- is the one lagging, nothing is removed and behaviour is unchanged.
--
-- Apply AFTER db/track_views_v2.sql. Rebuilds the views at the end.
-- =====================================================================

UPDATE core.view_defs SET create_sql = $v$
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
-- deletion_indicator is a LABEL, not a blank/X flag: the values are
  -- 'PO Not Deleted' / 'PO Deleted' (and PR equivalents). Filtering on
  -- = '' empties the view entirely, which is exactly what happened on
  -- the first attempt at this file.
  WHERE r.deletion_indicator NOT IN ('PR Deleted','PO Deleted')
  -- Drop anything purchase_requisation already shows as signed.
  AND NOT EXISTS (
    SELECT 1 FROM track.pr_line p
    WHERE p.pr_number = r.pr_number
      AND p.pr_item   = lpad(r.pr_line_number::text, 5, '0')
      AND p.release_state = 'Fully Released'
  )
$v$
WHERE view_name = 'pr_waiting_with';

UPDATE core.view_defs SET create_sql = $v$
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
-- deletion_indicator is a LABEL, not a blank/X flag: the values are
  -- 'PO Not Deleted' / 'PO Deleted' (and PR equivalents). Filtering on
  -- = '' empties the view entirely, which is exactly what happened on
  -- the first attempt at this file.
  WHERE r.deletion_indicator NOT IN ('PR Deleted','PO Deleted')
  -- Drop anything supplychain already shows as released.
  AND NOT EXISTS (
    SELECT 1 FROM track.po_line p
    WHERE p.po_number = r.po_number
      AND p.po_item   = r.po_line_number
      AND p.release_state = 'Released'
  )
$v$
WHERE view_name = 'po_waiting_with';

-- po_waiting_with (91) and pr_waiting_with (90) now read track.po_line
-- (20) and track.pr_line (10), which already sort before them, so the
-- rebuild order is unchanged. request_lifecycle at 100 still follows.

UPDATE ai.column_docs SET description =
 $d$WHO THE ORDER IS SITTING WITH - the approver who has not signed. An employee id, not a name. Rows are dropped automatically once supplychain shows the order released, so a row here means the order was still unsigned as at the later of the two loads. Check track.data_freshness if the timing matters.$d$,
 updated_at = now(), updated_by = 'f10'
WHERE object_schema='track' AND object_name='po_waiting_with' AND column_name='waiting_with';

UPDATE ai.column_docs SET description =
 $d$WHO THE REQUISITION IS SITTING WITH - the approver who has not signed. An employee id, not a name. Rows are dropped automatically once purchase_requisation shows the requisition fully released.$d$,
 updated_at = now(), updated_by = 'f10'
WHERE object_schema='track' AND object_name='pr_waiting_with' AND column_name='waiting_with';

SELECT core.rebuild_track_views() AS views_rebuilt;
