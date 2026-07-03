/**
 * Content-preservation check: did a transform silently change the document's
 * VISIBLE text? Shared by `canonicalize()` (must never rewrite content, only
 * form) and `scripts/thread.ts` (anchoring must never touch content either).
 *
 * Built on the existing word-diff (`computeDiff`, src/diff.ts) rather than a new
 * comparison, so this reports divergences in the same vocabulary the rest of the
 * app already uses for diffs.
 */
import { computeDiff } from './diff';

/**
 * Compare `before`/`after` (flattened visible text, not raw markdown) and
 * summarise any divergence as a compact `+ins -del` string. Returns `''` when
 * they are identical — the caller's "no divergence" case.
 */
export function contentDiffSummary(before: string, after: string): string {
  const parts: string[] = [];
  for (const seg of computeDiff(before, after)) {
    if (seg.type === 'insert') parts.push(`+${seg.value}`);
    else if (seg.type === 'delete') parts.push(`-${seg.value}`);
  }
  return parts.join(' ');
}
