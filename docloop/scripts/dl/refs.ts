import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

/**
 * Compute the content hash reference for a string.
 * Returns the first 8 hex characters of the lowercase SHA-256 digest.
 */
export function refOf(text: string): string {
  const digest = createHash('sha256').update(text).digest('hex');
  return digest.slice(0, 8);
}

/**
 * Parse a ref string of the form "<doc>@<hash>" into its components.
 * Throws if the format is invalid:
 * - no @ present
 * - empty doc name
 * - non-hex hash
 */
export function parseRef(ref: string): { doc: string; hash: string } {
  const lastAtIndex = ref.lastIndexOf('@');

  if (lastAtIndex === -1) {
    throw new Error(`Invalid ref format: missing @ delimiter in "${ref}"`);
  }

  const doc = ref.slice(0, lastAtIndex);
  const hash = ref.slice(lastAtIndex + 1);

  if (!doc) {
    throw new Error(`Invalid ref format: empty doc name in "${ref}"`);
  }

  if (!/^[0-9a-f]+$/.test(hash)) {
    throw new Error(`Invalid ref format: hash must be lowercase hex characters, got "${hash}"`);
  }

  return { doc, hash };
}

/**
 * Assert that the on-disk content at docPath matches the given hash.
 * Resolves if the hashes match; rejects with an error containing
 * the current (fresh) ref if they don't match.
 */
export async function assertFresh(docPath: string, hash: string): Promise<void> {
  const bytes = await readFile(docPath, 'utf8');
  const currentHash = refOf(bytes);

  if (currentHash !== hash) {
    throw new Error(
      `stale ref (doc is now ${docPath}@${currentHash}) — re-read`
    );
  }
}
