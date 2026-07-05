import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { initCommand } from '../src/commands/init.js';
import { addCommand } from '../src/commands/add.js';
import { removeCommand } from '../src/commands/remove.js';
import { statusCommand } from '../src/commands/status.js';
import { whereCommand } from '../src/commands/where.js';

let tmp: string;
let registry: string;
let project: string;
let originalCwd: string;
let envSnapshot: Record<string, string | undefined>;

beforeEach(async () => {
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'skl-e2e-'));
  registry = path.join(tmp, 'registry');
  project = path.join(tmp, 'project');
  await fs.mkdir(registry, { recursive: true });
  await fs.mkdir(project, { recursive: true });
  await fs.writeFile(path.join(project, 'package.json'), '{}', 'utf8');

  for (const name of ['sample-a', 'sample-b']) {
    const dir = path.join(registry, name);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(
      path.join(dir, 'SKILL.md'),
      `---\nname: ${name}\ndescription: ${name}\n---\nOriginal body of ${name}.\n`,
      'utf8',
    );
  }

  envSnapshot = {
    HOME: process.env.HOME,
    SKILLS_REGISTRY: process.env.SKILLS_REGISTRY,
    SKILLS_TARGET: process.env.SKILLS_TARGET,
  };
  process.env.HOME = tmp;
  delete process.env.SKILLS_REGISTRY;
  delete process.env.SKILLS_TARGET;

  originalCwd = process.cwd();
  process.chdir(project);

  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(async () => {
  process.chdir(originalCwd);
  for (const [k, v] of Object.entries(envSnapshot)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  vi.restoreAllMocks();
  await fs.rm(tmp, { recursive: true, force: true });
});

describe('end-to-end: the symlink is the bridge', () => {
  it('init -> add -> edit source -> read through symlink reflects the change', async () => {
    // 1. init writes config
    await initCommand({ registry, target: '.opencode/skills' });
    expect((await fs.stat(path.join(project, '.skillsrc.json'))).isFile()).toBe(true);

    // 2. add creates a real symlink
    await addCommand(['sample-a'], { yes: true });
    const link = path.join(project, '.opencode/skills/sample-a');
    const lstat = await fs.lstat(link);
    expect(lstat.isSymbolicLink()).toBe(true);

    // 3. read through the symlink -> see the original
    const before = await fs.readFile(path.join(link, 'SKILL.md'), 'utf8');
    expect(before).toContain('Original body of sample-a.');

    // 4. edit the source
    const source = path.join(registry, 'sample-a', 'SKILL.md');
    await fs.writeFile(
      source,
      '---\nname: sample-a\ndescription: sample-a\n---\nUpdated body.\n',
      'utf8',
    );

    // 5. read through the symlink again -> the change is visible
    const after = await fs.readFile(path.join(link, 'SKILL.md'), 'utf8');
    expect(after).toContain('Updated body.');
    expect(after).not.toContain('Original body');
  });

  it('removing the symlink leaves the source untouched', async () => {
    await initCommand({ registry, target: '.opencode/skills' });
    await addCommand(['sample-a'], { yes: true });

    const link = path.join(project, '.opencode/skills/sample-a');
    const source = path.join(registry, 'sample-a');

    expect((await fs.lstat(link)).isSymbolicLink()).toBe(true);

    await removeCommand(['sample-a'], { yes: true });
    await expect(fs.lstat(link)).rejects.toThrow();

    // source is still a directory
    const stat = await fs.stat(source);
    expect(stat.isDirectory()).toBe(true);
    const skillMd = await fs.readFile(path.join(source, 'SKILL.md'), 'utf8');
    expect(skillMd).toContain('Original body of sample-a.');
  });

  it('switching target requires re-running add (same registry, new symlink path)', async () => {
    // init for opencode
    await initCommand({ registry, target: '.opencode/skills' });
    await addCommand(['sample-a', 'sample-b'], { yes: true });

    // re-init for claude in the same project
    await initCommand({ registry, target: '.claude/skills' });
    await addCommand(['sample-a'], { yes: true });

    expect(
      (await fs.lstat(path.join(project, '.opencode/skills/sample-a'))).isSymbolicLink(),
    ).toBe(true);
    expect(
      (await fs.lstat(path.join(project, '.claude/skills/sample-a'))).isSymbolicLink(),
    ).toBe(true);
    // sample-b is only in the opencode target
    expect(
      (await fs.lstat(path.join(project, '.opencode/skills/sample-b'))).isSymbolicLink(),
    ).toBe(true);
    await expect(fs.lstat(path.join(project, '.claude/skills/sample-b'))).rejects.toThrow();
  });

  it('status reflects broken symlinks after the source is removed', async () => {
    await initCommand({ registry, target: '.opencode/skills' });
    await addCommand(['sample-a'], { yes: true });

    // Yank the source out from under the symlink
    await fs.rm(path.join(registry, 'sample-a'), { recursive: true, force: true });

    let output = '';
    const log = vi
      .spyOn(console, 'log')
      .mockImplementation((...args) => {
        output += args.map((a) => (typeof a === 'string' ? a : String(a))).join(' ');
      });
    await statusCommand({ json: true });
    log.mockRestore();

    const parsed = JSON.parse(output) as {
      counts: { total: number; linked: number; orphanBroken: number };
      orphanBroken: string[];
    };
    expect(parsed.counts.total).toBe(1); // sample-b still in registry
    expect(parsed.counts.linked).toBe(0);
    expect(parsed.counts.orphanBroken).toBe(1); // sample-a's symlink is dangling
    expect(parsed.orphanBroken).toContain('sample-a');
  });

  it('where points at the real source on disk', async () => {
    await initCommand({ registry, target: '.opencode/skills' });
    let output = '';
    const log = vi
      .spyOn(console, 'log')
      .mockImplementation((...args) => {
        output += args.map((a) => (typeof a === 'string' ? a : String(a))).join('\n');
      });
    await whereCommand('sample-a');
    log.mockRestore();

    const expected = path.join(registry, 'sample-a');
    expect(output).toContain(expected);
    // The reported path is a real directory on disk
    const stat = await fs.stat(output.trim());
    expect(stat.isDirectory()).toBe(true);
  });
});
