import type { PoolClient } from 'pg';
import type {
  ArchivedSourcePage,
  EnvironmentalEvent,
  SourceReport,
  StoredValidation,
  ValidationExecutionFailure,
  ValidationInput,
  ValidationResult,
} from '@jade/schemas';
import type { DatabasePool } from './pool.js';
import type { ValidationRepository } from './validation-repository.js';

type IdRow = { id: string };
const sourceKey = (source: {
  provider: string;
  dataset: string;
  layer: string;
}) => JSON.stringify([source.provider, source.dataset, source.layer]);
const receiptKey = (page: SourceReport['pages'][number] | ArchivedSourcePage) =>
  JSON.stringify([
    page.payloadHash,
    page.requestUrl,
    page.method,
    page.requestBody ?? null,
    page.retrievedAt,
  ]);

function temporalFields(event: EnvironmentalEvent) {
  if (event.temporalBasis === 'prodes-year') {
    return ['reporting_period', 'year', event.observedAt, null, null];
  }
  if (
    event.temporalBasis === 'observation' ||
    event.temporalBasis === 'occurrence'
  ) {
    if (event.temporalPrecision === 'day' && event.observedAt) {
      return [
        event.temporalBasis,
        'day',
        event.observedAt,
        event.observedAt,
        event.observedAt,
      ];
    }
    if (event.temporalPrecision !== 'unknown') {
      throw new Error('No persistence mapping for this temporal precision');
    }
  }
  return ['unknown', 'unknown', event.observedAt, null, null];
}

export class PostgisValidationRepository implements ValidationRepository {
  constructor(
    private readonly pool: DatabasePool,
    private readonly processingVersion: string,
  ) {}

  private async transaction<T>(
    operation: (client: PoolClient) => Promise<T>,
  ): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await operation(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      throw error;
    } finally {
      client.release();
    }
  }

  async start(validationId: string, input: ValidationInput): Promise<void> {
    await this.transaction(async (client) => {
      // Requests have no authenticated namespace for property_id/plot_id.
      // Preserve those labels in the snapshot; do not merge unrelated areas by them.
      const area = await client.query<IdRow>(
        `WITH area AS (INSERT INTO areas(kind) VALUES ('analysis_area') RETURNING id)
         INSERT INTO area_versions(area_id, version, geom)
         SELECT id, 1, ST_GeomFromGeoJSON($1) FROM area RETURNING id`,
        [JSON.stringify(input.geometry)],
      );
      await client.query(
        `INSERT INTO validation_runs(public_id, area_version_id, commodity, cutoff_date,
          methodology_id, methodology_version, processing_version, runtime_versions,
          request_snapshot, execution_status)
         VALUES ($1, $2, $3, $4, 'JADE-ENV', '0.1', $5,
          jsonb_build_object('node', $6::text, 'postgresql', version(), 'postgis', postgis_full_version()),
          $7::jsonb, 'running')`,
        [
          validationId,
          area.rows[0]!.id,
          input.commodity,
          input.cutoffDate,
          this.processingVersion,
          process.version,
          JSON.stringify(input),
        ],
      );
    });
  }

  private async openRun(client: PoolClient, validationId: string) {
    const { rows } = await client.query<IdRow & { execution_status: string }>(
      'SELECT id, execution_status FROM validation_runs WHERE public_id = $1 FOR UPDATE',
      [validationId],
    );
    const run = rows[0];
    if (!run || run.execution_status !== 'running')
      throw new Error('Validation is not running');
    return run;
  }

  private async artifacts(client: PoolClient, evidence: ArchivedSourcePage[]) {
    const unique = new Map(evidence.map((page) => [page.payloadHash, page]));
    for (const page of [...unique.values()].sort((a, b) =>
      a.payloadHash.localeCompare(b.payloadHash),
    )) {
      await client.query(
        `INSERT INTO evidence_artifacts(payload_hash, storage_key, media_type, byte_length)
         VALUES ($1, $2, 'application/json', $3) ON CONFLICT (payload_hash) DO NOTHING`,
        [page.payloadHash, page.storageKey, page.byteLength],
      );
      const existing = await client.query<{
        storage_key: string;
        byte_length: string;
      }>(
        'SELECT storage_key, byte_length FROM evidence_artifacts WHERE payload_hash = $1',
        [page.payloadHash],
      );
      if (
        existing.rows[0]?.storage_key !== page.storageKey ||
        existing.rows[0]?.byte_length !== String(page.byteLength)
      ) {
        throw new Error(
          'Archived artifact metadata does not match its existing record',
        );
      }
    }
  }

  async complete(
    result: ValidationResult,
    events: EnvironmentalEvent[],
    evidence: ArchivedSourcePage[],
  ): Promise<void> {
    if (
      result.status === 'ERROR' ||
      result.eventsFound !== events.length ||
      new Set(events.map((event) => event.id)).size !== events.length
    ) {
      throw new Error('Inconsistent validation result');
    }
    if (
      result.sources.reduce(
        (count, source) => count + source.matchedEvents,
        0,
      ) !== events.length
    ) {
      throw new Error('Source counts do not match the validation');
    }
    await this.transaction(async (client) => {
      const run = await this.openRun(client, result.validationId);
      await this.artifacts(client, evidence);
      const receipts = new Set(evidence.map(receiptKey));
      const collections = new Map<
        string,
        { sourceId: string; ingestionId: string; pages: Map<string, string> }
      >();
      for (const source of [...result.sources].sort((a, b) =>
        sourceKey(a).localeCompare(sourceKey(b)),
      )) {
        if (
          !source.adapter ||
          !source.pages.length ||
          collections.has(sourceKey(source))
        ) {
          throw new Error(
            'Missing adapter, page receipts or unique source identity',
          );
        }
        if (source.pages.some((page) => !receipts.has(receiptKey(page)))) {
          throw new Error('Source page was not verified in the archive');
        }
        await client.query(
          `INSERT INTO data_sources(provider_key, dataset_key) VALUES ($1, $2)
           ON CONFLICT (provider_key, dataset_key) DO NOTHING`,
          [source.provider, source.dataset],
        );
        const sourceRow = await client.query<IdRow>(
          'SELECT id FROM data_sources WHERE provider_key = $1 AND dataset_key = $2',
          [source.provider, source.dataset],
        );
        const sourceId = sourceRow.rows[0]!.id;
        const ingestion = await client.query<IdRow>(
          `INSERT INTO ingestion_runs(source_id, adapter_name, adapter_version, dataset_version,
            query_area_version_id, request_context, status, matched_records, returned_records,
            started_at, finished_at)
           SELECT $1, $2, $3, $4, area_version_id, $5::jsonb, 'complete', $6, $7,
            LEAST(created_at, $8::timestamptz), GREATEST(clock_timestamp(), $9::timestamptz)
           FROM validation_runs WHERE id = $10 RETURNING id`,
          [
            sourceId,
            source.adapter.name,
            source.adapter.version,
            source.datasetVersion,
            JSON.stringify({
              layer: source.layer,
              crs: source.crs,
              cutoffDate: source.cutoffDate,
            }),
            source.matchedEvents,
            source.pages.reduce((sum, page) => sum + page.returned, 0),
            source.pages[0]!.retrievedAt,
            source.pages.at(-1)!.retrievedAt,
            run.id,
          ],
        );
        const ingestionId = ingestion.rows[0]!.id;
        const pages = new Map<string, string>();
        for (const [index, page] of source.pages.entries()) {
          const inserted = await client.query<IdRow>(
            `INSERT INTO ingestion_pages(ingestion_run_id, source_id, page_number, payload_hash,
              request_uri, request_method, request_body, retrieved_at, returned_records)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
            [
              ingestionId,
              sourceId,
              index + 1,
              page.payloadHash,
              page.requestUrl,
              page.method,
              page.requestBody ?? null,
              page.retrievedAt,
              page.returned,
            ],
          );
          if (pages.has(page.payloadHash))
            throw new Error('Repeated payload in a source collection');
          pages.set(page.payloadHash, inserted.rows[0]!.id);
        }
        await client.query(
          `INSERT INTO validation_run_sources(validation_run_id, ingestion_run_id, coverage_status, coverage_reason)
           VALUES ($1, $2, $3, $4)`,
          [run.id, ingestionId, source.coverage.status, source.coverage.reason],
        );
        collections.set(sourceKey(source), { sourceId, ingestionId, pages });
      }
      const analyses = new Map(
        result.eventAnalyses.map((item) => [item.eventId, item.analysis]),
      );
      const invalid = new Map(
        result.issues
          ?.filter((issue) => issue.code === 'INVALID_EVENT_GEOMETRY')
          .map((issue) => [issue.eventId, issue]),
      );
      if (
        analyses.size !== result.eventAnalyses.length ||
        analyses.size + invalid.size !== events.length
      ) {
        throw new Error('Missing or duplicated event findings');
      }
      // All writers lock observations in the same order before allocating revisions.
      const ordered = [...events].sort((a, b) =>
        JSON.stringify([
          a.provider,
          a.dataset,
          a.provenance?.layer,
          a.id,
        ]).localeCompare(
          JSON.stringify([b.provider, b.dataset, b.provenance?.layer, b.id]),
        ),
      );
      for (const event of ordered) {
        const origin = event.provenance;
        if (!origin) throw new Error('Event has no page provenance');
        const collection = collections.get(
          sourceKey({ ...event, layer: origin.layer }),
        );
        const pageId = collection?.pages.get(origin.payloadHash);
        if (!collection || !pageId)
          throw new Error(
            'Event page does not belong to its source collection',
          );
        const { sourceId, ingestionId } = collection;
        const analysis = analyses.get(event.id);
        const issue = invalid.get(event.id);
        if ((!analysis && !issue) || (analysis && issue))
          throw new Error('Event finding is inconsistent');
        await client.query(
          `INSERT INTO source_records(source_id, record_namespace, external_id) VALUES ($1,$2,$3)
           ON CONFLICT (source_id, record_namespace, external_id) DO NOTHING`,
          [sourceId, origin.layer, event.id],
        );
        const record = await client.query<IdRow>(
          'SELECT id FROM source_records WHERE source_id = $1 AND record_namespace = $2 AND external_id = $3',
          [sourceId, origin.layer, event.id],
        );
        await client.query(
          `INSERT INTO environmental_observations(source_record_id, source_id) VALUES ($1,$2)
           ON CONFLICT (source_record_id) DO NOTHING`,
          [record.rows[0]!.id, sourceId],
        );
        const observation = await client.query<IdRow>(
          'SELECT id FROM environmental_observations WHERE source_record_id = $1 FOR UPDATE',
          [record.rows[0]!.id],
        );
        const version = await client.query<IdRow>(
          `INSERT INTO observation_versions(observation_id, version, source_id, ingestion_run_id,
            ingestion_page_id, record_locator, normalizer_version, geom, geometry_issue,
            temporal_basis, temporal_precision, temporal_label, period_start, period_end)
           SELECT $1, COALESCE(MAX(version), 0) + 1, $2, $3, $4, $5, $6,
            ST_GeomFromGeoJSON($7), $8, $9, $10, $11, $12::date, $13::date
           FROM observation_versions WHERE observation_id = $1 RETURNING id`,
          [
            observation.rows[0]!.id,
            sourceId,
            ingestionId,
            pageId,
            origin.recordLocator,
            origin.normalizerVersion,
            issue ? null : JSON.stringify(event.geometry),
            issue?.message ?? null,
            ...temporalFields(event),
          ],
        );
        await client.query(
          `INSERT INTO validation_findings(validation_run_id, observation_version_id, ingestion_run_id,
            analysis_status, intersection_area_m2, intersection_percentage, issue_code, issue_message)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
          [
            run.id,
            version.rows[0]!.id,
            ingestionId,
            issue ? 'invalid_geometry' : 'measured',
            analysis?.intersectionAreaM2 ?? null,
            analysis?.intersectionPercentage ?? null,
            issue?.code ?? null,
            issue?.message ?? null,
          ],
        );
      }
      await client.query(
        'INSERT INTO validation_run_outputs(validation_run_id, result, evidence) VALUES ($1,$2::jsonb,$3::jsonb)',
        [run.id, JSON.stringify(result), JSON.stringify(evidence)],
      );
      await client.query(
        `UPDATE validation_runs SET execution_status = 'completed', status = $2, issues = $3::jsonb,
          finished_at = clock_timestamp() WHERE id = $1`,
        [run.id, result.status, JSON.stringify(result.issues ?? [])],
      );
    });
  }

  async fail(
    error: ValidationExecutionFailure,
    evidence: ArchivedSourcePage[],
  ): Promise<void> {
    await this.transaction(async (client) => {
      const run = await this.openRun(client, error.validationId);
      await this.artifacts(client, evidence);
      await client.query(
        'INSERT INTO validation_run_outputs(validation_run_id, error, evidence) VALUES ($1,$2::jsonb,$3::jsonb)',
        [run.id, JSON.stringify(error), JSON.stringify(evidence)],
      );
      await client.query(
        `UPDATE validation_runs SET execution_status = 'failed', status = 'ERROR', issues = $2::jsonb,
          finished_at = clock_timestamp() WHERE id = $1`,
        [run.id, JSON.stringify([error])],
      );
    });
  }

  async find(validationId: string): Promise<StoredValidation | null> {
    const { rows } = await this.pool.query<StoredValidation>(
      `SELECT r.public_id AS "validationId", r.execution_status AS "executionStatus",
        r.request_snapshot AS input, o.result, o.error, COALESCE(o.evidence, '[]'::jsonb) AS evidence,
        r.processing_version AS "processingVersion", r.runtime_versions AS "runtimeVersions",
        to_char(r.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "createdAt",
        to_char(r.finished_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "finishedAt"
       FROM validation_runs r LEFT JOIN validation_run_outputs o ON o.validation_run_id = r.id
       WHERE r.public_id = $1`,
      [validationId],
    );
    return rows[0] ?? null;
  }
}
