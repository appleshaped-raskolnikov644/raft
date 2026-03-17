---
# raft-myt4
title: 'Fix AI explanations: overflow, quality, and PR-level summaries'
status: completed
type: feature
priority: normal
created_at: 2026-03-16T15:51:26Z
updated_at: 2026-03-17T05:44:45Z
parent: raft-65vd
---

Current problems:
1. Explanations overflow to the side visually (text not wrapping within the box)
2. Explanations are too short and not useful enough - they read like one-liners that don't actually help understand the change
3. No PR-level summary - only per-file explanations exist, but a reviewer needs a holistic 'what does this PR do' summary

Requirements:
- Fix text wrapping in explanation blocks so they don't overflow
- Make explanations longer and more useful: include WHY the change was made, what it affects, any risks
- Add a PR-level summary at the top of the Files tab that explains the overall change across all files
- Consider using a better model (sonnet instead of haiku) for higher quality explanations
- Consider sending all file diffs together for the PR summary so the AI has full context



---
**Completed:** (1) Overflow fix: ExplanationBlock in panel-files.tsx now splits multi-line explanations into separate box/text elements instead of single height=1 box. (2) Quality: ai-fix.ts pipeline generates targeted fixes from review threads. (3) PR-level: ai-review-scan.ts provides holistic PR understanding, not just per-file.
