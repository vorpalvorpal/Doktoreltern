/**
 * Node-store directory walker — the pure-fs half of the `GET /nodes` seam
 * (plan dl-E-gui-nav-sidebar). The ctx node store's schema is still a draft,
 * so v1 is deliberately schema-agnostic: one entry per directory, title =
 * basename, state = 'unknown' (reserved for the settled schema), `*.md`
 * filenames listed per directory. Pure fs, no git.
 */
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import type { Dirent } from 'node:fs';

/** One directory of the node store, as served by `GET /nodes`. */
export interface NodeEntry {
  /** path relative to the store root, posix separators — the stable key */
  id: string;
  /** directory basename (schema-agnostic v1) */
  title: string;
  /** 'unknown' in v1 — reserved for the settled store schema */
  state: string;
  /** `*.md` filenames directly inside this directory, sorted */
  docs: string[];
  /** subdirectories, sorted by title */
  children: NodeEntry[];
}

/**
 * Hard depth cap: directories nested deeper than this are silently ignored
 * (never an error) — a runaway store must not balloon the API response.
 */
const MAX_DEPTH = 12;

/**
 * Walk the node store under `root`: one {@link NodeEntry} per directory, with
 * `root` itself excluded (its subdirectories are the top level). Skips
 * dot-directories (`.git` etc.) and dot-files; does not follow directory
 * symlinks (`withFileTypes` dirents come from lstat, so a symlinked directory
 * is never `isDirectory()` and is skipped entirely).
 */
export async function readNodeTree(root: string): Promise<NodeEntry[]> {
  return childEntries(await readdir(root, { withFileTypes: true }), root, '', 1);
}

/**
 * Build the sorted {@link NodeEntry} list for the subdirectories among
 * `dirents` (the already-read contents of `dir`); the entries built here sit
 * at `depth` (1 = the top level, directly under the store root).
 */
async function childEntries(
  dirents: Dirent[],
  dir: string,
  relPrefix: string,
  depth: number,
): Promise<NodeEntry[]> {
  if (depth > MAX_DEPTH) return [];
  const subdirs = dirents
    .filter((d) => d.isDirectory() && !d.name.startsWith('.'))
    .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  return Promise.all(
    subdirs.map(async (d): Promise<NodeEntry> => {
      const id = relPrefix ? `${relPrefix}/${d.name}` : d.name;
      const sub = join(dir, d.name);
      const inner = await readdir(sub, { withFileTypes: true });
      const docs = inner
        .filter((f) => f.isFile() && f.name.endsWith('.md') && !f.name.startsWith('.'))
        .map((f) => f.name)
        .sort();
      return {
        id,
        title: d.name,
        state: 'unknown',
        docs,
        children: await childEntries(inner, sub, id, depth + 1),
      };
    }),
  );
}
