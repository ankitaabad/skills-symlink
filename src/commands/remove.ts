import path from 'node:path';
import { promises as fs } from 'node:fs';
import { checkbox, confirm } from '@inquirer/prompts';
import { red, gray } from 'kleur/colors';
import { loadConfig } from '../lib/config.js';
import { listSkills } from '../lib/registry.js';
import { checkStatus } from '../lib/symlink.js';
import { ensureTarget } from '../lib/layout.js';
import { CHECKBOX_HINTS } from '../lib/prompts.js';

export type RemoveOptions = {
  interactive?: boolean;
  yes?: boolean;
};

export async function removeCommand(names: string[], opts: RemoveOptions): Promise<void> {
  const config = await loadConfig();
  const skills = await listSkills(config.registry);
  const targetDir = await ensureTarget(config.projectRoot, config.target);
  const skillNames = new Set(skills.map((s) => s.name));

  const isInteractive = opts.interactive || names.length === 0;

  if (isInteractive && !process.stdout.isTTY) {
    throw new Error(
      'remove needs skill names in non-interactive mode.\n' +
        '  Usage: skl remove <name...>  or  skl remove --yes <name...>',
    );
  }

  let toRemove = new Set<string>();

  if (isInteractive) {
    const linked = skills.filter((s) => checkStatus(path.join(targetDir, s.name)) === 'linked');
    if (linked.length === 0) {
      console.log(gray('Nothing is currently linked.'));
      return;
    }
    const choices = linked.map((s) => ({
      name: s.name,
      value: s.name,
      description: s.description || '(no description)',
    }));
    const selected = await checkbox({
      message: 'Select symlinks to remove:',
      instructions: CHECKBOX_HINTS,
      choices,
      pageSize: Math.min(20, linked.length),
    });
    toRemove = new Set(selected);
  } else {
    for (const n of names) {
      if (!skillNames.has(n)) {
        console.log(red(`  ! Unknown skill: ${n}`));
        continue;
      }
      const status = checkStatus(path.join(targetDir, n));
      if (status !== 'linked') {
        console.log(gray(`  . ${n} (not linked)`));
        continue;
      }
      toRemove.add(n);
    }
  }

  if (toRemove.size === 0) {
    console.log(gray('No changes.'));
    return;
  }

  if (!opts.yes) {
    const list = [...toRemove].map((n) => `    - ${n}`).join('\n');
    const ok = await confirm({
      message: `Remove these symlinks?\n${list}\n  Proceed?`,
      default: false,
    });
    if (!ok) {
      console.log(gray('Aborted.'));
      return;
    }
  }

  let removed = 0;
  for (const name of toRemove) {
    const linkPath = path.join(targetDir, name);
    try {
      await fs.unlink(linkPath);
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
  }
  console.log();
  console.log(red(`  ${removed} removed`));
}
