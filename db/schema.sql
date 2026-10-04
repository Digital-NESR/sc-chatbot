-- materials_db : structure for the Materials AI data platform.
-- Generated from the live database. Apply to an empty database to rebuild
-- everything the loader needs; it cannot bootstrap on its own because
-- core.prep_staging clones the live table with CREATE TABLE ... LIKE.
--
-- Order matters: schemas, tables, then functions, then db/load_config.sql.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE SCHEMA IF NOT EXISTS core;
CREATE SCHEMA IF NOT EXISTS core_stg;

CREATE TABLE IF NOT EXISTS core.material_master_data (
  gross_weight double precision,
  height double precision,
  length double precision,
  net_weight double precision,
  base_unit_of_measure text,
  changed_by text,
  created_on timestamp,
  created_by text,
  df_at_client_level text,
  dg_indicator_profile text,
  ean_upc text,
  ean_variant text,
  ean_category text,
  ext_material_group text,
  highly_viscous text,
  in_bulk_liquid text,
  last_change timestamp,
  manufacturer text,
  manufacturer_part_no text,
  material text,
  material_description text,
  material_group text,
  material_type text,
  order_unit text,
  purchasing_value text,
  size_dimensions text,
  source_of_supply text,
  stock_transfer_net_change_costing text,
  transportation_group text,
  unit_of_weight text,
  material_new_id text,
  successor_code text,
  loaded_at timestamptz
);

CREATE TABLE IF NOT EXISTS core.mb52 (
  unrestricted double precision,
  price_unit double precision,
  value_unrestricted double precision,
  valuated_goods_receipt_blocked_stock double precision,
  valuated_goods_receipt_blocked_stock_value double precision,
  total_stock_in_transit_and_in_transfer double precision,
  val_in_trans_tfr double precision,
  stock_in_transit double precision,
  value_in_transit double precision,
  in_transfer_plant double precision,
  value_in_stock_tfr double precision,
  restricted_use_stock double precision,
  value_restricted double precision,
  quality_inspection double precision,
  quality_inspection_value double precision,
  blocked_stock double precision,
  value_in_blocked_stock double precision,
  returns double precision,
  retuns_value double precision,
  base_unit_of_measure text,
  batch text,
  currency text,
  df_stor_loc_level text,
  descr_of_storage_loc text,
  mpn text,
  manufacturer_name text,
  material text,
  material_description text,
  material_group text,
  material_type text,
  plant text,
  storage_bin text,
  storage_location text,
  valuation_type text,
  material_plant text,
  special_stock_indicator text,
  special_stock_number text,
  min_stock double precision,
  max_stock double precision,
  loaded_at timestamptz
);

CREATE TABLE IF NOT EXISTS core.inventory_movement (
  amount double precision,
  quantity double precision,
  base_unit_of_measure text,
  material text,
  material_group text,
  material_type text,
  movement_type text,
  movement_type_desc text,
  movement_type_text text,
  plant text,
  posting_date timestamp,
  material_plant text,
  event bigint,
  loaded_at timestamptz
);

CREATE TABLE IF NOT EXISTS core.purchase_requisation (
  quantity_ordered double precision,
  acct_assignment_cat text,
  blocking_indicator text,
  blocking_text text,
  closed text,
  committed_date text,
  created_by text,
  creation_indicator text,
  currency text,
  deletion_indicator text,
  delivery_date timestamp,
  desired_vendor text,
  ext_manufacturer text,
  fixed_indicator text,
  fixed_vendor text,
  goods_receipt text,
  invoice_receipt text,
  item_category text,
  item_of_requisition text,
  mpn_material text,
  manufacturer text,
  manufacturer_part_no text,
  material text,
  material_category text,
  material_group text,
  order_unit text,
  po_deletion_indicator text,
  pr_release_date_final timestamp,
  plant text,
  processing_status text,
  purch_organization text,
  purchase_order_date timestamp,
  purchase_order_release_date_f timestamp,
  purchase_requisition text,
  purchase_order_item text,
  purchasing_group text,
  purchasing_group_description text,
  purchasing_info_rec text,
  release_date timestamp,
  release_status text,
  release_strategy text,
  requisition_date timestamp,
  requisitioner text,
  reservation text,
  short_text text,
  supplying_plant text,
  unit_of_measure text,
  materiall text,
  quantity double precision,
  f3 text,
  material_plant text,
  column_val double precision,
  pr_line text,
  country text,
  pr_number_material text,
  loaded_at timestamptz
);

CREATE TABLE IF NOT EXISTS core.supplychain (
  delv_qty double precision,
  delv_value double precision,
  del_val_usd double precision,
  exchang_rate double precision,
  invoiced_qty double precision,
  invoiced_val double precision,
  inv_val_usd double precision,
  net_order_value double precision,
  net_order_val_usd double precision,
  net_price double precision,
  order_qty double precision,
  still_delv_qty double precision,
  still_delv_val double precision,
  still_delv_val_usd double precision,
  still_inv_qty double precision,
  still_inv_val double precision,
  still_inv_val_usd double precision,
  acc_assign_cat text,
  collective_num text,
  comment text,
  commited_delv_date text,
  comp_code text,
  comp_co_desc text,
  country text,
  created_by text,
  created_on timestamp,
  currency text,
  deletion_indicator text,
  delv_date timestamp,
  delv_status text,
  document_date timestamp,
  frgke text,
  gr_document_date timestamp,
  gr_entery_date timestamp,
  gr_posting_date timestamp,
  incomplete text,
  item_cat text,
  item text,
  last_migo timestamp,
  material text,
  mat_group_desc text,
  mat_group text,
  mat_type_desc text,
  mat_type text,
  month bigint,
  opco_po text,
  opco_qt text,
  order_price_unit text,
  order_unit text,
  package_num text,
  payment_terms text,
  pg_name text,
  plant_desc text,
  plant text,
  po_release_date timestamp,
  pr_release_date timestamp,
  pr_submitted_approv text,
  purchase_doc text,
  purchase_req text,
  purchasing_info_rec text,
  purchasing_org text,
  purchasin_group text,
  pur_org text,
  pu_doc_type text,
  quarter text,
  release_strategy text,
  requested_delv_date text,
  requisation_date text,
  req_tracking_num text,
  short_text text,
  statistical_delv_date timestamp,
  status text,
  stockkeeping_unit text,
  storage_loc text,
  supplier_num text,
  supplier_plant text,
  supplier_promise_date timestamp,
  tax_code text,
  year bigint,
  account_classification text,
  material_plant text,
  order_unit_price double precision,
  column_2 double precision,
  column_4 bigint,
  same_plant text,
  po_material_plant text,
  po_line text,
  f2 text,
  po_line_2 text,
  po_first_release_date timestamp,
  inco1 text,
  inco2_l text,
  incoterms_text text,
  count_release bigint,
  reject_po text,
  ds_name text,
  delivery_comment text,
  delivery_status text,
  year_2 text,
  month_2 text,
  quarter_2 text,
  monthno bigint,
  material_desc text,
  pr_material text,
  opco_country text,
  supplier_country text,
  user_email_id text,
  poline text,
  loaded_at timestamptz
);

CREATE TABLE IF NOT EXISTS core.soh_aging_live (
  amount double precision,
  number_of_days bigint,
  company_code text,
  company_name text,
  country text,
  country_desc text,
  date timestamp,
  ledger text,
  mat_grp_desc text,
  mat_type_desc text,
  material text,
  material_group text,
  material_type text,
  movement_type_desc text,
  plant text,
  profit_center text,
  profit_center_desc text,
  segment text,
  segment_desc text,
  max_date timestamp,
  stock_quantity double precision,
  material_plant text,
  material_desc text,
  material_manf_no text,
  loaded_at timestamptz
);

CREATE TABLE IF NOT EXISTS core.soh_quantity_per_store (
  stock_quantity double precision,
  material text,
  plant text,
  storage_location text,
  storage_location_desc text,
  material_plant text,
  vdc text,
  country text,
  vdc_country text,
  loaded_at timestamptz
);

CREATE TABLE IF NOT EXISTS core.soh_aging_gi_gr_dates_live (
  material text,
  plant text,
  gi timestamp,
  gr timestamp,
  null_val text,
  last_used_date timestamp,
  aging_days bigint,
  material_plant text,
  year_aging text,
  consumption timestamp,
  loaded_at timestamptz
);

CREATE TABLE IF NOT EXISTS core.all_plants (
  plant_code text,
  co_code bigint,
  legal_entity text,
  sap_plant_name text,
  sap_segment text,
  segment_group text,
  country_of_legal_entity text,
  reporting_country_finance text,
  reporting_segment_finance text,
  reporting_segment_group_finance text,
  country_segment text,
  loaded_at timestamptz
);

CREATE TABLE IF NOT EXISTS core.mat_group_description (
  mat_grp text,
  description text,
  loaded_at timestamptz
);

CREATE TABLE IF NOT EXISTS core.account_classification_mapping (
  account_classification text,
  account_classification_description text,
  loaded_at timestamptz
);

CREATE TABLE IF NOT EXISTS core.material_plant_extension (
  material text,
  plant text,
  loaded_at timestamptz
);

CREATE TABLE IF NOT EXISTS core.load_log (
  id            bigserial PRIMARY KEY,
  table_name    text,
  rows_staged   bigint,
  rows_expected bigint,
  status        text,
  message       text,
  finished_at   timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS load_log_table_time_idx ON core.load_log (table_name, finished_at DESC);

CREATE TABLE IF NOT EXISTS core.load_config (
  pg_table text PRIMARY KEY,
  dax_table text,
  bucket_col text,
  bucket_chars integer,
  dax_filter text,
  src_cols text[],
  pg_cols text[],
  enabled boolean,
  load_order integer,
  dax_source text,
  bucket_min integer,
  bucket_max integer,
  index_defs text[],
  load_mode text,
  incr_days integer,
  incr_date_cols text[],
  key_cols text[],
  full_reload_dow integer,
  col_comments jsonb
);

-- ---------------------------------------------------------------------------
-- Functions
--
-- build_indexes and apply_comments exist because CREATE TABLE ... LIKE copies
-- neither indexes nor column comments. The daily publish replaces the live
-- table with its staging clone, so both must be rebuilt on the clone BEFORE
-- the swap or they are silently lost.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION core.apply_comments(p_schema text, p_table text)
 RETURNS integer
 LANGUAGE plpgsql
AS $function$
DECLARE r record; n int := 0;
BEGIN
  FOR r IN
    SELECT key AS col, value AS descr
    FROM core.load_config lc, jsonb_each_text(lc.col_comments)
    WHERE lc.pg_table = p_table AND lc.col_comments IS NOT NULL
  LOOP
    -- Skip anything the table no longer has, so a source schema change cannot
    -- break the publish.
    IF EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_schema = p_schema AND table_name = p_table AND column_name = r.col) THEN
      EXECUTE format('COMMENT ON COLUMN %I.%I.%I IS %L', p_schema, p_table, r.col, r.descr);
      n := n + 1;
    END IF;
  END LOOP;
  RETURN n;
END $function$
;

CREATE OR REPLACE FUNCTION core.build_indexes(p_schema text, p_table text)
 RETURNS integer
 LANGUAGE plpgsql
AS $function$
DECLARE d text; n int := 0;
BEGIN
  FOR d IN SELECT unnest(index_defs) FROM core.load_config WHERE pg_table = p_table LOOP
    EXECUTE format('CREATE INDEX ON %I.%I %s', p_schema, p_table, d);
    n := n + 1;
  END LOOP;
  RETURN n;
END $function$
;

CREATE OR REPLACE FUNCTION core.prep_staging(p_table text)
 RETURNS void
 LANGUAGE plpgsql
AS $function$
BEGIN
  EXECUTE format('DROP TABLE IF EXISTS core_stg.%I', p_table);
  EXECUTE format('CREATE TABLE core_stg.%I (LIKE core.%I INCLUDING DEFAULTS)', p_table, p_table);
END $function$
;

CREATE OR REPLACE FUNCTION core.publish_all(p_expected jsonb, p_tables text[] DEFAULT NULL::text[], p_full text[] DEFAULT NULL::text[])
 RETURNS TABLE(tbl text, staged bigint, expected bigint, action text)
 LANGUAGE plpgsql
AS $function$
DECLARE
  r record; n bigint; e bigint; ix int; cm int; is_full boolean;
  j text; nullchk text; has_null boolean; del bigint;
BEGIN
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
END $function$
;
