import { defineConfig, type Plugin } from 'vite';
import { mkdir, writeFile, readFile, access } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { join } from 'node:path';
import { query } from '@anthropic-ai/claude-agent-sdk';
import { renderTurn } from './src/turn';
import { listThreads, addComment, updateComment, resolveThread, newThreadId } from './src/threads-store';
import { listSkills, readSkillBody } from './src/skill-frontmatter';

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

/**
 * Dev-only endpoints that close the doc↔LLM loop (M3). The workspace is a git
 * repo of its OWN, holding a single tracked `doc.md`; **each commit == one turn**
 * (human or Claude). It is separate from this code repo (workspace/ is gitignored).
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
 *   GET  /docloop-skills — the docloop plugin's skill roster, for the
 *                          slash-trigger dropdown (see skills/README.md).
 *   POST /run-skill      — invoke one docloop skill live, synchronously,
 *                          while the human is still composing (see runSkill).
 *
 * The hand-off to Claude itself is out of band: Claude (hand-simulating the MCP
 * for this v0 — see the wiki dogfooding note) reads `workspace/turn.xml`, edits
 * `workspace/doc.md`, and commits. The human then reloads the GUI.
 */
function docloopEndpoints(): Plugin {
  const workspace = join(process.cwd(), 'workspace');
  // The tracked doc under review. Defaults to `doc.md`; set DOCLOOP_DOC to point
  // the loop at any markdown file in the workspace (e.g. DOCLOOP_DOC=design.md),
  // so one workspace can host a doc per move. turn.xml + threads/ are shared, so
  // run one active doc per server instance.
  const docName = process.env.DOCLOOP_DOC ?? 'doc.md';
  const docPath = join(workspace, docName);
  const turnPath = join(workspace, 'turn.xml');
  const threadsDir = join(workspace, 'threads'); // sidecar store: threads/<id>/NNNN.md
  const skillsDir = join(process.cwd(), 'skills'); // the docloop plugin's own skills (see skills/README.md)
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

  /** A committed revision of the doc, or null if that rev doesn't exist. */
  const showDoc = async (rev: string): Promise<string | null> => {
    return git('show', `${rev}:${docName}`)
      .then(({ stdout }) => stdout)
      .catch(() => null);
  };

  const readBody = (req: import('node:http').IncomingMessage): Promise<string> =>
    new Promise((resolve) => {
      let body = '';
      req.setEncoding('utf8');
      req.on('data', (chunk) => (body += chunk));
      req.on('end', () => resolve(body));
    });

  return {
    name: 'docloop-endpoints',
    apply: 'serve', // dev server only — never part of the build or tests
    configureServer(server) {
      // eslint-disable-next-line no-console
      console.log(`[docloop] serving workspace/${docName}`);
      const send = (res: import('node:http').ServerResponse, status: number, payload: unknown) => {
        res.statusCode = status;
        res.setHeader('content-type', 'application/json');
        res.end(JSON.stringify(payload));
      };

      // POST /commit — render the turn, then write + commit the doc.
      server.middlewares.use('/commit', (req, res, next) => {
        if (req.method !== 'POST') return next();
        void (async () => {
          try {
            await ensureRepo();
            const newMd = await readBody(req);

            // Render the turn (human's delta vs the last commit) BEFORE committing,
            // so HEAD still points at the previous version. First commit -> diff
            // against empty.
            const prevMd = (await showDoc('HEAD')) ?? '';
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

            await writeFile(docPath, newMd, 'utf8');
            // Commit BOTH the doc and the sidecar store, so a turn that only
            // touches threads (e.g. a reply, no doc edit) still advances HEAD —
            // otherwise the previous-commit time wouldn't move and that reply
            // would be re-reported as "updated" on the next turn.
            await git('add', docName, 'threads');
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
      });

      // POST /save-draft — write doc.md to the workspace working tree WITHOUT
      // committing (no git add/commit, no turn.xml render). Lets the human save
      // progress across several sessions before one real "Hand to Claude" turn.
      // GET /doc's `current` always reads this working-tree file (see below), so
      // a saved draft reloads correctly and diffs against the same HEAD~1
      // baseline a live in-browser edit already would. Comment replies/resolves
      // are unaffected by any of this — they persist immediately via /threads.
      server.middlewares.use('/save-draft', (req, res, next) => {
        if (req.method !== 'POST') return next();
        void (async () => {
          try {
            await ensureRepo();
            const md = await readBody(req);
            await writeFile(docPath, md, 'utf8');
            send(res, 200, { ok: true });
          } catch (err) {
            send(res, 500, { ok: false, error: String(err) });
          }
        })();
      });

      // GET /doc — current + baseline from git, for (re)loading the read/write view.
      server.middlewares.use('/doc', (req, res, next) => {
        if (req.method !== 'GET') return next();
        void (async () => {
          try {
            await ensureRepo();
            // current: the working-tree file if one exists — after every commit
            // (via /commit, or Claude committing directly) it matches HEAD, but a
            // /save-draft may have left it ahead of HEAD (an uncommitted draft) —
            // else HEAD's committed doc.md, else absent entirely (no doc yet).
            const current =
              (await readFile(docPath, 'utf8').catch(() => null)) ?? (await showDoc('HEAD'));
            if (current === null) return send(res, 200, { ok: true, present: false });
            // baseline: the commit before HEAD (null if HEAD is the first commit).
            const baseline = await showDoc('HEAD~1');
            // baselineIso: HEAD~1's commit time as UTC — the boundary of "the last
            // turn" (current is HEAD; the last turn is HEAD~1 → HEAD), so the GUI
            // can tell which comments arrived this turn. Null if HEAD is the first.
            const baselineIso = await git('show', '-s', '--format=%ct', 'HEAD~1')
              .then(({ stdout }) => new Date(Number(stdout.trim()) * 1000).toISOString())
              .catch(() => null);
            send(res, 200, { ok: true, present: true, name: docName, current, baseline, baselineIso });
          } catch (err) {
            send(res, 500, { ok: false, error: String(err) });
          }
        })();
      });

      // /threads — the sidecar comment store (threads/<id>/NNNN.md). The browser
      // can't touch the filesystem, so it reaches the store through here.
      //   GET    /threads              → { threads: [...] }   (all threads + comments)
      //   POST   /threads              → create a new thread (allocates the id) + 1st comment
      //   POST   /threads/<id>         → append a comment (reply) to an existing thread
      //   PUT    /threads/<id>/<seq>   → amend an existing comment's body in place
      //   DELETE /threads/<id>         → resolve (delete) the thread
      // Body for POST/PUT is JSON `{ author, body }` / `{ body }`.
      server.middlewares.use('/threads', (req, res, next) => {
        const id = (req.url ?? '/').replace(/^\/+/, '').split('?')[0];
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
              await resolveThread(threadsDir, id);
              return send(res, 200, { ok: true });
            }
            return next();
          } catch (err) {
            send(res, 500, { ok: false, error: String(err) });
          }
        })();
      });

      // GET /docloop-skills — the docloop plugin's own skill roster (name +
      // description), for the slash-trigger dropdown in the compose box.
      // Reads straight off the working tree (docloop/skills/*/SKILL.md), not
      // the installed plugin registry — see runSkill's doc comment.
      server.middlewares.use('/docloop-skills', (req, res, next) => {
        if (req.method !== 'GET') return next();
        void (async () => {
          try {
            send(res, 200, { ok: true, skills: await listSkills(skillsDir) });
          } catch (err) {
            send(res, 500, { ok: false, error: String(err) });
          }
        })();
      });

      // POST /run-skill — invoke one docloop skill live, synchronously, while
      // the human is still composing (see runSkill). Body: { skill, context }.
      server.middlewares.use('/run-skill', (req, res, next) => {
        if (req.method !== 'POST') return next();
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
      });
    },
  };
}

export default defineConfig({
  plugins: [docloopEndpoints()],
  // The reviewed doc + sidecar store live under workspace/, which sits inside
  // this Vite root. They are read on demand via the /doc + /threads endpoints,
  // never imported into the module graph — so watching them buys nothing and
  // only risks a spurious full page reload (which would wipe the human's
  // in-memory edits) each time Claude writes a turn or /commit rewrites the doc.
  server: { watch: { ignored: ['**/workspace/**'] } },
});
