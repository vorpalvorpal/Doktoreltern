import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readSkillMeta, readSkillBody, listSkills } from '../src/skill-frontmatter';

let base: string;

beforeEach(async () => {
  base = await mkdtemp(join(tmpdir(), 'docloop-skills-'));
});

afterEach(async () => {
  await rm(base, { recursive: true, force: true });
});

async function writeSkill(id: string, text: string): Promise<void> {
  const dir = join(base, id);
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, 'SKILL.md'), text, 'utf8');
}

describe('readSkillMeta', () => {
  it('parses a single-line description', async () => {
    await writeSkill('foo', '---\nname: foo\ndescription: Does a thing.\n---\nBody.');
    expect(await readSkillMeta(base, 'foo')).toEqual({ name: 'foo', description: 'Does a thing.' });
  });

  it('parses a folded (>) multi-line description into one joined string', async () => {
    await writeSkill(
      'example',
      [
        '---',
        'name: example',
        'description: >',
        '  Placeholder skill proving the docloop plugin discovery mechanism',
        '  end to end. Not a real skill.',
        '---',
        '# Body',
        'Some instructions.',
      ].join('\n'),
    );
    const meta = await readSkillMeta(base, 'example');
    expect(meta.name).toBe('example');
    expect(meta.description).toBe(
      'Placeholder skill proving the docloop plugin discovery mechanism end to end. Not a real skill.',
    );
  });

  it('falls back to the directory name when frontmatter has no name', async () => {
    await writeSkill('bare', '---\ndescription: x\n---\nBody');
    expect((await readSkillMeta(base, 'bare')).name).toBe('bare');
  });
});

describe('readSkillBody', () => {
  it('strips frontmatter and returns the trimmed body', async () => {
    await writeSkill('foo', '---\nname: foo\ndescription: x\n---\n\n# Instructions\n\nDo the thing.\n');
    expect(await readSkillBody(base, 'foo')).toBe('# Instructions\n\nDo the thing.');
  });
});

describe('listSkills', () => {
  it('returns [] when skillsDir does not exist', async () => {
    expect(await listSkills(join(base, 'nope'))).toEqual([]);
  });

  it('lists every skill directory containing a SKILL.md, skipping ones without', async () => {
    await writeSkill('alpha', '---\nname: alpha\ndescription: A.\n---\nbody');
    await writeSkill('beta', '---\nname: beta\ndescription: B.\n---\nbody');
    await mkdir(join(base, 'not-a-skill'), { recursive: true }); // no SKILL.md
    const skills = await listSkills(base);
    expect(skills.map((s) => s.name).sort()).toEqual(['alpha', 'beta']);
  });
});
