import type { FastifyPluginAsync } from 'fastify';
import type { ValidationInput } from '@jade/schemas';
import type { ValidationService } from './validation.service.js';
import { validationSchema } from './validation.schemas.js';

export const validationRoutes: FastifyPluginAsync<{
  validate: ValidationService;
}> = async (app, options) => {
  app.post<{ Body: ValidationInput }>(
    '/validations',
    { schema: validationSchema },
    async (request) => options.validate(request.body),
  );
};
