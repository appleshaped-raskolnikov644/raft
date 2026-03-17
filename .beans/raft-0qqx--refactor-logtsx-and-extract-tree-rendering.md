---
# raft-0qqx
title: Refactor log.tsx and extract tree rendering
status: in-progress
type: task
priority: normal
created_at: 2026-03-16T15:41:39Z
updated_at: 2026-03-17T05:45:07Z
parent: raft-tlm1
---

log.tsx is 326 lines with tripled load logic. Split into:
- log-container.tsx: state management and fetch (~120 lines)
- log-tree.tsx: tree node building and connector rendering (~80 lines)
- log-loader.ts: deduplicated fetch logic (explicit repo, current repo, all repos) (~70 lines)



---
**In progress:** Architecture designed (log-tree.tsx for TreeRow/RepoHeader/TrunkLine + TreeNode/RenderLine types, log-loader.ts for buildTreeNodes/loadSections/RepoSection). Subagent read all files but was blocked by write permissions. Split still needed.
