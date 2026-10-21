import { Pool } from 'pg';
const globalForPg = globalThis as unknown as { planoraPool?: Pool };
export const pool = globalForPg.planoraPool ?? new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.PGSSL === 'true' ? { rejectUnauthorized: true } : undefined,
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
});
if (process.env.NODE_ENV !== 'production') globalForPg.planoraPool = pool;
