---
# raft-96v8
title: PR lifecycle state machine and workflow tracking
status: completed
type: feature
priority: normal
created_at: 2026-03-16T15:53:56Z
updated_at: 2026-03-17T05:44:37Z
parent: raft-65vd
---

Track each PR through its actual lifecycle states and surface what action is needed next. Based on Octavian's real workflow:

## PR Lifecycle States
1. DRAFTING - PR is still in draft, not ready for any review
2. AI_REVIEW - Greptile/AI review loop is running (greploop). Has unresolved AI comments being fixed.
3. READY_FOR_HUMANS - AI loop is clean, needs to ping reviewers
4. AWAITING_REVIEW - Human reviewers have been pinged, waiting for their response
5. CHANGES_REQUESTED - Human reviewer requested changes, need to fix
6. APPROVED - Has required approvals, CI passing, ready to merge
7. BLOCKED - Merge conflicts, CI failing, or other blockers

## Requirements
- Auto-detect state from GitHub API data: draft status, review states, CI checks, comment threads
- Show state prominently in PR list (colored badge: AI_REVIEW=blue, AWAITING=yellow, APPROVED=green, BLOCKED=red)
- Show state in panel header
- When state is READY_FOR_HUMANS, prompt/remind to ping reviewers
- When state is CHANGES_REQUESTED, show what needs fixing (link to unresolved threads)
- When state is APPROVED, show merge button/keybind prominently
- Consider auto-detecting greploop state (check if there are recent bot comments being resolved)
- Track state transitions over time (e.g. 'has been AWAITING_REVIEW for 3 days')

## Detection Logic
- DRAFTING: pr.isDraft === true
- AI_REVIEW: has unresolved bot/Greptile comments AND no human approvals yet
- READY_FOR_HUMANS: no unresolved threads, CI passing, no human reviews yet
- AWAITING_REVIEW: has been reviewed by bot only, no human review events
- CHANGES_REQUESTED: latest human review is CHANGES_REQUESTED
- APPROVED: has required human approvals, CI passing, no unresolved threads
- BLOCKED: CI failing OR merge conflicts OR unresolved threads with changes requested

This is the highest-value feature for raft because it eliminates the mental overhead of tracking PR states across repos.



---
**Completed:** src/lib/pr-lifecycle.ts implements 8-state machine (MERGE_NOW, FIX_REVIEW, FIX_CI, PING_REVIEWERS, WAITING, AI_REVIEW, DRAFT, BLOCKED). Includes inferLifecycleState(), attentionSort(), getActionHint(), urgencyLevel(). StatusView component renders badges. ls.tsx wired with m/F/P keybinds for lifecycle actions. Tests in pr-lifecycle.test.ts.
