/**
 * Browser ⇄ nav bridge. The left sidebar's data — the workspace's reviewable
 * docs (`GET /docs`) and the ctx node-store tree (`GET /nodes`) — lives
 * server-side, so the GUI reaches it through these thin typed fetch wrappers,
 * mirroring threads-client.ts in spirit. Both throw on a non-ok response or
 * network failure; the caller (main.ts) decides the fallback (offline/sample
 * mode shows an inert single-doc list and hides the node section).
 */
import type { NodeEntry } from './nodes-fs';

/** One reviewable doc as served by `GET /docs` (name + git-derived state). */
export interface DocInfo {
  name: string;
  /** 'clean' | 'draft' | 'untracked' — see the /docs endpoint in src/api.ts */
  state: string;
}

/** GET /docs → the workspace's reviewable docs + the server's default doc name. */
export async function fetchDocs(): Promise<{ docs: DocInfo[]; default: string }> {
  const res = await fetch('/docs');
  const json = (await res.json()) as { ok: boolean; docs?: DocInfo[]; default?: string };
  if (!json.ok || !Array.isArray(json.docs) || typeof json.default !== 'string') {
    throw new Error('GET /docs failed');
  }
  return { docs: json.docs, default: json.default };
}

/** GET /nodes → the node-store tree (`present: false` = no store configured/on disk). */
export async function fetchNodes(): Promise<{ present: boolean; nodes: NodeEntry[] }> {
  const res = await fetch('/nodes');
  const json = (await res.json()) as { ok: boolean; present?: boolean; nodes?: NodeEntry[] };
  if (!json.ok || typeof json.present !== 'boolean' || !Array.isArray(json.nodes)) {
    throw new Error('GET /nodes failed');
  }
  return { present: json.present, nodes: json.nodes };
}
