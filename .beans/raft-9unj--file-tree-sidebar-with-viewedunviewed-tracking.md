---
# raft-9unj
title: File tree sidebar with viewed/unviewed tracking
status: todo
type: feature
created_at: 2026-03-16T15:52:11Z
updated_at: 2026-03-16T15:52:11Z
parent: raft-65vd
---

Instead of scrolling through all files linearly, have a collapsible file tree sidebar (like Lumen/Critique) that shows which files you've looked at.

Requirements:
- Hierarchical file tree grouped by directory
- Color-coded by status (added=green, modified=yellow, deleted=red)
- Viewed/unviewed state per file (checkbox or dimming)
- Click or press key to jump to a specific file's diff
- Show file count and progress (e.g. '3/12 files reviewed')
- Consider syncing viewed state with GitHub API (bidirectional, like Lumen)

Reference: Lumen's file sidebar with collapsible directories and viewed-state sync, Critique's DirectoryTreeView component
