# raft v2 Features

## 1. raft log - Visual stack graph

Show stacks as an ASCII tree. When inside a repo, show that repo's stacks.
When not in a repo, show all stacks across all repos.

```
thirdear-ai/thirdear-webapp
  ● main
  ├── #703 feat(analytics): add WebEngage SDK        OPEN   2d
  │   └── #704 refactor(analytics): migrate events   OPEN   2d
  ├── #643 tooling: replace ESLint with Biome        OPEN   3w
  │   └── #645 tooling: add Vitest                   OPEN   3w
  └── #718 fix(og): move OG meta to page-level       OPEN   1w
```

Interactive: j/k to navigate, Enter to open in browser, q to quit.

## 2. raft merge - Merge a stack bottom-up

Merges PRs in a stack from bottom to top. For each PR:
1. Check CI status (wait if pending)
2. Merge via gh pr merge
3. Move to next PR up

Usage: raft merge (from current repo) or raft merge --repo=owner/repo

## 3. raft sync - Cleanup and sync

1. Fetch latest from remote
2. Detect merged/closed PRs
3. Offer to delete local branches for merged PRs
4. Update stack numbering for remaining stacks

## 4. raft create - Create stacked branch

Create a new branch on top of the current branch and commit staged changes.
Usage: raft create <name> -m "message"

## 5. raft up / raft down - Navigate stack

Check out the parent (down) or child (up) branch in the current stack.

## 6. raft restack - Rebase stack

Rebase each branch in the current stack onto its parent, ensuring
the commit history is clean.
