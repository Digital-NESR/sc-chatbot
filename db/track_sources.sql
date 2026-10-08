-- =====================================================================
-- Five more semantic models, for Track My Request.
--
-- Each is filtered to what the agent actually needs rather than loaded
-- whole. Unfiltered these six tables are 185M cells - five times the
-- entire current weekday load. Filtered they are about 17M.
--
-- The loader cannot bootstrap a table from nothing (core.prep_staging
-- does CREATE TABLE core_stg.x LIKE core.x), so every table is created
-- here before its first load. See db/README.md.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. core.ub_grir  -  GR/IR clearing account (GRIR model)
--
-- Goods received not yet invoiced, and invoiced not yet received. The
-- whole table is 2,838,448 rows of mostly CLEARED, i.e. matched and
-- finished, entries. Only 23,969 are uncleared, and those are the ones
-- anyone asks about, so the load filters to them - a 99.2% reduction.
-- Cleared history is deliberately NOT loaded.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS core.ub_grir (
  purchasing_doc        text,
  item                  text,
  purchase_item         text,
  document_number       text,
  document_type         text,
  document_type_desc    text,
  fiscal_year           text,
  clearing_doc          text,
  posting_date          timestamp,
  document_date         timestamp,
  vendor                text,
  vendor_creditor_name  text,
  po_creator            text,
  user_name             text,
  account               text,
  account_number        text,
  account_type          text,
  assignment            text,
  reference             text,
  doc_header_text       text,
  doc_text              text,
  amnt_in_bal_tr_crcy   double precision,
  amnt_in_compcd_crcy   double precision,
  transaction_currency  text,
  companycode_currency  text,
  company_code          text,
  country               text,
  plant_code            text,
  profit_center         text,
  profit_center_desc    text,
  segment               text,
  segment_desc          text,
  aging_buckets         bigint,
  aging_groups          text,
  loaded_at             timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------
-- 2. core.ap_aging  -  supplier invoices and payment status (AP Aging)
--
-- Filtered to invoices that carry a purchasing document: 373,241 of
-- 774,298. The rest are non-PO payables and have nothing to do with a
-- purchase request. Both open and settled invoices are kept, because
-- "when was it paid" needs the settled ones.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS core.ap_aging (
  purchasing_document       text,
  document_number           text,
  document_type             text,
  document_type_description text,
  invoice_ref               text,
  vendor                    text,
  vendor_name               text,
  company_code              text,
  country                   text,
  segment                   text,
  posting_date              timestamp,
  document_date             timestamp,
  baseline_date             timestamp,
  due_on                    timestamp,
  payment_term              text,
  transaction_currency      text,
  amnt_in_bal_tr_crcy       double precision,
  amount_in_compcd_crcy     double precision,
  invoice_amount            double precision,
  payment_amount            double precision,
  invoice_balance           double precision,
  baseline_agingdays        bigint,
  duedate_agingdays         bigint,
  payable_category          text,
  loaded_at                 timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------
-- 3. core.release_strategy  -  the approval matrix (NESR Release Strategy)
--
-- Who approves what, and between which values. The source is 1,035,384
-- rows because it is exploded across plant and document type; SUMMARIZE
-- over the eleven columns worth keeping gives 510,608 distinct rows.
-- The dedup lives in dax_source so the expected-count query and the
-- extraction describe the same set - see db/README.md.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS core.release_strategy (
  release_group     text,
  release_strategy  text,
  release_code      text,
  approver          text,
  email             text,
  min_value         text,
  max_value         text,
  document_type     text,
  plant             text,
  purchasing_group  text,
  status            text,
  loaded_at         timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------
-- 4. core.pr_release  -  requisitions awaiting approval, and WITH WHOM
-- 5. core.po_release  -  purchase orders awaiting approval, and with whom
--
-- Both filtered to Release_Indicator = 'Under Release'. Fully released
-- rows are 95% of PR_RELEASE and 99% of PO_RELEASE, and their release
-- dates are already in core.purchase_requisation and core.supplychain.
-- What is NOT available anywhere else is with_whom - who the document is
-- sitting with right now - and that only has meaning while unreleased.
--
-- NOTE pr_number: PR_RELEASE has no column called anything like a PR
-- number. The PR number is in PR_Sitting_Release, despite the name.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS core.pr_release (
  pr_number                    text,
  pr_line_number               bigint,
  pr_type                      text,
  requester                    text,
  full_name                    text,
  with_whom                    text,
  release_indicator            text,
  pr_submission                timestamp,
  pr_release_date              timestamp,
  days_since_pr_submission     bigint,
  days_since_last_release      bigint,
  days_to_release              bigint,
  material_group               text,
  plant                        text,
  company_code                 text,
  country                      text,
  segment                      text,
  deletion_indicator           text,
  loaded_at                    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS core.po_release (
  po_number                    text,
  po_line_number               text,
  po_line                      text,
  pr_number                    text,
  pr_line_number               text,
  po_type                      text,
  buyer                        text,
  full_name                    text,
  with_whom                    text,
  release_indicator            text,
  po_creation_date             timestamp,
  po_submission_date           timestamp,
  po_release_date              timestamp,
  po_days_since_creation       bigint,
  po_days_since_last_release   bigint,
  po_day_to_release            bigint,
  item_category                text,
  account_assignement          text,
  material_group               text,
  plant                        text,
  company_code                 text,
  country                      text,
  segment                      text,
  deletion_indicator           text,
  loaded_at                    timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------
-- 6. core.zmb5oa  -  open PO analysis, including IN TRANSIT (ZMB5OA)
--
-- The only source so far with an in-transit quantity per PO line. It is
-- not shipment tracking - there is still no AWB, container or bill of
-- lading anywhere - but it answers "how much of this order is on the
-- water" where nothing else could. 20,999 rows, 388 with transit stock.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS core.zmb5oa (
  purchasing_document        text,
  item                       text,
  po_line                    text,
  material                   text,
  material_description       text,
  supplier                   text,
  supplier_name              text,
  plant                      text,
  plant_name                 text,
  company_code               text,
  country_code               text,
  country_name               text,
  status                     text,
  delivery_completed         text,
  origin_acceptance          text,
  acct_assignment_cat        text,
  po_creation_date           text,
  po_fully_released_date     text,
  order_quantity             double precision,
  fully_delivered_quantity   double precision,
  fully_delivered_amount     double precision,
  intransit_quantity         double precision,
  intransit_amount           double precision,
  not_collected_quantity     double precision,
  not_collected_amount       double precision,
  loaded_at                  timestamptz NOT NULL DEFAULT now()
);
