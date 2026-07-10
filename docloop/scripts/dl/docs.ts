/**
 * Doc discovery (dl-00-overview "Doc discovery"): the workspace's tracked
 * top-level `*.md` files — never `turn.xml`, never a nested doc. Thread ids
 * are workspace-global, so id allocation scans every doc this returns plus
 * the `threads/` store.
 */
import { git } from './gitio';

/** Tracked top-level `*.md` files of the workspace repo, sorted. */
export async function trackedDocs(ws: string): Promise<string[]> {
  const out = await git(ws, ['ls-files', '--', '*.md']);
  return out
    .split('\n')
    .filter((f) => f.length > 0 && !f.includes('/'))
    .sort();
}
