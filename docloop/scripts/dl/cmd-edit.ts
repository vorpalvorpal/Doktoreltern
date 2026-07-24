/**
 * `dl edit <doc>@<ref>` (ops on stdin) — package A6. One call carries any
 * number of ops against the same ref, applied bottom-up against the
 * ORIGINAL numbering. Validates fully before the first write (stale ref /
 * overlap / range errors leave the file byte-identical), canonicalises the
 * spliced result, writes it, journals the new hash, and reports the new ref
 * + ordinal shift on one line.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseEditOps, applyEditOps, type ShiftEntry } from './editops';
import { refOf, parseRef } from './refs';
import { canonicalize } from './canonical';
import { recordWrite } from './journal';
import { checkWorkspace } from './checkcore';
import { isDocPath } from './docs';

function formatShift(shift: ShiftEntry[]): string {
  if (shift.length === 0) return 'none';
  return shift.map((s) => `${s.from}:${s.delta >= 0 ? '+' : ''}${s.delta}`).join(', ');
}

export async function cmdEdit(ws: string, positional: string[], stdin: string): Promise<string> {
  const [docRef] = positional;
  if (!docRef) throw new Error('usage: dl edit <doc>@<ref> (ops on stdin)');
  const { doc: docName, hash } = parseRef(docRef);
  // Path-qualified doc ids are legal (`nodes/16/design.md`), but only doc
  // paths: never `threads/…`, `archive/…`, or a traversal like `../x.md`.
  if (!isDocPath(docName)) throw new Error(`not a reviewable doc path "${docName}"`);

  let source: string;
  try {
    source = readFileSync(join(ws, docName), 'utf8');
  } catch {
    throw new Error(`unknown doc "${docName}"`);
  }

  const currentRef = refOf(source);
  if (currentRef !== hash) {
    throw new Error(`stale ref (doc is now ${docName}@${currentRef}) — re-read`);
  }

  const ops = parseEditOps(stdin); // throws on ambiguous body
  const { text, shift } = applyEditOps(source, ops); // throws on out-of-range / overlap

  const canonical = await canonicalize(text); // throws on content-preservation guard

  const docPath = join(ws, docName);
  writeFileSync(docPath, canonical, 'utf8');
  const newRef = refOf(canonical);
  recordWrite(ws, docName, newRef);

  await warnOnDroppedAnchors(ws);

  return `${docName}@${newRef} shift: ${formatShift(shift)}`;
}

/**
 * Post-edit anchor-consistency scan, WARN mode only (plan A6): an edit that
 * drops a span dl edit still succeeds, but each thread left with no live
 * anchor anywhere and no resolved marker gets a warn line so the caller can
 * resolve or re-anchor it. Never affects the exit code.
 */
async function warnOnDroppedAnchors(ws: string): Promise<void> {
  const issues = await checkWorkspace(ws);
  for (const issue of issues) {
    const m = /^thread (\S+)\/ is orphaned/.exec(issue.message);
    if (m) console.error(`warn: thread ${m[1]} unanchored (resolve or re-anchor)`);
  }
}
