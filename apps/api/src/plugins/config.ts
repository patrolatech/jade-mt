export interface ApiConfig {
  databaseUrl: string;
  host: string;
  port: number;
  logLevel: string;
}

export function readConfig(env: NodeJS.ProcessEnv = process.env): ApiConfig {
  const port = Number(env.API_PORT ?? '3000');
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    throw new Error('API_PORT must be an integer from 1 to 65535');
  const logLevel = env.LOG_LEVEL ?? 'info';
  if (
    !['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'].includes(
      logLevel,
    )
  )
    throw new Error('Invalid LOG_LEVEL');
  return {
    databaseUrl:
      env.DATABASE_URL ?? 'postgresql://jade:jade_dev@127.0.0.1:5432/jade',
    host: env.API_HOST ?? '127.0.0.1',
    port,
    logLevel,
  };
}
