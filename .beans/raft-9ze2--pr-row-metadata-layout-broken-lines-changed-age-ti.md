---
# raft-9ze2
title: PR row metadata layout broken (lines changed, age, title)
status: todo
type: bug
priority: high
created_at: 2026-03-17T15:57:12Z
updated_at: 2026-03-17T15:57:12Z
---

The line additions/deletions (+/-), full title, and age should all be visible in a coherent layout. Right now the metadata is either missing, overlapping, or unreadable. Each PR row should clearly show: full title, +N -M lines changed, and age.
