import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

const DB_VAR_NAMES = ['DB_HOST', 'DB_PORT', 'DB_NAME', 'DB_USER', 'DB_PASSWORD'] as const;

function buildConnectionString(): string {
  const { DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD, DB_SSL } = process.env;

  // Build-time safety net: if none of the individual DB vars are present (e.g. Vercel
  // static analysis), return a dummy URL so the build doesn't crash.
  if (DB_VAR_NAMES.every((key) => !process.env[key])) {
    return 'postgresql://dummy:dummy@localhost:5432/dummy';
  }

  const missing = DB_VAR_NAMES.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    throw new Error(`Missing required database environment variables: ${missing.join(', ')}`);
  }

  const sslMode = DB_SSL === 'true' ? 'require' : 'prefer';
  return `postgresql://${DB_USER}:${encodeURIComponent(DB_PASSWORD!)}@${DB_HOST}:${DB_PORT}/${DB_NAME}?sslmode=${sslMode}`;
}

const prismaClientSingleton = () => {
  const pool = new Pool({ connectionString: buildConnectionString() });
  const adapter = new PrismaPg(pool);

  return new PrismaClient({ adapter });
};

type PrismaClientSingleton = ReturnType<typeof prismaClientSingleton>;

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClientSingleton | undefined;
};

export const prisma = globalForPrisma.prisma ?? prismaClientSingleton();

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;