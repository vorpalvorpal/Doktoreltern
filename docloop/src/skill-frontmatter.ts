/**
 * Read the `docloop` plugin's own skill roster off disk — each skill under
 * `docloop/skills/<id>/SKILL.md` — for two different consumers: `GET
 * /docloop-skills` (name + description, for
 * the slash-trigger dropdown) and `POST /run-skill` (the body, as the system
 * prompt for a live invocation). Real YAML, not the hand-rolled line parser
 * `threads-store.ts` uses for comment frontmatter — SKILL.md's `description`
 * is a folded block scalar (`>`), which a naive `key: value`-per-line parser
 * can't represent; `js-yaml` is already the same library `count-skill-tokens.py`
 * relies on (via `python-frontmatter`) for this exact file format.
 */
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { load } from 'js-yaml';

export interface SkillMeta {
  name: string;
  description: string;
}

/** Split a SKILL.md's `---`-fenced YAML frontmatter from its body. */
function splitFrontmatter(text: string): { frontmatter: string; body: string } {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(text);
  if (!match) return { frontmatter: '', body: text };
  return { frontmatter: match[1], body: match[2] };
}

/** Read one skill's `{ name, description }` from `<skillsDir>/<id>/SKILL.md`. */
export async function readSkillMeta(skillsDir: string, id: string): Promise<SkillMeta> {
  const text = await readFile(join(skillsDir, id, 'SKILL.md'), 'utf8');
  const { frontmatter } = splitFrontmatter(text);
  const parsed = (load(frontmatter) ?? {}) as { name?: unknown; description?: unknown };
  return {
    name: String(parsed.name ?? id),
    description: String(parsed.description ?? '').trim(),
  };
}

/** Read one skill's body (frontmatter stripped) — the system prompt for a live invocation. */
export async function readSkillBody(skillsDir: string, id: string): Promise<string> {
  const text = await readFile(join(skillsDir, id, 'SKILL.md'), 'utf8');
  return splitFrontmatter(text).body.trim();
}

/** List every skill under `skillsDir` (one subdirectory per skill, each holding a SKILL.md). */
export async function listSkills(skillsDir: string): Promise<SkillMeta[]> {
  let entries: import('node:fs').Dirent[];
  try {
    entries = await readdir(skillsDir, { withFileTypes: true });
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw err;
  }
  const ids = entries.filter((e) => e.isDirectory()).map((e) => e.name).sort();
  const metas: SkillMeta[] = [];
  for (const id of ids) {
    try {
      metas.push(await readSkillMeta(skillsDir, id));
    } catch {
      // No SKILL.md (or unreadable) — not a skill directory, skip it.
    }
  }
  return metas;
}
