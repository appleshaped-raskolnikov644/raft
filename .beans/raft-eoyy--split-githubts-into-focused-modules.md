---
# raft-eoyy
title: Split github.ts into focused modules
status: in-progress
type: task
priority: normal
created_at: 2026-03-16T15:41:39Z
updated_at: 2026-03-17T05:45:15Z
parent: raft-tlm1
---

github.ts is 469 lines mixing auth, search, details, and review APIs. Split into:
- github-client.ts: runGh, account switching, tryMultiAccountFetch (~100 lines)
- github-search.ts: fetchOpenPRs, fetchAllAccountPRs, parseSearchResults (~120 lines)
- github-details.ts: fetchPRDetails, fetchPRPanelData (~80 lines)
- github-reviews.ts: submitPRReview, replyToReviewComment, postPRComment (~60 lines)
- github.ts: re-exports everything for backward compat (~10 lines)



---
**In progress:** New API functions added to github.ts (fetchReviewThreads-related, thread resolution). Full barrel re-export split into github-prs.ts, github-reviews.ts, github-auth.ts not yet done.
