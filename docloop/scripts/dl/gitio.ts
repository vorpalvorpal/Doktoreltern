/**
 * All git plumbing for `dl` goes through this module (dl-00-overview "Git &
 * attribution conventions"): every op is `execFile('git', ['-C', workspace,
 * ...])`, never a shell-interpolated string.
 *
 * Also owns agenda-boundary detection (plan B1): the model commits under a
 * fixed identity (`docloop-model <model@docloop>`) on every `dl commit`, so
 * "everything since the model's last turn" is just "newest commit with that
 * author email" — with a legacy fallback for pre-`dl` history (`C turn:`
 * subject prefix) and `null` (empty tree) when neither exists.
 */
import { execFile as execFileCb } from 'node:child_process';
import { promisify } from 'node:util';

const execFileP = promisify(execFileCb);

/** Model author identity stamped on every `dl commit` (dl-00-overview). */
export const MODEL_AUTHOR = 'docloop-model <model@docloop>';
export const MODEL_AUTHOR_EMAIL = 'model@docloop';

/** Human author identity stamped on a recovered-draft commit (`dl agenda`, plan B2). */
export const RJS_AUTHOR = 'rjs <rjs@docloop>';

/** Run `git -C <ws> <args>`, returning stdout. Throws on non-zero exit. */
export async function git(ws: string, args: string[], env: NodeJS.ProcessEnv = {}): Promise<string> {
  const { stdout } = await execFileP('git', ['-C', ws, ...args], {
    env: { ...process.env, ...env },
    maxBuffer: 1024 * 1024 * 64,
  });
  return stdout;
}

const LOG_FORMAT = '%H%x09%ae%x09%s';

/**
 * The newest (nearest-HEAD) commit reachable from HEAD that is either
 * model-authored (`model@docloop`), or — failing that — the newest whose
 * subject matches the legacy `/^C turn:/` prefix. `null` if history has
 * neither (all-human repo, or no commits yet): the agenda then diffs against
 * the empty tree.
 */
export async function lastModelCommit(ws: string): Promise<string | null> {
  let log: string;
  try {
    log = await git(ws, ['log', `--format=${LOG_FORMAT}`]);
  } catch {
    return null; // no commits yet
  }
  const lines = log.split('\n').filter(Boolean);
  const rows = lines
    .map((line) => /^([0-9a-f]+)\t([^\t]*)\t(.*)$/s.exec(line))
    .filter((m): m is RegExpExecArray => m !== null)
    .map((m) => ({ sha: m[1], email: m[2], subject: m[3] }));

  // git log lists newest-first, so the first match scanning top-down is the
  // newest qualifying commit.
  const byEmail = rows.find((r) => r.email === MODEL_AUTHOR_EMAIL);
  if (byEmail) return byEmail.sha;

  const legacy = rows.find((r) => /^C turn:/.test(r.subject));
  if (legacy) return legacy.sha;

  return null;
}

/**
 * The bytes of `doc` at revision `rev`, or `''` if `rev` is `null` (no
 * boundary — read against the empty tree) or the doc didn't exist yet at that
 * revision.
 */
export async function docAt(ws: string, rev: string | null, doc: string): Promise<string> {
  if (rev === null) return '';
  try {
    return await git(ws, ['show', `${rev}:${doc}`]);
  } catch {
    return '';
  }
}
