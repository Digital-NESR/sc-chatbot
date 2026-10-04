import { Pool } from 'pg';

// The app's own data lives in DB_NAME (chat history); the Materials AI platform
// lives in a separate database on the same server. Same credentials, different
// database, so only the name is overridden.
const MATERIALS_DB = process.env.MATERIALS_DB_NAME || 'materials_db';

const DB_VAR_NAMES = ['DB_HOST', 'DB_PORT', 'DB_USER', 'DB_PASSWORD'] as const;

function buildConnectionString(): string {
  const { DB_HOST, DB_PORT, DB_USER, DB_PASSWORD } = process.env;

  // Build-time safety net, mirroring src/lib/prisma.ts: if none of the vars are
  // present (e.g. during static analysis) hand back a dummy so the build runs.
  if (DB_VAR_NAMES.every((key) => !process.env[key])) {
    return 'postgresql://dummy:dummy@localhost:5432/dummy';
  }

  const missing = DB_VAR_NAMES.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    throw new Error(`Missing required database environment variables: ${missing.join(', ')}`);
  }

  return `postgresql://${DB_USER}:${encodeURIComponent(DB_PASSWORD!)}@${DB_HOST}:${DB_PORT}/${MATERIALS_DB}?uselibpqcompat=true&sslmode=require`;
}

const globalForMaterials = globalThis as unknown as {
  materialsPool: Pool | undefined;
};

export const materialsPool =
  globalForMaterials.materialsPool ??
  new Pool({ connectionString: buildConnectionString(), max: 4 });

if (process.env.NODE_ENV !== 'production') globalForMaterials.materialsPool = materialsPool;
