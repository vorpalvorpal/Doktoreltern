/**
 * CLI: canonicalise markdown file(s) in place to the docloop GUI's persisted form.
 *
 * The normalisation step for the LLM→md side of the loop. In v0 the MCP is hand-
 * simulated, so a Claude turn ends by editing `workspace/doc.md`, running this,
 * then committing — guaranteeing the commit is byte-identical to what the GUI
 * would save (clean diffs on the next turn). Run with vite-node (resolves the TS
 * + extensionless imports):
 *
 *     npm run canonicalize -- workspace/doc.md
 *     npm run canonicalize -- --check workspace/doc.md   # dry run, never writes
 *
 * `canonicalize()` can now throw (content-preservation check, src/canonicalize.ts)
 * instead of silently returning corrupted markdown. On a throw we print the error
 * and skip the write for that file, but keep processing the rest of the batch —
 * one bad file shouldn't hide the status of the others. The overall process still
 * exits non-zero if anything failed.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { bootstrapDom } from './dom-bootstrap';

bootstrapDom();

// Import only after the DOM globals are in place (ProseMirror touches them).
const { canonicalize } = await import('../src/canonicalize.ts');
const { computeDiff } = await import('../src/diff.ts');

const args = process.argv.slice(2);
const check = args.includes('--check');
const files = args.filter((a) => !a.startsWith('-'));
if (files.length === 0) {
  console.error('usage: canonicalize [--check] <file.md> [more.md ...]');
  process.exit(1);
}

/** Print each changed segment so `--check` doubles as a preview of the rewrite. */
function printDiff(before: string, after: string): void {
  for (const seg of computeDiff(before, after)) {
    if (seg.type === 'insert') console.log(`  + ${JSON.stringify(seg.value)}`);
    else if (seg.type === 'delete') console.log(`  - ${JSON.stringify(seg.value)}`);
  }
}

let anyFailed = false;
let anyWouldChange = false;

for (const file of files) {
  const before = readFileSync(file, 'utf8');
  let after: string;
  try {
    after = await canonicalize(before);
  } catch (err) {
    anyFailed = true;
    console.error(`${file}: FAILED — ${err instanceof Error ? err.message : String(err)}`);
    continue;
  }

  const changed = after !== before;
  if (check) {
    anyWouldChange ||= changed;
    console.log(`${file}: ${changed ? 'would change' : 'already canonical'}`);
    if (changed) printDiff(before, after);
    continue;
  }

  if (changed) writeFileSync(file, after, 'utf8');
  console.log(`${file}: ${changed ? 'normalised' : 'already canonical'}`);
}

if (anyFailed || (check && anyWouldChange)) process.exit(1);
