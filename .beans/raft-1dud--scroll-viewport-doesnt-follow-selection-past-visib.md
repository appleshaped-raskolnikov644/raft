---
# raft-1dud
title: Scroll viewport doesn't follow selection past visible area
status: todo
type: bug
priority: high
created_at: 2026-03-17T15:57:12Z
updated_at: 2026-03-17T15:57:12Z
---

When scrolling past the last visible PR with j/k, the selected PR moves off-screen. The selection continues to advance but the viewport doesn't scroll to keep it visible. It feels like the viewport is always one or two rows behind the actual selected PR.
