import { Pool } from 'pg';

/**
 * The two agents whose column dictionaries are editable from /admin/columns.
 *
 * They store descriptions differently, and deliberately so. materials_db rebuilds
 * every table daily from a staging clone, so its descriptions live in the same
 * load_config row that drives the load and get replayed on every swap. sourceguide_db
 * is not rebuilt that way, so a standalone ai.column_docs table is enough there.
 *
 * Both end up as real Postgres COMMENTs, which is what each agent actually reads
 * at query time.
 */

export type SourceId = 'materials' | 'sourceguide';

type SourceDef = {
  id: SourceId;
  label: string;
  agent: string;
  database: string;
  /** Objects the agent can see, as "schema.name". */
  objects: { schema: string; name: string }[];
};

export const SOURCES: Record<SourceId, SourceDef> = {
  materials: {
    id: 'materials',
    label: 'Materials AI',
    agent: 'Material AI',
    database: process.env.MATERIALS_DB_NAME || 'materials_db',
    // Driven from core.load_config rather than a fixed list.
    objects: [],
  },
  sourceguide: {
    id: 'sourceguide',
    label: 'SourceGuide AI',
    agent: 'SourceGuide AI',
    database: process.env.SOURCEGUIDE_DB_NAME || 'sourceguide_db',
    objects: [
      { schema: 'ai', name: 'sourcing' },
      { schema: 'ai', name: 'commodity_catalog' },
      { schema: 'ai', name: 'purchase_history' },
      { schema: 'public', name: 'sg_champions' },
    ],
  },
};

export function isSourceId(v: unknown): v is SourceId {
  return v === 'materials' || v === 'sourceguide';
}

const DB_VAR_NAMES = ['DB_HOST', 'DB_PORT', 'DB_USER', 'DB_PASSWORD'] as const;

function connectionString(database: string): string {
  const { DB_HOST, DB_PORT, DB_USER, DB_PASSWORD } = process.env;

  // Build-time safety net, mirroring src/lib/prisma.ts.
  if (DB_VAR_NAMES.every((key) => !process.env[key])) {
    return 'postgresql://dummy:dummy@localhost:5432/dummy';
  }
  const missing = DB_VAR_NAMES.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    throw new Error(`Missing required database environment variables: ${missing.join(', ')}`);
  }
  return `postgresql://${DB_USER}:${encodeURIComponent(DB_PASSWORD!)}@${DB_HOST}:${DB_PORT}/${database}?uselibpqcompat=true&sslmode=require`;
}

// One pool per database, reused across requests and across hot reloads in dev.
const globalForPools = globalThis as unknown as { columnPools: Map<string, Pool> | undefined };
const pools = globalForPools.columnPools ?? new Map<string, Pool>();
if (process.env.NODE_ENV !== 'production') globalForPools.columnPools = pools;

export function poolFor(source: SourceId): Pool {
  const db = SOURCES[source].database;
  let p = pools.get(db);
  if (!p) {
    p = new Pool({ connectionString: connectionString(db), max: 3 });
    pools.set(db, p);
  }
  return p;
}
