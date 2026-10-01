import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Fingerprint the API source (tsx) or build (node), the actual library builds
// resolved by Node, and the lockfile. A dirty checkout is not identified by HEAD.
export async function processingVersion(): Promise<string> {
  const hash = createHash('sha256');
  async function addDirectory(directory: string, label: string): Promise<void> {
    const entries = await readdir(directory, { withFileTypes: true });
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      const path = join(directory, entry.name);
      const key = `${label}/${entry.name}`;
      if (entry.isDirectory()) await addDirectory(path, key);
      else if (
        /\.(ts|js)$/.test(entry.name) &&
        !/\.(test|integration\.test|d)\.ts$/.test(entry.name)
      ) {
        hash
          .update(key)
          .update('\0')
          .update(await readFile(path))
          .update('\0');
      }
    }
  }
  await addDirectory(fileURLToPath(new URL('../', import.meta.url)), 'api');
  for (const name of ['schemas', 'database', 'environmental-oracle']) {
    await addDirectory(
      dirname(fileURLToPath(import.meta.resolve(`@jade/${name}`))),
      name,
    );
  }
  hash.update(
    await readFile(new URL('../../../../pnpm-lock.yaml', import.meta.url)),
  );
  return `sha256:${hash.digest('hex')}`;
}
