/**
 * M3 turn-render — the LLM-facing payload of a turn. This is the deterministic
 * "MCP" transform: given the previous committed document and the new one (the
 * human's commit), render what Claude reads before making its edits.
 *
 * Design SoT: the wiki `wiki-loop-draft` page (issue #53). The resolved shape is:
 *
 *   - **XML**, not prose — cheap for a script to emit and the format the
 *     formatting evidence favours for structured prompts (arXiv 2411.10541).
 *   - **grouped by enclosing heading** — related edits tend to share a section, so
 *     this groups them for free, no model needed. (The wiki says "H2"; we group by
 *     the nearest preceding heading of *any* level, because the dogfood docs use
 *     `# brainstorm` / `# issues` at H1. Same intent, works for both.)
 *   - **open items first** — comment threads (the things awaiting a response) are
 *     emitted before the document edits, a trivial deterministic sort that keeps
 *     the unresolved discussion out of the middle of the context (Liu et al. 2023,
 *     "Lost in the Middle").
 *
 * Pure string → string (no DOM), like diff.ts / foot.ts / threads.ts, so it runs
 * in node tests and could run in the MCP later. A local model to classify/rank
 * deltas is parked as a future refinement, not v0.
 */
import { computeDiff } from './diff';
import { extractAnchors, stripAnchors } from './threads';
import type { Thread } from './threads-store';

/** A heading found in the body, with the char offset where its line starts. */
interface Heading {
  offset: number;
  text: string;
}

/** ATX headings (`#`..`######`) at the start of a line; trailing `#`s stripped. */
const HEADING_RE = /^(#{1,6})\s+(.*?)\s*#*$/gm;

/** Collect the body's headings in document order, with their start offsets. */
function headingsOf(body: string): Heading[] {
  const out: Heading[] = [];
  for (const m of body.matchAll(HEADING_RE)) {
    out.push({ offset: m.index ?? 0, text: m[2].trim() });
  }
  return out;
}

/** The text of the nearest heading at or before `offset`, or null (preamble). */
function headingAt(headings: Heading[], offset: number): string | null {
  let found: string | null = null;
  for (const h of headings) {
    if (h.offset <= offset) found = h.text;
    else break; // headings are in offset order
  }
  return found;
}

// Edits run on the anchor-stripped body (via stripAnchors) so annotation
// scaffolding never appears as <ins>/<del> — the thread itself is already
// surfaced in the <threads> group.

/** Minimal XML text/attr escaping. */
function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** A rendered item belonging to one section (keyed by its heading). */
interface SectionItem {
  heading: string | null;
  xml: string;
}

/**
 * Bucket items into sections by heading, preserving the document order in which
 * each section first appears, and emit one `<section>` per heading wrapping its
 * items. `wrapper` names the outer element (`threads` / `edits`). An empty bucket
 * yields a self-closed `<wrapper/>` so the shape is stable.
 */
function renderSections(wrapper: string, items: SectionItem[]): string {
  if (items.length === 0) return `  <${wrapper}/>`;

  // Group preserving first-seen order. `null` heading -> the preamble section.
  const order: (string | null)[] = [];
  const byHeading = new Map<string | null, string[]>();
  for (const it of items) {
    if (!byHeading.has(it.heading)) {
      byHeading.set(it.heading, []);
      order.push(it.heading);
    }
    byHeading.get(it.heading)!.push(it.xml);
  }

  const sections = order.map((heading) => {
    const open = heading === null ? '<section>' : `<section heading="${esc(heading)}">`;
    const body = byHeading
      .get(heading)!
      .map((x) => `      ${x}`)
      .join('\n');
    return `    ${open}\n${body}\n    </section>`;
  });

  return `  <${wrapper}>\n${sections.join('\n')}\n  </${wrapper}>`;
}

/**
 * Render the turn Claude reads for the step from `oldMarkdown` to `newMarkdown`.
 *
 * Returns an XML string with two top-level groups, **threads first** then
 * **edits**, each grouped into `<section heading="…">` blocks by the enclosing
 * heading. Threads are the document's `:mark` anchors joined with their comment
 * bodies from the sidecar `store` (one `<reply>` per comment); edits come from the
 * body word-diff. `store` defaults to `[]`, so a caller without the store (or a
 * doc with no comments) still gets the anchors, just with no replies.
 */
export function renderTurn(
  oldMarkdown: string,
  newMarkdown: string,
  store: Thread[] = [],
): string {
  // Anchors live in the document; locate them by id to pick their section. Edits
  // run on the unwrapped body so anchor scaffolding never shows up as a change.
  const threadHeadings = headingsOf(newMarkdown);
  const editNew = stripAnchors(newMarkdown);
  const editHeadings = headingsOf(editNew);
  const commentsById = new Map(store.map((t) => [t.id, t.comments]));

  // --- Threads (open items): one <thread> per live anchor, in document order. ---
  const threadItems: SectionItem[] = [];
  for (const a of extractAnchors(newMarkdown)) {
    // Locate the anchor in the doc to pick its enclosing section.
    const at = newMarkdown.indexOf(`{#${a.id}}`);
    const heading = at >= 0 ? headingAt(threadHeadings, at) : null;

    const attrs = a.text ? ` anchor="${esc(a.text)}"` : '';
    const replies = (commentsById.get(a.id) ?? []).map((c) => c.body);
    const inner =
      replies.length === 0
        ? ''
        : '\n' +
          replies.map((r) => `        <reply>${esc(r)}</reply>`).join('\n') +
          '\n      ';
    threadItems.push({
      heading,
      xml: `<thread id="${esc(a.id)}"${attrs}>${inner}</thread>`,
    });
  }

  // --- Edits: word-diff of the body, each segment tagged with its section. ---
  // Walk the diff keeping a cursor into the NEW body: equal/insert segments are
  // present there (advance the cursor); a delete is not, so it inherits the
  // section at the current cursor. (The diff invariant guarantees equal+insert
  // reconstruct the new body, so the cursor stays accurate.)
  const editItems: SectionItem[] = [];
  let cursor = 0;
  for (const seg of computeDiff(stripAnchors(oldMarkdown), editNew)) {
    if (seg.type === 'equal') {
      cursor += seg.value.length;
      continue;
    }
    const heading = headingAt(editHeadings, cursor);
    const tag = seg.type === 'insert' ? 'ins' : 'del';
    editItems.push({ heading, xml: `<${tag}>${esc(seg.value)}</${tag}>` });
    if (seg.type === 'insert') cursor += seg.value.length;
  }

  return [
    '<turn>',
    renderSections('threads', threadItems),
    renderSections('edits', editItems),
    '</turn>',
    '',
  ].join('\n');
}
