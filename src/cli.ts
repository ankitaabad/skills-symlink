#!/usr/bin/env node
import { Command } from 'commander';
import { red, gray } from 'kleur/colors';
import { initCommand } from './commands/init.js';
import { addCommand } from './commands/add.js';
import { removeCommand } from './commands/remove.js';
import { listCommand } from './commands/list.js';
import { searchCommand } from './commands/search.js';
import { editCommand } from './commands/edit.js';
import { statusCommand } from './commands/status.js';
import { whereCommand } from './commands/where.js';

const program = new Command();

program
  .name('skl')
  .description('Manage a central skills registry and symlink a subset into the current project.')
  .version('0.1.0')
  .showHelpAfterError()
  .configureOutput({
    writeOut: (str) => process.stdout.write(str),
    writeErr: (str) => process.stderr.write(red(str)),
  });

program
  .command('init')
  .description('Create a .skillsrc.json for this project.')
  .option('-r, --registry <path>', 'Path to the skills registry')
  .option('-t, --target <dir>', 'Target dir for symlinks (relative to project root)')
  .option('-g, --global', 'Write config to a global location instead of project root')
  .action(initCommand);

program
  .command('add [names...]')
  .description('Add skill symlinks. With no names, opens an interactive picker.')
  .option('-i, --interactive', 'Force interactive picker even when names are given')
  .option('-f, --force', 'Replace existing non-symlink entries')
  .option('-y, --yes', 'Skip removal confirmations')
  .action(addCommand);

program
  .command('remove [names...]')
  .alias('rm')
  .description('Remove skill symlinks. With no names, opens an interactive picker.')
  .option('-i, --interactive', 'Force interactive picker even when names are given')
  .option('-y, --yes', 'Skip confirmation')
  .action(removeCommand);

program
  .command('list')
  .alias('ls')
  .description('List skills in the registry with their link status.')
  .option('-j, --json', 'Output as JSON')
  .option('-l, --linked', 'Show only currently linked skills')
  .option('-i, --interactive', 'Open a multi-select picker to add/remove')
  .option('-f, --force', 'Replace existing non-symlink entries (used with -i)')
  .action(listCommand);

program
  .command('search <query>')
  .description('Search skills by name, description, and SKILL.md content.')
  .option('-b, --body', 'Also search inside SKILL.md bodies (slower)')
  .option('-i, --interactive', 'After results, open a multi-select to add')
  .action(searchCommand);

program
  .command('edit [name]')
  .description("Open a skill's SKILL.md in $EDITOR (falls back to code/cursor/vim/nano).")
  .option('-e, --editor <cmd>', 'Editor to use (overrides $EDITOR)')
  .action(editCommand);

program
  .command('status')
  .description('Show registry, target, and link counts.')
  .option('-j, --json', 'Output as JSON')
  .action(statusCommand);

program
  .command('where <name>')
  .description('Print the absolute path of a skill in the registry.')
  .action(whereCommand);

async function main() {
  try {
    await program.parseAsync(process.argv);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(red(`error: ${message}`));
    process.exitCode = 1;
  }
}

process.on('SIGINT', () => {
  console.error(gray('\nAborted.'));
  process.exit(130);
});

void main();
