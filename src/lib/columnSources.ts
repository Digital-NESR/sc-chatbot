import { Pool } from 'pg';

/**
 * The databases whose column dictionaries are editable from /admin/columns.
 *
 * Descriptions are stored two ways, and deliberately so. materials_db rebuilds
 * every table daily from a staging clone, so its descriptions live in the same
 * core.load_config row that drives the load and get replayed on every swap. The
 * others are not rebuilt that way, so a standalone ai.column_docs table is
 * enough there.
 *
 * Both end up as real Postgres COMMENTs, which is what each agent actually
 * reads at query time.
 */

export type SourceId = 'materials' | 'sourceguide' | 'sns' | 'catalog';

type SourceDef = {
  id: SourceId;
  label: string;
  database: string;
  /** Where the editable copy lives. 'load_config' is driven by the loader. */
  storage: 'load_config' | 'column_docs';
  /** Objects the agent can see. Empty means "ask the database". */
  objects: { schema: string; name: string }[];
};

export const SOURCES: Record<SourceId, SourceDef> = {
  materials: {
    id: 'materials',
    label: 'Materials AI',
    database: process.env.MATERIALS_DB_NAME || 'materials_db',
    storage: 'load_config',
    objects: [], // taken from core.load_config
  },
  sourceguide: {
    id: 'sourceguide',
    label: 'SourceGuide — suppliers & spend',
    database: process.env.SOURCEGUIDE_DB_NAME || 'sourceguide_db',
    storage: 'column_docs',
    objects: [
      { schema: 'ai', name: 'sourcing' },
      { schema: 'ai', name: 'commodity_catalog' },
      { schema: 'ai', name: 'purchase_history' },
      { schema: 'public', name: 'sg_champions' },
    ],
  },
  catalog: {
    id: 'catalog',
    label: 'SourceGuide — contracted prices',
    database: process.env.CATALOG_DB_NAME || 'catalog_manager_db',
    storage: 'column_docs',
    objects: [
      { schema: 'public', name: 'pir_catalog' },
      { schema: 'public', name: 'supplier_directory' },
      { schema: 'public', name: 'catalog_entry' },
      { schema: 'public', name: 'rate_version' },
      { schema: 'public', name: 'currency' },
    ],
  },
  sns: {
    id: 'sns',
    label: 'SourceGuide — sole source registry',
    database: process.env.SNS_DB_NAME || 'sns_registry_db',
    storage: 'column_docs',
    objects: [
      { schema: 'public', name: 'sns_record' },
      { schema: 'public', name: 'sns_record_node' },
      { schema: 'public', name: 'sns_record_segment' },
      { schema: 'public', name: 'sns_reason' },
      { schema: 'public', name: 'sns_supplier' },
      { schema: 'public', name: 'sns_category_manager' },
      { schema: 'public', name: 'sns_country_manager' },
    ],
  },
};

const ORDER: SourceId[] = ['materials', 'sourceguide', 'catalog', 'sns'];
export const SOURCE_LIST = ORDER.map((id) => SOURCES[id]);

export function isSourceId(v: unknown): v is SourceId {
  return typeof v === 'string' && Object.prototype.hasOwnProperty.call(SOURCES, v);
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
