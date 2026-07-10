import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer, type Server } from 'node:http';
import { createApi, type ApiConfig } from '../../src/api';
import { listThreads } from '../../src/threads-store';

// Package C0 (API surface) — DELETE /threads/<id> now writes a resolved.md
// marker instead of deleting the directory, accepting an optional JSON body
// { author?, note? } (default author rjs). Kept separate from
// api-canonical.test.ts so this file has no scripts/dl/* import and can go
// green as soon as C0 lands, independent of package A.
//
// CONFLICT NOTE: test/api.test.ts "DELETE /threads/<id> resolves (deletes) the
// thread" pins the OLD behaviour (threads: [] after DELETE) — listed for
// reconciliation in COVERAGE.md; not modified here.

let workspace: string;
let skillsDir: string;
let cfg: ApiConfig;
let server: Server;
let base: string;

beforeEach(async () => {
  workspace = await mkdtemp(join(tmpdir(), 'dl-c0-ws-'));
  skillsDir = await mkdtemp(join(tmpdir(), 'dl-c0-skills-'));
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

describe('DELETE /threads/<id> writes the resolved marker (C0)', () => {
  it('DELETE with a {author, note} body lands the note in resolved.md, keeping the history', async () => {
    const created = await fetch(`${base}/threads`, {
      method: 'POST',
      body: JSON.stringify({ author: 'rjs', body: 'to be resolved' }),
    }).then((r) => r.json());

    const del = await fetch(`${base}/threads/${created.id}`, {
      method: 'DELETE',
      body: JSON.stringify({ author: 'rjs', note: 'agreed, folding it in' }),
    });
    expect(del.status).toBe(200);

    const threads = await listThreads(join(workspace, 'threads'));
    const t = threads.find((x) => x.id === created.id);
    expect(t).toBeTruthy(); // dir SURVIVES (marked, not deleted)
    expect(t!.resolved).toBeTruthy();
    expect(t!.resolved!.author).toBe('rjs');
    expect(t!.resolved!.note).toBe('agreed, folding it in');
    expect(t!.comments.map((c) => c.body)).toContain('to be resolved'); // history intact
  });

  it('DELETE with no body still works, defaulting the author to rjs', async () => {
    const created = await fetch(`${base}/threads`, {
      method: 'POST',
      body: JSON.stringify({ author: 'rjs', body: 'x' }),
    }).then((r) => r.json());

    const del = await fetch(`${base}/threads/${created.id}`, { method: 'DELETE' });
    expect(del.status).toBe(200);

    const threads = await listThreads(join(workspace, 'threads'));
    const t = threads.find((x) => x.id === created.id);
    expect(t?.resolved).toBeTruthy();
    expect(t!.resolved!.author).toBe('rjs');
  });
});
