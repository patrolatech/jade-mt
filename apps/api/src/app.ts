import Fastify from 'fastify';
import { PostgisGeometryRepository } from '@jade/database';
import {
  TerraBrasilisSource,
  EnvironmentalSourceUnavailableError,
  type ValidationDependencies,
} from '@jade/environmental-oracle';
import { GeometrySchema, ResearchNotImplementedError } from '@jade/schemas';
import { readConfig, type ApiConfig } from './plugins/config.js';
import { connectDatabase } from './plugins/database.js';
import { createValidationService } from './modules/validations/validation.service.js';
import { validationRoutes } from './modules/validations/validation.routes.js';

export async function buildApp(
  options: {
    config?: ApiConfig;
    validationDependencies?: ValidationDependencies;
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
    if (error instanceof Error && 'validation' in error)
      return reply
        .code(400)
        .send({ code: 'INVALID_REQUEST', message: error.message });
    if (error instanceof ResearchNotImplementedError)
      return reply
        .code(501)
        .send({ code: 'RESEARCH_NOT_IMPLEMENTED', message: error.message });
    if (error instanceof EnvironmentalSourceUnavailableError)
      return reply
        .code(503)
        .send({ code: 'SOURCE_UNAVAILABLE', message: error.message });
    if (
      error instanceof Error &&
      'statusCode' in error &&
      typeof error.statusCode === 'number' &&
      error.statusCode >= 400 &&
      error.statusCode < 500
    ) {
      return reply
        .code(error.statusCode)
        .send({ code: 'INVALID_REQUEST', message: error.message });
    }
    request.log.error({ err: error });
    return reply.code(500).send({
      code: 'INTERNAL_ERROR',
      message: 'Validation could not be completed',
    });
  });
  try {
    const dependencies = options.validationDependencies ?? {
      source: new TerraBrasilisSource(),
      geometryRepository: new PostgisGeometryRepository(
        await connectDatabase(app, config.databaseUrl),
      ),
    };
    app.get('/health', async () => ({ status: 'ok', service: 'jade-api' }));
    await app.register(validationRoutes, {
      validate: createValidationService(dependencies),
    });
    return app;
  } catch (error) {
    await app.close();
    throw error;
  }
}
