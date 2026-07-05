import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { initCommand } from '../src/commands/init.js';
import { addCommand } from '../src/commands/add.js';
import { removeCommand } from '../src/commands/remove.js';
import { listCommand } from '../src/commands/list.js';
import { statusCommand } from '../src/commands/status.js';
import { whereCommand } from '../src/commands/where.js';

let tmp: string;
let registry: string;
let project: string;
let originalCwd: string;
let originalExitCode: number | undefined;
let logs: string[];

beforeEach(async () => {
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'skl-cmd-'));
  registry = path.join(tmp, 'registry');
  project = path.join(tmp, 'project');
  await fs.mkdir(registry, { recursive: true });
  await fs.mkdir(project, { recursive: true });
  await fs.writeFile(path.join(project, 'package.json'), '{}', 'utf8');

  for (const name of ['alpha', 'beta']) {
    const dir = path.join(registry, name);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(
      path.join(dir, 'SKILL.md'),
      `---\nname: ${name}\ndescription: Skill ${name}\n---\nBody.\n`,
      'utf8',
    );
  }

  const envSnapshot = {
    HOME: process.env.HOME,
    SKILLS_REGISTRY: process.env.SKILLS_REGISTRY,
    SKILLS_TARGET: process.env.SKILLS_TARGET,
  };
  process.env.HOME = tmp; // isolated fake home -> no ~/.skillsrc.json
  delete process.env.SKILLS_REGISTRY;
  delete process.env.SKILLS_TARGET;
  (globalThis as Record<string, unknown>).__envSnapshot = envSnapshot;

  originalCwd = process.cwd();
  process.chdir(project);
  originalExitCode = process.exitCode;
  process.exitCode = 0;

  logs = [];
  vi.spyOn(console, 'log').mockImplementation((...args) => {
    logs.push(args.map((a) => (typeof a === 'string' ? a : String(a))).join(' '));
  });
});

afterEach(async () => {
  process.chdir(originalCwd);
  process.exitCode = originalExitCode;
  vi.restoreAllMocks();
  const snap = (globalThis as Record<string, unknown>).__envSnapshot as
    | Record<string, string | undefined>
    | undefined;
  if (snap) {
    for (const [k, v] of Object.entries(snap)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
  await fs.rm(tmp, { recursive: true, force: true });
});

function findLogJson(prefix: string): unknown {
  const line = logs.find((l) => l.trim().startsWith(prefix));
  if (!line) throw new Error(`No log starting with ${prefix}: ${JSON.stringify(logs)}`);
  return JSON.parse(line);
}

describe('initCommand', () => {
  it('creates .skillsrc.json with the provided flags', async () => {
    await initCommand({ registry, target: '.opencode/skills' });
    const raw = await fs.readFile(path.join(project, '.skillsrc.json'), 'utf8');
    const parsed = JSON.parse(raw) as { registry: string; target: string };
    expect(parsed.registry).toBe(registry);
    expect(parsed.target).toBe('.opencode/skills');
  });

  it('throws in non-tty without --registry or --target', async () => {
    // vitest runs with stdout.isTTY = false
    await expect(initCommand({})).rejects.toThrow(/TTY/);
  });

  it('throws when the registry path does not exist', async () => {
    await expect(
      initCommand({ registry: path.join(tmp, 'no-such'), target: '.opencode/skills' }),
    ).rejects.toThrow(/Registry path does not exist/);
  });
});

describe('addCommand (non-interactive)', () => {
  beforeEach(async () => {
    await initCommand({ registry, target: '.opencode/skills' });
    logs.length = 0; // clear init logs
  });

  it('creates a symlink for a named skill', async () => {
    await addCommand(['alpha'], { yes: true });
    const stat = await fs.lstat(path.join(project, '.opencode/skills/alpha'));
    expect(stat.isSymbolicLink()).toBe(true);
    expect(logs.some((l) => l.includes('+ alpha'))).toBe(true);
  });

  it('creates symlinks for multiple named skills', async () => {
    await addCommand(['alpha', 'beta'], { yes: true });
    const a = await fs.lstat(path.join(project, '.opencode/skills/alpha'));
    const b = await fs.lstat(path.join(project, '.opencode/skills/beta'));
    expect(a.isSymbolicLink()).toBe(true);
    expect(b.isSymbolicLink()).toBe(true);
  });

  it('reports unknown skills and continues with known ones', async () => {
    await addCommand(['nope', 'alpha'], { yes: true });
    expect(logs.some((l) => l.includes('Unknown skill: nope'))).toBe(true);
    const stat = await fs.lstat(path.join(project, '.opencode/skills/alpha'));
    expect(stat.isSymbolicLink()).toBe(true);
  });

  it('throws in non-tty with no names', async () => {
    await expect(addCommand([], {})).rejects.toThrow(/non-interactive/);
  });

  it('refuses to clobber an existing real directory', async () => {
    const target = path.join(project, '.opencode/skills/alpha');
    await fs.mkdir(path.join(project, '.opencode/skills'), { recursive: true });
    await fs.mkdir(target, { recursive: true });
    await fs.writeFile(path.join(target, 'SKILL.md'), 'x', 'utf8');
    await expect(addCommand(['alpha'], { yes: true })).rejects.toThrow(/Refusing to clobber/);
  });
});

describe('removeCommand (non-interactive)', () => {
  beforeEach(async () => {
    await initCommand({ registry, target: '.opencode/skills' });
    await addCommand(['alpha'], { yes: true });
    logs.length = 0;
  });

  it('removes a symlink', async () => {
    const link = path.join(project, '.opencode/skills/alpha');
    expect((await fs.lstat(link)).isSymbolicLink()).toBe(true);
    await removeCommand(['alpha'], { yes: true });
    await expect(fs.lstat(link)).rejects.toThrow();
    expect(logs.some((l) => l.includes('- alpha'))).toBe(true);
  });

  it('reports unknown skills', async () => {
    await removeCommand(['nope'], { yes: true });
    expect(logs.some((l) => l.includes('Unknown skill: nope'))).toBe(true);
  });

  it('skips skills that are not currently linked', async () => {
    await removeCommand(['beta'], { yes: true }); // never added
    expect(logs.some((l) => l.includes('not linked'))).toBe(true);
  });

  it('throws in non-tty with no names', async () => {
    await expect(removeCommand([], {})).rejects.toThrow(/non-interactive/);
  });
});

describe('listCommand', () => {
  beforeEach(async () => {
    await initCommand({ registry, target: '.opencode/skills' });
    logs.length = 0;
  });

  it('outputs all skills as JSON when --json is set', async () => {
    await listCommand({ json: true });
    const parsed = findLogJson('[') as Array<{ name: string; status: string }>;
    expect(parsed).toHaveLength(2);
    expect(parsed.map((s) => s.name).sort()).toEqual(['alpha', 'beta']);
    expect(parsed.every((s) => s.status === 'not-linked')).toBe(true);
  });

  it('filters to linked-only when --linked is set', async () => {
    await addCommand(['alpha'], { yes: true });
    logs.length = 0;
    await listCommand({ json: true, linked: true });
    const parsed = findLogJson('[') as Array<{ name: string; status: string }>;
    expect(parsed).toHaveLength(1);
    expect(parsed[0]?.name).toBe('alpha');
    expect(parsed[0]?.status).toBe('linked');
  });

  it('returns a friendly message when --linked filter is empty', async () => {
    await listCommand({ linked: true });
    expect(logs.some((l) => /No skills are currently linked/.test(l))).toBe(true);
  });
});

describe('statusCommand', () => {
  beforeEach(async () => {
    await initCommand({ registry, target: '.opencode/skills' });
    logs.length = 0;
  });

  it('reports zero linked at start', async () => {
    await statusCommand({ json: true });
    const parsed = findLogJson('{') as { counts: { total: number; linked: number } };
    expect(parsed.counts.total).toBe(2);
    expect(parsed.counts.linked).toBe(0);
  });

  it('detects orphan broken symlinks when source is removed', async () => {
    await addCommand(['alpha'], { yes: true });
    await fs.rm(path.join(registry, 'alpha'), { recursive: true, force: true });
    logs.length = 0;
    await statusCommand({ json: true });
    const parsed = findLogJson('{') as {
      counts: { orphanBroken: number };
      orphanBroken: string[];
    };
    expect(parsed.counts.orphanBroken).toBe(1);
    expect(parsed.orphanBroken).toContain('alpha');
  });
});

describe('whereCommand', () => {
  beforeEach(async () => {
    await initCommand({ registry, target: '.opencode/skills' });
    logs.length = 0;
  });

  it('prints the absolute path for a known skill', async () => {
    await whereCommand('alpha');
    const combined = logs.join('\n');
    expect(combined).toContain(path.join(registry, 'alpha'));
  });

  it('exits non-zero and prints an error for unknown skills', async () => {
    await whereCommand('nope');
    expect(logs.some((l) => /not found/i.test(l))).toBe(true);
    expect(process.exitCode).toBe(1);
  });
});
