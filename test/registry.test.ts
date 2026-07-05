import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { listSkills, getSkill, isValidSkillName } from '../src/lib/registry.js';

let tmp: string;
let registry: string;

beforeEach(async () => {
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'skl-reg-'));
  registry = path.join(tmp, 'registry');
  await fs.mkdir(registry, { recursive: true });
});

afterEach(async () => {
  await fs.rm(tmp, { recursive: true, force: true });
});

describe('isValidSkillName', () => {
  it.each([
    ['alpha', true],
    ['skill-1', true],
    ['skill.v2', true],
    ['a_b', true],
    ['1starts-with-digit', true],
    ['', false],
    ['has spaces', false],
    ['has/slash', false],
    ['.hidden', false], // leading dot rejected; registry also has its own dotfile filter
    ['way-too-long-' + 'x'.repeat(80), false],
  ])('isValidSkillName(%j) = %s', (name, expected) => {
    expect(isValidSkillName(name)).toBe(expected);
  });
});

describe('listSkills', () => {
  it('lists skills with parsed frontmatter description', async () => {
    for (const name of ['alpha', 'beta']) {
      const dir = path.join(registry, name);
      await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(
        path.join(dir, 'SKILL.md'),
        `---\nname: ${name}\ndescription: Skill ${name}\n---\nBody.\n`,
        'utf8',
      );
    }
    const skills = await listSkills(registry);
    expect(skills.map((s) => s.name).sort()).toEqual(['alpha', 'beta']);
    for (const s of skills) {
      expect(s.description).toMatch(/^Skill /);
      expect(s.path).toBe(path.join(registry, s.name));
      expect(s.skillMd).toBe(path.join(registry, s.name, 'SKILL.md'));
    }
  });

  it('skips directories without SKILL.md', async () => {
    await fs.mkdir(path.join(registry, 'real'), { recursive: true });
    await fs.writeFile(path.join(registry, 'real', 'SKILL.md'), 'body\n', 'utf8');
    await fs.mkdir(path.join(registry, 'not-a-skill'), { recursive: true });
    const skills = await listSkills(registry);
    expect(skills.map((s) => s.name)).toEqual(['real']);
  });

  it('skips hidden dotfile directories', async () => {
    await fs.mkdir(path.join(registry, '.hidden'), { recursive: true });
    await fs.writeFile(path.join(registry, '.hidden', 'SKILL.md'), 'x', 'utf8');
    await fs.mkdir(path.join(registry, 'real'), { recursive: true });
    await fs.writeFile(path.join(registry, 'real', 'SKILL.md'), 'x', 'utf8');
    const skills = await listSkills(registry);
    expect(skills.map((s) => s.name)).toEqual(['real']);
  });

  it('skips files at the top level (only directories)', async () => {
    await fs.writeFile(path.join(registry, 'loose.md'), 'not a skill\n', 'utf8');
    await fs.mkdir(path.join(registry, 'real'), { recursive: true });
    await fs.writeFile(path.join(registry, 'real', 'SKILL.md'), 'x', 'utf8');
    const skills = await listSkills(registry);
    expect(skills.map((s) => s.name)).toEqual(['real']);
  });

  it('falls back to first body line when no frontmatter description', async () => {
    const dir = path.join(registry, 'no-front');
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(
      path.join(dir, 'SKILL.md'),
      '# Heading\n\nThis is the first real line.\nMore.\n',
      'utf8',
    );
    const skills = await listSkills(registry);
    expect(skills[0]?.description).toBe('This is the first real line.');
  });

  it('returns empty array for missing registry', async () => {
    const missing = path.join(tmp, 'no-such');
    await expect(listSkills(missing)).rejects.toThrow(/Registry not found/);
  });

  it('returns sorted results', async () => {
    for (const name of ['zebra', 'alpha', 'mango']) {
      const dir = path.join(registry, name);
      await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(path.join(dir, 'SKILL.md'), `body of ${name}\n`, 'utf8');
    }
    const skills = await listSkills(registry);
    expect(skills.map((s) => s.name)).toEqual(['alpha', 'mango', 'zebra']);
  });

  it('skips skills with unparseable frontmatter and warns, keeps the rest', async () => {
    const good = path.join(registry, 'good');
    await fs.mkdir(good, { recursive: true });
    await fs.writeFile(
      path.join(good, 'SKILL.md'),
      `---\nname: good\ndescription: A fine skill.\n---\nBody.\n`,
      'utf8',
    );

    const bad = path.join(registry, 'bad');
    await fs.mkdir(bad, { recursive: true });
    await fs.writeFile(
      path.join(bad, 'SKILL.md'),
      `---\nname: bad\ndescription: triggers: Mantine, @mantine/core\n---\nBody.\n`,
      'utf8',
    );

    const warnings: { name: string; error: string }[] = [];
    const skills = await listSkills(registry, {
      onWarn: (w) => warnings.push({ name: w.name, error: w.error }),
    });

    expect(skills.map((s) => s.name)).toEqual(['good']);
    expect(warnings).toHaveLength(1);
    expect(warnings[0].name).toBe('bad');
    expect(warnings[0].error).toMatch(/line 3/);
  });
});

describe('getSkill', () => {
  beforeEach(async () => {
    const dir = path.join(registry, 'known');
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(
      path.join(dir, 'SKILL.md'),
      `---\nname: known\ndescription: Known skill.\n---\nBody.\n`,
      'utf8',
    );
  });

  it('returns the skill for a known name', async () => {
    const skill = await getSkill(registry, 'known');
    expect(skill?.name).toBe('known');
    expect(skill?.description).toBe('Known skill.');
  });

  it('returns null for a missing name', async () => {
    expect(await getSkill(registry, 'nope')).toBeNull();
  });

  it('returns null for invalid skill names', async () => {
    expect(await getSkill(registry, 'has spaces')).toBeNull();
    expect(await getSkill(registry, '../escape')).toBeNull();
  });
});
