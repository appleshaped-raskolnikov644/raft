---
# raft-oqla
title: Collapsible unchanged code regions in diffs
status: todo
type: feature
created_at: 2026-03-16T15:51:45Z
updated_at: 2026-03-16T15:51:45Z
parent: raft-65vd
---

Currently all context lines are shown in full, making it hard to find actual changes in large files. GitHub and most diff tools collapse unchanged regions.

Requirements:
- Collapse unchanged code regions between hunks (show '... N lines hidden ...' placeholder)
- Click or press key to expand collapsed regions
- Keep N lines of context around each change (configurable, default 3)
- Consider OpenTUI's diff component context prop if it supports this natively
- Collapsing should make it much faster to scan through large diffs and focus on what changed
