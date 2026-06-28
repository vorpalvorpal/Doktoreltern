import { diffWords } from 'diff';

export type DiffSegment = {
  type: 'equal' | 'insert' | 'delete';
  value: string;
};

/**
 * Split a docloop document at its **last** `---` thematic break: everything
 * above is the body (document content); the line of `---` and everything below
 * is the `<article>` foot-region. Returns just the body.
 *
 * We match the delimiter as a `---` line (optionally surrounded by blank
 * lines), which is how src/roundtrip.ts pins the foot-region rule. If there is
 * no `---`, the whole doc is body.
 */
function bodyOf(markdown: string): string {
  return splitFoot(markdown).body;
}

/**
 * Split a docloop document at its **last** `---` line into the `body` (above) and
 * `foot` (the `---` line and everything below, i.e. the foot-region). Joining
 * `body` + `foot` with a single `\n` reconstructs the document when foot is
 * present. Exported so the hunk accept/reject ops (src/hunks.ts) can edit the
 * body and re-attach the untouched foot-region.
 */
export function splitFoot(markdown: string): { body: string; foot: string } {
  const lines = markdown.split('\n');
  let lastRule = -1;
  for (let i = 0; i < lines.length; i++) {
    if (/^---\s*$/.test(lines[i])) lastRule = i;
  }
  if (lastRule === -1) return { body: markdown, foot: '' };
  return {
    body: lines.slice(0, lastRule).join('\n'),
    foot: lines.slice(lastRule).join('\n'),
  };
}

/**
 * Word-level diff of two markdown versions, restricted to the **body** —
 * everything above the final `---`. The `<article>` foot-region (at/below the
 * final `---`) is **excluded** from diffing, because threads are not document
 * content and must never surface as `<ins>`/`<del>`.
 *
 * Returns an ordered segment list. The invariant the tests pin:
 *   equal+delete segments, in order, reconstruct the OLD body;
 *   equal+insert segments, in order, reconstruct the NEW body.
 * The GUI maps insert/delete segments to ProseMirror decorations.
 */
export function computeDiff(oldMarkdown: string, newMarkdown: string): DiffSegment[] {
  const oldBody = bodyOf(oldMarkdown);
  const newBody = bodyOf(newMarkdown);

  // diffWords groups runs of unchanged / added / removed words (whitespace is
  // attached so the two sides reconstruct exactly). Map its parts onto our
  // narrower vocabulary.
  return diffWords(oldBody, newBody).map((part): DiffSegment => ({
    type: part.added ? 'insert' : part.removed ? 'delete' : 'equal',
    value: part.value,
  }));
}
