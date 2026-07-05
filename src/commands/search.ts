import { checkbox, confirm } from '@inquirer/prompts';
import { green, red, gray, yellow, bold, cyan } from 'kleur/colors';
import { loadConfig } from '../lib/config.js';
import { listSkills } from '../lib/registry.js';
import { searchInSkills, searchInBody } from '../lib/search.js';
import { createSymlink, removeSymlink, checkStatus } from '../lib/symlink.js';
import { ensureTarget } from '../lib/layout.js';
import path from 'node:path';
import { CHECKBOX_HINTS } from '../lib/prompts.js';

export type SearchOptions = {
  body?: boolean;
  interactive?: boolean;
};

export async function searchCommand(query: string, opts: SearchOptions): Promise<void> {
  if (!query || !query.trim()) {
    console.log(yellow('Provide a search query. Example: skl search mantine'));
    return;
  }

  const config = await loadConfig();
  const skills = await listSkills(config.registry);
  const targetDir = await ensureTarget(config.projectRoot, config.target);

  const metaHits = searchInSkills(skills, query);
  let bodyHits: Awaited<ReturnType<typeof searchInBody>> = [];
  if (opts.body) {
    bodyHits = await searchInBody(skills, query);
  }

  const merged = mergeHits(metaHits, bodyHits, skills);

  if (merged.length === 0) {
    console.log(gray(`No matches for "${query}".`));
    return;
  }

  for (const hit of merged) {
    const status = checkStatus(path.join(targetDir, hit.skill.name));
    const icon =
      status === 'linked' ? green('✓') : status === 'broken' ? red('!') : gray('·');
    console.log(`${icon} ${bold(hit.skill.name)}  ${gray(hit.skill.description || '')}`);
    for (const m of hit.matches) {
      const tag =
        m.field === 'name'
          ? cyan('name')
          : m.field === 'description'
            ? cyan('desc')
            : cyan('body');
      const line = m.line ? `:${m.line}` : '';
      console.log(`    ${tag}${line}  ${m.snippet}`);
    }
  }

  if (!opts.interactive) return;

  if (!process.stdout.isTTY) {
    console.log(gray('(interactive picker requires a TTY; skipping)'));
    return;
  }

  const choices = merged.map((hit) => {
    const status = checkStatus(path.join(targetDir, hit.skill.name));
    return {
      name: hit.skill.name,
      value: hit.skill.name,
      description: `${status === 'linked' ? '✓ ' : ''}${hit.skill.description || ''}`.trim(),
      checked: false,
    };
  });
  const selected = await checkbox({
    message: 'Select matches to add:',
    instructions: CHECKBOX_HINTS,
    choices,
    pageSize: Math.min(15, choices.length),
  });

  if (selected.length === 0) {
    console.log(gray('No changes.'));
    return;
  }

  const linkedSet = new Set(
    merged
      .filter((h) => checkStatus(path.join(targetDir, h.skill.name)) === 'linked')
      .map((h) => h.skill.name),
  );

  const toAdd = selected.filter((n) => !linkedSet.has(n));
  const toRemove = selected.filter((n) => linkedSet.has(n));

  if (toRemove.length > 0) {
    const ok = await confirm({
      message: `Also unlink ${toRemove.length} already-linked skill${toRemove.length === 1 ? '' : 's'}?`,
      default: false,
    });
    if (!ok) toRemove.length = 0;
  }

  for (const name of toAdd) {
    const skill = skills.find((s) => s.name === name);
    if (!skill) continue;
    const result = createSymlink(path.join(targetDir, name), skill.path);
    if (result.kind === 'created') console.log(green(`  + ${name}`));
  }
  for (const name of toRemove) {
    const result = removeSymlink(path.join(targetDir, name));
    if (result.kind === 'removed') console.log(red(`  - ${name}`));
  }
}

function mergeHits(
  meta: ReturnType<typeof searchInSkills>,
  body: Awaited<ReturnType<typeof searchInBody>>,
  skills: Awaited<ReturnType<typeof listSkills>>,
) {
  const byName = new Map<string, { skill: (typeof skills)[number]; matches: NonNullable<ReturnType<typeof searchInSkills>>[number]['matches'] }>();
  for (const hit of meta) {
    byName.set(hit.skill.name, { skill: hit.skill, matches: [...hit.matches] });
  }
  for (const hit of body) {
    const existing = byName.get(hit.skill.name);
    if (existing) {
      existing.matches.push(...hit.matches);
    } else {
      byName.set(hit.skill.name, { skill: hit.skill, matches: [...hit.matches] });
    }
  }
  return [...byName.values()].sort((a, b) => a.skill.name.localeCompare(b.skill.name));
}
