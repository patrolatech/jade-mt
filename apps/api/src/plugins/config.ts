export interface ApiConfig {
  databaseUrl: string;
  host: string;
  port: number;
  logLevel: string;
  datasets?: ('PRODES' | 'DETER')[];
  sourceEvidenceDirectory?: string;
}

export function readConfig(env: NodeJS.ProcessEnv = process.env): ApiConfig {
  const port = Number(env.API_PORT ?? '3000');
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    throw new Error('API_PORT must be an integer from 1 to 65535');
  const logLevel = env.LOG_LEVEL ?? 'info';
  const datasets = (env.ENVIRONMENTAL_DATASETS ?? 'PRODES,DETER')
    .split(',')
    .map((value) => value.trim());
  if (
    new Set(datasets).size !== datasets.length ||
    !datasets.every((value) => value === 'PRODES' || value === 'DETER')
  ) {
    throw new Error(
      'ENVIRONMENTAL_DATASETS must select unique PRODES and/or DETER datasets',
    );
  }
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
    datasets,
    ...(env.SOURCE_EVIDENCE_DIR
      ? { sourceEvidenceDirectory: env.SOURCE_EVIDENCE_DIR }
      : {}),
  };
}
