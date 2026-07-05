import path from 'node:path';
import { checkbox, confirm } from '@inquirer/prompts';
import { green, red, gray, yellow } from 'kleur/colors';
import { loadConfig } from '../lib/config.js';
import { listSkills } from '../lib/registry.js';
import { checkStatus, createSymlink, ensureDir } from '../lib/symlink.js';
import { ensureTarget } from '../lib/layout.js';
import { CHECKBOX_HINTS } from '../lib/prompts.js';

export type AddOptions = {
  interactive?: boolean;
  force?: boolean;
  yes?: boolean;
};

export async function addCommand(names: string[], opts: AddOptions): Promise<void> {
  const config = await loadConfig();
  const skills = await listSkills(config.registry);
  if (skills.length === 0) {
    console.log(yellow('No skills found in registry.'));
    return;
  }

  const targetDir = await ensureTarget(config.projectRoot, config.target);

  let toAdd = new Set<string>();
  let toRemove = new Set<string>();
  const skillNames = new Set(skills.map((s) => s.name));

  const isInteractive = opts.interactive || names.length === 0;

  if (isInteractive && !process.stdout.isTTY) {
    throw new Error(
      'add needs skill names in non-interactive mode.\n' +
        '  Usage: skl add <name...>  or  echo y | skl add -i',
    );
  }

  if (!isInteractive && names.length > 0) {
    for (const n of names) {
      if (!skillNames.has(n)) {
        console.log(red(`  ! Unknown skill: ${n}`));
        continue;
      }
      const link = path.join(targetDir, n);
      if (checkStatus(link) === 'linked') {
        console.log(gray(`  = ${n} (already linked)`));
      } else {
        toAdd.add(n);
      }
    }
  } else {
    const currentlyLinked = new Set<string>();
    for (const s of skills) {
      if (checkStatus(path.join(targetDir, s.name)) === 'linked') currentlyLinked.add(s.name);
    }
    const choices = skills.map((s) => ({
      name: s.name,
      value: s.name,
      description: s.description || '(no description)',
      checked: currentlyLinked.has(s.name),
    }));

    const selected = await checkbox({
      message: 'Select skills to link (uncheck to remove):',
      instructions: CHECKBOX_HINTS,
      choices,
      pageSize: Math.min(20, skills.length),
    });

    const selectedSet = new Set(selected);
    for (const s of skills) {
      const wasLinked = currentlyLinked.has(s.name);
      const isSelected = selectedSet.has(s.name);
      if (isSelected && !wasLinked) toAdd.add(s.name);
      else if (!isSelected && wasLinked) toRemove.add(s.name);
    }
  }

  if (toAdd.size === 0 && toRemove.size === 0) {
    console.log(gray('No changes.'));
    return;
  }

  if (toRemove.size > 0) {
    if (!opts.yes) {
      const removeList = [...toRemove].map((n) => `    - ${n}`).join('\n');
      const ok = await confirm({
        message: `Remove these symlinks?\n${removeList}\n  Proceed?`,
        default: false,
      });
      if (!ok) toRemove = new Set();
    }
  }

  await ensureDir(targetDir);

  let added = 0;
  let removed = 0;
  let skipped = 0;
  for (const name of toAdd) {
    const skill = skills.find((s) => s.name === name);
    if (!skill) continue;
    const result = createSymlink(
      path.join(targetDir, name),
      skill.path,
      { force: opts.force },
    );
    if (result.kind === 'created') {
      console.log(green(`  + ${name}`));
      added++;
    } else {
      console.log(gray(`  = ${name} (already linked)`));
      skipped++;
    }
  }
  for (const name of toRemove) {
    const linkPath = path.join(targetDir, name);
    const { symlink, unlink } = await import('node:fs/promises');
    try {
      await unlink(linkPath);
      console.log(red(`  - ${name}`));
      removed++;
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code === 'ENOENT') {
        console.log(gray(`  . ${name} (not linked)`));
      } else {
        throw err;
      }
    }
    void symlink;
  }

  console.log();
  if (added > 0) console.log(green(`  ${added} added`));
  if (removed > 0) console.log(red(`  ${removed} removed`));
  if (skipped > 0) console.log(gray(`  ${skipped} already linked`));
}
