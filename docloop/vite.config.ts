import { defineConfig, type Plugin } from 'vite';
import { join } from 'node:path';
import { createApi, type ApiConfig } from './src/api';

/**
 * Dev-only endpoints that close the doc↔LLM loop (M3). See `src/api.ts` for
 * the full endpoint documentation (POST /commit, POST /save-draft, GET /doc,
 * /threads, GET /docloop-skills, POST /run-skill) — this plugin is just a
 * thin adapter: it computes the config from cwd/env (as it always has) and
 * mounts the framework-agnostic handler on Vite's dev server. The standalone
 * runtime (`scripts/server.ts`, `npm run serve`) mounts the exact same
 * `createApi` handler outside of Vite/HMR.
 */
function docloopEndpoints(): Plugin {
  const workspace = join(process.cwd(), 'workspace');
  // The tracked doc under review. Defaults to `doc.md`; set DOCLOOP_DOC to point
  // the loop at any markdown file in the workspace (e.g. DOCLOOP_DOC=design.md),
  // so one workspace can host a doc per move. turn.xml + threads/ are shared, so
  // run one active doc per server instance.
  const docName = process.env.DOCLOOP_DOC ?? 'doc.md';
  const skillsDir = join(process.cwd(), 'skills'); // the docloop plugin's own skills (see skills/README.md)
  const cfg: ApiConfig = { workspace, docName, skillsDir };

  return {
    name: 'docloop-endpoints',
    apply: 'serve', // dev server only — never part of the build or tests
    configureServer(server) {
      // eslint-disable-next-line no-console
      console.log(`[docloop] serving workspace/${docName}`);
      server.middlewares.use(createApi(cfg));
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
