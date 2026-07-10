/**
 * Shared scaffolding for the `dl` CLI test suite.
 *
 * Two kinds of workspace:
 *  - `makeRepo()` — a throwaway git repo in a temp dir, for anything that
 *    exercises git plumbing (agenda boundary, recovery, commit, orient).
 *  - a bare temp dir (mkdtemp) for pure-filesystem unit tests (blocks/refs on a
 *    fixture string, journal round-trips) — those don't need git at all.
 *
 * All git commits go through `commit()`, which sets deterministic author/committer
 * dates and an explicit `--author` so a test can simulate a human turn
 * (`rjs <rjs@docloop>`) or a model turn (`docloop-model <model@docloop>`) — the two
 * identities the agenda's boundary detection keys off (spec decision 7).
 *
 * NEVER point any of this at docloop/workspace/ — every path here lives under a
 * fresh mkdtemp root and is removed in the caller's afterEach.
 */
import { execFile as execFileCb } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const execFile = promisify(execFileCb);

export const MODEL_AUTHOR = 'docloop-model <model@docloop>';
export const RJS_AUTHOR = 'rjs <rjs@docloop>';

const here = dirname(fileURLToPath(import.meta.url));
export const FIXTURES = join(here, '..', 'fixtures', 'dl');
export const DL_SCRIPT = join(here, '..', '..', 'scripts', 'dl.ts');

/** Read a fixture file (design.md / plan.md / torture.md / lint-forbidden.md). */
export function readFixture(name: string): Promise<string> {
  return readFile(join(FIXTURES, name), 'utf8');
}

/** A fresh empty temp dir with no git repo — for pure-fs unit tests. */
export async function makeDir(): Promise<string> {
  return mkdtemp(join(tmpdir(), 'dl-unit-'));
}

export async function cleanup(dir: string): Promise<void> {
  await rm(dir, { recursive: true, force: true });
}

async function git(ws: string, args: string[], env: NodeJS.ProcessEnv = {}): Promise<string> {
  const { stdout } = await execFile('git', ['-C', ws, ...args], {
    env: { ...process.env, ...env },
  });
  return stdout;
}

/** Init a throwaway workspace repo with a default (human) identity configured. */
export async function makeRepo(): Promise<string> {
  const ws = await mkdtemp(join(tmpdir(), 'dl-ws-'));
  await git(ws, ['init', '-q', '-b', 'main']);
  await git(ws, ['config', 'user.name', 'rjs']);
  await git(ws, ['config', 'user.email', 'rjs@docloop']);
  await git(ws, ['config', 'commit.gpgsign', 'false']);
  return ws;
}

/** Write a top-level workspace doc (creates parent dirs as needed). */
export async function writeDoc(ws: string, name: string, content: string): Promise<void> {
  const path = join(ws, name);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, content, 'utf8');
}

/** Read a workspace file back. */
export function readDoc(ws: string, name: string): Promise<string> {
  return readFile(join(ws, name), 'utf8');
}

/** Seed a thread comment file directly on disk (comment-shaped frontmatter). */
export async function writeComment(
  ws: string,
  id: string,
  seq: number,
  opts: { author: string; created: string; body: string },
): Promise<void> {
  const dir = join(ws, 'threads', id);
  await mkdir(dir, { recursive: true });
  const name = String(seq).padStart(4, '0') + '.md';
  await writeFile(
    join(dir, name),
    `---\nauthor: ${opts.author}\ncreated: ${opts.created}\n---\n${opts.body}`,
    'utf8',
  );
}

/** Seed a `resolved.md` marker directly (the C0 store shape). */
export async function writeResolvedMarker(
  ws: string,
  id: string,
  opts: { author: string; created: string; note: string },
): Promise<void> {
  const dir = join(ws, 'threads', id);
  await mkdir(dir, { recursive: true });
  await writeFile(
    join(dir, 'resolved.md'),
    `---\nauthor: ${opts.author}\ncreated: ${opts.created}\n---\n${opts.note}`,
    'utf8',
  );
}

export interface CommitOpts {
  author?: string; // "Name <email>"; default RJS_AUTHOR
  date?: string; // ISO; drives both author and committer date for determinism
  addAll?: boolean; // default true: `git add -A` before commit
}

/** Stage (by default everything) and commit with a fixed author + deterministic dates. */
export async function commit(ws: string, subject: string, opts: CommitOpts = {}): Promise<string> {
  const author = opts.author ?? RJS_AUTHOR;
  const date = opts.date ?? '2026-07-09T12:00:00';
  if (opts.addAll !== false) await git(ws, ['add', '-A']);
  await git(ws, ['commit', '-q', '--author', author, '-m', subject], {
    GIT_AUTHOR_DATE: date,
    GIT_COMMITTER_DATE: date,
    GIT_COMMITTER_NAME: 'committer',
    GIT_COMMITTER_EMAIL: 'committer@docloop',
  });
  return (await git(ws, ['rev-parse', '--short', 'HEAD'])).trim();
}

/** Author email of a commit (for asserting who a recovered/model commit is attributed to). */
export async function authorEmailOf(ws: string, rev = 'HEAD'): Promise<string> {
  return (await git(ws, ['show', '-s', '--format=%ae', rev])).trim();
}

/** Subject line of a commit. */
export async function subjectOf(ws: string, rev = 'HEAD'): Promise<string> {
  return (await git(ws, ['show', '-s', '--format=%s', rev])).trim();
}

/** Full commit-message body (the turn record lives here). */
export async function bodyOf(ws: string, rev = 'HEAD'): Promise<string> {
  return (await git(ws, ['show', '-s', '--format=%b', rev])).trim();
}

export async function headCount(ws: string): Promise<number> {
  const out = (await git(ws, ['rev-list', '--count', 'HEAD'])).trim();
  return Number(out);
}

export async function status(ws: string): Promise<string> {
  return git(ws, ['status', '--porcelain']);
}

export interface DlResult {
  stdout: string;
  stderr: string;
  code: number;
}

/**
 * Strip declared-acceptable harness noise from CLI stdout: vite.config.ts logs
 * `[docloop] serving workspace/<doc>` whenever vite-node loads the config
 * (dl-00 overview: "vite-node noise: acceptable for now"). The dl output
 * discipline (one line on success, nothing on stdout on failure) is asserted
 * on what remains.
 */
function stripHarnessNoise(stdout: string): string {
  return stdout
    .split('\n')
    .filter((l) => !l.startsWith('[docloop] serving '))
    .join('\n');
}

/**
 * Run the `dl` CLI against a scratch workspace via vite-node, feeding `stdin`.
 *
 * ASSUMPTION (flagged in COVERAGE.md / report): the CLI resolves its workspace
 * root from `DOCLOOP_WORKSPACE`, falling back to docloop/workspace. The plans fix
 * the workspace to docloop/workspace/ but give no override, and tests must never
 * touch the real workspace — an env override is the minimal testable seam and the
 * recommended plan addition.
 */
export async function runDl(ws: string, args: string[], stdin = ''): Promise<DlResult> {
  const repoRoot = join(here, '..', '..');
  try {
    const child = execFile('npx', ['vite-node', DL_SCRIPT, '--', ...args], {
      cwd: repoRoot,
      env: { ...process.env, DOCLOOP_WORKSPACE: ws },
    });
    if (child.child.stdin) {
      child.child.stdin.write(stdin);
      child.child.stdin.end();
    }
    const { stdout, stderr } = await child;
    return { stdout: stripHarnessNoise(stdout), stderr, code: 0 };
  } catch (err) {
    const e = err as { stdout?: string; stderr?: string; code?: number };
    return { stdout: stripHarnessNoise(e.stdout ?? ''), stderr: e.stderr ?? '', code: e.code ?? 1 };
  }
}
