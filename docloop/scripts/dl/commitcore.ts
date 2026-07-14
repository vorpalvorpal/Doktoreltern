/**
 * `dl commit` (package C2) — transactional turn end: validate (checkcore) +
 * canonicalise (already true of every `dl`-written doc) + stage exactly the
 * right files + commit as the fixed model author. The turn record is the
 * structured commit-message body (YAML), so it stays derivable from git
 * forever — no extra file.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { load, dump } from 'js-yaml';
import { git, docAt, MODEL_AUTHOR } from './gitio';
import { readScratch, clearScratch, type TurnScratch } from './journal';
import { refOf } from './refs';
import { checkWorkspace } from './checkcore';
import { canonicalize } from './canonical';
import { isDocPath, isDocDir } from './docs';

export interface TurnRecord {
  'docloop-turn': number;
  docs: Record<string, { before: string; after: string }>;
  threads: {
    opened: string[];
    replied: string[];
    resolved: { id: string; note?: string }[];
  };
  'recovered-draft': boolean;
  /** Not built/populated by C2 (no camelCase alias is ever written) — declared only so
   * `rec.recoveredDraft ?? rec['recovered-draft']` typechecks for reverse-direction readers. */
  recoveredDraft?: boolean;
}

/** Parse a commit-message body back into a {@link TurnRecord} (reverse of the builder). */
export function parseTurnRecord(body: string): TurnRecord {
  return load(body) as TurnRecord;
}

function buildTurnRecordYaml(
  docs: Record<string, { before: string; after: string }>,
  threads: TurnScratch['threads'],
  recoveredDraft: boolean,
): string {
  const record: TurnRecord = {
    'docloop-turn': 1,
    docs,
    threads: {
      opened: threads.opened,
      replied: threads.replied,
      resolved: threads.resolved,
    },
    'recovered-draft': recoveredDraft,
  };
  return dump(record).trimEnd();
}

/**
 * Every reviewable `*.md` doc file currently PRESENT in the workspace (not
 * git-tracked-ness — presence), recursively, as workspace-relative paths —
 * the same exclusion rule as doc discovery (`docs.ts` isDocPath: never
 * `threads/`, `archive/`, or dot-paths).
 */
async function presentDocFiles(ws: string): Promise<string[]> {
  async function walk(dir: string, relPrefix: string): Promise<string[]> {
    const entries = await readdir(dir, { withFileTypes: true });
    const out: string[] = [];
    for (const e of entries) {
      const rel = relPrefix ? `${relPrefix}/${e.name}` : e.name;
      if (e.isDirectory()) {
        if (isDocDir(rel)) out.push(...(await walk(join(dir, e.name), rel)));
      } else if (e.isFile() && isDocPath(rel)) {
        out.push(rel);
      }
    }
    return out;
  }
  return walk(ws, '');
}

/** Every file currently present under `<ws>/threads/`, recursively, as repo-relative paths (`threads/t1/0001.md`). */
async function threadFiles(ws: string): Promise<string[]> {
  async function walk(dir: string, relDir: string): Promise<string[]> {
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return [];
    }
    const out: string[] = [];
    for (const e of entries) {
      const rel = `${relDir}/${e.name}`;
      if (e.isDirectory()) out.push(...(await walk(join(dir, e.name), rel)));
      else if (e.isFile()) out.push(rel);
    }
    return out;
  }
  return walk(join(ws, 'threads'), 'threads');
}

/**
 * Foreign-edit guard (C2 step 1). Throws naming the offending file if the
 * working tree disagrees with what `dl` itself last wrote (journalled hash)
 * or, for files the journal doesn't know about, with HEAD — covering both
 * top-level docs AND everything under `threads/` (a hand-edited comment file
 * mid-turn is refused exactly like a hand-edited doc). `--allow-manual` skips
 * this guard entirely (still checks + canonicalises downstream).
 */
async function foreignEditGuard(ws: string, journal: TurnScratch | null, allowManual: boolean): Promise<void> {
  if (!journal) {
    if (!allowManual) throw new Error('nothing to commit — no dl writes this turn');
    return;
  }
  if (allowManual) return;

  const files = [...(await presentDocFiles(ws)), ...(await threadFiles(ws))];
  for (const doc of files) {
    const bytes = readFileSync(join(ws, doc), 'utf8');
    const recordedHash = journal.writes[doc];
    if (recordedHash !== undefined) {
      if (refOf(bytes) !== recordedHash) {
        throw new Error(`workspace changed outside dl (${doc}) — human edit mid-turn? re-run dl agenda`);
      }
    } else {
      const headBytes = await docAt(ws, 'HEAD', doc);
      if (bytes !== headBytes) {
        throw new Error(`workspace changed outside dl (${doc}) — human edit mid-turn? re-run dl agenda`);
      }
    }
  }
}

/**
 * Under `--allow-manual`: canonicalise every present doc so a hand edit
 * lands in canonical form before check/stage (plan C2). The
 * content-preservation guard inside `canonicalize` still applies — a throw
 * here refuses the commit, same as any other pre-commit failure.
 */
async function canonicaliseTrackedDocs(ws: string): Promise<void> {
  const files = await presentDocFiles(ws);
  for (const doc of files) {
    const path = join(ws, doc);
    const bytes = readFileSync(path, 'utf8');
    const canon = await canonicalize(bytes);
    if (canon !== bytes) writeFileSync(path, canon, 'utf8');
  }
}

export interface CommitResult {
  sha: string;
  docsCount: number;
  threadsCount: number;
}

export interface CommitOpts {
  subject: string;
  allowManual?: boolean;
}

/**
 * The full transactional sequence (C2): guard → checkcore → stage → commit →
 * clear scratch. Any failure before `git commit` leaves the repo exactly as
 * found (nothing is staged until every check has passed).
 */
export async function commitTurn(ws: string, opts: CommitOpts): Promise<CommitResult> {
  const allowManual = opts.allowManual ?? false;
  const journal = readScratch(ws);

  await foreignEditGuard(ws, journal, allowManual);

  if (allowManual) await canonicaliseTrackedDocs(ws);

  const issues = await checkWorkspace(ws);
  const errors = issues.filter((i) => i.level === 'ERROR');
  if (errors.length > 0) {
    throw new Error(`check failed (${errors.length} error${errors.length === 1 ? '' : 's'}): ${errors[0].message}`);
  }

  const files = await presentDocFiles(ws);
  const addArgs = [...files];
  try {
    await readdir(join(ws, 'threads'));
    addArgs.push('threads');
  } catch {
    /* no threads/ dir yet — nothing to add */
  }
  if (addArgs.length > 0) await git(ws, ['add', ...addArgs]);

  const journalWrites = journal?.writes ?? {};
  const docs: Record<string, { before: string; after: string }> = {};
  for (const [doc, after] of Object.entries(journalWrites)) {
    if (!isDocPath(doc)) continue; // thread-store paths (journalled for the foreign-edit guard) are not docs
    const beforeBytes = await docAt(ws, 'HEAD', doc);
    docs[doc] = { before: refOf(beforeBytes), after };
  }
  const threads = journal?.threads ?? { opened: [], replied: [], resolved: [] };

  const body = buildTurnRecordYaml(docs, threads, false);
  try {
    await git(ws, ['commit', '-q', '--author', MODEL_AUTHOR, '-m', opts.subject, '-m', body]);
  } catch (err) {
    await git(ws, ['reset']); // best-effort: unstage what we just staged, leave the working tree alone
    throw err;
  }

  const sha = (await git(ws, ['rev-parse', '--short', 'HEAD'])).trim();
  clearScratch(ws);

  const threadsCount = new Set([...threads.opened, ...threads.replied, ...threads.resolved.map((r) => r.id)]).size;
  return { sha, docsCount: Object.keys(docs).length, threadsCount };
}
