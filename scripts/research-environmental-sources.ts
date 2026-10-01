import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { URL, URLSearchParams, fileURLToPath } from 'node:url';
import { log } from 'node:console';
import process from 'node:process';
import type { ValidationInput } from '../packages/schemas/src/index.js';

interface ResearchQuery {
  name: string;
  method?: 'GET' | 'POST';
  params: Record<string, string>;
}

interface QueryReceipt {
  dataset: string;
  operation: string;
  requestUrl: string;
  method: 'GET' | 'POST';
  requestBody?: string;
  retrievedAt: string;
  httpStatus: number;
  payloadHash: string;
  file: string;
  numberMatched?: number;
  numberReturned?: number;
  featureIds?: string[];
}

const root = fileURLToPath(new URL('../', import.meta.url));
const output = resolve(
  process.argv[2] ??
    join(
      root,
      '.data/research',
      `terrabrasilis-${new Date().toISOString().replaceAll(':', '-')}`,
    ),
);
await mkdir(output, { recursive: true });
const example: ValidationInput = JSON.parse(
  await readFile(
    join(root, 'docs/examples/validation-input-sinop.json'),
    'utf8',
  ),
);
assert.equal(example.geometry.type, 'Polygon');
const wkt = `POLYGON(${example.geometry.coordinates.map((ring) => `(${ring.map((point) => point.join(' ')).join(',')})`).join(',')})`;
const spatial = `INTERSECTS(geom,SRID=4326;${wkt})`;
const datasets = [
  {
    dataset: 'DETER',
    workspace: 'deter-amz',
    layer: 'deter_amz',
    sort: 'gid',
    date: 'view_date',
  },
  {
    dataset: 'PRODES',
    workspace: 'prodes-legal-amz',
    layer: 'yearly_deforestation',
    sort: 'fid',
    date: 'image_date',
  },
];
const manifest: {
  input: ValidationInput;
  note: string;
  queries: QueryReceipt[];
} = {
  input: example,
  note: 'Read-only small queries; count defaults are not experimentally measured server maximums.',
  queries: [],
};
for (const dataset of datasets) {
  const typeName = `${dataset.workspace}:${dataset.layer}`;
  const featureParams = {
    request: 'GetFeature',
    typeName,
    outputFormat: 'application/json',
    srsName: 'EPSG:4326',
    sortBy: dataset.sort,
  };
  const queries: ResearchQuery[] = [
    { name: 'capabilities', params: { request: 'GetCapabilities' } },
    { name: 'schema', params: { request: 'DescribeFeatureType', typeName } },
    ...[0, 1].map((index) => ({
      name: `page-${index}`,
      params: {
        ...featureParams,
        count: '1',
        startIndex: String(index),
        CQL_FILTER: spatial,
      },
    })),
    {
      name: 'post',
      method: 'POST',
      params: {
        ...featureParams,
        count: '1',
        startIndex: '0',
        CQL_FILTER: spatial,
      },
    },
    ...[
      ['after', `${dataset.date} > '${example.cutoffDate}'`],
      ['before', `${dataset.date} <= '${example.cutoffDate}'`],
      ['undated', `${dataset.date} IS NULL`],
    ].map(([name, temporal]) => ({
      name: `${name}-hits`,
      params: {
        ...featureParams,
        resultType: 'hits',
        CQL_FILTER: `${spatial} AND (${temporal})`,
      },
    })),
  ];
  for (const { name, params, method = 'GET' } of queries) {
    const endpoint = `https://terrabrasilis.dpi.inpe.br/geoserver/${dataset.workspace}/wfs`;
    const search = new URLSearchParams({
      service: 'WFS',
      version: '2.0.0',
      ...params,
    }).toString();
    const requestUrl = method === 'GET' ? `${endpoint}?${search}` : endpoint;
    const response = await globalThis.fetch(requestUrl, {
      method,
      ...(method === 'POST'
        ? {
            body: search,
            headers: { 'content-type': 'application/x-www-form-urlencoded' },
          }
        : {}),
      signal: globalThis.AbortSignal.timeout(30_000),
    });
    const bytes = new Uint8Array(await response.arrayBuffer());
    const body = new TextDecoder().decode(bytes);
    if (!response.ok || /ExceptionReport/.test(body))
      throw new Error(
        `${dataset.dataset}/${name}: ${response.status} ${body.slice(0, 300)}`,
      );
    const filename = `${dataset.dataset.toLowerCase()}-${name}.${body.trimStart().startsWith('{') ? 'json' : 'xml'}`;
    await writeFile(join(output, filename), bytes);
    const entry: QueryReceipt = {
      dataset: dataset.dataset,
      operation: name,
      requestUrl,
      method,
      ...(method === 'POST' ? { requestBody: search } : {}),
      retrievedAt: new Date().toISOString(),
      httpStatus: response.status,
      payloadHash: createHash('sha256').update(bytes).digest('hex'),
      file: filename,
    };
    if (filename.endsWith('.json')) {
      const json: {
        numberMatched: number;
        numberReturned: number;
        features?: { id: string }[];
      } = JSON.parse(body);
      Object.assign(entry, {
        numberMatched: json.numberMatched,
        numberReturned: json.numberReturned,
        featureIds: json.features?.map((feature) => feature.id),
      });
    } else if (name.endsWith('-hits')) {
      Object.assign(entry, {
        numberMatched: Number(body.match(/numberMatched="(\d+)"/)?.[1]),
      });
    }
    manifest.queries.push(entry);
    log(`${dataset.dataset} ${name}: HTTP ${response.status}`);
  }
}
await writeFile(
  join(output, 'manifest.json'),
  JSON.stringify(manifest, null, 2) + '\n',
);
log(
  `Preserved ${manifest.queries.length} responses and SHA-256 receipts in ${output}`,
);
