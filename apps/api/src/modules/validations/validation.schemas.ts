import { ValidationInputSchema, ValidationResultSchema } from '@jade/schemas';

export const ApiErrorSchema = {
  type: 'object',
  required: ['code', 'message'],
  additionalProperties: false,
  properties: { code: { type: 'string' }, message: { type: 'string' } },
} as const;

export const validationSchema = {
  body: ValidationInputSchema,
  response: {
    200: ValidationResultSchema,
    400: ApiErrorSchema,
    501: ApiErrorSchema,
    503: ApiErrorSchema,
    500: ApiErrorSchema,
  },
};
