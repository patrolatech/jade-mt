-- Additive migration: the prototype tables remain available for old callers.
-- No provider payload is inferred or backfilled into the domain model.

CREATE FUNCTION jade_is_valid_polygon(value geometry) RETURNS boolean
LANGUAGE sql IMMUTABLE PARALLEL SAFE
SET search_path = public, pg_temp
AS $$
  SELECT COALESCE(
    ST_SRID(value) = 4326
    AND ST_NDims(value) = 2
    AND ST_GeometryType(value) IN ('ST_Polygon', 'ST_MultiPolygon')
    AND NOT ST_IsEmpty(value)
    AND ST_IsValid(value)
    AND ST_XMin(Box3D(value)) >= -180 AND ST_XMax(Box3D(value)) <= 180
    AND ST_YMin(Box3D(value)) >= -90 AND ST_YMax(Box3D(value)) <= 90
    AND ST_Area(value) > 0 AND ST_Area(value) < 'Infinity'::double precision,
    false
  )
$$;

CREATE TABLE areas (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  kind text NOT NULL CHECK (kind IN ('property', 'plot', 'analysis_area')),
  name text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE area_external_references (
  area_id bigint NOT NULL REFERENCES areas(id),
  namespace text NOT NULL CHECK (btrim(namespace) <> ''),
  external_id text NOT NULL CHECK (btrim(external_id) <> ''),
  PRIMARY KEY (namespace, external_id)
);
CREATE INDEX area_external_references_area_idx ON area_external_references(area_id);

CREATE TABLE area_versions (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  area_id bigint NOT NULL REFERENCES areas(id),
  version integer NOT NULL CHECK (version > 0),
  geom geometry(Geometry, 4326) NOT NULL CHECK (jade_is_valid_polygon(geom)),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (area_id, version)
);
CREATE INDEX area_versions_geom_idx ON area_versions USING gist(geom);

CREATE TABLE data_sources (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  provider_key text NOT NULL CHECK (btrim(provider_key) <> ''),
  dataset_key text NOT NULL CHECK (btrim(dataset_key) <> ''),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider_key, dataset_key)
);

CREATE TABLE source_records (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  source_id bigint NOT NULL REFERENCES data_sources(id),
  record_namespace text NOT NULL DEFAULT '',
  external_id text NOT NULL CHECK (btrim(external_id) <> ''),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source_id, record_namespace, external_id),
  UNIQUE (id, source_id)
);

CREATE TABLE evidence_artifacts (
  payload_hash text PRIMARY KEY CHECK (payload_hash ~ '^[a-f0-9]{64}$'),
  storage_key text NOT NULL UNIQUE CHECK (btrim(storage_key) <> ''),
  media_type text NOT NULL CHECK (btrim(media_type) <> ''),
  byte_length bigint NOT NULL CHECK (byte_length >= 0),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Insert the receipt and its pages together; first use by a validation seals the page set.
CREATE TABLE ingestion_runs (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  source_id bigint NOT NULL REFERENCES data_sources(id),
  adapter_name text NOT NULL CHECK (btrim(adapter_name) <> ''),
  adapter_version text NOT NULL CHECK (btrim(adapter_version) <> ''),
  dataset_version text,
  query_area_version_id bigint REFERENCES area_versions(id),
  request_context jsonb NOT NULL CHECK (jsonb_typeof(request_context) = 'object'),
  status text NOT NULL CHECK (status IN ('complete', 'partial', 'failed')),
  matched_records bigint CHECK (matched_records >= 0),
  returned_records bigint NOT NULL CHECK (returned_records >= 0),
  failure_reason text,
  started_at timestamptz NOT NULL,
  finished_at timestamptz NOT NULL CHECK (finished_at >= started_at),
  sealed_at timestamptz,
  UNIQUE (id, source_id),
  CHECK (status <> 'complete' OR matched_records IS NULL OR returned_records = matched_records),
  CHECK (
    (status = 'complete' AND failure_reason IS NULL)
    OR (status IN ('partial', 'failed') AND failure_reason IS NOT NULL AND btrim(failure_reason) <> '')
  )
);
CREATE INDEX ingestion_runs_source_idx ON ingestion_runs(source_id, finished_at);
CREATE INDEX ingestion_runs_area_idx ON ingestion_runs(query_area_version_id);

CREATE TABLE ingestion_pages (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  ingestion_run_id bigint NOT NULL,
  source_id bigint NOT NULL,
  page_number integer NOT NULL CHECK (page_number > 0),
  payload_hash text NOT NULL REFERENCES evidence_artifacts(payload_hash),
  request_uri text NOT NULL CHECK (btrim(request_uri) <> ''),
  request_method text NOT NULL CHECK (btrim(request_method) <> ''),
  request_body text,
  retrieved_at timestamptz NOT NULL,
  returned_records bigint NOT NULL CHECK (returned_records >= 0),
  FOREIGN KEY (ingestion_run_id, source_id) REFERENCES ingestion_runs(id, source_id),
  UNIQUE (ingestion_run_id, page_number),
  UNIQUE (id, ingestion_run_id, source_id)
);
CREATE INDEX ingestion_pages_payload_idx ON ingestion_pages(payload_hash);

CREATE TABLE observation_kinds (
  code text PRIMARY KEY CHECK (code ~ '^[a-z][a-z0-9_]*$'),
  description text NOT NULL CHECK (btrim(description) <> '')
);
-- Classifications are a JADE vocabulary; adapters must not invent a scientific equivalence.
INSERT INTO observation_kinds(code, description)
VALUES ('unknown', 'The source classification has not been mapped to a reviewed JADE category.');

CREATE TABLE environmental_observations (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  source_record_id bigint NOT NULL UNIQUE,
  source_id bigint NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (source_record_id, source_id) REFERENCES source_records(id, source_id),
  UNIQUE (id, source_id)
);
CREATE INDEX environmental_observations_source_idx ON environmental_observations(source_id);

CREATE TABLE observation_versions (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  observation_id bigint NOT NULL,
  version integer NOT NULL CHECK (version > 0),
  source_id bigint NOT NULL,
  ingestion_run_id bigint NOT NULL,
  ingestion_page_id bigint NOT NULL,
  record_locator text NOT NULL CHECK (btrim(record_locator) <> ''),
  normalizer_version text NOT NULL CHECK (btrim(normalizer_version) <> ''),
  kind_code text NOT NULL DEFAULT 'unknown' REFERENCES observation_kinds(code),
  geom geometry(Geometry, 4326),
  geometry_issue text,
  temporal_basis text NOT NULL CHECK (temporal_basis IN ('observation', 'occurrence', 'reporting_period', 'unknown')),
  temporal_precision text NOT NULL CHECK (temporal_precision IN ('day', 'month', 'year', 'interval', 'unknown')),
  temporal_label text,
  period_start date,
  period_end date,
  attributes jsonb NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(attributes) = 'object'),
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (observation_id, source_id) REFERENCES environmental_observations(id, source_id),
  FOREIGN KEY (ingestion_page_id, ingestion_run_id, source_id) REFERENCES ingestion_pages(id, ingestion_run_id, source_id),
  UNIQUE (observation_id, version),
  UNIQUE (observation_id, ingestion_page_id, record_locator, normalizer_version),
  UNIQUE (id, ingestion_run_id),
  CHECK (
    (geom IS NOT NULL AND geometry_issue IS NULL AND jade_is_valid_polygon(geom))
    OR (geom IS NULL AND geometry_issue IS NOT NULL AND btrim(geometry_issue) <> '')
  ),
  CHECK (
    (period_start IS NULL AND period_end IS NULL)
    OR (period_start IS NOT NULL AND period_end IS NOT NULL
      AND isfinite(period_start) AND isfinite(period_end) AND period_start <= period_end)
  ),
  CHECK ((temporal_basis <> 'unknown' AND temporal_precision <> 'unknown') OR period_start IS NULL),
  CHECK (period_start IS NOT NULL OR temporal_basis IN ('unknown', 'reporting_period') OR temporal_precision = 'unknown'),
  CHECK (temporal_precision <> 'day' OR period_start IS NULL OR period_start = period_end),
  CHECK (temporal_basis <> 'reporting_period' OR (temporal_label IS NOT NULL AND btrim(temporal_label) <> ''))
);
CREATE INDEX observation_versions_geom_idx ON observation_versions USING gist(geom);
CREATE INDEX observation_versions_period_idx ON observation_versions(period_start, period_end);
CREATE INDEX observation_versions_page_idx ON observation_versions(ingestion_page_id, ingestion_run_id, source_id);
CREATE INDEX observation_versions_ingestion_idx ON observation_versions(ingestion_run_id);
CREATE INDEX observation_versions_kind_idx ON observation_versions(kind_code);

CREATE TABLE validation_runs (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  area_version_id bigint NOT NULL REFERENCES area_versions(id),
  commodity text NOT NULL CHECK (btrim(commodity) <> ''),
  cutoff_date date NOT NULL CHECK (isfinite(cutoff_date)),
  methodology_id text NOT NULL CHECK (btrim(methodology_id) <> ''),
  methodology_version text NOT NULL CHECK (btrim(methodology_version) <> ''),
  methodology_status text NOT NULL DEFAULT 'draft' CHECK (methodology_status IN ('draft', 'approved')),
  processing_version text NOT NULL CHECK (btrim(processing_version) <> ''),
  runtime_versions jsonb NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(runtime_versions) = 'object'),
  request_snapshot jsonb CHECK (jsonb_typeof(request_snapshot) = 'object'),
  execution_status text NOT NULL DEFAULT 'queued' CHECK (execution_status IN ('queued', 'running', 'completed', 'failed')),
  status text CHECK (status IN ('PASS', 'FAIL', 'INCONCLUSIVE', 'ERROR')),
  issues jsonb NOT NULL DEFAULT '[]' CHECK (jsonb_typeof(issues) = 'array'),
  created_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  CHECK (finished_at IS NULL OR finished_at >= created_at),
  CHECK (
    (execution_status IN ('queued', 'running') AND status IS NULL AND finished_at IS NULL)
    OR (execution_status = 'completed' AND status IS NOT NULL AND status IN ('PASS', 'FAIL', 'INCONCLUSIVE') AND finished_at IS NOT NULL)
    OR (execution_status = 'failed' AND status IS NOT NULL AND status = 'ERROR' AND finished_at IS NOT NULL)
  )
);
CREATE INDEX validation_runs_area_idx ON validation_runs(area_version_id, created_at);
CREATE INDEX validation_runs_execution_idx ON validation_runs(execution_status, created_at);

-- Coverage is assessed for this validation, independently of transport completeness.
CREATE TABLE validation_run_sources (
  validation_run_id bigint NOT NULL REFERENCES validation_runs(id),
  ingestion_run_id bigint NOT NULL REFERENCES ingestion_runs(id),
  coverage_status text NOT NULL CHECK (coverage_status IN ('sufficient', 'insufficient', 'unknown')),
  coverage_reason text NOT NULL CHECK (btrim(coverage_reason) <> ''),
  PRIMARY KEY (validation_run_id, ingestion_run_id)
);
CREATE INDEX validation_run_sources_ingestion_idx ON validation_run_sources(ingestion_run_id);

CREATE TABLE validation_findings (
  validation_run_id bigint NOT NULL,
  observation_version_id bigint NOT NULL,
  ingestion_run_id bigint NOT NULL,
  analysis_status text NOT NULL CHECK (analysis_status IN ('measured', 'invalid_geometry', 'error')),
  intersection_area_m2 double precision,
  intersection_percentage double precision,
  issue_code text,
  issue_message text,
  PRIMARY KEY (validation_run_id, observation_version_id),
  FOREIGN KEY (validation_run_id, ingestion_run_id) REFERENCES validation_run_sources(validation_run_id, ingestion_run_id),
  FOREIGN KEY (observation_version_id, ingestion_run_id) REFERENCES observation_versions(id, ingestion_run_id),
  CHECK (
    (analysis_status = 'measured'
      AND intersection_area_m2 IS NOT NULL AND intersection_area_m2 >= 0 AND intersection_area_m2 < 'Infinity'::double precision
      AND intersection_percentage IS NOT NULL AND intersection_percentage >= 0 AND intersection_percentage <= 100
      AND ((intersection_area_m2 = 0 AND intersection_percentage = 0) OR (intersection_area_m2 > 0 AND intersection_percentage > 0))
      AND issue_code IS NULL AND issue_message IS NULL)
    OR (analysis_status IN ('invalid_geometry', 'error') AND intersection_area_m2 IS NULL AND intersection_percentage IS NULL
      AND issue_code IS NOT NULL AND btrim(issue_code) <> '' AND issue_message IS NOT NULL AND btrim(issue_message) <> '')
  )
);
CREATE INDEX validation_findings_observation_idx ON validation_findings(observation_version_id, ingestion_run_id);
CREATE INDEX validation_findings_source_idx ON validation_findings(validation_run_id, ingestion_run_id);

CREATE FUNCTION jade_reject_history_change() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% is append-only; insert a new version or run', TG_TABLE_NAME USING ERRCODE = '23514';
END
$$;

DO $$
DECLARE history_table text;
BEGIN
  FOREACH history_table IN ARRAY ARRAY[
    'area_versions', 'data_sources', 'source_records', 'evidence_artifacts',
    'ingestion_pages', 'environmental_observations',
    'observation_versions', 'validation_run_sources', 'validation_findings'
  ] LOOP
    EXECUTE format('CREATE TRIGGER jade_history_immutable BEFORE UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION jade_reject_history_change()', history_table);
  END LOOP;
END
$$;

CREATE FUNCTION jade_guard_ingestion_run() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.sealed_at IS NOT NULL THEN
      RAISE EXCEPTION 'Insert an unsealed collection before adding its pages' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
  END IF;
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Collection history cannot be deleted' USING ERRCODE = '23514';
  END IF;
  IF OLD.sealed_at IS NOT NULL OR NEW.sealed_at IS NULL
    OR (to_jsonb(NEW) - 'sealed_at') IS DISTINCT FROM (to_jsonb(OLD) - 'sealed_at') THEN
    RAISE EXCEPTION 'Collection receipts are immutable; only first-time sealing is allowed' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END
$$;
CREATE TRIGGER jade_ingestion_run_guard BEFORE INSERT OR UPDATE OR DELETE ON ingestion_runs
FOR EACH ROW EXECUTE FUNCTION jade_guard_ingestion_run();

CREATE FUNCTION jade_require_unsealed_ingestion() RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE collection_sealed_at timestamptz;
BEGIN
  SELECT sealed_at INTO collection_sealed_at FROM ingestion_runs WHERE id = NEW.ingestion_run_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Collection does not exist' USING ERRCODE = '23503';
  END IF;
  IF collection_sealed_at IS NOT NULL THEN
    RAISE EXCEPTION 'Cannot append pages to a sealed collection' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END
$$;
CREATE TRIGGER jade_ingestion_page_guard BEFORE INSERT ON ingestion_pages
FOR EACH ROW EXECUTE FUNCTION jade_require_unsealed_ingestion();

CREATE FUNCTION jade_guard_validation_run() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.execution_status NOT IN ('queued', 'running') THEN
      RAISE EXCEPTION 'Create an open validation before attaching evidence and finishing it' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
  END IF;
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Validation history cannot be deleted' USING ERRCODE = '23514';
  END IF;
  IF OLD.execution_status IN ('completed', 'failed')
    OR (OLD.execution_status = 'running' AND NEW.execution_status = 'queued')
    OR (to_jsonb(NEW) - ARRAY['execution_status', 'status', 'issues', 'finished_at'])
      IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['execution_status', 'status', 'issues', 'finished_at']) THEN
    RAISE EXCEPTION 'Validation inputs and finalized results are immutable; create a new run' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END
$$;
CREATE TRIGGER jade_validation_run_guard BEFORE INSERT OR UPDATE OR DELETE ON validation_runs
FOR EACH ROW EXECUTE FUNCTION jade_guard_validation_run();

CREATE FUNCTION jade_require_open_validation() RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  run_status text;
  collection ingestion_runs%ROWTYPE;
  page_count bigint;
  record_count numeric;
  has_geometry boolean;
BEGIN
  -- Serialize attachment with finalization so concurrent writers cannot amend a closed run.
  SELECT execution_status INTO run_status FROM validation_runs WHERE id = NEW.validation_run_id FOR UPDATE;
  IF run_status IS NULL THEN
    RAISE EXCEPTION 'Validation does not exist' USING ERRCODE = '23503';
  END IF;
  IF run_status NOT IN ('queued', 'running') THEN
    RAISE EXCEPTION 'Cannot attach evidence or findings to a finalized validation' USING ERRCODE = '23514';
  END IF;
  IF TG_TABLE_NAME = 'validation_run_sources' THEN
    SELECT * INTO collection FROM ingestion_runs WHERE id = NEW.ingestion_run_id FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Collection does not exist' USING ERRCODE = '23503';
    END IF;
    SELECT count(*), COALESCE(sum(returned_records), 0) INTO page_count, record_count
      FROM ingestion_pages WHERE ingestion_run_id = collection.id;
    IF record_count <> collection.returned_records OR (collection.status = 'complete' AND page_count = 0) THEN
      RAISE EXCEPTION 'Collection page receipts do not match its declared result' USING ERRCODE = '23514';
    END IF;
    IF collection.sealed_at IS NULL THEN
      UPDATE ingestion_runs SET sealed_at = now() WHERE id = collection.id;
    END IF;
  ELSIF NEW.analysis_status = 'measured' THEN
    SELECT geom IS NOT NULL INTO has_geometry FROM observation_versions WHERE id = NEW.observation_version_id;
    IF has_geometry = false THEN
      RAISE EXCEPTION 'An observation without valid geometry cannot have a measurement' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END
$$;
CREATE TRIGGER jade_validation_source_guard BEFORE INSERT ON validation_run_sources
FOR EACH ROW EXECUTE FUNCTION jade_require_open_validation();
CREATE TRIGGER jade_validation_finding_guard BEFORE INSERT ON validation_findings
FOR EACH ROW EXECUTE FUNCTION jade_require_open_validation();

COMMENT ON TABLE environmental_validations IS 'Legacy prototype. New persistence should use validation_runs; no implicit JSON backfill is performed.';
COMMENT ON TABLE environmental_sources IS 'Legacy per-validation source receipts. New persistence should use data_sources, ingestion_runs and validation_run_sources.';
COMMENT ON TABLE environmental_observations IS 'JADE identity for one external source record. Observations from distinct sources are not automatically merged.';
COMMENT ON COLUMN source_records.record_namespace IS 'Provider record namespace, such as a layer. It scopes external identifiers without defining the JADE identity.';
COMMENT ON COLUMN area_external_references.namespace IS 'Caller/system namespace. External identifiers do not establish registration or ownership.';
COMMENT ON COLUMN area_versions.geom IS 'Valid 2D Polygon/MultiPolygon in EPSG:4326. Transform explicitly before insertion; no repair, simplification or reprojection is performed here.';
COMMENT ON COLUMN observation_versions.temporal_label IS 'Preserved date/reporting label. A reporting year may have NULL bounds; do not invent an occurrence interval.';
COMMENT ON COLUMN observation_versions.normalizer_version IS 'Version of the mapping that produced this domain revision. Reprocessing raw evidence creates a new revision.';
COMMENT ON COLUMN observation_versions.geometry_issue IS 'If normalization cannot produce a valid geometry, retain the original bytes through ingestion_page_id and record the reason here.';
COMMENT ON COLUMN evidence_artifacts.storage_key IS 'Logical key resolved by an evidence-store adapter. Keep raw bytes outside JSONB and verify their SHA-256 when writing and reading.';
COMMENT ON COLUMN validation_runs.processing_version IS 'Version of the JADE processing implementation and spatial policy used for this run.';
