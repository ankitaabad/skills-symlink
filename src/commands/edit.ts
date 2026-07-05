import { spawn, spawnSync } from 'node:child_process';
import { checkbox } from '@inquirer/prompts';
import { red, gray, yellow, cyan } from 'kleur/colors';
import { loadConfig } from '../lib/config.js';
import { listSkills, getSkill } from '../lib/registry.js';
import { checkStatus } from '../lib/symlink.js';
import { ensureTarget } from '../lib/layout.js';
import path from 'node:path';
import { CHECKBOX_HINTS } from '../lib/prompts.js';

export type EditOptions = {
  editor?: string;
};

const EDITOR_FALLBACKS = ['code', 'cursor', 'vim', 'nano'];

function resolveEditor(opts: EditOptions): string | null {
  if (opts.editor) return opts.editor;
  if (process.env.VISUAL) return process.env.VISUAL;
  if (process.env.EDITOR) return process.env.EDITOR;
  for (const candidate of EDITOR_FALLBACKS) {
    const found = spawnSync('which', [candidate], { stdio: 'ignore' });
    if (found.status === 0) return candidate;
  }
  return null;
}

export async function editCommand(name: string | undefined, opts: EditOptions): Promise<void> {
  const config = await loadConfig();
  const targetDir = await ensureTarget(config.projectRoot, config.target);

  let skill;
  if (name) {
    skill = await getSkill(config.registry, name);
    if (!skill) {
      const status = checkStatus(path.join(targetDir, name));
      if (status === 'linked') {
        const target = await import('node:fs').then((m) => m.promises.readlink(path.join(targetDir, name)));
        const resolved = path.resolve(path.dirname(path.join(targetDir, name)), target);
        skill = await getSkill(config.registry, path.basename(resolved));
      }
    }
    if (!skill) {
      console.log(red(`Skill not found in registry: ${name}`));
      console.log(gray(`Try: skl where ${name}  or  skl search ${name.slice(0, 3)}`));
      return;
    }
  } else {
    if (!process.stdout.isTTY) {
      console.log(yellow('edit needs a skill name in non-interactive mode.'));
      console.log(gray('  Usage: skl edit <name>'));
      return;
    }
    const skills = await listSkills(config.registry);
    if (skills.length === 0) {
      console.log(yellow('No skills in registry.'));
      return;
    }
    const choices = skills.map((s) => ({
      name: s.name,
      value: s.name,
      description: s.description || '(no description)',
    }));
    const selected = await checkbox({
      message: 'Select a skill to edit:',
      instructions: CHECKBOX_HINTS,
      choices,
      pageSize: Math.min(20, skills.length),
    });
    if (selected.length === 0) {
      console.log(gray('Aborted.'));
      return;
    }
    const chosen = selected[0];
    if (!chosen) {
      console.log(gray('Aborted.'));
      return;
    }
    skill = skills.find((s) => s.name === chosen);
    if (!skill) return;
  }

  const editor = resolveEditor(opts);
  if (!editor) {
    console.log(yellow('No editor found. Set $EDITOR (or $VISUAL) or pass --editor.'));
    console.log();
    console.log('Skill path:', cyan(skill.skillMd));
    return;
  }

  console.log(gray(`Opening ${skill.skillMd} in ${editor}…`));
  const child = spawn(editor, [skill.skillMd], { stdio: 'inherit' });
  await new Promise<void>((resolve, reject) => {
    child.on('exit', (code) => {
      if (code === 0 || code === null) resolve();
      else reject(new Error(`${editor} exited with code ${code}`));
    });
    child.on('error', reject);
  });
}
