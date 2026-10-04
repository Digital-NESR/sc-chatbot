import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/authOptions';
import { isAdmin } from '@/lib/admin';
import { SOURCES, SOURCE_LIST, isSourceId, poolFor, type SourceId } from '@/lib/columnSources';

export const dynamic = 'force-dynamic';

/**
 * Column dictionaries for the agents that have one.
 *
 * Descriptions are stored twice on purpose: as data, which is what survives a
 * rebuild, and as real Postgres COMMENTs, which is what the agent reads at query
 * time. A save writes the first and then re-applies the second, so an edit is
 * live for the agent on its very next query.
 *
 * Where the data lives differs by source, because the two databases are rebuilt
 * differently - see src/lib/columnSources.ts.
 */

type OutColumn = { name: string; type: string; description: string };
type OutTable = { name: string; schema: string; note: string; columns: OutColumn[] };

/** Objects whose columns are editable, and how they are grouped in the UI. */
async function listObjects(source: SourceId): Promise<{ schema: string; name: string; note: string }[]> {
  if (SOURCES[source].storage === 'column_docs') {
    return SOURCES[source].objects.map((o) => ({ ...o, note: '' }));
  }
  // materials: whatever the loader is currently configured to publish.
  const { rows } = await poolFor('materials').query<{ pg_table: string; load_mode: string | null }>(
    `SELECT pg_table, load_mode FROM core.load_config WHERE enabled ORDER BY load_order`,
  );
  return rows.map((r) => ({
    schema: 'core',
    name: r.pg_table,
    note: (r.load_mode || 'full') === 'incremental' ? 'incremental' : '',
  }));
}

export async function GET(request: Request) {
  const session = await getServerSession(authOptions);
  if (!isAdmin(session?.user?.email)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const raw = new URL(request.url).searchParams.get('source') ?? 'materials';
  if (!isSourceId(raw)) {
    return NextResponse.json({ error: 'Unknown source' }, { status: 400 });
  }
  const source: SourceId = raw;

  try {
    const objects = await listObjects(source);
    const pool = poolFor(source);
    const tables: OutTable[] = [];

    for (const o of objects) {
      const { rows } = await pool.query<{ column_name: string; data_type: string; description: string | null }>(
        `SELECT ic.column_name, ic.data_type,
                col_description(k.oid, ic.ordinal_position) AS description
         FROM information_schema.columns ic
         JOIN pg_class k ON k.relname = ic.table_name
         JOIN pg_namespace n ON n.oid = k.relnamespace AND n.nspname = ic.table_schema
         WHERE ic.table_schema = $1 AND ic.table_name = $2
         ORDER BY ic.ordinal_position`,
        [o.schema, o.name],
      );
      if (rows.length === 0) continue; // dropped upstream; skip rather than show an empty shell
      tables.push({
        name: o.name,
        schema: o.schema,
        note: o.note,
        columns: rows.map((r) => ({
          name: r.column_name,
          type: r.data_type,
          description: r.description || '',
        })),
      });
    }

    const total = tables.reduce((a, t) => a + t.columns.length, 0);
    const described = tables.reduce((a, t) => a + t.columns.filter((c) => c.description).length, 0);

    return NextResponse.json({
      source,
      label: SOURCES[source].label,
      database: SOURCES[source].database,
      sources: SOURCE_LIST.map((s) => ({ id: s.id, label: s.label })),
      tables,
      total,
      described,
    });
  } catch (error) {
    console.error(`Failed to load column descriptions for ${source}:`, error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const session = await getServerSession(authOptions);
  if (!isAdmin(session?.user?.email)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  let body: { source?: string; schema?: string; table?: string; column?: string; description?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const raw = body.source ?? 'materials';
  if (!isSourceId(raw)) {
    return NextResponse.json({ error: 'Unknown source' }, { status: 400 });
  }
  const source: SourceId = raw;

  const schema = String(body.schema || '');
  const table = String(body.table || '');
  const column = String(body.column || '');
  const description = String(body.description ?? '').trim();
  const editor = session?.user?.email || 'unknown';

  if (!schema || !table || !column) {
    return NextResponse.json({ error: 'schema, table and column are required' }, { status: 400 });
  }
  if (description.length > 2000) {
    return NextResponse.json({ error: 'Description too long (max 2000)' }, { status: 400 });
  }

  // Identifiers end up inside DDL, so neither is taken on trust: the object must
  // be one this page is allowed to edit, and the column must really exist on it.
  const allowed = (await listObjects(source)).some((o) => o.schema === schema && o.name === table);
  if (!allowed) {
    return NextResponse.json({ error: 'Unknown table for this source' }, { status: 404 });
  }

  const client = await poolFor(source).connect();
  try {
    const check = await client.query(
      `SELECT 1 FROM information_schema.columns
       WHERE table_schema = $1 AND table_name = $2 AND column_name = $3`,
      [schema, table, column],
    );
    if (check.rowCount === 0) {
      return NextResponse.json({ error: 'Unknown column' }, { status: 404 });
    }

    await client.query('BEGIN');

    if (SOURCES[source].storage === 'load_config') {
      if (description === '') {
        await client.query(
          `UPDATE core.load_config SET col_comments = col_comments - $2 WHERE pg_table = $1`,
          [table, column],
        );
      } else {
        await client.query(
          `UPDATE core.load_config
           SET col_comments = coalesce(col_comments, '{}'::jsonb)
                              || jsonb_build_object($2::text, $3::text)
           WHERE pg_table = $1`,
          [table, column, description],
        );
      }
    } else {
      if (description === '') {
        await client.query(
          `DELETE FROM ai.column_docs
           WHERE object_schema = $1 AND object_name = $2 AND column_name = $3`,
          [schema, table, column],
        );
      } else {
        await client.query(
          `INSERT INTO ai.column_docs (object_schema, object_name, column_name, description, updated_by)
           VALUES ($1,$2,$3,$4,$5)
           ON CONFLICT (object_schema, object_name, column_name)
           DO UPDATE SET description = EXCLUDED.description, updated_at = now(), updated_by = EXCLUDED.updated_by`,
          [schema, table, column, description, editor],
        );
      }
    }

    if (description === '') {
      // The apply functions only write what is stored, so a removal has to clear
      // the live COMMENT explicitly. format(%I) quotes the identifiers.
      const { rows } = await client.query<{ ddl: string }>(
        `SELECT format('COMMENT ON COLUMN %I.%I.%I IS NULL', $1::text, $2::text, $3::text) AS ddl`,
        [schema, table, column],
      );
      await client.query(rows[0].ddl);
    } else if (SOURCES[source].storage === 'load_config') {
      await client.query(`SELECT core.apply_comments('core', $1)`, [table]);
    } else {
      await client.query(`SELECT ai.apply_column_docs($1, $2)`, [schema, table]);
    }

    await client.query('COMMIT');

    // Read the live comment back, so the UI confirms what the agent will see
    // rather than echoing what was submitted.
    const { rows: after } = await client.query<{ description: string | null }>(
      `SELECT col_description(k.oid, ic.ordinal_position) AS description
       FROM information_schema.columns ic
       JOIN pg_class k ON k.relname = ic.table_name
       JOIN pg_namespace n ON n.oid = k.relnamespace AND n.nspname = ic.table_schema
       WHERE ic.table_schema = $1 AND ic.table_name = $2 AND ic.column_name = $3`,
      [schema, table, column],
    );

    return NextResponse.json({
      ok: true,
      source,
      schema,
      table,
      column,
      description: after[0]?.description || '',
    });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('Failed to save column description:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  } finally {
    client.release();
  }
}
