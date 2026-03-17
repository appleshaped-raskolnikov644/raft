---
# raft-muvz
title: Extract shared utilities (git-utils, panel hook, constants)
status: completed
type: task
priority: normal
created_at: 2026-03-16T15:41:17Z
updated_at: 2026-03-17T05:44:28Z
parent: raft-tlm1
---

Extract utilities duplicated across commands:
- git-utils.ts: runGit (from nav.tsx), runGhMerge (from merge.tsx)
- usePanel hook: panel state management duplicated in ls.tsx and stack.tsx (panelOpen, panelTab, panelData, panelLoading, splitRatio, panelFullscreen, fetch logic, keyboard handling)
- constants.ts: shared color codes (#7aa2f7, #9ece6a, etc.), magic numbers (header height 9, list offset 7)

This must be done FIRST since other refactors depend on these shared pieces.



---
**Completed:** Created src/lib/process.ts (safeSpawn), src/lib/git-utils.ts (runGhMerge, checkPRCIStatus, runGit), src/lib/constants.ts (COLORS, SORT_MODES, DENSITY_LEVELS), src/hooks/usePanel.ts (usePanel hook). merge.tsx, nav.tsx, stack.tsx, sync.tsx all deduplicated to use shared utils.
