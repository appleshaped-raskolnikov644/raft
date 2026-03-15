# pr-cli Design

A TUI tool for viewing and managing GitHub pull requests, built with Bun + OpenTUI React.

## Features

### 1. `pr ls` - List Open PRs

Fetches all open PRs authored by the current user (via `gh` CLI) and displays them in a styled terminal table.

- Columns: PR number (linked), repo, title (truncated 50 chars), description (first line, 80 chars), status (OPEN/DRAFT)
- Sorted by repo name, then PR number ascending
- Optional `--repo=<substring>` filter for case-insensitive repo name matching
- Optional `--author=<username>` override (defaults to authenticated user)

### 2. `pr stack` - Manage Stacked PRs

Detects and manages chains of dependent PRs within a repo, Graphite-style.

**Detection algorithm:**
1. Fetch all open PRs for the current repo (or specified repo)
2. Build a directed graph from `headRefName` -> `baseRefName`
3. Find chains where one PR's base branch = another PR's head branch
4. Order: bottom of stack (targets main/master) = `[1/N]`, next up = `[2/N]`, etc.

**`pr stack`** - Show detected stack(s) for the current repo

**`pr stack sync`** - Apply stack metadata:
- Rename PR titles to `[1/N] Original title`, `[2/N] Original title`, etc.
- Strip existing `[X/Y]` prefix before reapplying (idempotent)
- Post or update a navigation comment on each PR

**Stack comment format:**

```markdown
## Stack

| | PR | Title |
|---|---|---|
| | [#41](link) | Add user model |
| >> | [#42](link) | **Add auth middleware** |
| | [#43](link) | Add login endpoint |
```

The `>>` marker and bold title indicate the current PR. Each PR in the stack gets this comment with its own row highlighted.

## Architecture

```
pr-cli/
  src/
    index.tsx          # Entry point, arg parsing, route to command
    commands/
      ls.tsx           # PR list TUI view
      stack.tsx        # Stack management TUI view
    lib/
      github.ts        # gh CLI wrapper (fetch PRs, update titles, post comments)
      stack.ts         # Stack detection + ordering logic
    components/
      table.tsx        # Reusable PR table component
  package.json
  tsconfig.json
  bunfig.toml
```

## Technical Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Framework | OpenTUI React | Declarative UI, JSX components, familiar patterns |
| Runtime | Bun | Required by OpenTUI |
| GitHub interaction | `gh` CLI via `Bun.spawn` | No token management, reuses existing auth |
| Stack detection | Branch target chain analysis | Uses `baseRefName`/`headRefName` from gh API |
| Comment tracking | Hidden HTML comment marker | `<!-- pr-cli-stack -->` to find/update existing comments |

## CLI Interface

```bash
pr ls                    # List all open PRs
pr ls --repo=web         # Filter by repo substring
pr ls --author=someone   # Override author

pr stack                 # Show detected stacks in current repo
pr stack sync            # Rename titles + update navigation comments
```

## Constraints

- Read-only by default (`ls`). Only `stack sync` modifies anything.
- Uses only `gh` CLI, no direct API tokens needed.
- Idempotent: running `stack sync` multiple times produces the same result.
