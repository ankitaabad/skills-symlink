import { promises as fs } from 'node:fs';
import path from 'node:path';
import { red, green, gray, bold } from 'kleur/colors';
import { loadConfig } from '../lib/config.js';
import { listSkills } from '../lib/registry.js';
import { checkStatus } from '../lib/symlink.js';
import { ensureTarget } from '../lib/layout.js';
import type { SymlinkStatus } from '../types.js';

export type StatusOptions = {
  json?: boolean;
};

type TargetEntry = {
  name: string;
  status: SymlinkStatus;
  orphan: boolean;
};

async function readTargetEntries(targetDir: string): Promise<TargetEntry[]> {
  let entries: string[];
  try {
    entries = await fs.readdir(targetDir);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw err;
  }
  const out: TargetEntry[] = [];
  for (const entry of entries) {
    if (entry.startsWith('.')) continue;
    const linkPath = path.join(targetDir, entry);
    const status = checkStatus(linkPath);
    if (status === 'not-linked') continue; // skip plain dirs/files that aren't ours
    out.push({ name: entry, status, orphan: false });
  }
  return out;
}

export async function statusCommand(opts: StatusOptions): Promise<void> {
  const config = await loadConfig();
  const skills = await listSkills(config.registry);
  const targetDir = await ensureTarget(config.projectRoot, config.target);
  const targetEntries = await readTargetEntries(targetDir);

  const knownNames = new Set(skills.map((s) => s.name));

  let linked = 0;
  let broken = 0;
  let orphanLinked = 0;
  let orphanBroken = 0;
  const brokenNames: string[] = [];
  const orphanLinkedNames: string[] = [];
  const orphanBrokenNames: string[] = [];

  // Mark orphans: target entries that aren't in the registry
  for (const entry of targetEntries) {
    entry.orphan = !knownNames.has(entry.name);
  }

  // Categorize each target entry
  for (const entry of targetEntries) {
    if (entry.orphan) {
      if (entry.status === 'linked') {
        orphanLinked++;
        orphanLinkedNames.push(entry.name);
      } else if (entry.status === 'broken') {
        orphanBroken++;
        orphanBrokenNames.push(entry.name);
      }
      continue;
    }
    if (entry.status === 'linked') linked++;
    if (entry.status === 'broken') {
      broken++;
      brokenNames.push(entry.name);
    }
  }

  const report = {
    registry: config.registry,
    target: config.target,
    projectRoot: config.projectRoot,
    configPath: config.configPath,
    counts: {
      total: skills.length,
      linked,
      broken,
      notLinked: Math.max(0, skills.length - linked - broken),
      orphanLinked,
      orphanBroken,
    },
    broken: brokenNames,
    orphanLinked: orphanLinkedNames,
    orphanBroken: orphanBrokenNames,
  };

  if (opts.json) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  console.log(bold('Skills registry'));
  console.log(`  ${gray('registry')}  ${config.registry}`);
  console.log(`  ${gray('target')}    ${path.relative(config.projectRoot, targetDir) || targetDir}`);
  console.log(`  ${gray('project')}   ${config.projectRoot}`);
  console.log(`  ${gray('config')}    ${config.configPath ?? gray('(none, using env/default)')}`);
  console.log();
  console.log(bold('Counts'));
  console.log(`  ${gray('total')}     ${skills.length}`);
  console.log(`  ${green('linked')}    ${linked}`);
  if (broken > 0) console.log(`  ${red('broken')}    ${broken}`);
  if (orphanLinked > 0) console.log(`  ${gray('orphan')}    ${orphanLinked}`);
  if (orphanBroken > 0) console.log(`  ${red('orphan!')}   ${orphanBroken}`);
  console.log(`  ${gray('unlinked')}  ${Math.max(0, skills.length - linked - broken)}`);

  if (brokenNames.length > 0) {
    console.log();
    console.log(red('Broken symlinks (source no longer in registry):'));
    for (const n of brokenNames) console.log(`  - ${n}`);
    console.log(gray('  Clean up: skl remove ' + brokenNames.join(' ')));
  }
  if (orphanLinkedNames.length > 0) {
    console.log();
    console.log(gray('Orphan symlinks (linked but not in registry):'));
    for (const n of orphanLinkedNames) console.log(`  - ${n}`);
  }
  if (orphanBrokenNames.length > 0) {
    console.log();
    console.log(red('Orphan broken symlinks (not in registry, target gone):'));
    for (const n of orphanBrokenNames) console.log(`  - ${n}`);
    console.log(gray('  Clean up: skl remove ' + orphanBrokenNames.join(' ')));
  }
}
