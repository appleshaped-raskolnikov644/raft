---
# raft-hvdz
title: PR readiness dashboard and actionable status
status: completed
type: feature
priority: normal
created_at: 2026-03-16T15:52:52Z
updated_at: 2026-03-17T05:44:37Z
parent: raft-65vd
---

The most important unsolved problem: when looking at a PR, the user can't quickly tell if it's ready to merge or if action is needed.

Key questions a reviewer needs answered at a glance:
1. Are there unresolved review comments I need to address?
2. Did someone request changes that I haven't fixed yet?
3. Are CI checks passing, failing, or pending?
4. Are there merge conflicts?
5. Is the PR approved by enough reviewers?
6. Are there conversations I haven't responded to?

Requirements:
- PR status badge/summary at top of preview panel: READY / BLOCKED / NEEDS WORK / WAITING
- Status breakdown showing: approvals count, changes requested, unresolved threads, CI status, conflicts
- In the ls view, show a colored indicator per PR (green=ready, yellow=waiting, red=blocked)
- Fetch CI check status via GitHub API (GET /repos/{owner}/{repo}/commits/{ref}/check-runs)
- Fetch review thread resolution status (resolved vs unresolved)
- Fetch merge conflict status from PR API (mergeable field)
- Consider a dedicated 'Status' tab in the panel showing all of this in detail
- Flash notification when a PR transitions to 'ready' state

This is higher priority than fancy diff viewing because it solves the actual workflow pain: knowing what needs your attention.



---
**Completed:** Merged into raft-96v8. The lifecycle state machine IS the readiness dashboard - each PR gets a state badge showing exactly what action is needed. attentionSort() prioritizes by urgency. StatusView component provides the visual indicator.
