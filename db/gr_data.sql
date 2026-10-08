-- =====================================================================
-- core.gr_data - goods receipt events, from the "GR Analyser" model
-- (dataset ce263715-0dda-4f57-93a3-e47af1e04cb3, table GR_DATA).
--
-- WHY THIS MATTERS
-- This is the first source that attributes a receipt to a PURCHASE ORDER
-- LINE. core.inventory_movement has no document reference at all, so a
-- goods movement could never be tied back to a PO; core.supplychain has
-- gr_posting_date and delv_qty, but only as one netted total per line.
--
-- GR_DATA is one row per receipt EVENT: 935,619 events across 710,882 PO
-- lines, so partial deliveries appear individually, and reversals are
-- explicit rather than silently netted away.
--
-- The loader cannot bootstrap a table from nothing - core.prep_staging
-- does CREATE TABLE core_stg.x (LIKE core.x INCLUDING DEFAULTS) - so this
-- table has to exist before the first load. See db/README.md.
-- =====================================================================

CREATE TABLE IF NOT EXISTS core.gr_data (
  purchase_order       text,
  purchase_order_item  text,
  po_item              text,
  movement_type        text,
  reversed_gr          text,
  total_quantity       double precision,
  received_reversed    double precision,
  posting_date         timestamp,
  gr_entry_date        timestamp,
  plant                text,
  loaded_at            timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------
-- Loader configuration
--
-- Full load, not incremental. GR_DATA carries no material document number
-- (no MBLNR), so there is no column combination guaranteed unique per
-- event - two receipts against the same PO line, movement type and date
-- are possible. An incremental merge deletes by key before re-inserting,
-- so a non-unique key risks dropping rows whenever the window splits a
-- key's events. At ~9.4M cells the full load costs about the same as
-- inventory_movement, which already loads in full daily.
-- ---------------------------------------------------------------------
INSERT INTO core.load_config (
  pg_table, dax_table, dataset_id, bucket_col, bucket_chars,
  src_cols, pg_cols, enabled, load_order, load_mode, index_defs
) VALUES (
  'gr_data',
  'GR_DATA',
  'ce263715-0dda-4f57-93a3-e47af1e04cb3',
  'Purchase_Order',
  3,
  ARRAY['Purchase_Order','Purchase_Order_Item','PO-Item','Movement_Type','Reversed_GR',
        'Total_Quantity','Received__Reversed','Posting_Date','GR_Entry_Date','Plant'],
  ARRAY['purchase_order','purchase_order_item','po_item','movement_type','reversed_gr',
        'total_quantity','received_reversed','posting_date','gr_entry_date','plant'],
  true,
  13,
  'full',
  ARRAY['(purchase_order, purchase_order_item)','(posting_date)','(plant)']
)
ON CONFLICT (pg_table) DO UPDATE SET
  dax_table    = EXCLUDED.dax_table,
  dataset_id   = EXCLUDED.dataset_id,
  bucket_col   = EXCLUDED.bucket_col,
  bucket_chars = EXCLUDED.bucket_chars,
  src_cols     = EXCLUDED.src_cols,
  pg_cols      = EXCLUDED.pg_cols,
  enabled      = EXCLUDED.enabled,
  load_order   = EXCLUDED.load_order,
  load_mode    = EXCLUDED.load_mode,
  index_defs   = EXCLUDED.index_defs;

-- ---------------------------------------------------------------------
-- Column dictionary. Stored in load_config so it survives every swap, and
-- editable from /admin/columns like every other table.
-- ---------------------------------------------------------------------
UPDATE core.load_config SET col_comments = '{
  "purchase_order": "Purchase order number this receipt was posted against. Join to supplychain.purchase_doc or track.po_line.po_number. This is the link core.inventory_movement does not have.",
  "purchase_order_item": "Purchase order LINE this receipt was posted against, e.g. 00010. With purchase_order it identifies the PO line. Join to supplychain.item.",
  "po_item": "Composite \"PO number-item\" key built by the source model. Redundant with purchase_order and purchase_order_item; prefer those two.",
  "movement_type": "SAP movement type. 101 standard goods receipt, 102 its reversal, 107/109 receipt into valuated and non-valuated blocked stock, 108/110 their reversals, 122 return delivery to vendor, Z50/Z51 intercompany receipt and reversal.",
  "reversed_gr": "Whether this event is a receipt or the cancellation of one. Values Received and Reversed. 17,778 of 935,619 events are reversals. Does not align perfectly with movement_type - type 102 appears under both labels - so trust this column over inferring from the type.",
  "total_quantity": "Gross quantity of this receipt event, always positive. UNVERIFIED relationship with received_reversed: the two agree for material lines but diverge on service lines, where this reads 1 while received_reversed holds a different figure. There is NO unit of measure column, so quantities must not be summed across materials.",
  "received_reversed": "Signed quantity: positive on a receipt, negative on a reversal. Sum THIS column for a net received quantity, not total_quantity. UNVERIFIED - see total_quantity.",
  "posting_date": "Date the receipt was posted to the ledger. Use this for received-on analysis and as the activity date for this table.",
  "gr_entry_date": "Date the receipt was entered into SAP, which can differ from the posting date.",
  "plant": "4-digit SAP plant code receiving the goods. Join to all_plants.plant_code.",
  "loaded_at": "Timestamp this row was written by the Data Loader. Operational, not business data."
}'::jsonb
WHERE pg_table = 'gr_data';

SELECT core.apply_comments('core', 'gr_data') AS comments_applied;
