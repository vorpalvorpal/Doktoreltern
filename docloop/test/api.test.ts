import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer, type Server } from 'node:http';
import { createApi, type ApiConfig } from '../src/api';

// Fresh temp workspace + skillsDir per test, standalone http server on an
// ephemeral port, driven with fetch — mirrors threads-store.test.ts's
// "fresh isolated backing per test" idiom, one level up the stack.
let workspace: string;
let skillsDir: string;
let cfg: ApiConfig;
let server: Server;
let base: string;

beforeEach(async () => {
  workspace = await mkdtemp(join(tmpdir(), 'docloop-api-workspace-'));
  skillsDir = await mkdtemp(join(tmpdir(), 'docloop-api-skills-'));
  cfg = { workspace, docName: 'doc.md', skillsDir };
  server = createServer(createApi(cfg));
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const address = server.address();
  if (address === null || typeof address === 'string') throw new Error('expected AddressInfo');
  base = `http://127.0.0.1:${address.port}`;
});

afterEach(async () => {
  await new Promise<void>((resolve, reject) =>
    server.close((err) => (err ? reject(err) : resolve())),
  );
  await rm(workspace, { recursive: true, force: true });
  await rm(skillsDir, { recursive: true, force: true });
});

describe('GET /doc', () => {
  it('returns {present:false} on an empty workspace', async () => {
    const res = await fetch(`${base}/doc`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, present: false });
  });

  it('reflects a save/commit with {present:true, name, current, baseline, baselineIso}', async () => {
    await fetch(`${base}/commit`, { method: 'POST', body: '# Hello\n\nworld' });
    const res = await fetch(`${base}/doc`);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.present).toBe(true);
    expect(body.name).toBe('doc.md');
    expect(body.current).toBe('# Hello\n\nworld');
    // First-ever commit: no HEAD~1 to diff against.
    expect(body.baseline).toBeNull();
    expect(body.baselineIso).toBeNull();
  });

  it('after a second commit, baseline is the previous committed doc', async () => {
    await fetch(`${base}/commit`, { method: 'POST', body: 'v1' });
    await fetch(`${base}/commit`, { method: 'POST', body: 'v2' });
    const res = await fetch(`${base}/doc`);
    const body = await res.json();
    expect(body.current).toBe('v2');
    expect(body.baseline).toBe('v1');
    expect(typeof body.baselineIso).toBe('string');
    expect(new Date(body.baselineIso).toISOString()).toBe(body.baselineIso);
  });
});

describe('POST /save-draft', () => {
  it('writes the working-tree file without committing', async () => {
    const res = await fetch(`${base}/save-draft`, { method: 'POST', body: 'draft text' });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });

    const docRes = await fetch(`${base}/doc`);
    const doc = await docRes.json();
    expect(doc.current).toBe('draft text');
    // No commit happened -> still "not present" from git's point of view in the
    // sense that there's no baseline yet (HEAD doesn't exist).
    expect(doc.baseline).toBeNull();
  });

  it('does not create a new commit', async () => {
    await fetch(`${base}/commit`, { method: 'POST', body: 'committed v1' });
    await fetch(`${base}/save-draft`, { method: 'POST', body: 'uncommitted v2' });

    const docRes = await fetch(`${base}/doc`);
    const doc = await docRes.json();
    // current reflects the working-tree draft...
    expect(doc.current).toBe('uncommitted v2');
    // ...but baseline (HEAD~1) is still absent: there's only ever been ONE commit.
    expect(doc.baseline).toBeNull();
  });
});

describe('POST /commit', () => {
  it('writes turn.xml, commits doc + threads, and returns {ok, committed, commit}', async () => {
    const res = await fetch(`${base}/commit`, { method: 'POST', body: '# Doc\n\nbody text' });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.committed).toBe(true);
    expect(typeof body.commit).toBe('string');
    expect(body.commit.length).toBeGreaterThan(0);
    expect(body.commit.length).toBeLessThanOrEqual(12); // short hash

    const docRes = await fetch(`${base}/doc`);
    const doc = await docRes.json();
    expect(doc.current).toBe('# Doc\n\nbody text');
  });

  it('a second identical commit (no changes) returns committed:false', async () => {
    await fetch(`${base}/commit`, { method: 'POST', body: 'same content' });
    const res2 = await fetch(`${base}/commit`, { method: 'POST', body: 'same content' });
    const body2 = await res2.json();
    expect(body2.ok).toBe(true);
    expect(body2.committed).toBe(false);
  });

  it('a commit with actual changes after a no-op attempt is committed:true again', async () => {
    await fetch(`${base}/commit`, { method: 'POST', body: 'v1' });
    await fetch(`${base}/commit`, { method: 'POST', body: 'v1' }); // no-op
    const res = await fetch(`${base}/commit`, { method: 'POST', body: 'v2' });
    const body = await res.json();
    expect(body.committed).toBe(true);
  });
});

describe('/threads', () => {
  it('GET returns empty on a fresh workspace', async () => {
    const res = await fetch(`${base}/threads`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, threads: [] });
  });

  it('POST /threads creates a new thread, allocating an id + first comment', async () => {
    const res = await fetch(`${base}/threads`, {
      method: 'POST',
      body: JSON.stringify({ author: 'rjs', body: 'first note' }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.id).toBe('t1');
    expect(body.comment).toMatchObject({ seq: 1, author: 'rjs', body: 'first note' });

    const listRes = await fetch(`${base}/threads`);
    const list = await listRes.json();
    expect(list.threads).toHaveLength(1);
    expect(list.threads[0].id).toBe('t1');
  });

  it('POST /threads/<id> appends a reply to an existing thread', async () => {
    const first = await fetch(`${base}/threads`, {
      method: 'POST',
      body: JSON.stringify({ author: 'rjs', body: 'open' }),
    }).then((r) => r.json());
    const id = first.id;

    const reply = await fetch(`${base}/threads/${id}`, {
      method: 'POST',
      body: JSON.stringify({ author: 'C', body: 'reply' }),
    });
    expect(reply.status).toBe(200);
    const replyBody = await reply.json();
    expect(replyBody.id).toBe(id);
    expect(replyBody.comment).toMatchObject({ seq: 2, author: 'C', body: 'reply' });

    const thread = await fetch(`${base}/threads`).then((r) => r.json());
    expect(thread.threads[0].comments).toHaveLength(2);
  });

  it('PUT /threads/<id>/<seq> amends a comment in place', async () => {
    const first = await fetch(`${base}/threads`, {
      method: 'POST',
      body: JSON.stringify({ author: 'rjs', body: 'draft one' }),
    }).then((r) => r.json());

    const put = await fetch(`${base}/threads/${first.id}/1`, {
      method: 'PUT',
      body: JSON.stringify({ body: 'draft two' }),
    });
    expect(put.status).toBe(200);
    const putBody = await put.json();
    expect(putBody.comment).toMatchObject({ seq: 1, body: 'draft two' });

    const list = await fetch(`${base}/threads`).then((r) => r.json());
    expect(list.threads[0].comments).toHaveLength(1);
    expect(list.threads[0].comments[0].body).toBe('draft two');
  });

  it('PUT with a malformed path returns 400', async () => {
    const res = await fetch(`${base}/threads/t1/not-a-number`, {
      method: 'PUT',
      body: JSON.stringify({ body: 'x' }),
    });
    expect(res.status).toBe(400);
  });

  it('DELETE /threads/<id> resolves (deletes) the thread', async () => {
    const first = await fetch(`${base}/threads`, {
      method: 'POST',
      body: JSON.stringify({ author: 'rjs', body: 'to be resolved' }),
    }).then((r) => r.json());

    const del = await fetch(`${base}/threads/${first.id}`, { method: 'DELETE' });
    expect(del.status).toBe(200);
    expect(await del.json()).toEqual({ ok: true });

    const list = await fetch(`${base}/threads`).then((r) => r.json());
    expect(list.threads).toEqual([]);
  });

  it('DELETE with no id returns 400', async () => {
    const res = await fetch(`${base}/threads`, { method: 'DELETE' });
    expect(res.status).toBe(400);
  });
});

describe('GET /docloop-skills', () => {
  it('returns the skill roster from skillsDir', async () => {
    // Point cfg.skillsDir at a fixture with one real SKILL.md, mirroring the
    // repo's own skills/example/SKILL.md shape.
    const { mkdir, writeFile } = await import('node:fs/promises');
    await mkdir(join(skillsDir, 'example'), { recursive: true });
    await writeFile(
      join(skillsDir, 'example', 'SKILL.md'),
      '---\nname: example\ndescription: >\n  A test skill.\n---\n\nBody here.',
      'utf8',
    );

    const res = await fetch(`${base}/docloop-skills`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.skills).toEqual([{ name: 'example', description: 'A test skill.' }]);
  });

  it('returns an empty roster when skillsDir has no skills', async () => {
    const res = await fetch(`${base}/docloop-skills`);
    const body = await res.json();
    expect(body.skills).toEqual([]);
  });
});

describe('POST /run-skill', () => {
  it('returns 400 when skill is missing (does not invoke the model)', async () => {
    const res = await fetch(`${base}/run-skill`, {
      method: 'POST',
      body: JSON.stringify({ context: 'hello' }),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.ok).toBe(false);
  });

  it('returns 400 when body is empty (does not invoke the model)', async () => {
    const res = await fetch(`${base}/run-skill`, { method: 'POST', body: '' });
    expect(res.status).toBe(400);
  });
});

describe('unmatched routes', () => {
  it('falls through to a 404 JSON when there is no next()', async () => {
    const res = await fetch(`${base}/nonexistent`);
    expect(res.status).toBe(404);
  });

  it('GET /commit (wrong method) falls through to 404', async () => {
    const res = await fetch(`${base}/commit`);
    expect(res.status).toBe(404);
  });
});
