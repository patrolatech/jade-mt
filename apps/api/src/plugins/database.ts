import type { FastifyInstance } from 'fastify';
import { createDatabasePool, verifyDatabase } from '@jade/database';

export async function connectDatabase(
  app: FastifyInstance,
  databaseUrl: string,
) {
  const pool = createDatabasePool(databaseUrl);
  try {
    await verifyDatabase(pool);
  } catch (error) {
    await pool.end();
    throw error;
  }
  pool.on('error', (error) =>
    app.log.error({ err: error }, 'Idle database connection failed'),
  );
  app.addHook('onClose', async () => pool.end());
  return pool;
}
