import { createHash } from "crypto";

export function computeSha256(data: string): string {
  return createHash("sha256").update(data).digest("hex");
}

export function computeSha256Buffer(data: Buffer): string {
  return createHash("sha256").update(data).digest("hex");
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function createEvidenceManifest(
  record: EvidenceManifestRecord,
): EvidenceManifestV01 {
  const geometryHash = computeSha256(JSON.stringify(record.input.geometry));
  return {
    schema: 'jade-evidence/0.1',
    validationId: record.validationId,
    methodology: record.methodology,
    input: {
      geometryHash,
      commodity: record.input.commodity,
      cutoffDate: record.input.cutoffDate,
    },
    sources: record.sources,
    analysis: {
      intersectionAreaM2: record.analysis.intersectionAreaM2,
      intersectionPercentage: record.analysis.intersectionPercentage,
      eventsFound: record.analysis.eventsFound,
    },
    result: record.result,
  };
}

export interface EvidenceManifestRecord {
  validationId: string;
  methodology: { id: string; version: string };
  input: {
    geometry: object;
    commodity: string;
    cutoffDate: string;
  };
  sources: Array<{
    provider: string;
    dataset: string;
    datasetVersion: string | null;
    layer: string | null;
    retrievedAt: string;
    payloadHash: string;
  }>;
  analysis: {
    intersectionAreaM2: number | null;
    intersectionPercentage: number | null;
    eventsFound: number;
  };
  result: string;
}

export interface EvidenceManifestV01 {
  schema: 'jade-evidence/0.1';
  validationId: string;
  methodology: { id: string; version: string };
  input: {
    geometryHash: string;
    commodity: string;
    cutoffDate: string;
  };
  sources: Array<{
    provider: string;
    dataset: string;
    datasetVersion: string | null;
    layer: string | null;
    retrievedAt: string;
    payloadHash: string;
  }>;
  analysis: {
    intersectionAreaM2: number | null;
    intersectionPercentage: number | null;
    eventsFound: number;
  };
  result: string;
}