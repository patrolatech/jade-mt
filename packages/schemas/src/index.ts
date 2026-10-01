import { Type, type Static } from '@sinclair/typebox';
import { GeometrySchema, PolygonGeometrySchema } from './geometry.js';

export { GeometrySchema };
export {
  PolygonGeometrySchema,
  isPolygonGeometry,
  countPositions,
  MAX_INPUT_POSITIONS,
} from './geometry.js';
export type { Geometry } from './geometry.js';

export const ValidationStatusSchema = Type.Union([
  Type.Literal('PASS'),
  Type.Literal('FAIL'),
  Type.Literal('INCONCLUSIVE'),
  Type.Literal('ERROR'),
]);
export type ValidationStatus = Static<typeof ValidationStatusSchema>;

export const MethodologySchema = Type.Object(
  {
    id: Type.Literal('JADE-ENV'),
    version: Type.Literal('0.1'),
  },
  { additionalProperties: false },
);

export const ValidationInputSchema = Type.Object(
  {
    geometry: PolygonGeometrySchema,
    commodity: Type.String({ minLength: 1, maxLength: 100, pattern: '\\S' }),
    cutoffDate: Type.String({ format: 'date' }),
    property_id: Type.Optional(Type.String({ minLength: 1, maxLength: 128 })),
    plot_id: Type.Optional(Type.String({ minLength: 1, maxLength: 128 })),
  },
  { additionalProperties: false },
);
export type ValidationInput = Omit<
  Static<typeof ValidationInputSchema>,
  'geometry'
> & {
  geometry: import('./geometry.js').Geometry;
};

export const GeometryAnalysisSchema = Type.Object(
  {
    intersectionExists: Type.Boolean(),
    intersectionAreaM2: Type.Number({ minimum: 0 }),
    intersectionPercentage: Type.Number({ minimum: 0, maximum: 100 }),
  },
  { additionalProperties: false },
);
export type GeometryAnalysis = Static<typeof GeometryAnalysisSchema>;

export const EnvironmentalEventSchema = Type.Object(
  {
    id: Type.String({ minLength: 1 }),
    provider: Type.String({ minLength: 1 }),
    dataset: Type.String({ minLength: 1 }),
    geometry: Type.Ref(GeometrySchema),
    observedAt: Type.Union([Type.String(), Type.Null()]),
    temporalPrecision: Type.Union([
      Type.Literal('day'),
      Type.Literal('month'),
      Type.Literal('year'),
      Type.Literal('unknown'),
    ]),
    temporalBasis: Type.Optional(
      Type.Union([
        Type.Literal('observation'),
        Type.Literal('occurrence'),
        Type.Literal('prodes-year'),
        Type.Literal('unknown'),
      ]),
    ),
    provenance: Type.Optional(
      Type.Object(
        {
          layer: Type.String({ minLength: 1 }),
          payloadHash: Type.String({ pattern: '^[a-f0-9]{64}$' }),
          recordLocator: Type.String({ minLength: 1 }),
          normalizerVersion: Type.String({ minLength: 1 }),
        },
        { additionalProperties: false },
      ),
    ),
  },
  { additionalProperties: false },
);
export type EnvironmentalEvent = Omit<
  Static<typeof EnvironmentalEventSchema>,
  'geometry'
> & {
  geometry: import('./geometry.js').Geometry;
};

export const SourceReportSchema = Type.Object(
  {
    provider: Type.String(),
    dataset: Type.String(),
    layer: Type.String(),
    crs: Type.Literal('EPSG:4326'),
    cutoffDate: Type.String(),
    datasetVersion: Type.Union([Type.String(), Type.Null()]),
    adapter: Type.Optional(
      Type.Object(
        {
          name: Type.String({ minLength: 1 }),
          version: Type.String({ minLength: 1 }),
        },
        { additionalProperties: false },
      ),
    ),
    coverage: Type.Object(
      {
        status: Type.Union([
          Type.Literal('sufficient'),
          Type.Literal('insufficient'),
          Type.Literal('unknown'),
        ]),
        reason: Type.String(),
      },
      { additionalProperties: false },
    ),
    matchedEvents: Type.Integer({ minimum: 0 }),
    pages: Type.Array(
      Type.Object(
        {
          requestUrl: Type.String(),
          method: Type.Union([Type.Literal('GET'), Type.Literal('POST')]),
          requestBody: Type.Optional(Type.String()),
          retrievedAt: Type.String({ format: 'date-time' }),
          payloadHash: Type.String({ pattern: '^[a-f0-9]{64}$' }),
          returned: Type.Integer({ minimum: 0 }),
        },
        { additionalProperties: false },
      ),
    ),
  },
  { additionalProperties: false },
);
export type SourceReport = Static<typeof SourceReportSchema>;

export const ValidationResultSchema = Type.Object(
  {
    validationId: Type.String({ format: 'uuid' }),
    methodology: MethodologySchema,
    methodologyStatus: Type.Literal('draft'),
    sources: Type.Array(SourceReportSchema),
    status: ValidationStatusSchema,
    eventsFound: Type.Integer({ minimum: 0 }),
    eventAnalyses: Type.Array(
      Type.Object(
        {
          eventId: Type.String(),
          analysis: GeometryAnalysisSchema,
        },
        { additionalProperties: false },
      ),
    ),
    issues: Type.Optional(
      Type.Array(
        Type.Object(
          {
            code: Type.Union([
              Type.Literal('INVALID_EVENT_GEOMETRY'),
              Type.Literal('METHODOLOGY_PENDING_APPROVAL'),
              Type.Literal('INSUFFICIENT_COVERAGE'),
              Type.Literal('UNCERTAIN_EVENT_DATE'),
            ]),
            eventId: Type.Optional(Type.String()),
            message: Type.String(),
          },
          { additionalProperties: false },
        ),
      ),
    ),
  },
  { additionalProperties: false },
);
export type ValidationResult = Static<typeof ValidationResultSchema>;

export const ArchivedSourcePageSchema = Type.Object(
  {
    payloadHash: Type.String({ pattern: '^[a-f0-9]{64}$' }),
    storageKey: Type.String(),
    byteLength: Type.Integer({ minimum: 0 }),
    requestUrl: Type.String(),
    method: Type.Union([Type.Literal('GET'), Type.Literal('POST')]),
    requestBody: Type.Optional(Type.String()),
    retrievedAt: Type.String({ format: 'date-time' }),
  },
  { additionalProperties: false },
);
export type ArchivedSourcePage = Static<typeof ArchivedSourcePageSchema>;

export const ValidationExecutionErrorSchema = Type.Object(
  {
    code: Type.String(),
    message: Type.String(),
    validationId: Type.String({ format: 'uuid' }),
  },
  { additionalProperties: false },
);
export type ValidationExecutionFailure = Static<
  typeof ValidationExecutionErrorSchema
>;

export const StoredValidationSchema = Type.Object(
  {
    validationId: Type.String({ format: 'uuid' }),
    executionStatus: Type.Union([
      Type.Literal('queued'),
      Type.Literal('running'),
      Type.Literal('completed'),
      Type.Literal('failed'),
    ]),
    input: ValidationInputSchema,
    result: Type.Union([ValidationResultSchema, Type.Null()]),
    error: Type.Union([ValidationExecutionErrorSchema, Type.Null()]),
    evidence: Type.Array(ArchivedSourcePageSchema),
    processingVersion: Type.String(),
    runtimeVersions: Type.Record(Type.String(), Type.String()),
    createdAt: Type.String({ format: 'date-time' }),
    finishedAt: Type.Union([Type.String({ format: 'date-time' }), Type.Null()]),
  },
  { additionalProperties: false },
);
export type StoredValidation = Omit<
  Static<typeof StoredValidationSchema>,
  'input'
> & { input: ValidationInput };

export const Sha256Schema = Type.String({ pattern: '^[a-f0-9]{64}$' });

export const EvidenceManifestV01Schema = Type.Object(
  {
    schema: Type.Literal('jade-evidence/0.1'),
    validationId: Type.String({ format: 'uuid' }),
    methodology: MethodologySchema,
    input: Type.Object(
      {
        geometryHash: Sha256Schema,
        commodity: Type.String({ minLength: 1 }),
        cutoffDate: Type.String({ format: 'date' }),
      },
      { additionalProperties: false },
    ),
    sources: Type.Array(
      Type.Object(
        {
          provider: Type.String({ minLength: 1 }),
          dataset: Type.String({ minLength: 1 }),
          datasetVersion: Type.Union([Type.String(), Type.Null()]),
          layer: Type.Union([Type.String(), Type.Null()]),
          retrievedAt: Type.String({ format: 'date-time' }),
          payloadHash: Sha256Schema,
        },
        { additionalProperties: false },
      ),
    ),
    analysis: Type.Object(
      {
        intersectionAreaM2: Type.Union([
          Type.Number({ minimum: 0 }),
          Type.Null(),
        ]),
        intersectionPercentage: Type.Union([
          Type.Number({ minimum: 0, maximum: 100 }),
          Type.Null(),
        ]),
        eventsFound: Type.Integer({ minimum: 0 }),
      },
      { additionalProperties: false },
    ),
    result: ValidationStatusSchema,
  },
  { additionalProperties: false },
);
export type EvidenceManifestV01 = Static<typeof EvidenceManifestV01Schema>;

export class ResearchNotImplementedError extends Error {
  constructor(public readonly boundary: string) {
    super(`Research implementation required: ${boundary}`);
    this.name = 'ResearchNotImplementedError';
  }
}
