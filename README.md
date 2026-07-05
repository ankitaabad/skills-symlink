# skills-symlink

Manage a central **skills** registry (e.g. `~/skills`) and symlink a
subset into any project with a single CLI: **`skl`**.

- One source of truth for your skills — edit once, every project sees it.
- Interactive multi-select picker for adding/removing.
- Search by name, description, or full `SKILL.md` body.
- No sync step, no copies — just symlinks.

```
$ skl
Usage: skl [options] [command]

Manage a central skills registry and symlink a current project.

Commands:
  init                 Create a .skillsrc.json for this project.
  add [names...]       Add skill symlinks. With no names, opens an interactive picker.
  remove|rm [names...] Remove skill symlinks. With no names, opens an interactive picker.
  list|ls              List skills in the registry with their link status.
  search <query>       Search skills by name, description, and SKILL.md content.
  edit [name]          Open a skill's SKILL.md in $EDITOR.
  status               Show registry, target, and link counts.
  where <name>         Print the absolute path of a skill in the registry.
```

## Install

```bash
pnpm add -g skills-symlink
# or: npm i -g skills-symlink
```

Requires Node 20+. The `skl` binary (and alias `skills-symlink`) is added to your `PATH`.

## Quick start

```bash
# 1. Create the registry once (it can already exist with skill subdirs).
mkdir -p ~/skills/mantine
echo "# Mantine" > ~/skills/mantine/SKILL.md

# 2. In any project, initialize the config.
cd ~/code/my-app
skl init
# ? Registry path: ~/skills
# ? Target dir:    .opencode/skills
# ✓ Wrote .skillsrc.json
# ✓ Found 1 skill in registry.

# 3. Open the interactive picker (or pass names).
skl add
#   ☑ mantine  Build React UIs with Mantine.
#   ☐ tdd-review Review code with TDD.
# ↑/↓ to move, space to toggle, enter to confirm
```

After this, `~/code/my-app/.opencode/skills/mantine` is a symlink to the central
copy. Edit it in either place — both views stay in sync.

## Cross-agent usage

The same `~/skills` registry works for any agent that reads
`<dir>/<name>/SKILL.md` files. To use the same skills with **Claude Code** in
the same project, just point the target at Claude's directory:

```bash
cd ~/code/my-app
skl init -r ~/skills -t .claude/skills
skl add
```

Both opencode (`.opencode/skills`) and Claude Code (`.claude/skills`) consume
the exact same file format, so one symlink per skill, one registry, no
duplication.

> **Note:** Cursor (`.cursor/rules/*.mdc`) and Aider (`AGENTS.md`) use a
> different format and aren't supported by `skl` today.

## Versioning your skills

`skl` itself never touches git. But `~/skills` is a great candidate for a
versioned repo so you can sync skills across machines, review changes, and
roll back if a skill breaks.

```bash
cd ~/skills
git init
# ignore editor / OS junk
cat > .gitignore <<'EOF'
.DS_Store
*.swp
.idea/
.vscode/
EOF
git add .
git commit -m "Initial skills registry"
```

Push to a remote (GitHub, GitLab, etc.) and `git clone` it on other machines.
`skl` will work against the clone without modification.

## Commands

### `skl init`

Creates a `.skillsrc.json` in the project root (or walks up to find one).

```bash
skl init                              # interactive
skl init -r ~/skills -t .opencode/skills   # non-interactive
```

If `.skillsrc.json` already exists, you'll be asked to confirm overwriting.

### `skl add [names...]`

```bash
skl add                # interactive picker (default)
skl add mantine        # one skill
skl add mantine tdd    # multiple skills
skl add -f my-skill    # replace an existing real dir/file at the target
skl add -i mantine     # force interactive even when names are given
skl add -y mantine     # skip the removal confirmation
```

In the interactive picker, **unchecking** an already-linked skill schedules it
for removal. Removing symlinks is gated by a confirmation prompt; adding is not.

### `skl remove [names...]` (alias `rm`)

Mirror of `add`. With no names, opens a multi-select picker of currently-linked skills.

```bash
skl remove mantine
skl rm -y mantine tdd-review   # skip confirmation
```

### `skl list` (alias `ls`)

```bash
skl list                # full table
skl list --linked       # only currently linked
skl list --json         # machine-readable
skl list -i             # table + interactive multi-select for add/remove
```

### `skl search <query>`

```bash
skl search mantine             # name + description
skl search -b EXPLAIN          # also grep SKILL.md bodies
skl search -b -i "use prefix"  # body search, then picker to add
```

Uses `rg` (ripgrep) if available; falls back to a plain `fs.readFile` scan.

### `skl edit [name]`

```bash
skl edit mantine               # open with $EDITOR
skl edit --editor code mantine # override
skl edit                       # interactive picker
```

Falls back to `code` → `cursor` → `vim` → `nano` if `$EDITOR`/`$VISUAL` is unset.

### `skl status`

Prints registry, target, and counts. Distinguishes between skills that are in
the registry (linked/broken/unlinked) and **orphan** symlinks in the target
dir whose source is no longer in the registry (e.g. you deleted the source).
Both broken and orphan-broken are listed by name with a fix-it command.

```bash
skl status
skl status --json
```

JSON shape:

```jsonc
{
  "registry": "/Users/you/skills",
  "target": ".opencode/skills",
  "counts": {
    "total": 5,        // skills in registry
    "linked": 3,       // known + symlinked
    "broken": 0,       // known but symlink target gone
    "notLinked": 2,    // known but not symlinked
    "orphanLinked": 0, // symlinked but not in registry
    "orphanBroken": 1  // symlinked but not in registry + target gone
  },
  "broken": [],
  "orphanLinked": [],
  "orphanBroken": ["foo"]
}
```

### `skl where <name>`

Prints the absolute path of a skill in the registry. Useful for shell chains:

```bash
cd "$(skl where mantine)"
```

## Configuration

Resolution order (highest → lowest):

1. CLI flags: `--registry <path>`, `--target <dir>`
2. Project `.skillsrc.json` (walks up to find one)
3. `package.json` `"skills"` key in the project
4. Global `~/.skillsrc.json`
5. Env vars: `SKILLS_REGISTRY`, `SKILLS_TARGET`
6. Built-in default target: `.opencode/skills`

`.skillsrc.json` shape:

```json
{
  "$schema": "https://unpkg.com/skills-symlink/schema.json",
  "registry": "/Users/you/skills",
  "target": ".opencode/skills"
}
```

A skill is any subdirectory of `registry/` that contains a `SKILL.md`. A
frontmatter block is recommended:

```markdown
---
name: mantine
description: Build React UIs with Mantine.
---

# Mantine

Notes go here…
```

`description` is shown in pickers, search results, and tables. The first
non-heading line of the body is used as a fallback.

## Behavior notes

- **Refuses to clobber**: if the target path exists and is *not* a symlink, `add`
  errors out unless you pass `--force`.
- **Broken symlinks**: detected and listed by `status`. Fix with `skl add -f <name>`.
- **Removing is gated by confirmation** in the interactive picker; adding is not.
- **Non-TTY safety**: `add`/`remove`/`edit` with no names in a non-interactive
  shell exit with a clear usage error instead of hanging.
- **Windows**: symlinks require admin or developer mode. Junctions are not yet
  used; contributions welcome.

## Development

```bash
pnpm install
pnpm run build
pnpm test
pnpm run dev -- --help   # run src directly via tsx
```

## License

MIT
