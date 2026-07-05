import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs, symlinkSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {
  createSymlink,
  removeSymlink,
  checkStatus,
  ensureDir,
} from '../src/lib/symlink.js';

let tmp: string;
let registry: string;
let project: string;

beforeEach(async () => {
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'skl-sym-'));
  registry = path.join(tmp, 'registry');
  project = path.join(tmp, 'project');
  await fs.mkdir(registry, { recursive: true });
  await fs.mkdir(project, { recursive: true });

  for (const name of ['alpha', 'beta']) {
    const dir = path.join(registry, name);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, 'SKILL.md'), `body of ${name}\n`, 'utf8');
  }
});

afterEach(async () => {
  await fs.rm(tmp, { recursive: true, force: true });
});

describe('createSymlink', () => {
  it('creates a symlink and reports it as linked', () => {
    const target = path.join(project, 'alpha');
    const result = createSymlink(target, path.join(registry, 'alpha'));
    expect(result.kind).toBe('created');
    expect(checkStatus(target)).toBe('linked');
  });

  it('refuses to clobber a real directory without --force', async () => {
    const target = path.join(project, 'alpha');
    await fs.mkdir(target, { recursive: true });
    await fs.writeFile(path.join(target, 'SKILL.md'), 'x', 'utf8');
    expect(() => createSymlink(target, path.join(registry, 'alpha'))).toThrow(/Refusing to clobber/);
  });

  it('replaces a real directory with --force', async () => {
    const target = path.join(project, 'alpha');
    await fs.mkdir(target, { recursive: true });
    await fs.writeFile(path.join(target, 'SKILL.md'), 'x', 'utf8');
    const result = createSymlink(target, path.join(registry, 'alpha'), { force: true });
    expect(result.kind).toBe('created');
    expect(checkStatus(target)).toBe('linked');
  });

  it('refuses to clobber a regular file without --force', async () => {
    const target = path.join(project, 'alpha');
    await fs.writeFile(target, 'x', 'utf8');
    expect(() => createSymlink(target, path.join(registry, 'alpha'))).toThrow(/Refusing to clobber/);
  });

  it('returns exists when the symlink is already in place', () => {
    const target = path.join(project, 'alpha');
    createSymlink(target, path.join(registry, 'alpha'));
    const second = createSymlink(target, path.join(registry, 'alpha'));
    expect(second.kind).toBe('exists');
  });
});

describe('checkStatus', () => {
  it('reports not-linked when path is absent', () => {
    expect(checkStatus(path.join(project, 'nope'))).toBe('not-linked');
  });

  it('reports not-linked for a real directory', async () => {
    const dir = path.join(project, 'real');
    await fs.mkdir(dir, { recursive: true });
    expect(checkStatus(dir)).toBe('not-linked');
  });

  it('reports broken when the symlink target is gone', () => {
    const link = path.join(project, 'dangling');
    symlinkSync(path.join(registry, 'does-not-exist'), link, 'dir');
    expect(checkStatus(link)).toBe('broken');
  });
});

describe('removeSymlink', () => {
  it('removes a symlink and reports absent afterwards', () => {
    const link = path.join(project, 'alpha');
    createSymlink(link, path.join(registry, 'alpha'));
    const result = removeSymlink(link);
    expect(result.kind).toBe('removed');
    expect(checkStatus(link)).toBe('not-linked');
  });

  it('refuses to remove a non-symlink', async () => {
    const dir = path.join(project, 'real');
    await fs.mkdir(dir, { recursive: true });
    const result = removeSymlink(dir);
    expect(result.kind).toBe('not-symlink');
  });

  it('returns absent when path is gone', () => {
    const result = removeSymlink(path.join(project, 'nope'));
    expect(result.kind).toBe('absent');
  });
});

describe('ensureDir', () => {
  it('is idempotent', async () => {
    const dir = path.join(project, 'nested', 'deep');
    await ensureDir(dir);
    await ensureDir(dir);
    const stat = await fs.stat(dir);
    expect(stat.isDirectory()).toBe(true);
  });
});
