# raft

A terminal UI for managing GitHub pull requests and stacked PRs. Built with [OpenTUI](https://github.com/anomalyco/opentui) and Bun.

```
raft ls
```

```
  raft                                    94 PRs  sort: Repo
  All (94)  Open (50)  Draft (44)
  ▸ ● #24   ai-nexus           feat(ui): add AccessRequestBanner…          0d
    ● #7    ai-agent-workflow   Add dynamic resource fetching…              6d
    ● #8    ai-agent-workflow   Implement Multi-Source Research…            6d
    ○ #1    esther-and-me-book  Add configurable drop-cap styling…          2w
    ● #743  thirdear-webapp     feat(extension-handoff): add Chrome…        2d
    ● #718  thirdear-webapp     fix(og): move OG meta to page-level…       1w
    ○ #545  ThirdEar-CE         feat(message_listener): centralize…        3d
  ┌──────────────────────────────────────────────────────────────────────┐
  │ OctavianTocan/ai-nexus #24                                          │
  │ feat(ui): add AccessRequestBanner component with animated expand…   │
  │ https://github.com/OctavianTocan/ai-nexus/pull/24                   │
  │ Enter: open  c: copy  /: search  r: repo  s: sort  Tab: status     │
  └──────────────────────────────────────────────────────────────────────┘
```

## Features

**Browse PRs** across all your GitHub accounts in one interactive list. Filter by status, repo, or search. Sort by repo, number, title, age, or status.

**Stacked PRs** without Graphite. Detect PR chains, rename them `[1/N]`, `[2/N]`, and add navigation comments linking each PR to the rest of the stack.

**Merge stacks** bottom-up with CI checks. Navigate up and down within stacks. Rebase entire stacks with one command.

**Multi-account support.** If you have multiple `gh` accounts (personal + work), raft fetches PRs from all of them automatically.

## Install

Requires [Bun](https://bun.sh) and [gh CLI](https://cli.github.com).

```bash
git clone https://github.com/OctavianTocan/pr-cli.git
cd pr-cli
bun install
bun link
```

Now `raft` is available globally.

## Commands

### Browsing

```bash
raft                      # Interactive home screen
raft ls                   # List all your open PRs
raft ls --repo=webapp     # Filter by repo substring
raft ls --author=someone  # PRs by a specific author
raft log                  # Visual stack graph (ASCII tree)
```

### Stack Management

```bash
raft stack                # Show detected stacks
raft stack sync           # Rename PRs [1/N] and add nav comments
raft merge                # Merge a stack bottom-up
```

### Git Workflow

```bash
raft create feature-x -m "Add feature X"   # Create stacked branch
raft up                                     # Checkout child branch
raft down                                   # Checkout parent branch
raft restack                                # Rebase stack onto parents
```

### Maintenance

```bash
raft sync                 # Delete merged branches
raft --help               # Full command reference
```

## Keyboard Shortcuts (raft ls)

| Key | Action |
|-----|--------|
| `j` / `Down` | Move selection down |
| `k` / `Up` | Move selection up |
| `Enter` | Open PR in browser |
| `c` | Copy PR URL |
| `/` | Search (title, repo, PR#) |
| `Tab` | Cycle status filter (All / Open / Draft) |
| `r` | Cycle repo filter |
| `s` | Cycle sort mode |
| `Escape` | Clear filter / quit |
| `q` | Quit |
| `Ctrl+C` | Force quit |

## How Stacks Work

raft detects stacks by analyzing branch targets. If PR #2's branch targets PR #1's branch (instead of main), they form a stack:

```
● main
├── #703 feat(analytics): add WebEngage SDK         [1/2]
│   └── #704 refactor(analytics): migrate events    [2/2]
```

`raft stack sync` renames the PR titles with `[1/2]`, `[2/2]` prefixes and posts a navigation comment on each PR:

| | PR | Title |
|---|---|---|
| >> | [#703](…) | **feat(analytics): add WebEngage SDK** |
| | [#704](…) | refactor(analytics): migrate events |

No external service needed. Works with any GitHub repo.

## Multi-Account

raft automatically discovers all `gh` accounts on your machine:

```bash
gh auth status
# github.com: OctavianTocan (active)
# github.com: OctavianTocan-TwinMind
```

`raft ls` fetches PRs from both accounts and deduplicates by URL. Repo-level commands (`raft merge`, `raft log`) try each account until one has access.

## Tech Stack

- **[Bun](https://bun.sh)** - Runtime
- **[OpenTUI](https://github.com/anomalyco/opentui)** - Terminal UI framework (Zig core + React reconciler)
- **[gh CLI](https://cli.github.com)** - GitHub API access
- **TypeScript** + **React 19**

## Development

```bash
bun run dev          # Watch mode
bun test             # Run tests
bunx tsc --noEmit    # Typecheck
```

## License

MIT
