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
 *
 * 'track' is materials_db too, but a separate source on purpose: Track My
 * Request reads track.* and is forbidden from touching core.*, and the views
 * rename columns on the way through, so a comment on the core table would not
 * reach it. Its views are dropped and recreated by every load, which is why
 * its descriptions live in ai.column_docs and are replayed by
 * core.rebuild_track_views() - see db/track_column_docs.sql.
 */

export type SourceId = 'materials' | 'track' | 'sourceguide' | 'sns' | 'catalog';

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
  track: {
    id: 'track',
    label: 'Track My Request',
    database: process.env.MATERIALS_DB_NAME || 'materials_db',
    storage: 'column_docs',
    objects: [
      { schema: 'track', name: 'request_lifecycle' },
      { schema: 'track', name: 'pr_line' },
      { schema: 'track', name: 'po_line' },
      { schema: 'track', name: 'open_pr' },
      { schema: 'track', name: 'pr_pending_release' },
      { schema: 'track', name: 'po_draft' },
      { schema: 'track', name: 'po_pending_release' },
      { schema: 'track', name: 'po_open' },
      { schema: 'track', name: 'pr_waiting_with' },
      { schema: 'track', name: 'po_waiting_with' },
      { schema: 'track', name: 'goods_receipt' },
      // invoice and grir_open are gone on purpose: the invoice data is not
      // logged reliably in SAP, so the tracked lifecycle now ends at the
      // goods receipt. See db/track_drop_invoice.sql.
      { schema: 'track', name: 'in_transit' },
      { schema: 'track', name: 'approval_chain' },
      { schema: 'track', name: 'data_freshness' },
      { schema: 'track', name: 'column_guide' },
    ],
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

const ORDER: SourceId[] = ['materials', 'track', 'sourceguide', 'catalog', 'sns'];
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
