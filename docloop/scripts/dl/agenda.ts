/**
 * `dl agenda` (package B) — *the* read: everything since the model's last
 * commit, all human turns folded (union, not latest). Owns block-level union
 * delta (B3, `blockDelta`), dangling-draft recovery (B2), thread triage (B4),
 * and the top-level rendering (B5). `dl orient` lives in cmd-orient.ts (it
 * doesn't share machinery beyond gitio).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { diffArrays } from 'diff';
import { splitBlocks } from './blocks';
import { extractAnchors, stripAnchors } from '../../src/threads';
import { listThreads } from '../../src/threads-store';
import { trackedDocs } from './docs';
import { refOf } from './refs';
import { git, lastModelCommit, docAt, RJS_AUTHOR } from './gitio';
import { readScratch } from './journal';

// ---------------------------------------------------------------------------
// B3 — block-level union delta.
// ---------------------------------------------------------------------------

export interface DeltaItem {
  old: string[];
  new: string[];
  headingTrail: string[];
}

/**
 * Block-level delta between two full doc texts, stripped of anchors first
 * (anchor add/remove is thread business, not prose — same rule `renderTurn`
 * uses). Blocks are matched by exact segment equality (the `diff` package's
 * `diffArrays`, already a dependency); each contiguous changed run becomes
 * one item, carrying the new side's heading context (falling back to the old
 * side's for a pure deletion).
 */
export function blockDelta(oldDoc: string, newDoc: string): DeltaItem[] {
  const oldBlocks = splitBlocks(stripAnchors(oldDoc));
  const newBlocks = splitBlocks(stripAnchors(newDoc));
  // Compare TRIMMED segments (trailing blank-line separators dropped): a
  // block's raw segment absorbs whatever follows it (tiling rule), so
  // appending a new section after an unchanged block changes that block's
  // trailing whitespace alone — a diff artifact, not a real content change.
  const oldSegs = oldBlocks.map((b) => b.segment.replace(/\n+$/, ''));
  const newSegs = newBlocks.map((b) => b.segment.replace(/\n+$/, ''));

  const parts = diffArrays(oldSegs, newSegs);

  const items: DeltaItem[] = [];
  let oldIdx = 0;
  let newIdx = 0;
  let i = 0;
  while (i < parts.length) {
    const part = parts[i];
    if (!part.added && !part.removed) {
      oldIdx += part.value.length;
      newIdx += part.value.length;
      i++;
      continue;
    }
    const oldRun: string[] = [];
    const newRun: string[] = [];
    while (i < parts.length && (parts[i].added || parts[i].removed)) {
      if (parts[i].removed) {
        oldRun.push(...parts[i].value);
        oldIdx += parts[i].value.length;
      } else {
        newRun.push(...parts[i].value);
        newIdx += parts[i].value.length;
      }
      i++;
    }
    const headingTrail =
      newRun.length > 0
        ? (newBlocks[newIdx - newRun.length]?.headingTrail ?? [])
        : (oldBlocks[oldIdx - oldRun.length]?.headingTrail ?? []);
    items.push({ old: oldRun, new: newRun, headingTrail });
  }
  return items;
}

// ---------------------------------------------------------------------------
// B2 — dangling-draft recovery.
// ---------------------------------------------------------------------------

/** Paths named by `git status --porcelain` (staged/unstaged/untracked), best-effort parse. */
async function dirtyPaths(ws: string): Promise<string[]> {
  const out = await git(ws, ['status', '--porcelain']);
  return out
    .split('\n')
    .filter((l) => l.length > 0)
    .map((l) => l.slice(3).trim())
    .filter((p) => p.length > 0);
}

/**
 * If the recorded journal hash for every dirty path matches `refOf` of what's
 * on disk (the journal always stores `refOf(file bytes)` — see journal.ts),
 * the dirt is the model's own in-progress turn, not a foreign human edit.
 */
function journalMatchesDirt(ws: string, journal: ReturnType<typeof readScratch>, paths: string[]): boolean {
  if (!journal) return false;
  for (const p of paths) {
    const recorded = journal.writes[p];
    if (recorded === undefined) return false;
    let bytes: string;
    try {
      bytes = readFileSync(join(ws, p), 'utf8');
    } catch {
      return false;
    }
    if (recorded !== refOf(bytes)) return false;
  }
  return true;
}

/**
 * At the very start of `dl agenda`: recover a dirty human draft as its own
 * turn (spec decision 8), UNLESS the dirt is the model's own in-progress
 * turn (journal matches). Emits a `warn:` line to stderr either way there
 * was something to report. No-op on a clean tree.
 */
async function recoverDanglingDraft(ws: string): Promise<void> {
  const paths = await dirtyPaths(ws);
  if (paths.length === 0) return;

  const journal = readScratch(ws);
  if (journalMatchesDirt(ws, journal, paths)) {
    console.error('warn: model turn in progress');
    return;
  }

  await git(ws, ['add', '-A']);
  await git(ws, ['commit', '-q', '--author', RJS_AUTHOR, '-m', 'turn (rjs): recovered draft']);
  console.error('warn: recovered uncommitted human draft as its own turn');
}

// ---------------------------------------------------------------------------
// B4/B5 — thread triage + rendering.
// ---------------------------------------------------------------------------

function truncate(s: string, n: number): string {
  return s.length <= n ? s : s.slice(0, n);
}

/** The full `dl agenda` report. */
export async function buildAgenda(ws: string): Promise<string> {
  await recoverDanglingDraft(ws);

  const boundarySha = await lastModelCommit(ws);
  let shortSha = '(repo start)';
  let subject = '';
  let boundaryTimeMs = -Infinity;
  if (boundarySha) {
    const info = (await git(ws, ['show', '-s', '--format=%h%x09%s%x09%ct', boundarySha])).trim();
    const [h, subj, ct] = info.split('\t');
    shortSha = h;
    subject = subj ?? '';
    boundaryTimeMs = Number(ct) * 1000;
  }

  const headSha = (await git(ws, ['rev-parse', 'HEAD'])).trim();
  if (boundarySha !== null && headSha === boundarySha) {
    return `agenda: nothing new since ${shortSha}`;
  }

  const turnsFolded = Number(
    (
      await git(ws, boundarySha !== null ? ['rev-list', '--count', `${boundarySha}..HEAD`] : ['rev-list', '--count', 'HEAD'])
    ).trim(),
  );

  const docs = await trackedDocs(ws);
  const threads = await listThreads(join(ws, 'threads'));
  const threadsById = new Map(threads.map((t) => [t.id, t]));

  const oldAnchorsByDoc = new Map<string, Set<string>>();
  const liveIdsAll = new Set<string>();
  for (const doc of docs) {
    const oldText = await docAt(ws, boundarySha, doc);
    oldAnchorsByDoc.set(doc, new Set(extractAnchors(oldText).map((a) => a.id)));
  }
  for (const doc of docs) {
    const newText = readFileSync(join(ws, doc), 'utf8');
    for (const a of extractAnchors(newText)) liveIdsAll.add(a.id);
  }
  const docSections: string[] = [];

  for (const doc of docs) {
    const newText = readFileSync(join(ws, doc), 'utf8');
    const oldText = await docAt(ws, boundarySha, doc);
    const ref = refOf(newText);
    const items = blockDelta(oldText, newText);

    const proseLines: string[] = [];
    items.forEach((it, idx) => {
      const where = it.headingTrail.length ? it.headingTrail.join(' > ') : '(preamble)';
      proseLines.push(`[${idx + 1}] under "${where}":`);
      proseLines.push(`  old: ${it.old.join(' ').trim() || '(none)'}`);
      proseLines.push(`  new: ${it.new.join(' ').trim() || '(none)'}`);
    });

    const oldAnchorIds = oldAnchorsByDoc.get(doc)!;
    const awaitingChanged: string[] = [];
    const awaitingUnchanged: string[] = [];
    for (const a of extractAnchors(newText)) {
      const t = threadsById.get(a.id);
      if (t?.resolved) continue;
      const opened = !oldAnchorIds.has(a.id);
      const hasNewComment = (t?.comments ?? []).some((c) => Date.parse(c.created) > boundaryTimeMs);
      if (opened || hasNewComment) {
        const n = t?.comments.length ?? 0;
        const bodies = (t?.comments ?? []).map((c) => `  ${c.author}: ${c.body}`).join('\n');
        awaitingChanged.push(`${a.id} (changed) "${a.text}" — ${n} comment${n === 1 ? '' : 's'}\n${bodies}`);
      } else {
        const cs = t?.comments ?? [];
        const last = cs[cs.length - 1];
        const snippet = last ? `${last.author}: ${truncate(last.body, 80)}` : '(no comments)';
        awaitingUnchanged.push(`${a.id} (open, unchanged) "${a.text}" — last: ${snippet}`);
      }
    }

    // Resolved-since-boundary threads owned by this doc: explicit markers
    // (path A), and legacy dirs deleted outright between B and HEAD with no
    // marker at all (path B — pre-marker data, spec decision 9 predates this).
    const resolvedItems: string[] = [];
    for (const t of threads) {
      if (!t.resolved) continue;
      if (Date.parse(t.resolved.created) <= boundaryTimeMs) continue; // resolved before B — not listed
      if (t.resolved.author === 'claude') continue; // model self-resolution (plan B4: author ≠ the model) — not listed
      // Attribute to the doc that had the anchor live at B; if none did (the
      // thread was opened AND resolved entirely after B), fall back to the
      // first tracked doc so it's still reported exactly once, somewhere.
      const owner = owningDocFor(oldAnchorsByDoc, docs, t.id) ?? docs[0];
      if (owner !== doc) continue;
      resolvedItems.push(`${t.id} — note: ${t.resolved.note || '(none)'}`);
    }
    // Legacy: a thread dir deleted outright between B and HEAD (pre-marker
    // data) — no store entry survives at all, so it's inferred purely from
    // "was live at B, isn't live anywhere now, has no store entry".
    for (const id of oldAnchorIds) {
      if (liveIdsAll.has(id)) continue;
      if (threadsById.has(id)) continue;
      resolvedItems.push(`${id} — note: (none)`);
    }

    const hasContent = proseLines.length > 0 || awaitingChanged.length > 0 || awaitingUnchanged.length > 0 || resolvedItems.length > 0;
    if (!hasContent) {
      docSections.push(`## ${doc}  (unchanged)`);
      continue;
    }

    const lines: string[] = [`## ${doc}  (now @${ref})`];
    if (proseLines.length > 0) {
      lines.push('### prose changes');
      lines.push(...proseLines);
    }
    if (awaitingChanged.length > 0 || awaitingUnchanged.length > 0) {
      lines.push('### threads awaiting you');
      lines.push(...awaitingChanged, ...awaitingUnchanged);
    }
    if (resolvedItems.length > 0) {
      lines.push('### resolved by rjs');
      lines.push(...resolvedItems);
    }
    docSections.push(lines.join('\n'));
  }

  const header = `# agenda (since ${shortSha} "${subject}", ${turnsFolded} human turn${turnsFolded === 1 ? '' : 's'} folded)`;
  return [header, '', docSections.join('\n\n')].join('\n');
}

/** Which doc (if any) had `id` live-anchored at the boundary. */
function owningDocFor(oldAnchorsByDoc: Map<string, Set<string>>, docs: string[], id: string): string | undefined {
  return docs.find((d) => oldAnchorsByDoc.get(d)?.has(id));
}
