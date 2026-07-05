import { promises as fs } from 'node:fs';
import path from 'node:path';
import { input, confirm } from '@inquirer/prompts';
import { green, gray, bold, cyan } from 'kleur/colors';
import { DEFAULT_TARGET, writeProjectConfig } from '../lib/config.js';
import { listSkills } from '../lib/registry.js';
import { findProjectRoot } from '../lib/config.js';

export type InitOptions = {
  registry?: string;
  target?: string;
  json?: boolean;
  global?: boolean;
};

export async function initCommand(opts: InitOptions): Promise<void> {
  const cwd = process.cwd();
  const projectRoot = opts.global ? path.resolve(cwd) : findProjectRoot(cwd);

  const isTty = process.stdout.isTTY;
  const hasFlags = !!(opts.registry || opts.target);

  if (!isTty && !hasFlags) {
    throw new Error('init needs an interactive TTY or --registry / --target flags');
  }

  const existingPath = path.join(projectRoot, '.skillsrc.json');
  let exists = false;
  try {
    await fs.stat(existingPath);
    exists = true;
  } catch {
    exists = false;
  }

  if (exists && isTty) {
    const proceed = await confirm({
      message: `${existingPath} already exists. Overwrite?`,
      default: false,
    });
    if (!proceed) {
      console.log(gray('Aborted.'));
      return;
    }
  }

  async function resolveRegistryPath(raw: string): Promise<string> {
    const expanded = raw.startsWith('~')
      ? path.join(process.env.HOME ?? '', raw.slice(1).replace(/^[/\\]/, ''))
      : raw;
    const abs = path.resolve(expanded);
    try {
      const stat = await fs.stat(abs);
      if (!stat.isDirectory()) throw new Error(`Not a directory: ${abs}`);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        throw new Error(`Registry path does not exist: ${abs}`);
      }
      throw err;
    }
    return abs;
  }

  const defaultRegistry =
    opts.registry ?? process.env.SKILLS_REGISTRY ?? path.join(process.env.HOME ?? '~', 'skills');

  const registryInput = hasFlags
    ? defaultRegistry
    : await input({
        message: 'Registry path (folder containing skill subdirs):',
        default: defaultRegistry,
        validate: async (value) => {
          try {
            await resolveRegistryPath(value);
            return true;
          } catch (err) {
            return err instanceof Error ? err.message : String(err);
          }
        },
      });

  const absoluteRegistry = await resolveRegistryPath(registryInput);

  const targetInput = hasFlags
    ? (opts.target ?? process.env.SKILLS_TARGET ?? DEFAULT_TARGET)
    : await input({
        message: 'Target dir in each project (relative):',
        default: opts.target ?? process.env.SKILLS_TARGET ?? DEFAULT_TARGET,
        validate: (v) => (v.length > 0 ? true : 'Required'),
      });

  const skills = await listSkills(absoluteRegistry);
  const written = await writeProjectConfig(projectRoot, {
    registry: absoluteRegistry,
    target: targetInput,
  });

  console.log();
  console.log(green(`  Wrote ${written}`));
  console.log(green(`  Found ${skills.length} skill${skills.length === 1 ? '' : 's'} in registry.`));
  if (skills.length > 0) {
    const preview = skills
      .slice(0, 5)
      .map((s) => `    - ${s.name}${s.description ? `  ${gray(s.description.slice(0, 60))}` : ''}`);
    console.log(preview.join('\n'));
    if (skills.length > 5) console.log(gray(`    ...and ${skills.length - 5} more`));
  }
  console.log();
  console.log(bold('Next:'), 'run', cyan('skl add'), 'to symlink skills into this project.');
}
