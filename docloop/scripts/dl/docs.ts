/**
 * Doc discovery (dl-00-overview "Doc discovery"): the workspace's tracked
 * `*.md` files, recursively, each identified by its workspace-relative posix
 * path (`whiteboard.md`, `nodes/16/design.md`) — never `turn.xml`, never the
 * `threads/` sidecar store, never the parked docs under `archive/`, never a
 * dot-path. Top-level docs keep their historical identity (the bare
 * filename IS the path). Basenames may repeat across directories (every ctx
 * node has a `design.md`); the path is the doc id everywhere — refs, turn
 * records, thread ownership. Thread ids stay workspace-global, so id
 * allocation scans every doc this returns plus the `threads/` store.
 */
import { git } from './gitio';

/** Top-level directories outside the loop: parked docs + the sidecar store. */
const EXCLUDED_ROOTS = new Set(['archive', 'threads']);

/**
 * Whether the workspace-relative directory `rel` may contain reviewable docs:
 * no empty / dot-prefixed segments (so no `.git`, no `..` traversal), no
 * backslashes, and not under a top-level excluded root (see EXCLUDED_ROOTS).
 * Walkers use this to prune whole subtrees before descending.
 */
export function isDocDir(rel: string): boolean {
  if (rel.includes('\\')) return false;
  const segments = rel.split('/');
  if (segments.some((s) => s.length === 0 || s.startsWith('.'))) return false;
  return !EXCLUDED_ROOTS.has(segments[0]);
}

/**
 * Whether `rel` (a workspace-relative posix path) is a reviewable doc id:
 * ends in `.md` (so never `turn.xml`) and every directory rule of
 * {@link isDocDir} holds for it. This is also the path-traversal guard for
 * externally supplied doc names (`?doc=`, `dl edit <doc>@<ref>`).
 */
export function isDocPath(rel: string): boolean {
  return rel.endsWith('.md') && isDocDir(rel);
}

/** Tracked `*.md` doc paths of the workspace repo (recursive — see isDocPath), sorted. */
export async function trackedDocs(ws: string): Promise<string[]> {
  const out = await git(ws, ['ls-files', '--', '*.md']);
  return out.split('\n').filter(isDocPath).sort();
}
