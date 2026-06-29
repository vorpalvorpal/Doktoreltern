/**
 * Sidecar comment-thread store — the pure Node filesystem layer behind the
 * "comments as files" model. Unlike the foot-region store (src/foot.ts), which
 * keeps thread bodies inline in the document, this store gives each thread its
 * own DIRECTORY and each comment its own markdown FILE. The payoff: a comment
 * can hold arbitrary markdown — fenced code blocks, lists, multiple paragraphs —
 * none of which survives the single-line `<br>`-joined inline form.
 *
 * ## On-disk layout
 *     <baseDir>/
 *       t1/
 *         0001.md   ← first comment
 *         0002.md   ← reply
 *       t2/
 *         0001.md
 *
 * Each `NNNN.md` is a tiny `---`-delimited frontmatter block (string-valued
 * `author` / `created`) followed by the raw markdown body:
 *
 *     ---
 *     author: rjs
 *     created: 2026-06-29T10:00:00.000Z
 *     ---
 *     The markdown body of the comment.
 *
 * We hand-roll the frontmatter parse/serialize rather than pull in a YAML
 * dependency: the shape is fixed and trivial (a few `key: value` lines, plain
 * string values, no quoting/escaping needed for v0), so a real YAML parser would
 * be cost without benefit. Keeping it greppable plain text also matches the
 * repo's portability aim. If we ever need richer values, swap the two helpers
 * below and nothing else changes.
 *
 * Everything here is async (`node:fs/promises`) and side-effect-local: functions
 * read/write under `baseDir` and nowhere else, and tolerate a missing `baseDir`
 * or stray non-`NNNN.md` files so the store degrades gracefully.
 */

import { mkdir, readdir, readFile, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';

/** A single comment in a thread, in sequence order within its thread. */
export interface Comment {
  seq: number;
  author: string;
  created: string;
  body: string;
}

/** A thread: its id (directory name) and its comments, sorted by `seq`. */
export interface Thread {
  id: string;
  comments: Comment[];
}

/** Matches a `t<N>` id and captures the numeric suffix. */
const ID_RE = /^t(\d+)$/;

/** Matches an `NNNN.md` comment filename and captures the sequence number. */
const COMMENT_FILE_RE = /^(\d+)\.md$/;

/**
 * Next sequential id of the form `t<N>` given the ids already present: max
 * numeric suffix + 1, or `t1` if none qualify. Ids that don't match `^t(\d+)$`
 * are simply ignored when computing the max — they can't collide with this
 * scheme.
 */
export function newThreadId(existingIds: string[]): string {
  let max = 0;
  for (const id of existingIds) {
    const m = ID_RE.exec(id);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `t${max + 1}`;
}

/**
 * Natural id ordering: `t2` before `t10`. When both ids match `t<N>` we compare
 * the numeric suffixes; otherwise we fall back to a lexical compare so the sort
 * stays total even for unexpected directory names.
 */
function compareIds(a: string, b: string): number {
  const ma = ID_RE.exec(a);
  const mb = ID_RE.exec(b);
  if (ma && mb) return Number(ma[1]) - Number(mb[1]);
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Serialize a comment to its `NNNN.md` file contents (frontmatter + body). */
function serializeComment(c: Pick<Comment, 'author' | 'created' | 'body'>): string {
  // Closing `---` followed by a single newline, then the body verbatim. The
  // single newline is the one parseComment strips back off on read.
  return `---\nauthor: ${c.author}\ncreated: ${c.created}\n---\n${c.body}`;
}

/**
 * Parse a `NNNN.md` file: a leading `---` line, `key: value` lines, a closing
 * `---` line, then the body. We strip exactly ONE newline after the closing
 * `---` (the one serializeComment wrote) so the body round-trips byte-stably.
 * On a malformed file (no proper frontmatter) we degrade to empty metadata and
 * treat the whole text as the body rather than throwing — a stray file
 * shouldn't take down a `listThreads`.
 */
function parseComment(seq: number, text: string): Comment {
  const lines = text.split('\n');
  let author = '';
  let created = '';

  if (lines[0] === '---') {
    let i = 1;
    for (; i < lines.length && lines[i] !== '---'; i++) {
      const sep = lines[i].indexOf(':');
      if (sep === -1) continue;
      const key = lines[i].slice(0, sep).trim();
      const value = lines[i].slice(sep + 1).trim();
      if (key === 'author') author = value;
      else if (key === 'created') created = value;
    }
    if (i < lines.length) {
      // lines[i] is the closing `---`; the body is everything after it, rejoined
      // with the newlines split removed. Dropping `i + 1` lines from the front
      // and rejoining strips exactly the one separating newline.
      const body = lines.slice(i + 1).join('\n');
      return { seq, author, created, body };
    }
  }

  // No well-formed frontmatter — keep the raw text as the body.
  return { seq, author, created, body: text };
}

/** Read and parse every `NNNN.md` in a thread directory, sorted by seq. */
async function readComments(dir: string): Promise<Comment[]> {
  const entries = await readdir(dir);
  const comments: Comment[] = [];
  for (const name of entries) {
    const m = COMMENT_FILE_RE.exec(name);
    if (!m) continue; // ignore anything that isn't an NNNN.md comment file
    const text = await readFile(join(dir, name), 'utf8');
    comments.push(parseComment(Number(m[1]), text));
  }
  comments.sort((a, b) => a.seq - b.seq);
  return comments;
}

/**
 * Read one thread by id, or `null` if its directory doesn't exist. A missing
 * directory surfaces as ENOENT from `readdir`, which we treat as "no such
 * thread" rather than an error.
 */
export async function readThread(baseDir: string, id: string): Promise<Thread | null> {
  const dir = join(baseDir, id);
  try {
    const comments = await readComments(dir);
    return { id, comments };
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw err;
  }
}

/**
 * All threads under `baseDir`, sorted by id (numeric suffix order), each with
 * its comments sorted by seq. Returns `[]` if `baseDir` itself doesn't exist —
 * the store may simply not have been written to yet.
 */
export async function listThreads(baseDir: string): Promise<Thread[]> {
  let entries: import('node:fs').Dirent[];
  try {
    entries = await readdir(baseDir, { withFileTypes: true });
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw err;
  }

  const ids = entries.filter((e) => e.isDirectory()).map((e) => e.name).sort(compareIds);
  const threads: Thread[] = [];
  for (const id of ids) {
    const comments = await readComments(join(baseDir, id));
    threads.push({ id, comments });
  }
  return threads;
}

/**
 * Append a comment to thread `id`, creating the thread directory if it doesn't
 * exist yet. The new comment takes the next sequence (max existing seq + 1, or 1
 * for the first), and `created` defaults to now if the caller omits it. Returns
 * the created comment.
 */
export async function addComment(
  baseDir: string,
  id: string,
  input: { author: string; body: string; created?: string },
): Promise<Comment> {
  const dir = join(baseDir, id);
  await mkdir(dir, { recursive: true });

  // Next seq from what's already on disk, so concurrent threads each number
  // independently and gaps (from manual deletes) don't reuse a number.
  const existing = await readComments(dir);
  const seq = existing.length ? existing[existing.length - 1].seq + 1 : 1;

  const created = input.created ?? new Date().toISOString();
  const comment: Comment = { seq, author: input.author, created, body: input.body };

  const name = String(seq).padStart(4, '0') + '.md';
  await writeFile(join(dir, name), serializeComment(comment), 'utf8');
  return comment;
}

/**
 * Resolve a thread by deleting its directory and all its comment files. A no-op
 * if the thread isn't there (`force: true` swallows ENOENT), so resolving an
 * already-resolved id is safe.
 */
export async function resolveThread(baseDir: string, id: string): Promise<void> {
  await rm(join(baseDir, id), { recursive: true, force: true });
}
