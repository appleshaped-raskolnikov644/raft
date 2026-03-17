---
# raft-ah4r
title: PR stacking integration needs clear place in workflow
status: todo
type: feature
priority: normal
created_at: 2026-03-17T15:57:12Z
updated_at: 2026-03-17T15:57:12Z
---

PR stacking (detecting stacks, sync, rebase, bottom-up merge) exists in the codebase but it's unclear where and how it integrates into the daily workflow. Questions: Where do stacks show up in raft ls? What stack actions are available? How does stacking interact with lifecycle states? Is raft stack separate or integrated into raft ls? Existing infra: src/lib/stack.ts, src/commands/stack.tsx, src/commands/sync.tsx, src/lib/grouping.ts.
