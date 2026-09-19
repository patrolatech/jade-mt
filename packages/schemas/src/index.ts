import { Type, type Static } from '@sinclair/typebox';
import { GeometrySchema } from './geometry.js';

export { GeometrySchema };
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
    geometry: Type.Ref(GeometrySchema),
    commodity: Type.String({ minLength: 1, maxLength: 100, pattern: '\\S' }),
    cutoffDate: Type.String({ format: 'date' }),
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
    // Missing or coarse source dates must not be silently converted into exact dates.
    observedAt: Type.Union([Type.String(), Type.Null()]),
    temporalPrecision: Type.Union([
      Type.Literal('day'),
      Type.Literal('month'),
      Type.Literal('year'),
      Type.Literal('unknown'),
    ]),
  },
  { additionalProperties: false },
);
export type EnvironmentalEvent = Omit<
  Static<typeof EnvironmentalEventSchema>,
  'geometry'
> & {
  geometry: import('./geometry.js').Geometry;
};

export const ValidationResultSchema = Type.Object(
  {
    validationId: Type.String({ format: 'uuid' }),
    methodology: MethodologySchema,
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
  },
  { additionalProperties: false },
);
export type ValidationResult = Static<typeof ValidationResultSchema>;

export const Sha256Schema = Type.String({ pattern: '^[a-f0-9]{64}$' });

// Provisional integration contract; this is not a finalized scientific schema.
export const EvidenceManifestV01Schema = Type.Object(
  {
    schema: Type.Literal('jade-evidence/0.1'),
    validationId: Type.String({ format: 'uuid' }),
    methodology: MethodologySchema,
    input: Type.Object(
      {
        geometryHash: Sha256Schema,
        commodity: Type.String({
          minLength: 1,
          maxLength: 100,
          pattern: '\\S',
        }),
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
        // null means unmeasured; zero must only describe a measurement.
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
    // Pointer to where the raw evidence bytes (geometry, source payloads) can be
    // retrieved for audit; absent when no retrievable storage exists yet.
    evidenceUri: Type.Optional(
      Type.Union([Type.String({ format: 'uri' }), Type.Null()]),
    ),
    // Version of the oracle/evidence codebase that produced this manifest,
    // distinct from `schema` (manifest format) and `methodology.version`
    // (scientific rule version).
    implementationVersion: Type.Optional(
      Type.Union([Type.String(), Type.Null()]),
    ),
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
