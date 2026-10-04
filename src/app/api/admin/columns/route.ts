import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/authOptions';
import { materialsPool } from '@/lib/materialsDb';
import { isAdmin } from '@/lib/admin';

export const dynamic = 'force-dynamic';

/**
 * Column descriptions for the Materials AI agent.
 *
 * They are stored twice on purpose: in core.load_config.col_comments, which is
 * the declarative source the daily load replays, and as real Postgres COMMENTs,
 * which is what the agent reads at query time. A save writes the first and then
 * calls core.apply_comments to refresh the second, so an edit is live for the
 * agent on its very next query.
 *
 * Writing only the COMMENT would not survive: the daily publish swaps each table
 * for a staging clone built with CREATE TABLE ... LIKE, which copies neither
 * indexes nor comments. load_config is what carries them across that swap.
 */

type Row = {
    pg_table: string;
    load_mode: string | null;
    column_name: string;
    data_type: string;
    description: string | null;
};

export async function GET() {
    const session = await getServerSession(authOptions);
    if (!isAdmin(session?.user?.email)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    try {
        const { rows } = await materialsPool.query<Row>(`
            SELECT lc.pg_table,
                   lc.load_mode,
                   ic.column_name,
                   ic.data_type,
                   col_description(k.oid, ic.ordinal_position) AS description
            FROM core.load_config lc
            JOIN pg_class k ON k.relname = lc.pg_table
            JOIN pg_namespace n ON n.oid = k.relnamespace AND n.nspname = 'core'
            JOIN information_schema.columns ic
              ON ic.table_schema = 'core' AND ic.table_name = lc.pg_table
            WHERE lc.enabled
            ORDER BY lc.load_order, ic.ordinal_position
        `);

        type OutColumn = { name: string; type: string; description: string };
        const tables: Record<string, { name: string; loadMode: string; columns: OutColumn[] }> = {};
        for (const r of rows) {
            if (!tables[r.pg_table]) {
                tables[r.pg_table] = {
                    name: r.pg_table,
                    loadMode: r.load_mode || 'full',
                    columns: [],
                };
            }
            tables[r.pg_table].columns.push({
                name: r.column_name,
                type: r.data_type,
                description: r.description || '',
            });
        }

        const list = Object.values(tables);
        const total = list.reduce((a, t) => a + t.columns.length, 0);
        const described = list.reduce(
            (a, t) => a + t.columns.filter((c) => c.description).length,
            0,
        );

        return NextResponse.json({ tables: list, total, described });
    } catch (error) {
        console.error('Failed to load column descriptions:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

export async function PATCH(request: Request) {
    const session = await getServerSession(authOptions);
    if (!isAdmin(session?.user?.email)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    let body: { table?: string; column?: string; description?: string };
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const table = String(body.table || '');
    const column = String(body.column || '');
    const description = String(body.description ?? '').trim();

    if (!table || !column) {
        return NextResponse.json({ error: 'table and column are required' }, { status: 400 });
    }
    if (description.length > 2000) {
        return NextResponse.json({ error: 'Description too long (max 2000)' }, { status: 400 });
    }

    const client = await materialsPool.connect();
    try {
        // Identifiers end up inside DDL, so neither is taken on trust: both must
        // exist in the loader's own configuration and in the live table.
        const check = await client.query(
            `SELECT 1
             FROM core.load_config lc
             JOIN information_schema.columns ic
               ON ic.table_schema = 'core' AND ic.table_name = lc.pg_table
             WHERE lc.pg_table = $1 AND ic.column_name = $2 AND lc.enabled`,
            [table, column],
        );
        if (check.rowCount === 0) {
            return NextResponse.json({ error: 'Unknown table or column' }, { status: 404 });
        }

        await client.query('BEGIN');

        if (description === '') {
            await client.query(
                `UPDATE core.load_config SET col_comments = col_comments - $2 WHERE pg_table = $1`,
                [table, column],
            );
            // apply_comments only writes what the jsonb holds, so a removal has to
            // clear the live COMMENT explicitly. format(%I) quotes the identifiers.
            const { rows } = await client.query<{ ddl: string }>(
                `SELECT format('COMMENT ON COLUMN core.%I.%I IS NULL', $1::text, $2::text) AS ddl`,
                [table, column],
            );
            await client.query(rows[0].ddl);
        } else {
            await client.query(
                `UPDATE core.load_config
                 SET col_comments = coalesce(col_comments, '{}'::jsonb)
                                    || jsonb_build_object($2::text, $3::text)
                 WHERE pg_table = $1`,
                [table, column],
            );
            await client.query(`SELECT core.apply_comments('core', $1)`, [table]);
        }

        await client.query('COMMIT');

        // Read the live comment back, so the UI confirms what the agent will see
        // rather than echoing what was submitted.
        const { rows: after } = await client.query<{ description: string | null }>(
            `SELECT col_description(k.oid, ic.ordinal_position) AS description
             FROM information_schema.columns ic
             JOIN pg_class k ON k.relname = ic.table_name
             JOIN pg_namespace n ON n.oid = k.relnamespace AND n.nspname = 'core'
             WHERE ic.table_schema = 'core' AND ic.table_name = $1 AND ic.column_name = $2`,
            [table, column],
        );

        return NextResponse.json({
            ok: true,
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
