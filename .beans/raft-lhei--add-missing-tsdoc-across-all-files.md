---
# raft-lhei
title: Add missing TSDoc across all files
status: todo
type: task
priority: normal
created_at: 2026-03-16T15:41:39Z
updated_at: 2026-03-17T05:45:15Z
parent: raft-tlm1
---

Systematic pass to add TSDoc/JSDoc to all exported functions, types, interfaces, and components. Focus on:
- All github.ts functions (especially tryMultiAccountFetch, fetchAllAccountPRs)
- All command component props interfaces
- All helper functions in format.ts, grouping.ts, stack.ts
- All component props interfaces



---
**Not started.** New files (process.ts, git-utils.ts, constants.ts, pr-lifecycle.ts, review-threads.ts, ai-fix.ts, ai-qa.ts, ai-review-scan.ts, review-session.ts, theme.ts) already have TSDoc. Existing files still need a sweep.
