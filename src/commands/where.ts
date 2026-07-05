import { red } from 'kleur/colors';
import { getSkill } from '../lib/registry.js';
import { loadConfig } from '../lib/config.js';

export async function whereCommand(name: string): Promise<void> {
  const config = await loadConfig();
  const skill = await getSkill(config.registry, name);
  if (!skill) {
    console.log(red(`Skill not found in registry: ${name}`));
    process.exitCode = 1;
    return;
  }
  console.log(skill.path);
}
