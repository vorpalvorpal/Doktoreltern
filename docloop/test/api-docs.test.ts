/**
 * Package E (dl-E-gui-nav-sidebar): multi-doc API + node-store seam.
 *
 * Correctness criteria 1–10 from the plan, driven over a real ephemeral HTTP
 * server + temp workspace (the api.test.ts idiom). The untouched api.test.ts
 * suite is the no-`?doc=` regression gate (criterion 8); this file covers the
 * new surface: GET /docs, the `?doc=` parameter, and GET /nodes.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, mkdir, writeFile, readFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer, type Server } from 'node:http';
import { createApi, type ApiConfig } from '../src/api';
import { canonicalize } from '../scripts/dl/canonical';

const run = promisify(execFile);

let workspace: string;
let skillsDir: string;
let nodesDir: string;
let server: Server;
let base: string;

/** Start a fresh server over `cfg`, returning its base URL. */
async function startServer(cfg: ApiConfig): Promise<void> {
  server = createServer(createApi(cfg));
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const address = server.address();
  if (address === null || typeof address === 'string') throw new Error('expected AddressInfo');
  base = `http://127.0.0.1:${address.port}`;
}

const git = (...args: string[]) => run('git', ['-C', workspace, ...args]);

beforeEach(async () => {
  workspace = await mkdtemp(join(tmpdir(), 'docloop-e-workspace-'));
  skillsDir = await mkdtemp(join(tmpdir(), 'docloop-e-skills-'));
  nodesDir = await mkdtemp(join(tmpdir(), 'docloop-e-nodes-'));
  await startServer({ workspace, docName: 'doc.md', skillsDir });
});

afterEach(async () => {
  await new Promise<void>((resolve, reject) =>
    server.close((err) => (err ? reject(err) : resolve())),
  );
  await rm(workspace, { recursive: true, force: true });
  await rm(skillsDir, { recursive: true, force: true });
  await rm(nodesDir, { recursive: true, force: true });
});

/** Restart the server with a different config (same workspace/skills unless given). */
async function restartWith(extra: Partial<ApiConfig>): Promise<void> {
  await new Promise<void>((resolve, reject) =>
    server.close((err) => (err ? reject(err) : resolve())),
  );
  await startServer({ workspace, docName: 'doc.md', skillsDir, ...extra });
}

describe('GET /docs', () => {
  it('empty workspace → no docs, the configured default', async () => {
    const res = await fetch(`${base}/docs`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, docs: [], default: 'doc.md' });
  });

  it('lists tracked + untracked top-level *.md with per-doc state, sorted', async () => {
    // doc.md: committed, then untouched → clean.
    await fetch(`${base}/commit`, { method: 'POST', body: 'default doc' });
    // design.md: committed, then a differing draft saved → draft.
    await fetch(`${base}/commit?doc=design.md`, { method: 'POST', body: 'design v1' });
    await fetch(`${base}/save-draft?doc=design.md`, { method: 'POST', body: 'design v2 draft' });
    // notes.md: only ever saved, never committed → untracked.
    await fetch(`${base}/save-draft?doc=notes.md`, { method: 'POST', body: 'scratch' });

    const body = await (await fetch(`${base}/docs`)).json();
    expect(body.ok).toBe(true);
    expect(body.default).toBe('doc.md');
    expect(body.docs).toEqual([
      { name: 'design.md', state: 'draft' },
      { name: 'doc.md', state: 'clean' },
      { name: 'notes.md', state: 'untracked' },
    ]);
  });

  it('never lists turn.xml or nested markdown', async () => {
    // A commit writes turn.xml into the working tree as a side effect.
    await fetch(`${base}/commit`, { method: 'POST', body: 'hello' });
    // Commit a nested md via git directly (the API never writes nested paths).
    await mkdir(join(workspace, 'sub'), { recursive: true });
    await writeFile(join(workspace, 'sub', 'inner.md'), 'nested\n', 'utf8');
    await git('add', 'sub/inner.md');
    await git('commit', '-q', '-m', 'nested doc');

    const body = await (await fetch(`${base}/docs`)).json();
    const names = body.docs.map((d: { name: string }) => d.name);
    expect(names).toEqual(['doc.md']);
  });

  it('never lists parked docs under workspace/archive/ (tracked or not)', async () => {
    await fetch(`${base}/commit`, { method: 'POST', body: 'live doc' });
    // A tracked parked doc (the Phase-A restructure shape)…
    await mkdir(join(workspace, 'archive'), { recursive: true });
    await writeFile(join(workspace, 'archive', 'design.md'), 'drained\n', 'utf8');
    await git('add', 'archive/design.md');
    await git('commit', '-q', '-m', 'park drained doc');
    // …and an untracked one sitting in the working tree.
    await writeFile(join(workspace, 'archive', 'notes.md'), 'parked draft\n', 'utf8');

    const body = await (await fetch(`${base}/docs`)).json();
    const names = body.docs.map((d: { name: string }) => d.name);
    expect(names).toEqual(['doc.md']);
  });
});

describe('?doc= parameter', () => {
  it('GET /doc?doc=design.md returns that doc, not the default', async () => {
    await fetch(`${base}/commit`, { method: 'POST', body: 'the default doc' });
    await fetch(`${base}/commit?doc=design.md`, { method: 'POST', body: 'the design doc' });

    const body = await (await fetch(`${base}/doc?doc=design.md`)).json();
    expect(body.present).toBe(true);
    expect(body.name).toBe('design.md');
    expect(body.current).toBe(await canonicalize('the design doc'));
  });

  it('baseline is per-doc: the doc as of HEAD~1', async () => {
    await fetch(`${base}/commit?doc=design.md`, { method: 'POST', body: 'design v1' });
    await fetch(`${base}/commit?doc=design.md`, { method: 'POST', body: 'design v2' });
    const body = await (await fetch(`${base}/doc?doc=design.md`)).json();
    expect(body.current).toBe(await canonicalize('design v2'));
    expect(body.baseline).toBe(await canonicalize('design v1'));
  });

  it('a doc untouched by the last commit has baseline == current (empty diff)', async () => {
    await fetch(`${base}/commit?doc=design.md`, { method: 'POST', body: 'design v1' });
    await fetch(`${base}/commit`, { method: 'POST', body: 'default doc turn' });
    const body = await (await fetch(`${base}/doc?doc=design.md`)).json();
    expect(body.baseline).toBe(body.current);
  });

  it('commit of one doc does not stage or modify another doc’s draft', async () => {
    await fetch(`${base}/save-draft?doc=b.md`, { method: 'POST', body: 'b draft' });
    const bBytes = await readFile(join(workspace, 'b.md'), 'utf8');
    await fetch(`${base}/commit?doc=a.md`, { method: 'POST', body: 'a content' });

    // b.md is byte-identical and still untracked (nothing committed it).
    expect(await readFile(join(workspace, 'b.md'), 'utf8')).toBe(bBytes);
    const docs = (await (await fetch(`${base}/docs`)).json()).docs;
    expect(docs).toContainEqual({ name: 'b.md', state: 'untracked' });
    expect(docs).toContainEqual({ name: 'a.md', state: 'clean' });
  });

  it('no ?doc= keeps the configured default doc (existing behaviour)', async () => {
    await fetch(`${base}/commit`, { method: 'POST', body: 'default content' });
    const body = await (await fetch(`${base}/doc`)).json();
    expect(body.name).toBe('doc.md');
    expect(body.current).toBe(await canonicalize('default content'));
  });

  const unsafe = ['../evil.md', 'a/b.md', '.hidden.md', 'turn.xml', ''];
  for (const name of unsafe) {
    const q = `?doc=${encodeURIComponent(name)}`;
    it(`rejects unsafe name ${JSON.stringify(name)} on all three endpoints, writing nothing`, async () => {
      for (const [path, method] of [
        ['/doc', 'GET'],
        ['/commit', 'POST'],
        ['/save-draft', 'POST'],
      ] as const) {
        const res = await fetch(`${base}${path}${q}`, {
          method,
          ...(method === 'POST' ? { body: 'payload' } : {}),
        });
        expect(res.status).toBe(400);
        const body = await res.json();
        expect(body.ok).toBe(false);
      }
      // Nothing was written or committed anywhere.
      const docs = (await (await fetch(`${base}/docs`)).json()).docs;
      expect(docs).toEqual([]);
    });
  }
});

describe('GET /nodes', () => {
  it('no nodesDir configured → present:false', async () => {
    const body = await (await fetch(`${base}/nodes`)).json();
    expect(body).toEqual({ ok: true, present: false, nodes: [] });
  });

  it('nodesDir configured but missing on disk → present:false (silent degrade)', async () => {
    await restartWith({ nodesDir: join(nodesDir, 'does-not-exist') });
    const body = await (await fetch(`${base}/nodes`)).json();
    expect(body).toEqual({ ok: true, present: false, nodes: [] });
  });

  it('walks a real store: nested entries, sorted docs, dot entries skipped', async () => {
    await mkdir(join(nodesDir, 'a', 'b'), { recursive: true });
    await mkdir(join(nodesDir, 'a', '.hidden'), { recursive: true });
    await mkdir(join(nodesDir, '.git'), { recursive: true });
    await writeFile(join(nodesDir, 'a', 'y.md'), 'y', 'utf8');
    await writeFile(join(nodesDir, 'a', 'x.md'), 'x', 'utf8');
    await writeFile(join(nodesDir, 'a', '.dot.md'), 'dot', 'utf8');
    await writeFile(join(nodesDir, 'a', 'b', 'z.md'), 'z', 'utf8');
    await restartWith({ nodesDir });

    const body = await (await fetch(`${base}/nodes`)).json();
    expect(body.ok).toBe(true);
    expect(body.present).toBe(true);
    expect(body.nodes).toEqual([
      {
        id: 'a',
        title: 'a',
        state: 'unknown',
        docs: ['x.md', 'y.md'],
        children: [{ id: 'a/b', title: 'b', state: 'unknown', docs: ['z.md'], children: [] }],
      },
    ]);
  });
});
