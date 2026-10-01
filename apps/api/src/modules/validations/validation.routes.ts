import type { FastifyPluginAsync } from 'fastify';
import type { StoredValidation, ValidationInput } from '@jade/schemas';
import type { ValidationService } from './validation.service.js';
import {
  storedValidationSchema,
  validationSchema,
} from './validation.schemas.js';

export const validationRoutes: FastifyPluginAsync<{
  validate: ValidationService;
  find?: (validationId: string) => Promise<StoredValidation | null>;
}> = async (app, options) => {
  app.post<{ Body: ValidationInput }>(
    '/validations',
    { schema: validationSchema },
    async (request) => options.validate(request.body),
  );
  const find = options.find;
  if (find) {
    app.get<{ Params: { validationId: string } }>(
      '/validations/:validationId',
      { schema: storedValidationSchema },
      async (request, reply) => {
        const stored = await find(request.params.validationId);
        if (!stored)
          return reply.code(404).send({
            code: 'VALIDATION_NOT_FOUND',
            message: 'Validation not found',
          });
        return stored;
      },
    );
  }
};
