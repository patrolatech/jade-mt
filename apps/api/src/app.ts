import Fastify from 'fastify';
import {
  PostgisGeometryRepository,
  InvalidGeometryError,
  PostgisValidationRepository,
} from '@jade/database';
import {
  TerraBrasilisSource,
  type ValidationDependencies,
} from '@jade/environmental-oracle';
import { GeometrySchema } from '@jade/schemas';
import { readConfig, type ApiConfig } from './plugins/config.js';
import { connectDatabase } from './plugins/database.js';
import {
  createValidationService,
  classifyExecutionError,
  ValidationExecutionError,
  type ValidationPersistence,
} from './modules/validations/validation.service.js';
import { validationRoutes } from './modules/validations/validation.routes.js';
import {
  archiveSourcePage,
  describeSourcePage,
} from './plugins/source-evidence.js';
import { processingVersion } from './plugins/processing-version.js';

export async function buildApp(
  options: {
    config?: ApiConfig;
    validationDependencies?: ValidationDependencies;
    validationPersistence?: ValidationPersistence;
  } = {},
) {
  const config = options.config ?? readConfig();
  const app = Fastify({
    logger: { level: config.logLevel },
    bodyLimit: 1_048_576,
    ajv: { customOptions: { coerceTypes: false, removeAdditional: false } },
  });
  app.addSchema(GeometrySchema);
  app.setErrorHandler((error, request, reply) => {
    const execution =
      error instanceof ValidationExecutionError ? error : undefined;
    if (!execution && error instanceof Error) {
      if (
        (error instanceof InvalidGeometryError &&
          error.target === 'property') ||
        'validation' in error
      )
        return reply
          .code(400)
          .send({ code: 'INVALID_REQUEST', message: error.message });
      if (
        'statusCode' in error &&
        typeof error.statusCode === 'number' &&
        error.statusCode >= 400 &&
        error.statusCode < 500
      )
        return reply
          .code(error.statusCode)
          .send({ code: 'INVALID_REQUEST', message: error.message });
    }
    const failure = classifyExecutionError(execution ? execution.cause : error);
    const statusCode = {
      SOURCE_UNAVAILABLE: 503,
      RESEARCH_NOT_IMPLEMENTED: 501,
      INTERNAL_ERROR: 500,
    }[failure.code];
    if (statusCode === 500) request.log.error({ err: error });
    return reply.code(statusCode).send({
      ...failure,
      ...(execution ? { validationId: execution.validationId } : {}),
    });
  });
  try {
    let dependencies = options.validationDependencies;
    let persistence = options.validationPersistence;
    if (!dependencies) {
      const pool = await connectDatabase(app, config.databaseUrl);
      dependencies = {
        source: new TerraBrasilisSource({
          ...(config.datasets ? { datasets: config.datasets } : {}),
          onPage: archiveSourcePage(config.sourceEvidenceDirectory),
        }),
        geometryRepository: new PostgisGeometryRepository(pool),
      };
      persistence ??= {
        repository: new PostgisValidationRepository(
          pool,
          await processingVersion(),
        ),
        describePage: describeSourcePage(config.sourceEvidenceDirectory),
      };
    }
    const repository = persistence?.repository;
    app.get('/health', async () => ({ status: 'ok', service: 'jade-api' }));
    await app.register(validationRoutes, {
      validate: createValidationService(dependencies, persistence),
      ...(repository ? { find: (id: string) => repository.find(id) } : {}),
    });
    return app;
  } catch (error) {
    await app.close();
    throw error;
  }
}
