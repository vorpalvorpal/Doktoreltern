/**
 * Standalone, HMR-free server for actually USING docloop (as opposed to
 * `vite`/`npm run dev`, which is for hacking on docloop's own source). Serves
 * the built SPA (`dist/`, from `npm run build`) plus the exact same API
 * handlers as the dev server, on one plain `http.createServer` — no Vite dev
 * server underneath, so it isn't restart-fragile or HMR-reload-happy, and
 * survives the launching session ending (see HANDOFF.md's "durable server"
 * note, which applied to `npm run dev` and now also covers this).
 *
 * Run via vite-node (like the other scripts/*.ts CLIs):
 *
 *     npm run serve            # = `vite build && vite-node scripts/server.ts`
 *
 * Env:
 *   DOCLOOP_DOC   — the tracked doc under review (default `doc.md`), same
 *                   knob as the dev server / CLI scripts.
 *   PORT          — default 5173. NEVER point this at the human's live dev
 *                   server port while it's running one of its own.
 */
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, extname, normalize, sep } from 'node:path';
import { createApi, type ApiConfig } from '../src/api';

const workspace = join(process.cwd(), 'workspace');
const docName = process.env.DOCLOOP_DOC ?? 'doc.md';
const skillsDir = join(process.cwd(), 'skills');
const cfg: ApiConfig = { workspace, docName, skillsDir };
const api = createApi(cfg);

const distDir = join(process.cwd(), 'dist');
const port = Number(process.env.PORT ?? 5173);

// API routes this server owns; everything else falls through to the static
// SPA handler below. Kept as simple prefix checks mirroring src/api.ts's own
// dispatch (which also 404s internally on an unmatched method/path when there
// is no `next`).
const API_PATHS = ['/commit', '/save-draft', '/doc', '/threads', '/docloop-skills', '/run-skill'];
function isApiRequest(pathname: string): boolean {
  return API_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

const CONTENT_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.json': 'application/json; charset=utf-8',
  '.ico': 'image/x-icon',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
};

async function readDistFile(relPath: string): Promise<Buffer | null> {
  // Prevent escaping dist/ via a crafted path (e.g. `..`), same spirit as any
  // static file server's containment check.
  const safeRel = normalize(relPath).replace(/^([.][.][/\\])+/, '');
  const full = join(distDir, safeRel);
  if (!full.startsWith(distDir + sep) && full !== distDir) return null;
  return readFile(full).catch(() => null);
}

async function distExists(): Promise<boolean> {
  return readFile(join(distDir, 'index.html'))
    .then(() => true)
    .catch(() => false);
}

const server = createServer((req, res) => {
  const url = req.url ?? '/';
  const pathname = decodeURIComponent(url.split('?')[0]);

  if (isApiRequest(pathname)) {
    api(req, res);
    return;
  }

  void (async () => {
    if (!(await distExists())) {
      res.statusCode = 404;
      res.setHeader('content-type', 'text/plain; charset=utf-8');
      res.end("docloop: dist/ not found — run `npm run build` first.");
      return;
    }

    // Map the URL to a file under dist/; `/` -> index.html. Fall back to
    // index.html for any unknown non-API path (SPA client-side routing).
    const relPath = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
    let file = await readDistFile(relPath);
    if (file === null) {
      file = await readDistFile('index.html');
      if (file === null) {
        res.statusCode = 404;
        res.setHeader('content-type', 'text/plain; charset=utf-8');
        res.end('docloop: not found');
        return;
      }
      res.statusCode = 200;
      res.setHeader('content-type', CONTENT_TYPES['.html']);
      res.end(file);
      return;
    }

    const ext = extname(relPath === '' ? 'index.html' : relPath);
    res.statusCode = 200;
    res.setHeader('content-type', CONTENT_TYPES[ext] ?? 'application/octet-stream');
    res.end(file);
  })();
});

if (!(await distExists())) {
  console.error('docloop: dist/ not found — run `npm run build` first.');
  process.exit(1);
}

server.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`[docloop] serving workspace/${docName} + dist/ on http://localhost:${port}`);
});
