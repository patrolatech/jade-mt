import { createHash, randomUUID } from 'node:crypto';
import { link, mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { SourcePageEvidence } from '@jade/environmental-oracle';
import type { ArchivedSourcePage } from '@jade/schemas';

export const defaultEvidenceDirectory = fileURLToPath(
  new URL('../../../../.data/source-evidence/', import.meta.url),
);

async function writeOnce(
  directory: string,
  filename: string,
  content: Uint8Array,
) {
  const temporary = join(directory, `.${randomUUID()}.tmp`);
  await writeFile(temporary, content, { flag: 'wx' });
  try {
    try {
      // Publish complete bytes atomically, without replacing an existing artifact.
      await link(temporary, join(directory, filename));
    } catch (error) {
      if (!(
        error instanceof Error &&
        'code' in error &&
        error.code === 'EEXIST'
      ))
        throw error;
      if (
        !Buffer.from(await readFile(join(directory, filename))).equals(content)
      )
        throw new Error(
          'Existing source evidence does not match its content hash',
          { cause: error },
        );
    }
  } finally {
    await unlink(temporary);
  }
}

export function archiveSourcePage(directory = defaultEvidenceDirectory) {
  return async ({
    body,
    bodyBytes,
    ...receipt
  }: SourcePageEvidence): Promise<void> => {
    const bytes = bodyBytes ?? Buffer.from(body, 'utf8');
    if (
      !/^[a-f0-9]{64}$/.test(receipt.payloadHash) ||
      createHash('sha256').update(bytes).digest('hex') !== receipt.payloadHash
    )
      throw new Error('Source payload hash mismatch');
    await mkdir(directory, { recursive: true });
    const receiptBody = JSON.stringify(receipt, null, 2);
    const receiptHash = createHash('sha256').update(receiptBody).digest('hex');
    await writeOnce(directory, `${receipt.payloadHash}.json`, bytes);
    await writeOnce(
      directory,
      `${receiptHash}.receipt.json`,
      Buffer.from(receiptBody, 'utf8'),
    );
  };
}

export function describeSourcePage(directory = defaultEvidenceDirectory) {
  return async (page: SourcePageEvidence): Promise<ArchivedSourcePage> => {
    const receipt = {
      requestUrl: page.requestUrl,
      method: page.method,
      ...(page.requestBody !== undefined
        ? { requestBody: page.requestBody }
        : {}),
      retrievedAt: page.retrievedAt,
      payloadHash: page.payloadHash,
    };
    if (!/^[a-f0-9]{64}$/.test(receipt.payloadHash))
      throw new Error('Invalid source payload hash');
    const storageKey = `${receipt.payloadHash}.json`;
    const bytes = await readFile(join(directory, storageKey));
    if (
      createHash('sha256').update(bytes).digest('hex') !== receipt.payloadHash
    )
      throw new Error('Archived source payload hash mismatch');
    return { ...receipt, storageKey, byteLength: bytes.byteLength };
  };
}
