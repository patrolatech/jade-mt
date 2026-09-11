CREATE EXTENSION IF NOT EXISTS postgis;

CREATE TABLE environmental_validations (
  id uuid PRIMARY KEY,
  input jsonb NOT NULL,
  status text CHECK (status IN ('PASS', 'FAIL', 'INCONCLUSIVE', 'ERROR')),
  result jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON COLUMN environmental_validations.input IS
  'Original request; geometry normalization and processing CRS are unresolved.';
COMMENT ON COLUMN environmental_validations.status IS
  'Environmental screening only. NULL means no decision recorded.';

CREATE TABLE environmental_sources (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  validation_id uuid NOT NULL REFERENCES environmental_validations(id),
  provider text NOT NULL,
  dataset text NOT NULL,
  dataset_version text,
  layer text,
  retrieved_at timestamptz NOT NULL,
  payload_hash text NOT NULL CHECK (payload_hash ~ '^[a-f0-9]{64}$')
);

CREATE INDEX environmental_sources_validation_id_idx ON environmental_sources(validation_id);
