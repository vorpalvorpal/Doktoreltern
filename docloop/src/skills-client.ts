/**
 * Browser ⇄ docloop-skills bridge (see vite.config.ts `GET /docloop-skills`,
 * `POST /run-skill`). Mirrors src/skill-frontmatter.ts's `SkillMeta` shape.
 */

export interface SkillMeta {
  name: string;
  description: string;
}

/** GET /docloop-skills → the docloop plugin's skill roster, for the slash-trigger dropdown. */
export async function fetchSkills(): Promise<SkillMeta[]> {
  try {
    const res = await fetch('/docloop-skills');
    const json = (await res.json()) as { ok: boolean; skills?: SkillMeta[] };
    return json.ok && json.skills ? json.skills : [];
  } catch {
    return []; // no dev server — the demo build just has no slash commands
  }
}

/**
 * POST /run-skill → invoke one docloop skill live and return its result text.
 * Throws (with the server's error message) on failure — the caller decides
 * how to surface that to the human rather than silently falling back.
 */
export async function runSkill(skill: string, context: string): Promise<string> {
  const res = await fetch('/run-skill', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ skill, context }),
  });
  const json = (await res.json()) as { ok: boolean; result?: string; error?: string };
  if (!json.ok || typeof json.result !== 'string') {
    throw new Error(json.error ?? 'skill run failed');
  }
  return json.result;
}
