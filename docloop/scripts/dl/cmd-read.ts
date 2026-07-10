/**
 * `dl read <doc> [section]` (package A5). Prints the doc's numbered blocks:
 * a header line (`<doc>@<ref> blocks <from>-<to>`) followed by one `@@ <n>
 * @@` marker per block and the block's segment (trailing blank-line
 * separator stripped — the next marker line provides the separation).
 * Reads the working-tree file as-is; canonicalisation is write-side work.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { splitBlocks, sectionRange } from './blocks';
import { refOf } from './refs';
import { trackedDocs } from './docs';

export async function cmdRead(ws: string, positional: string[]): Promise<string> {
  const [docName, section] = positional;
  if (!docName) throw new Error('usage: dl read <doc> [section]');

  const docs = await trackedDocs(ws);
  if (!docs.includes(docName)) {
    throw new Error(`unknown doc "${docName}"; tracked docs: ${docs.join(', ') || '(none)'}`);
  }

  const bytes = readFileSync(join(ws, docName), 'utf8');
  const ref = refOf(bytes);
  const blocks = splitBlocks(bytes);

  let from = blocks.length ? 1 : 0;
  let to = blocks.length;
  if (section) {
    const range = sectionRange(blocks, section); // throws on unknown/ambiguous heading
    from = range.from;
    to = range.to;
  }

  const lines: string[] = [`${docName}@${ref} blocks ${from}-${to}`];
  for (const b of blocks) {
    if (b.n < from || b.n > to) continue;
    lines.push(`@@ ${b.n} @@`);
    lines.push(b.segment.replace(/\n+$/, ''));
  }
  return lines.join('\n');
}
