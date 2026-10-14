-- =====================================================================
-- Editable column dictionary for the track.* views.
--
-- WHY THIS EXISTS
-- /admin/columns already documents 472 columns, but every one of them is
-- on core.*, and Track My Request is forbidden from querying core.* - it
-- reads track.* only. The views also RENAME columns on the way through
-- (ub_grir.purchasing_doc becomes grir_open.po_number), so a comment on
-- the core table would not follow even if the agent could see it.
--
-- Measured before this file existed: 16 views, 444 columns, 0 commented.
-- The agent had no column context whatsoever on the schema it reads, and
-- its only recourse was an information_schema round-trip per view. In the
-- 14 Oct evaluation that cost four of Q30's ten iterations and the
-- question failed with "Max iterations (10) reached".
--
-- THE REBUILD PROBLEM
-- core.rebuild_track_views() DROPs and recreates every view on every
-- publish_all, and a dropped view takes its COMMENTs with it. So the
-- descriptions are stored as DATA in ai.column_docs and replayed onto
-- the views immediately after each create - exactly the pattern
-- core.apply_comments already uses for the core tables after a swap.
--
-- Apply AFTER db/track_schema.sql and db/track_views_v2.sql.
-- Seed content lives in db/track_column_docs_seed.sql.
-- =====================================================================

CREATE SCHEMA IF NOT EXISTS ai;

-- Shape is fixed by src/app/api/admin/columns/route.ts, which writes this
-- table directly for every 'column_docs' source. Do not rename columns
-- here without changing that route.
CREATE TABLE IF NOT EXISTS ai.column_docs (
  object_schema text        NOT NULL,
  object_name   text        NOT NULL,
  column_name   text        NOT NULL,
  description   text        NOT NULL,
  updated_at    timestamptz NOT NULL DEFAULT now(),
  updated_by    text,
  PRIMARY KEY (object_schema, object_name, column_name)
);

COMMENT ON TABLE ai.column_docs IS
  'Editable column descriptions for objects that are rebuilt, and so cannot hold their own COMMENTs. Written by /admin/columns, replayed onto the live objects by ai.apply_column_docs().';

-- ---------------------------------------------------------------------
-- Replay stored descriptions onto a live object as real COMMENTs, which
-- is what the agent reads at query time.
--
-- The join against information_schema is deliberate: a description for a
-- column that no longer exists is skipped rather than raising, so an edit
-- made before a view was reshaped cannot break the nightly load.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION ai.apply_column_docs(p_schema text, p_name text)
RETURNS int
LANGUAGE plpgsql AS $fn$
DECLARE r record; n int := 0;
BEGIN
  FOR r IN
    SELECT d.column_name, d.description
    FROM ai.column_docs d
    JOIN information_schema.columns c
      ON c.table_schema = d.object_schema
     AND c.table_name   = d.object_name
     AND c.column_name  = d.column_name
    WHERE d.object_schema = p_schema
      AND d.object_name   = p_name
  LOOP
    EXECUTE format('COMMENT ON COLUMN %I.%I.%I IS %L',
                   p_schema, p_name, r.column_name, r.description);
    n := n + 1;
  END LOOP;
  RETURN n;
END $fn$;

COMMENT ON FUNCTION ai.apply_column_docs(text, text) IS
  'Write every stored description for one object out as a Postgres COMMENT. Called after each view is recreated, and by /admin/columns on save.';

-- ---------------------------------------------------------------------
-- rebuild_track_views now replays the dictionary too.
--
-- Unchanged from db/track_schema.sql apart from the PERFORM and its own
-- exception block: a missing or broken dictionary must cost the comments,
-- never the view, and never the load.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION core.rebuild_track_views() RETURNS int
LANGUAGE plpgsql AS $fn$
DECLARE r record; n int := 0;
BEGIN
  FOR r IN SELECT view_name, create_sql FROM core.view_defs ORDER BY apply_order LOOP
    BEGIN
      -- Dropped immediately before its own create, ascending, so this is
      -- safe to run whether or not the views are already there. CASCADE
      -- is harmless in this order: a view's dependents always sort after
      -- it and so have not been rebuilt yet.
      EXECUTE format('DROP VIEW IF EXISTS track.%I CASCADE', r.view_name);
      EXECUTE r.create_sql;
      n := n + 1;

      -- A dropped view loses its COMMENTs, so put them back. Failing to
      -- document a view is not a reason to fail the load.
      BEGIN
        PERFORM ai.apply_column_docs('track', r.view_name);
      EXCEPTION WHEN OTHERS THEN
        INSERT INTO core.load_log(table_name, rows_staged, rows_expected, status, finished_at)
          VALUES ('track.' || r.view_name, NULL, NULL, 'COMMENTS FAILED: ' || SQLERRM, now());
      END;

    EXCEPTION WHEN OTHERS THEN
      -- A broken view must never abort a data load. Record and carry on;
      -- load_log is where the loader already reports per-table status.
      INSERT INTO core.load_log(table_name, rows_staged, rows_expected, status, finished_at)
        VALUES ('track.' || r.view_name, NULL, NULL, 'VIEW FAILED: ' || SQLERRM, now());
    END;
  END LOOP;
  RETURN n;
END $fn$;

-- ---------------------------------------------------------------------
-- track.column_guide - the whole dictionary in ONE query.
--
-- Replaces one information_schema round-trip per view. The agent asks
-- once, for the views it needs, and gets names, types and descriptions
-- together. apply_order 200 so it is created after everything it
-- describes; its content is read from the catalog at query time, so the
-- ordering only governs its own existence.
-- ---------------------------------------------------------------------
INSERT INTO core.view_defs (view_name, apply_order, create_sql, note) VALUES
('column_guide', 200, $v$
CREATE VIEW track.column_guide AS
SELECT
  c.table_name                                AS view_name,
  c.column_name,
  c.data_type,
  c.ordinal_position,
  col_description(k.oid, c.ordinal_position)  AS description
FROM information_schema.columns c
JOIN pg_class     k ON k.relname = c.table_name
JOIN pg_namespace n ON n.oid = k.relnamespace AND n.nspname = c.table_schema
WHERE c.table_schema = 'track'
$v$, 'Self-describing column dictionary for every track view. One query instead of an information_schema lookup per view. Edit the descriptions at /admin/columns.')
ON CONFLICT (view_name) DO UPDATE SET
  apply_order = EXCLUDED.apply_order,
  create_sql  = EXCLUDED.create_sql,
  note        = EXCLUDED.note;
