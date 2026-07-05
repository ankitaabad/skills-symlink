import { promises as fs } from 'node:fs';
import path from 'node:path';
import { extractDescription, parseSkillMd } from './frontmatter.js';
import type { Skill } from '../types.js';

const VALID_NAME = /^[a-z0-9][a-z0-9._-]{0,63}$/;

export function isValidSkillName(name: string): boolean {
  return VALID_NAME.test(name);
}

export type SkillWarning = {
  name: string;
  path: string;
  error: string;
};

export type ListSkillsOptions = {
  onWarn?: (w: SkillWarning) => void;
};

const defaultWarn: NonNullable<ListSkillsOptions['onWarn']> = (w) => {
  process.stderr.write(`warning: skipping skill '${w.name}' (${w.path}): ${w.error}\n`);
};

export async function listSkills(
  registryPath: string,
  opts: ListSkillsOptions = {},
): Promise<Skill[]> {
  const onWarn = opts.onWarn ?? defaultWarn;

  let entries: string[];
  try {
    entries = await fs.readdir(registryPath);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new Error(`Registry not found: ${registryPath}`);
    }
    throw err;
  }

  const skills: Skill[] = [];
  for (const entry of entries) {
    if (entry.startsWith('.')) continue;
    if (!isValidSkillName(entry)) continue;
    const skillDir = path.join(registryPath, entry);
    const skillMd = path.join(skillDir, 'SKILL.md');

    let stat;
    try {
      stat = await fs.stat(skillDir);
    } catch {
      continue;
    }
    if (!stat.isDirectory()) continue;

    let content = '';
    try {
      content = await fs.readFile(skillMd, 'utf8');
    } catch {
      continue;
    }

    let parsed: { data: ReturnType<typeof parseSkillMd>['data']; body: string };
    try {
      parsed = parseSkillMd(content);
    } catch (err) {
      onWarn({
        name: entry,
        path: skillMd,
        error: err instanceof Error ? err.message : String(err),
      });
      continue;
    }

    const description = extractDescription(parsed.data, parsed.body, '');
    skills.push({
      name: entry,
      path: skillDir,
      skillMd,
      description,
    });
  }

  skills.sort((a, b) => a.name.localeCompare(b.name));
  return skills;
}

export async function getSkill(registryPath: string, name: string): Promise<Skill | null> {
  if (!isValidSkillName(name)) return null;
  const skillDir = path.join(registryPath, name);
  const skillMd = path.join(skillDir, 'SKILL.md');
  try {
    const stat = await fs.stat(skillDir);
    if (!stat.isDirectory()) return null;
  } catch {
    return null;
  }
  let content = '';
  try {
    content = await fs.readFile(skillMd, 'utf8');
  } catch {
    return null;
  }
  const { data, body } = parseSkillMd(content);
  return {
    name,
    path: skillDir,
    skillMd,
    description: extractDescription(data, body, ''),
  };
}
