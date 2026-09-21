import {
  StoredValidationSchema,
  ValidationInputSchema,
  ValidationResultSchema,
} from '@jade/schemas';

export const ApiErrorSchema = {
  type: 'object',
  required: ['code', 'message'],
  additionalProperties: false,
  properties: {
    code: { type: 'string' },
    message: { type: 'string' },
    validationId: { type: 'string', format: 'uuid' },
  },
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

export const storedValidationSchema = {
  params: {
    type: 'object',
    required: ['validationId'],
    additionalProperties: false,
    properties: { validationId: { type: 'string', format: 'uuid' } },
  },
  response: {
    200: StoredValidationSchema,
    400: ApiErrorSchema,
    404: ApiErrorSchema,
    500: ApiErrorSchema,
  },
};
