---
# raft-gazn
title: Interactive AI Q&A on code selections
status: todo
type: feature
created_at: 2026-03-16T15:51:58Z
updated_at: 2026-03-16T15:51:58Z
parent: raft-65vd
---

The key differentiator: ability to select code (lines, hunks, or across files) and ask Claude Code questions about it with full PR context. This makes reviewing actually easier than GitHub.

Requirements:
- Line/range selection in diff view (visual highlight, like text selection)
- Press a key (e.g. '?') to open a question prompt about the selected code
- The AI gets the selected code PLUS all other file diffs in the PR as context
- Can ask questions like 'Why was this commented out?', 'What calls this function?', 'Is this safe?'
- AI response appears inline or in a floating panel near the selection
- Support for follow-up questions (conversation mode)
- The AI should be able to cross-reference other files in the PR to answer

Implementation ideas:
- Use OpenTUI's text selection (selectionBg/selectionFg on diff component)
- Use DiffRenderable's highlightLines() to mark selected ranges
- Send selection + all file patches to Claude Code with a focused question prompt
- Stream response back and display progressively

This is the feature that makes raft genuinely better than GitHub's review UI. A reviewer can point at confusing code and get instant, context-aware explanations.
