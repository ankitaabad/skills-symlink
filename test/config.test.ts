import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { loadConfig, findProjectRoot, writeProjectConfig } from '../src/lib/config.js';

let tmp: string;
let project: string;
let fakeHome: string;
let envSnapshot: Record<string, string | undefined>;

beforeEach(async () => {
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'skl-cfg-'));
  project = path.join(tmp, 'project');
  fakeHome = path.join(tmp, 'home');
  await fs.mkdir(project, { recursive: true });
  await fs.mkdir(fakeHome, { recursive: true });
  await fs.writeFile(path.join(project, 'package.json'), '{}', 'utf8');

  envSnapshot = {
    HOME: process.env.HOME,
    SKILLS_REGISTRY: process.env.SKILLS_REGISTRY,
    SKILLS_TARGET: process.env.SKILLS_TARGET,
  };
  process.env.HOME = fakeHome;
  delete process.env.SKILLS_REGISTRY;
  delete process.env.SKILLS_TARGET;
});

afterEach(async () => {
  for (const [k, v] of Object.entries(envSnapshot)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  await fs.rm(tmp, { recursive: true, force: true });
  vi.restoreAllMocks();
});

describe('findProjectRoot', () => {
  it('stops at package.json', async () => {
    const nested = path.join(project, 'a', 'b');
    await fs.mkdir(nested, { recursive: true });
    expect(findProjectRoot(nested)).toBe(project);
  });

  it('stops at .git', async () => {
    const nested = path.join(project, 'a', 'b');
    await fs.mkdir(nested, { recursive: true });
    await fs.mkdir(path.join(project, '.git'), { recursive: true });
    expect(findProjectRoot(nested)).toBe(project);
  });

  it('stops at .skillsrc.json', async () => {
    const nested = path.join(project, 'a', 'b');
    await fs.mkdir(nested, { recursive: true });
    await fs.writeFile(path.join(project, '.skillsrc.json'), '{}', 'utf8');
    expect(findProjectRoot(nested)).toBe(project);
  });

  it('returns the start dir when no marker is found above', async () => {
    const isolated = path.join(tmp, 'isolated', 'deep');
    await fs.mkdir(isolated, { recursive: true });
    // /private/var/folders has no package.json/.git/.skillsrc.json until the FS root
    const result = findProjectRoot(isolated);
    expect(result).toBe(isolated);
  });
});

describe('writeProjectConfig + loadConfig', () => {
  it('round-trips .skillsrc.json', async () => {
    const registry = path.join(tmp, 'reg');
    await fs.mkdir(registry, { recursive: true });
    const written = await writeProjectConfig(project, { registry, target: '.opencode/skills' });
    expect(written).toBe(path.join(project, '.skillsrc.json'));

    const cfg = await loadConfig(project, { projectRoot: project });
    expect(cfg.registry).toBe(registry);
    expect(cfg.target).toBe('.opencode/skills');
    expect(cfg.projectRoot).toBe(project);
  });

  it('reads skills from package.json as a fallback', async () => {
    const registry = path.join(tmp, 'reg');
    await fs.mkdir(registry, { recursive: true });
    await fs.writeFile(
      path.join(project, 'package.json'),
      JSON.stringify({ name: 'app', skills: { registry, target: '.claude/skills' } }),
      'utf8',
    );
    const cfg = await loadConfig(project, { projectRoot: project });
    expect(cfg.registry).toBe(registry);
    expect(cfg.target).toBe('.claude/skills');
  });

  it('reads ~/.skillsrc.json globally when no project config', async () => {
    const registry = path.join(tmp, 'reg');
    await fs.mkdir(registry, { recursive: true });
    await fs.writeFile(
      path.join(fakeHome, '.skillsrc.json'),
      JSON.stringify({ registry, target: '.global/skills' }),
      'utf8',
    );
    const cfg = await loadConfig(project, { projectRoot: project });
    expect(cfg.registry).toBe(registry);
    expect(cfg.target).toBe('.global/skills');
  });

  it('project config overrides global config', async () => {
    const regGlobal = path.join(tmp, 'reg-global');
    const regProject = path.join(tmp, 'reg-project');
    await fs.mkdir(regGlobal, { recursive: true });
    await fs.mkdir(regProject, { recursive: true });
    await fs.writeFile(
      path.join(fakeHome, '.skillsrc.json'),
      JSON.stringify({ registry: regGlobal, target: '.g/skills' }),
      'utf8',
    );
    await writeProjectConfig(project, { registry: regProject, target: '.p/skills' });
    const cfg = await loadConfig(project, { projectRoot: project });
    expect(cfg.registry).toBe(regProject);
    expect(cfg.target).toBe('.p/skills');
  });
});

describe('env var overrides', () => {
  it('SKILLS_REGISTRY is honored when no config exists', async () => {
    const registry = path.join(tmp, 'reg');
    await fs.mkdir(registry, { recursive: true });
    process.env.SKILLS_REGISTRY = registry;
    const cfg = await loadConfig(project, { projectRoot: project });
    expect(cfg.registry).toBe(registry);
  });

  it('SKILLS_TARGET is honored when no config exists', async () => {
    const registry = path.join(tmp, 'reg');
    await fs.mkdir(registry, { recursive: true });
    process.env.SKILLS_REGISTRY = registry;
    process.env.SKILLS_TARGET = '.env/skills';
    const cfg = await loadConfig(project, { projectRoot: project });
    expect(cfg.target).toBe('.env/skills');
  });
});

describe('flag overrides', () => {
  it('CLI flags beat config', async () => {
    const regConfig = path.join(tmp, 'reg-config');
    const regFlag = path.join(tmp, 'reg-flag');
    await fs.mkdir(regConfig, { recursive: true });
    await fs.mkdir(regFlag, { recursive: true });
    await writeProjectConfig(project, { registry: regConfig, target: '.x' });
    const cfg = await loadConfig(project, {
      projectRoot: project,
      registry: regFlag,
      target: '.y',
    });
    expect(cfg.registry).toBe(regFlag);
    expect(cfg.target).toBe('.y');
  });
});

describe('home expansion and error paths', () => {
  it('expands ~ in registry', async () => {
    const subdir = path.join(fakeHome, 'mysub');
    await fs.mkdir(subdir, { recursive: true });
    await writeProjectConfig(project, { registry: '~/mysub', target: '.a' });
    const cfg = await loadConfig(project, { projectRoot: project });
    expect(cfg.registry).toBe(subdir);
  });

  it('throws when no registry is configured', async () => {
    await expect(loadConfig(project, { projectRoot: project })).rejects.toThrow(
      /No skills registry configured/,
    );
  });

  it('throws when the registry path does not exist', async () => {
    await expect(
      loadConfig(project, { projectRoot: project, registry: '/no/such/path' }),
    ).rejects.toThrow(/Registry path does not exist/);
  });

  it('throws when the registry path is a file, not a directory', async () => {
    const file = path.join(tmp, 'not-a-dir');
    await fs.writeFile(file, 'x', 'utf8');
    await expect(loadConfig(project, { projectRoot: project, registry: file })).rejects.toThrow(
      /not a directory/i,
    );
  });
});
