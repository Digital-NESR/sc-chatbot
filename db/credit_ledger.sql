-- =====================================================================
-- ai.credit_ledger - manually recorded Anthropic credit top-ups.
--
-- WHY THIS EXISTS AND WHAT IT IS NOT
-- Anthropic's Admin API exposes usage (tokens) and cost (USD actually
-- billed). It does NOT expose a remaining prepaid credit balance; there
-- is no endpoint for it. On 14 Oct 2026 the credits ran out mid-session
-- and every agent went down with no warning, which is the gap this
-- closes as far as it can be closed.
--
-- So the balance on /admin/usage is DERIVED:
--     remaining = sum(top-ups) - cost reported since the first top-up
--
-- That is an estimate, and the page says so. It drifts because:
--   * Priority Tier spend is excluded from the cost endpoint entirely
--   * any charge that is not API cost never appears
--   * cost data lags real usage by about five minutes
-- Treat it as a burn-down to act on, never as an accounting figure.
-- The Console remains the authority.
-- =====================================================================

CREATE TABLE IF NOT EXISTS ai.credit_ledger (
  id          bigserial    PRIMARY KEY,
  occurred_on date         NOT NULL,
  amount_usd  numeric(12,2) NOT NULL CHECK (amount_usd <> 0),
  note        text,
  created_at  timestamptz  NOT NULL DEFAULT now(),
  created_by  text
);

COMMENT ON TABLE ai.credit_ledger IS
  'Credit top-ups entered by hand at /admin/usage, because Anthropic exposes no remaining-balance endpoint. Used only to derive an estimated burn-down against the Cost API.';

COMMENT ON COLUMN ai.credit_ledger.occurred_on IS
  'Date the credit was added. Cost is counted from the EARLIEST top-up onwards, so an older entry widens the window.';
COMMENT ON COLUMN ai.credit_ledger.amount_usd IS
  'Amount added in USD. Negative is allowed, for recording a correction or a refund.';

CREATE INDEX IF NOT EXISTS credit_ledger_occurred_idx ON ai.credit_ledger (occurred_on);
