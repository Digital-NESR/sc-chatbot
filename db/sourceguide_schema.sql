-- sourceguide_db : column dictionary for SourceGuide AI.
--
-- Only the dictionary lives here. The tables and views the agent queries
-- (ai.sourcing, ai.commodity_catalog, ai.purchase_history over public.sg_*)
-- are owned and loaded elsewhere and are deliberately not defined in this repo.
--
-- Descriptions are stored as data AND applied as real Postgres COMMENTs. The
-- COMMENT is what the agent reads at query time; the table is what survives a
-- DROP/CREATE of one of those views, which would otherwise take its column
-- comments with it. Re-running ai.apply_column_docs() puts them back.
--
-- Descriptions themselves are in db/sourceguide_column_comments.json, which is
-- the human-editable source, and are editable from /admin/columns.

CREATE SCHEMA IF NOT EXISTS ai;

CREATE TABLE IF NOT EXISTS ai.column_docs (
  object_schema text        NOT NULL,
  object_name   text        NOT NULL,
  column_name   text        NOT NULL,
  description   text        NOT NULL,
  updated_at    timestamptz NOT NULL DEFAULT now(),
  updated_by    text,
  PRIMARY KEY (object_schema, object_name, column_name)
);

CREATE OR REPLACE FUNCTION ai.apply_column_docs(p_schema text DEFAULT NULL, p_object text DEFAULT NULL)
RETURNS int LANGUAGE plpgsql AS $fn$
DECLARE r record; n int := 0;
BEGIN
  FOR r IN
    SELECT d.object_schema, d.object_name, d.column_name, d.description
    FROM ai.column_docs d
    WHERE (p_schema IS NULL OR d.object_schema = p_schema)
      AND (p_object IS NULL OR d.object_name   = p_object)
  LOOP
    -- Skip anything the object no longer has, so a schema change upstream
    -- cannot make this fail.
    IF EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_schema = r.object_schema
                 AND table_name   = r.object_name
                 AND column_name  = r.column_name) THEN
      EXECUTE format('COMMENT ON COLUMN %I.%I.%I IS %L',
                     r.object_schema, r.object_name, r.column_name, r.description);
      n := n + 1;
    END IF;
  END LOOP;
  RETURN n;
END $fn$;

-- Re-apply everything:
--   SELECT ai.apply_column_docs();
-- Re-apply one object:
--   SELECT ai.apply_column_docs('ai', 'purchase_history');
