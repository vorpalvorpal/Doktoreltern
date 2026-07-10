import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer, type Server } from 'node:http';
import { createApi, type ApiConfig } from '../../src/api';
import { canonicalize } from '../../scripts/dl/canonical';

// Package C4 — the GUI side conforms to remark canonical form: src/api.ts runs
// the incoming body through package A's canonicalize() before writing, on both
// POST /commit and POST /save-draft. Mirrors test/api.test.ts scaffolding.

let workspace: string;
let skillsDir: string;
let cfg: ApiConfig;
let server: Server;
let base: string;

beforeEach(async () => {
  workspace = await mkdtemp(join(tmpdir(), 'dl-c4-ws-'));
  skillsDir = await mkdtemp(join(tmpdir(), 'dl-c4-skills-'));
  cfg = { workspace, docName: 'doc.md', skillsDir };
  server = createServer(createApi(cfg));
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const address = server.address();
  if (address === null || typeof address === 'string') throw new Error('expected AddressInfo');
  base = `http://127.0.0.1:${address.port}`;
});

afterEach(async () => {
  await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
  await rm(workspace, { recursive: true, force: true });
  await rm(skillsDir, { recursive: true, force: true });
});

async function currentDoc(): Promise<string> {
  const r = await fetch(`${base}/doc`);
  return (await r.json()).current as string;
}

describe('POST /commit canonicalises the body (C4)', () => {
  it('a sloppy-spaced body is committed in remark-canonical form', async () => {
    const sloppy = '# Doc\n\n*   loose   bullet\n*   another   one\n';
    const res = await fetch(`${base}/commit`, { method: 'POST', body: sloppy });
    expect(res.status).toBe(200);
    const committed = await currentDoc();
    expect(await canonicalize(committed)).toBe(committed); // canonical fixed point
    expect(committed).not.toBe(sloppy); // it actually reformatted
  });
});

describe('POST /save-draft canonicalises the body (C4)', () => {
  it('the working-tree draft is written in canonical form', async () => {
    const sloppy = '# Doc\n\n*   loose   bullet\n';
    const res = await fetch(`${base}/save-draft`, { method: 'POST', body: sloppy });
    expect(res.status).toBe(200);
    const draft = await currentDoc();
    expect(await canonicalize(draft)).toBe(draft);
  });
});

describe('content-guard trip (C4)', () => {
  it('a body that trips the content-preservation guard 500s and writes nothing', async () => {
    // A bare `:mark` directive is engine-swallowed => content guard throws.
    const res = await fetch(`${base}/commit`, { method: 'POST', body: 'A bare :mark in prose.\n' });
    expect(res.status).toBe(500);
    // Nothing committed: the doc is still absent.
    const doc = await (await fetch(`${base}/doc`)).json();
    expect(doc.present).toBe(false);
  });
});

describe('GUI-canonical round-trip (C4)', () => {
  it('a body already in canonical form commits successfully and is unchanged', async () => {
    const canon = await canonicalize('# Doc\n\ntidy paragraph one\n\ntidy paragraph two\n');
    const res = await fetch(`${base}/commit`, { method: 'POST', body: canon });
    expect(res.status).toBe(200);
    expect(await currentDoc()).toBe(canon); // no cosmetic churn on re-commit
  });
});

