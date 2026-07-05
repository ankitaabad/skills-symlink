import { promises as fs, lstatSync, readlinkSync, statSync, symlinkSync, unlinkSync, rmSync } from 'node:fs';
import path from 'node:path';
import type { SymlinkStatus } from '../types.js';

export type CreateSymlinkOptions = {
  force?: boolean;
};

export type CreateSymlinkResult =
  | { kind: 'created'; linkPath: string; target: string }
  | { kind: 'exists' };

export async function ensureDir(dir: string): Promise<void> {
  await fs.mkdir(dir, { recursive: true });
}

export function checkStatus(linkPath: string): SymlinkStatus {
  let stat;
  try {
    stat = lstatSync(linkPath);
  } catch {
    return 'not-linked';
  }
  if (!stat.isSymbolicLink()) return 'not-linked';
  try {
    const target = readlinkSync(linkPath);
    const resolved = path.resolve(path.dirname(linkPath), target);
    statSync(resolved);
    return 'linked';
  } catch {
    return 'broken';
  }
}

export function createSymlink(
  linkPath: string,
  target: string,
  options: CreateSymlinkOptions = {},
): CreateSymlinkResult {
  const absLink = path.resolve(linkPath);
  const absTarget = path.resolve(target);

  let existing;
  try {
    existing = lstatSync(absLink);
  } catch {
    existing = null;
  }

  if (existing) {
    if (existing.isSymbolicLink()) {
      return { kind: 'exists' };
    }
    if (!options.force) {
      throw new Error(
        `Refusing to clobber existing entry at ${absLink}.\n` +
          `  It is not a symlink. Remove it manually or pass --force.`,
      );
    }
    if (existing.isDirectory()) {
      rmSync(absLink, { recursive: true, force: true });
    } else {
      unlinkSync(absLink);
    }
  }

  symlinkSync(absTarget, absLink, 'dir');
  return { kind: 'created', linkPath: absLink, target: absTarget };
}

export function removeSymlink(
  linkPath: string,
): { kind: 'removed' } | { kind: 'absent' } | { kind: 'not-symlink' } {
  const abs = path.resolve(linkPath);
  let stat;
  try {
    stat = lstatSync(abs);
  } catch {
    return { kind: 'absent' };
  }
  if (!stat.isSymbolicLink()) {
    return { kind: 'not-symlink' };
  }
  unlinkSync(abs);
  return { kind: 'removed' };
}
