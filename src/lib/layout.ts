import path from 'node:path';
import { ensureDir } from './symlink.js';

export function resolveTargetPath(projectRoot: string, target: string): string {
  return path.resolve(projectRoot, target);
}

export async function ensureTarget(projectRoot: string, target: string): Promise<string> {
  const resolved = resolveTargetPath(projectRoot, target);
  await ensureDir(resolved);
  return resolved;
}
