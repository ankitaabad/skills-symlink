import { promises as fs, existsSync as fsExistsSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import type { LoadedConfig } from '../types.js';

export const DEFAULT_TARGET = '.opencode/skills';

export type ConfigOverrides = {
  registry?: string;
  target?: string;
  projectRoot?: string;
};

type RawConfig = {
  registry?: string;
  target?: string;
};

function expandHome(p: string): string {
  if (p.startsWith('~')) {
    return path.join(os.homedir(), p.slice(1).replace(/^[/\\]/, ''));
  }
  return p;
}

export function findProjectRoot(start: string): string {
  let dir = path.resolve(start);
  const { root } = path.parse(dir);
  while (true) {
    if (
      fsExistsSync(path.join(dir, 'package.json')) ||
      fsExistsSync(path.join(dir, '.git')) ||
      fsExistsSync(path.join(dir, '.skillsrc.json')) ||
      fsExistsSync(path.join(dir, '.skillsrc'))
    ) {
      return dir;
    }
    if (dir === root) return path.resolve(start);
    const parent = path.dirname(dir);
    if (parent === dir) return path.resolve(start);
    dir = parent;
  }
}

async function readJsonIfExists(filePath: string): Promise<{ raw: RawConfig; configPath: string | null }> {
  try {
    const stat = await fs.stat(filePath);
    if (!stat.isFile()) return { raw: {}, configPath: null };
    const content = await fs.readFile(filePath, 'utf8');
    const parsed = JSON.parse(content) as { skills?: RawConfig } & RawConfig;
    const raw: RawConfig = parsed.skills ?? { registry: parsed.registry, target: parsed.target };
    return { raw, configPath: filePath };
  } catch {
    return { raw: {}, configPath: null };
  }
}

async function loadProjectConfig(projectRoot: string): Promise<{ raw: RawConfig; configPath: string | null }> {
  const jsonPath = path.join(projectRoot, '.skillsrc.json');
  const fromJson = await readJsonIfExists(jsonPath);
  if (fromJson.configPath) return fromJson;

  const pkgPath = path.join(projectRoot, 'package.json');
  const fromPkg = await readJsonIfExists(pkgPath);
  if (fromPkg.raw.registry || fromPkg.raw.target) {
    return fromPkg;
  }
  return { raw: {}, configPath: null };
}

async function loadGlobalConfig(): Promise<RawConfig> {
  const filePath = path.join(os.homedir(), '.skillsrc.json');
  const { raw } = await readJsonIfExists(filePath);
  return raw;
}

export async function loadConfig(
  cwd: string = process.cwd(),
  overrides: ConfigOverrides = {},
): Promise<LoadedConfig> {
  const projectRoot = overrides.projectRoot ?? findProjectRoot(cwd);

  const project = await loadProjectConfig(projectRoot);
  const global = await loadGlobalConfig();

  const fromEnv = {
    registry: process.env.SKILLS_REGISTRY,
    target: process.env.SKILLS_TARGET,
  };

  const registry =
    overrides.registry ??
    project.raw.registry ??
    global.registry ??
    fromEnv.registry ??
    null;

  const target =
    overrides.target ??
    project.raw.target ??
    global.target ??
    fromEnv.target ??
    DEFAULT_TARGET;

  if (!registry) {
    throw new Error(
      'No skills registry configured.\n' +
        '  Run `skl init` to create a .skillsrc.json, or set SKILLS_REGISTRY.\n' +
        '  See `skl init --help`.',
    );
  }

  const expandedRegistry = path.resolve(projectRoot, expandHome(registry));

  try {
    const stat = await fs.stat(expandedRegistry);
    if (!stat.isDirectory()) {
      throw new Error(`Registry path is not a directory: ${expandedRegistry}`);
    }
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new Error(`Registry path does not exist: ${expandedRegistry}`);
    }
    throw err;
  }

  return {
    registry: expandedRegistry,
    target,
    projectRoot,
    configPath: project.configPath,
  };
}

export async function writeProjectConfig(
  projectRoot: string,
  config: { registry: string; target: string },
  format: 'json' | 'package' = 'json',
): Promise<string> {
  if (format === 'package') {
    const pkgPath = path.join(projectRoot, 'package.json');
    let pkg: Record<string, unknown> = {};
    try {
      const raw = await fs.readFile(pkgPath, 'utf8');
      pkg = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      return writeProjectConfig(projectRoot, config, 'json');
    }
    pkg.skills = { registry: config.registry, target: config.target };
    await fs.writeFile(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`, 'utf8');
    return pkgPath;
  }

  const configPath = path.join(projectRoot, '.skillsrc.json');
  const payload = {
    $schema: 'https://unpkg.com/skills-symlink/schema.json',
    registry: config.registry,
    target: config.target,
  };
  await fs.writeFile(configPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  return configPath;
}
