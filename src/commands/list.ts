import path from 'node:path';
import Table from 'cli-table3';
import { green, red, gray, bold, cyan } from 'kleur/colors';
import { checkbox, confirm } from '@inquirer/prompts';
import { loadConfig } from '../lib/config.js';
import { listSkills } from '../lib/registry.js';
import { checkStatus, createSymlink, removeSymlink } from '../lib/symlink.js';
import { ensureTarget } from '../lib/layout.js';
import { CHECKBOX_HINTS } from '../lib/prompts.js';

export type ListOptions = {
  json?: boolean;
  linked?: boolean;
  interactive?: boolean;
  force?: boolean;
};

export async function listCommand(opts: ListOptions): Promise<void> {
  const config = await loadConfig();
  const skills = await listSkills(config.registry);
  const targetDir = await ensureTarget(config.projectRoot, config.target);

  const annotated = skills.map((skill) => ({
    skill,
    status: checkStatus(path.join(targetDir, skill.name)),
  }));

  const filtered = opts.linked ? annotated.filter((r) => r.status === 'linked') : annotated;

  if (opts.json) {
    console.log(
      JSON.stringify(
        filtered.map(({ skill, status }) => ({
          name: skill.name,
          description: skill.description,
          status,
          path: skill.path,
        })),
        null,
        2,
      ),
    );
    return;
  }

  if (filtered.length === 0) {
    console.log(gray(opts.linked ? 'No skills are currently linked.' : 'No skills in registry.'));
    return;
  }

  const table = new Table({
    head: [bold('Status'), bold('Name'), bold('Description')],
    colWidths: [14, 28, 70],
    wordWrap: true,
  });
  for (const { skill, status } of filtered) {
    const icon =
      status === 'linked'
        ? green('✓ linked')
        : status === 'broken'
          ? red('! broken')
          : gray('· not-linked');
    table.push([icon, skill.name, skill.description || gray('(no description)')]);
  }
  console.log(table.toString());

  if (!opts.interactive) return;

  if (!process.stdout.isTTY) {
    console.log(gray('(interactive picker requires a TTY; skipping)'));
    return;
  }

  const linkedSet = new Set(annotated.filter((r) => r.status === 'linked').map((r) => r.skill.name));
  const choices = skills.map((s) => ({
    name: s.name,
    value: s.name,
    description: s.description || '(no description)',
    checked: linkedSet.has(s.name),
  }));
  const selected = await checkbox({
    message: 'Select skills to link (uncheck to remove):',
    instructions: CHECKBOX_HINTS,
    choices,
    pageSize: Math.min(20, skills.length),
  });

  const selectedSet = new Set(selected);
  const toAdd = [...selectedSet].filter((n) => !linkedSet.has(n));
  const toRemove = [...linkedSet].filter((n) => !selectedSet.has(n));

  if (toAdd.length === 0 && toRemove.length === 0) {
    console.log(gray('No changes.'));
    return;
  }

  if (toRemove.length > 0) {
    const list = toRemove.map((n) => `    - ${n}`).join('\n');
    const ok = await confirm({
      message: `Remove these symlinks?\n${list}\n  Proceed?`,
      default: false,
    });
    if (!ok) toRemove.length = 0;
  }

  let added = 0;
  let removed = 0;
  for (const name of toAdd) {
    const skill = skills.find((s) => s.name === name);
    if (!skill) continue;
    const result = createSymlink(path.join(targetDir, name), skill.path, { force: opts.force });
    if (result.kind === 'created') {
      console.log(green(`  + ${name}`));
      added++;
    }
  }
  for (const name of toRemove) {
    const result = removeSymlink(path.join(targetDir, name));
    if (result.kind === 'removed') {
      console.log(red(`  - ${name}`));
      removed++;
    }
  }
  console.log();
  if (added > 0) console.log(green(`  ${added} added`));
  if (removed > 0) console.log(red(`  ${removed} removed`));
}
