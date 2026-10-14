-- =====================================================================
-- F5: track.invoice - correct payment_state, and stop showing negatives.
--
-- MEASURED, on 373,820 loaded invoices:
--   * invoice_balance = -invoice_amount on ALL 372,631 non-zero rows.
--     The column carries no information the amount does not; its sign is
--     pure credit-side bookkeeping convention. Reporting a fully unpaid
--     invoice of 3,066.71 as a balance of "-3,066.71" reads to a user
--     like a credit or a refund. It is neither.
--   * payment_amount is non-zero on exactly 3,865 rows, and on every one
--     of those it EQUALS invoice_amount to the cent. It is a mirror of
--     the amount, never a part payment.
--
-- So the old CASE was wrong on those 3,865 rows: it saw payment_amount
-- <> 0 and called them 'Partially paid' when nothing had been paid at
-- all. THERE IS NO PARTIAL PAYMENT IN THIS DATA, and the state is
-- dropped rather than left as a label the source cannot support.
--
-- amount_outstanding is added as the plain positive number to report.
-- invoice_balance is KEPT exactly as the source has it, so anyone
-- reconciling against SAP or the AP Aging model still sees what they
-- expect. Changing its sign would have made this view disagree with
-- every other system showing the same figure.
--
-- Apply AFTER db/track_views_v2.sql. Re-applies comments at the end.
-- =====================================================================

UPDATE core.view_defs SET create_sql = $v$
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
  -- The number to put in front of a user: always positive, always the
  -- amount still owed. Zero once settled.
  abs(coalesce(a.invoice_balance, 0))     AS amount_outstanding,
  -- Settled is balance = 0. Everything else is outstanding, and the only
  -- question left is whether it is past its due date. 'Partially paid'
  -- is deliberately absent - see the header.
  CASE
    WHEN coalesce(a.invoice_balance, 0) = 0                THEN 'Paid'
    WHEN a.due_on IS NOT NULL AND a.due_on < CURRENT_DATE  THEN 'Overdue'
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
$v$
WHERE view_name = 'invoice';

-- ---------------------------------------------------------------------
-- Column dictionary for what changed. Editable afterwards at
-- /admin/columns -> Track My Request.
-- ---------------------------------------------------------------------
INSERT INTO ai.column_docs (object_schema, object_name, column_name, description, updated_by)
VALUES
('track','invoice','amount_outstanding',
 $d$Amount still owed on this invoice, ALWAYS POSITIVE. Zero once settled. This is the figure to report to a user - use it instead of invoice_balance, which carries a confusing negative sign.$d$,'f5'),
('track','invoice','invoice_balance',
 $d$Raw outstanding balance exactly as the source holds it. Measured: it equals -invoice_amount on all 372,631 non-zero rows, so its sign is credit-side bookkeeping convention and nothing more - a fully unpaid invoice of 3,066.71 shows -3,066.71, which is NOT a credit or a refund. Kept unchanged so it reconciles with SAP and the AP Aging model. For anything shown to a user, report amount_outstanding instead.$d$,'f5'),
('track','invoice','payment_amount',
 $d$NOT A PART PAYMENT, and not safe to read as one. Measured: non-zero on only 3,865 of 373,820 rows, and on every one of those it equals invoice_amount to the cent - it mirrors the amount rather than recording anything paid. Do not compute a paid-so-far figure from it, and do not infer partial payment from it. Use payment_state.$d$,'f5'),
('track','invoice','payment_state',
 $d$Resolved payment status: Paid (balance is zero) | Overdue (still owed, past due_on) | Open (still owed, not yet due). There is NO partial-payment state: the source cannot express one, because payment_amount never records a part payment. Use this rather than interpreting invoice_balance yourself.$d$,'f5')
ON CONFLICT (object_schema, object_name, column_name) DO UPDATE
  SET description = EXCLUDED.description, updated_at = now(), updated_by = EXCLUDED.updated_by;

-- grir_open.amount carries the same credit-side sign. The view is left
-- alone - it is one amount column, not a state anyone reasons about -
-- but the description now says so.
UPDATE ai.column_docs SET description =
 $d$Amount in transaction currency, carrying SAP's credit-side sign: a goods receipt awaiting its invoice shows as NEGATIVE. That is a bookkeeping convention, not a credit note. Report the magnitude and say what it is. Do NOT sum across rows with different currency values.$d$,
 updated_at = now(), updated_by = 'f5'
WHERE object_schema='track' AND object_name='grir_open' AND column_name='amount';

SELECT core.rebuild_track_views() AS views_rebuilt;
