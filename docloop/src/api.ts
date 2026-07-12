import { mkdir, writeFile, readFile, readdir, access, stat } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { join } from 'node:path';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { query } from '@anthropic-ai/claude-agent-sdk';
import { renderTurn } from './turn';
import { listThreads, addComment, updateComment, resolveThread, newThreadId } from './threads-store';
import { listSkills, readSkillBody } from './skill-frontmatter';
import { readNodeTree } from './nodes-fs';
import { canonicalize } from '../scripts/dl/canonical';

const run = promisify(execFile);

/**
 * Invoke one docloop skill live: its own SKILL.md body (frontmatter
 * stripped) as the system prompt, `context` as the single user turn, no
 * tool access, no interactive approval — an unattended invocation can only
 * ever produce a final text response. Throws if the run errors or is denied
 * (rather than returning a partial/empty result silently).
 */
async function runSkill(systemPrompt: string, context: string): Promise<string> {
  let result: string | null = null;
  for await (const message of query({
    prompt: context,
    options: { systemPrompt, tools: [], permissionMode: 'dontAsk' },
  })) {
    if (message.type === 'result') {
      if (message.subtype === 'success') {
        result = message.result;
      } else {
        throw new Error(`skill run failed: ${message.subtype}`);
      }
    }
  }
  if (result === null) throw new Error('skill run produced no result');
  return result;
}

/** Configuration this API's handlers are driven by — computed by the caller from cwd/env. */
export interface ApiConfig {
  /** The workspace directory: its own git repo holding the tracked doc + threads sidecar. */
  workspace: string;
  /** The tracked doc under review, e.g. `doc.md` (see DOCLOOP_DOC). */
  docName: string;
  /** The docloop plugin's own skills directory (see skills/README.md). */
  skillsDir: string;
  /**
   * The ctx node store's root directory (see DOCLOOP_NODES / GET /nodes) —
   * absent means "no node store configured" and /nodes reports present:false.
   */
  nodesDir?: string;
}

/**
 * Whether `name` is a safe doc name for the `?doc=` parameter (shared by
 * /doc, /commit and /save-draft): non-empty, no path separators, not a dot
 * path, does not start with `.`, and ends with `.md`. This is the
 * path-traversal guard; `turn.xml` is excluded by the `.md` rule.
 */
function isSafeDocName(name: string): boolean {
  return (
    name.length > 0 &&
    !name.includes('/') &&
    !name.includes('\\') &&
    !name.startsWith('.') &&
    name.endsWith('.md')
  );
}

/**
 * Endpoints that close the doc↔LLM loop (M3). The workspace is a git repo of
 * its OWN, holding a single tracked `doc.md`; **each commit == one turn**
 * (human or Claude). It is separate from the code repo (workspace/ is
 * gitignored).
 *
 *   POST /commit         — body = the document markdown. Renders the turn (the
 *                          human's delta vs the last commit) to
 *                          `workspace/turn.xml` for Claude to read, then writes
 *                          + commits `doc.md`. The "Hand to Claude".
 *   GET  /doc            — returns `{ current, baseline }` from git so the GUI
 *                          can (re)load real state: current = HEAD's doc.md,
 *                          baseline = the commit before it. After Claude edits
 *                          + commits, a GUI reload shows Claude's changes as
 *                          diffs against the human's last turn.
 *   GET  /docs           — the workspace's reviewable docs (tracked ∪
 *                          working-tree top-level *.md) with per-doc state,
 *                          for the left-nav doc list. /doc, /commit and
 *                          /save-draft all take `?doc=<name>` to target a doc
 *                          other than the configured default.
 *   GET  /nodes          — the ctx node-store seam: a read-only directory
 *                          tree of cfg.nodesDir (present:false when unset or
 *                          missing) — see src/nodes-fs.ts.
 *   GET  /docloop-skills — the docloop plugin's skill roster, for the
 *                          slash-trigger dropdown (see skills/README.md).
 *   POST /run-skill      — invoke one docloop skill live, synchronously,
 *                          while the human is still composing (see runSkill).
 *
 * The hand-off to Claude itself is out of band: Claude (hand-simulating the MCP
 * for this v0 — see the wiki dogfooding note) reads `workspace/turn.xml`, edits
 * `workspace/doc.md`, and commits. The human then reloads the GUI.
 *
 * Returns a connect-style middleware: framework-agnostic so it can be mounted
 * either on Vite's dev-server `configureServer` hook or a plain
 * `http.createServer` (see scripts/server.ts). Everything that used to be
 * derived from `process.cwd()`/`process.env.DOCLOOP_DOC` is now driven by the
 * injected `cfg` instead — the *callers* compute that from cwd/env.
 */
export function createApi(
  cfg: ApiConfig,
): (req: IncomingMessage, res: ServerResponse, next?: () => void) => void {
  const { workspace, docName } = cfg;
  /** Working-tree path of doc `name` (validated by the caller — see isSafeDocName). */
  const pathFor = (name: string) => join(workspace, name);
  const turnPath = join(workspace, 'turn.xml');
  const threadsDir = join(workspace, 'threads'); // sidecar store: threads/<id>/NNNN.md
  const skillsDir = cfg.skillsDir;
  const git = (...args: string[]) => run('git', ['-C', workspace, ...args]);

  /**
   * Ensure the workspace exists and is its OWN git repo. We test for
   * `workspace/.git` directly rather than `git rev-parse`, because this repo lives
   * inside the outer code repo — `rev-parse --git-dir` would happily resolve to
   * the *outer* repo and we'd never initialise the workspace's own one (after
   * which `git add` trips over the outer `.gitignore`).
   */
  const ensureRepo = async () => {
    await mkdir(workspace, { recursive: true });
    const hasOwnRepo = await access(join(workspace, '.git')).then(
      () => true,
      () => false,
    );
    if (!hasOwnRepo) {
      await git('init', '-q');
      await git('config', 'user.email', 'docloop@local');
      await git('config', 'user.name', 'docloop');
    }
  };

  /** A committed revision of doc `name`, or null if that rev (or the doc in it) doesn't exist. */
  const showDoc = async (rev: string, name: string = docName): Promise<string | null> => {
    return git('show', `${rev}:${name}`)
      .then(({ stdout }) => stdout)
      .catch(() => null);
  };

  /**
   * Tracked top-level `*.md` files of the workspace repo, sorted — the same
   * discovery rule as `scripts/dl/docs.ts` `trackedDocs` (replicated rather
   * than imported: this module's git plumbing already runs `-C workspace`).
   * Never `turn.xml` (not `.md`), never nested files (so never `threads/`).
   */
  const trackedDocs = async (): Promise<string[]> => {
    const { stdout } = await git('ls-files', '--', '*.md');
    return stdout
      .split('\n')
      .filter((f) => f.length > 0 && !f.includes('/'))
      .sort();
  };

  /** Working-tree top-level `*.md` files (no dot-files), sorted. */
  const workingTreeDocs = async (): Promise<string[]> => {
    const entries = await readdir(workspace, { withFileTypes: true });
    return entries
      .filter((e) => e.isFile() && e.name.endsWith('.md') && !e.name.startsWith('.'))
      .map((e) => e.name)
      .sort();
  };

  const readBody = (req: IncomingMessage): Promise<string> =>
    new Promise((resolve) => {
      let body = '';
      req.setEncoding('utf8');
      req.on('data', (chunk) => (body += chunk));
      req.on('end', () => resolve(body));
    });

  const send = (res: ServerResponse, status: number, payload: unknown) => {
    res.statusCode = status;
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify(payload));
  };

  return (req, res, next) => {
    const url = req.url ?? '/';
    const pathname = url.split('?')[0];
    const query = new URLSearchParams(url.split('?')[1] ?? '');

    const notFound = () => {
      if (next) return next();
      send(res, 404, { ok: false, error: 'not found' });
    };

    /**
     * Resolve the `?doc=` parameter for /doc, /commit and /save-draft:
     * absent → the configured default (exactly today's behaviour); present
     * but unsafe → null, and a 400 has already been sent (nothing written).
     */
    const requestedDoc = (): string | null => {
      const doc = query.get('doc');
      if (doc === null) return docName;
      if (!isSafeDocName(doc)) {
        send(res, 400, { ok: false, error: `unsafe doc name: ${JSON.stringify(doc)}` });
        return null;
      }
      return doc;
    };

    // POST /commit — render the turn, then write + commit the doc. `?doc=`
    // selects which doc (default: cfg.docName); other docs' working-tree
    // drafts are neither staged nor modified.
    if (pathname === '/commit') {
      if (req.method !== 'POST') return notFound();
      const name = requestedDoc();
      if (name === null) return;
      void (async () => {
        try {
          await ensureRepo();
          // Canonicalise BEFORE any write (C4: the external formatter owns
          // canonical form; a content-guard trip throws here, so nothing is
          // written and the handler 500s below).
          const newMd = await canonicalize(await readBody(req));

          // Render the turn (human's delta vs the last commit) BEFORE committing,
          // so HEAD still points at the previous version. First commit -> diff
          // against empty.
          const prevMd = (await showDoc('HEAD', name)) ?? '';
          await mkdir(threadsDir, { recursive: true });
          const store = await listThreads(threadsDir);
          // The previous commit's time bounds "added-to since last turn": a
          // comment created after it is new this turn. Null on the first commit.
          // Use %ct (UNIX epoch seconds — inherently UTC/zoneless) and emit a
          // UTC ISO string, so the boundary matches the store's UTC `created`
          // and no local-offset value is ever passed around.
          const sinceIso = await git('show', '-s', '--format=%ct', 'HEAD')
            .then(({ stdout }) => new Date(Number(stdout.trim()) * 1000).toISOString())
            .catch(() => null);
          await writeFile(turnPath, renderTurn(prevMd, newMd, store, sinceIso), 'utf8');

          await writeFile(pathFor(name), newMd, 'utf8');
          // Commit BOTH the doc and the sidecar store, so a turn that only
          // touches threads (e.g. a reply, no doc edit) still advances HEAD —
          // otherwise the previous-commit time wouldn't move and that reply
          // would be re-reported as "updated" on the next turn.
          await git('add', name, 'threads');
          let committed = true;
          await git('commit', '-q', '-m', `turn @ ${new Date().toISOString()}`).catch(() => {
            committed = false; // nothing staged — no change since the last commit
          });
          const { stdout } = await git('rev-parse', '--short', 'HEAD');
          send(res, 200, { ok: true, committed, commit: stdout.trim() });
        } catch (err) {
          send(res, 500, { ok: false, error: String(err) });
        }
      })();
      return;
    }

    // POST /save-draft — write doc.md to the workspace working tree WITHOUT
    // committing (no git add/commit, no turn.xml render). Lets the human save
    // progress across several sessions before one real "Hand to Claude" turn.
    // GET /doc's `current` always reads this working-tree file (see below), so
    // a saved draft reloads correctly and diffs against the same HEAD~1
    // baseline a live in-browser edit already would. Comment replies/resolves
    // are unaffected by any of this — they persist immediately via /threads.
    if (pathname === '/save-draft') {
      if (req.method !== 'POST') return notFound();
      const name = requestedDoc();
      if (name === null) return;
      void (async () => {
        try {
          await ensureRepo();
          const md = await canonicalize(await readBody(req));
          await writeFile(pathFor(name), md, 'utf8');
          send(res, 200, { ok: true });
        } catch (err) {
          send(res, 500, { ok: false, error: String(err) });
        }
      })();
      return;
    }

    // GET /doc — current + baseline from git, for (re)loading the read/write
    // view. `?doc=` selects which doc (default: cfg.docName).
    if (pathname === '/doc') {
      if (req.method !== 'GET') return notFound();
      const name = requestedDoc();
      if (name === null) return;
      void (async () => {
        try {
          await ensureRepo();
          // current: the working-tree file if one exists — after every commit
          // (via /commit, or Claude committing directly) it matches HEAD, but a
          // /save-draft may have left it ahead of HEAD (an uncommitted draft) —
          // else HEAD's committed doc, else absent entirely (no doc yet).
          const current =
            (await readFile(pathFor(name), 'utf8').catch(() => null)) ??
            (await showDoc('HEAD', name));
          if (current === null) return send(res, 200, { ok: true, present: false });
          // baseline: this doc as of the commit before HEAD (null if HEAD is
          // the first commit) — per-doc, but the boundary is the whole
          // workspace's HEAD~1 (commit == turn), so a doc untouched by the
          // last commit has baseline == current (an empty diff).
          const baseline = await showDoc('HEAD~1', name);
          // baselineIso: HEAD~1's commit time as UTC — the boundary of "the last
          // turn" (current is HEAD; the last turn is HEAD~1 → HEAD), so the GUI
          // can tell which comments arrived this turn. Null if HEAD is the first.
          const baselineIso = await git('show', '-s', '--format=%ct', 'HEAD~1')
            .then(({ stdout }) => new Date(Number(stdout.trim()) * 1000).toISOString())
            .catch(() => null);
          send(res, 200, { ok: true, present: true, name, current, baseline, baselineIso });
        } catch (err) {
          send(res, 500, { ok: false, error: String(err) });
        }
      })();
      return;
    }

    // GET /docs — the workspace's reviewable docs for the left-nav doc list:
    // union of tracked top-level *.md (the scripts/dl/docs.ts discovery rule)
    // and working-tree top-level *.md, each with a state:
    //   untracked — in the working tree but never committed;
    //   draft     — tracked, working-tree bytes differ from HEAD (includes
    //               "deleted from the working tree but still tracked");
    //   clean     — tracked and identical to HEAD.
    if (pathname === '/docs') {
      if (req.method !== 'GET') return notFound();
      void (async () => {
        try {
          await ensureRepo();
          const tracked = await trackedDocs().catch(() => [] as string[]);
          const trackedSet = new Set(tracked);
          const names = [...new Set([...tracked, ...(await workingTreeDocs())])].sort();
          const docs = await Promise.all(
            names.map(async (name) => {
              if (!trackedSet.has(name)) return { name, state: 'untracked' };
              const head = await showDoc('HEAD', name);
              const wt = await readFile(pathFor(name), 'utf8').catch(() => null);
              return { name, state: wt === head ? 'clean' : 'draft' };
            }),
          );
          send(res, 200, { ok: true, docs, default: docName });
        } catch (err) {
          send(res, 500, { ok: false, error: String(err) });
        }
      })();
      return;
    }

    // GET /nodes — the ctx node-store seam (read-only; see src/nodes-fs.ts).
    // No nodesDir configured, or configured but missing on disk → present:false
    // (the GUI degrades silently, never errors).
    if (pathname === '/nodes') {
      if (req.method !== 'GET') return notFound();
      void (async () => {
        try {
          const nodesDir = cfg.nodesDir;
          const absent = () => send(res, 200, { ok: true, present: false, nodes: [] });
          if (nodesDir === undefined) return absent();
          const onDisk = await stat(nodesDir)
            .then((s) => s.isDirectory())
            .catch(() => false);
          if (!onDisk) return absent();
          send(res, 200, { ok: true, present: true, nodes: await readNodeTree(nodesDir) });
        } catch (err) {
          send(res, 500, { ok: false, error: String(err) });
        }
      })();
      return;
    }

    // /threads — the sidecar comment store (threads/<id>/NNNN.md). The browser
    // can't touch the filesystem, so it reaches the store through here.
    //   GET    /threads              → { threads: [...] }   (all threads + comments)
    //   POST   /threads              → create a new thread (allocates the id) + 1st comment
    //   POST   /threads/<id>         → append a comment (reply) to an existing thread
    //   PUT    /threads/<id>/<seq>   → amend an existing comment's body in place
    //   DELETE /threads/<id>         → resolve (delete) the thread
    // Body for POST/PUT is JSON `{ author, body }` / `{ body }`.
    if (pathname === '/threads' || pathname.startsWith('/threads/')) {
      const id = pathname.replace(/^\/threads\/?/, '');
      void (async () => {
        try {
          await mkdir(threadsDir, { recursive: true });
          if (req.method === 'GET') {
            return send(res, 200, { ok: true, threads: await listThreads(threadsDir) });
          }
          if (req.method === 'POST') {
            const raw = await readBody(req);
            const input = raw ? (JSON.parse(raw) as { author?: string; body?: string }) : {};
            const author = String(input.author ?? 'rjs');
            const body = String(input.body ?? '');
            // id in the URL → reply; no id → new thread (allocate next free id).
            const threadId =
              id || newThreadId((await listThreads(threadsDir)).map((t) => t.id));
            const comment = await addComment(threadsDir, threadId, { author, body });
            return send(res, 200, { ok: true, id: threadId, comment });
          }
          if (req.method === 'PUT') {
            // PUT /threads/<id>/<seq> — amend an existing comment in place
            // (the compose box's blur-driven upsert; see updateComment).
            const [threadId, seqStr] = id.split('/');
            const seq = Number(seqStr);
            if (!threadId || !Number.isInteger(seq)) {
              return send(res, 400, { ok: false, error: 'expected PUT /threads/<id>/<seq>' });
            }
            const raw = await readBody(req);
            const input = raw ? (JSON.parse(raw) as { body?: string }) : {};
            const comment = await updateComment(threadsDir, threadId, seq, String(input.body ?? ''));
            return send(res, 200, { ok: true, id: threadId, comment });
          }
          if (req.method === 'DELETE') {
            if (!id) return send(res, 400, { ok: false, error: 'missing thread id' });
            const raw = await readBody(req);
            const input = raw ? (JSON.parse(raw) as { author?: string; note?: string }) : {};
            const author = String(input.author ?? 'rjs');
            await resolveThread(threadsDir, id, { author, note: input.note });
            return send(res, 200, { ok: true });
          }
          return notFound();
        } catch (err) {
          send(res, 500, { ok: false, error: String(err) });
        }
      })();
      return;
    }

    // GET /docloop-skills — the docloop plugin's own skill roster (name +
    // description), for the slash-trigger dropdown in the compose box.
    // Reads straight off the working tree (docloop/skills/*/SKILL.md), not
    // the installed plugin registry — see runSkill's doc comment.
    if (pathname === '/docloop-skills') {
      if (req.method !== 'GET') return notFound();
      void (async () => {
        try {
          send(res, 200, { ok: true, skills: await listSkills(skillsDir) });
        } catch (err) {
          send(res, 500, { ok: false, error: String(err) });
        }
      })();
      return;
    }

    // POST /run-skill — invoke one docloop skill live, synchronously, while
    // the human is still composing (see runSkill). Body: { skill, context }.
    if (pathname === '/run-skill') {
      if (req.method !== 'POST') return notFound();
      void (async () => {
        try {
          const raw = await readBody(req);
          const input = raw ? (JSON.parse(raw) as { skill?: string; context?: string }) : {};
          const skill = String(input.skill ?? '');
          const context = String(input.context ?? '');
          if (!skill) return send(res, 400, { ok: false, error: 'missing skill' });
          const systemPrompt = await readSkillBody(skillsDir, skill);
          const result = await runSkill(systemPrompt, context);
          send(res, 200, { ok: true, result });
        } catch (err) {
          send(res, 500, { ok: false, error: String(err) });
        }
      })();
      return;
    }

    return notFound();
  };
}
