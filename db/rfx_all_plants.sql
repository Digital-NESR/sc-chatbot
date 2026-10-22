-- =====================================================================
-- rfx_officer.all_plants - a daily copy of materials_db core.all_plants.
--
-- WHY A COPY RATHER THAN A LIVE VIEW
-- Every database here lives on the same Azure Postgres Flexible Server,
-- so a foreign table would normally be the obvious answer. It is not
-- available: azure.extensions is set to VECTOR,PG_TRGM only, so
-- postgres_fdw and dblink cannot be installed without a server parameter
-- change, and wal_level is 'replica' so logical replication is out too.
--
-- It would be the wrong tool anyway. This is 354 rows of reference data
-- that changes perhaps monthly. A local copy can be indexed and joined
-- at full speed, where a foreign table would make every join in
-- rfx_officer a network round trip to materials_db and inherit its
-- downtime.
--
-- Refreshed by the n8n workflow "All Plants Imports to SQL"
-- (87GsFdcED1nmG9XQ), daily at 08:00 Asia/Dubai. The workflow timezone is
-- pinned rather than inherited, since the instance default is UTC and the
-- cron would otherwise fire at noon Gulf.
--
-- 08:00 Gulf is 04:00 UTC, which is BEFORE the Materials AI loader runs
-- that day (09:00-16:00 UTC), so the copy carries the PREVIOUS day's
-- load - about 12 hours behind. That is deliberate: the table is fresh
-- when people arrive, and plant reference data changes monthly at most.
-- Compare synced_at with loaded_at to see both ages.
--
-- The workflow issues this same CREATE TABLE IF NOT EXISTS before every
-- load, so the table is self-healing; this file is the readable record.
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.all_plants (
  plant_code                      text PRIMARY KEY,
  co_code                         bigint,
  legal_entity                    text,
  sap_plant_name                  text,
  sap_segment                     text,
  segment_group                   text,
  country_of_legal_entity         text,
  reporting_country_finance       text,
  reporting_segment_finance       text,
  reporting_segment_group_finance text,
  country_segment                 text,
  loaded_at                       timestamptz,
  synced_at                       timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.all_plants IS
  'Plant reference data, copied daily from materials_db core.all_plants, which is itself loaded from the Power BI "All Plants" table. Read-only here: anything written directly is lost on the next sync, which truncates and reloads.';

COMMENT ON COLUMN public.all_plants.plant_code IS
  '4-digit SAP plant code. Unique across all 354 rows, so it is the join key for any plant column in this database.';
COMMENT ON COLUMN public.all_plants.co_code IS
  'SAP company code. Numeric in the source, so it is bigint here - cast when joining to a text plant/company column.';
COMMENT ON COLUMN public.all_plants.legal_entity IS
  'Full legal entity name that owns the plant.';
COMMENT ON COLUMN public.all_plants.sap_plant_name IS
  'Readable plant name as it appears in SAP, e.g. "Cementing - NPT - KSA".';
COMMENT ON COLUMN public.all_plants.sap_segment IS
  'Business segment in SAP terms, e.g. Cementing, Coiled-Tubing.';
COMMENT ON COLUMN public.all_plants.segment_group IS
  'Higher-level grouping of sap_segment, e.g. Production.';
COMMENT ON COLUMN public.all_plants.country_of_legal_entity IS
  'Country of the legal entity, full name, e.g. "Saudi Arabia".';
COMMENT ON COLUMN public.all_plants.reporting_country_finance IS
  'Country as Finance reports it, which is an abbreviation rather than the full name, e.g. "KSA". Differs from country_of_legal_entity - pick deliberately.';
COMMENT ON COLUMN public.all_plants.reporting_segment_finance IS
  'Segment as Finance reports it, e.g. "Cementing Services". Differs from sap_segment.';
COMMENT ON COLUMN public.all_plants.reporting_segment_group_finance IS
  'Segment group as Finance reports it.';
COMMENT ON COLUMN public.all_plants.country_segment IS
  'Concatenation of the Finance country and segment, e.g. "KSA-Cementing Services". Pre-built by the source.';
COMMENT ON COLUMN public.all_plants.loaded_at IS
  'When the row was written into materials_db by the Power BI loader. Source freshness.';
COMMENT ON COLUMN public.all_plants.synced_at IS
  'When this copy was last refreshed. Compare with loaded_at to tell a stale sync from a stale source.';

-- Three columns exist in the Power BI "All Plants" table but are not
-- loaded upstream and so cannot appear here: Budget Segment, Reviewed
-- Country, Reviewed Segment. Adding them means changing src_cols and
-- pg_cols on the materials_db load_config row first.
