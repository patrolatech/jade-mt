import pg from 'pg';

export function createDatabasePool(connectionString: string) {
  return new pg.Pool({
    connectionString,
    max: 5,
    connectionTimeoutMillis: 5_000,
    statement_timeout: 10_000,
  });
}

export type DatabasePool = ReturnType<typeof createDatabasePool>;

export async function verifyDatabase(pool: DatabasePool): Promise<void> {
  await pool.query('SELECT postgis_version()');
}
