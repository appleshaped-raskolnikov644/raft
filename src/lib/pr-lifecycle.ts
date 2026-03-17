/**
 * PR lifecycle state machine with urgency-based scoring.
 *
 * Assigns each PR a lifecycle state based on GitHub data (draft status,
 * reviews, CI checks, thread resolution) and computes an urgency score
 * that determines attention-based sort order. Higher urgency = needs
 * action sooner.
 *
 * States map to Octavian's actual PR workflow:
 * 1. DRAFTING -> AI_REVIEW -> PING_REVIEWERS -> AWAITING_REVIEW
 * 2. AWAITING_REVIEW -> CHANGES_REQUESTED -> (fix) -> AWAITING_REVIEW
 * 3. AWAITING_REVIEW -> APPROVED -> MERGE_NOW
 * At any point: FIX_CI or RESOLVE_CONFLICTS can block progress.
 */

import type { PRDetails, Review } from "./types"

/** All possible lifecycle states for a PR. */
export type PRLifecycleState =
  | "MERGE_NOW"
  | "FIX_REVIEW"
  | "PING_REVIEWERS"
  | "FIX_CI"
  | "RESOLVE_CONFLICTS"
  | "AI_REVIEW"
  | "WAITING"
  | "DRAFT"

/** Display metadata for each lifecycle state. */
export interface StateInfo {
  state: PRLifecycleState
  /** Urgency score (0-100) for attention-based sorting. Higher = more urgent. */
  urgency: number
  /** Short label shown in the PR list badge. */
  label: string
  /** Color for the badge (hex). */
  color: string
  /** Description of what action is needed. */
  action: string
  /** Keybind hint for the prompted action. */
  keybind: string
}

/** Known bot account patterns for detecting AI review loops. */
const BOT_PATTERNS = [
  "greptile[bot]",
  "github-actions[bot]",
  "greptile",
  "coderabbit",
  "coderabbit[bot]",
]

/** Check if a review author is a bot. */
function isBot(author: string): boolean {
  const lower = author.toLowerCase()
  return BOT_PATTERNS.some(p => lower.includes(p))
}

/** Check if any human reviewer has left a CHANGES_REQUESTED review. */
function hasHumanChangesRequested(reviews: Review[]): boolean {
  // Deduplicate by user, keeping only the latest review per user
  const latestByUser = new Map<string, Review>()
  for (const r of reviews) {
    if (!isBot(r.user)) {
      latestByUser.set(r.user, r)
    }
  }
  return [...latestByUser.values()].some(r => r.state === "CHANGES_REQUESTED")
}

/** Check if any human reviewer has approved. */
function hasHumanApproval(reviews: Review[]): boolean {
  const latestByUser = new Map<string, Review>()
  for (const r of reviews) {
    if (!isBot(r.user)) {
      latestByUser.set(r.user, r)
    }
  }
  return [...latestByUser.values()].some(r => r.state === "APPROVED")
}

/** Count distinct human approvals (latest review per user). */
function countHumanApprovals(reviews: Review[]): number {
  const latestByUser = new Map<string, Review>()
  for (const r of reviews) {
    if (!isBot(r.user)) {
      latestByUser.set(r.user, r)
    }
  }
  return [...latestByUser.values()].filter(r => r.state === "APPROVED").length
}

/** Check if there are only bot reviews and no human reviews. */
function hasOnlyBotReviews(reviews: Review[]): boolean {
  const humanReviews = reviews.filter(r => !isBot(r.user))
  const botReviews = reviews.filter(r => isBot(r.user))
  return botReviews.length > 0 && humanReviews.length === 0
}

/** Check if there are any human review events at all. */
function hasAnyHumanReview(reviews: Review[]): boolean {
  return reviews.some(r => !isBot(r.user))
}

/** Compute how many days since a date. */
function daysSince(dateStr: string): number {
  const then = new Date(dateStr).getTime()
  const now = Date.now()
  return Math.floor((now - then) / (1000 * 60 * 60 * 24))
}

/**
 * Detect the lifecycle state of a PR from its GitHub data.
 *
 * Uses a priority-ordered decision tree:
 * 1. Draft? -> DRAFT
 * 2. Human approved + no blockers? -> MERGE_NOW
 * 3. Human requested changes? -> FIX_REVIEW
 * 4. Only bot reviews, unresolved? -> AI_REVIEW
 * 5. No human reviews, clean? -> PING_REVIEWERS
 * 6. Has human reviews but waiting? -> WAITING
 * 7. Fallback -> WAITING
 *
 * @param pr - Basic PR data (isDraft, createdAt)
 * @param details - Extended PR details (reviews, commentCount)
 * @param unresolvedCount - Number of unresolved review threads (0 if unknown)
 * @param ciStatus - CI check result ("ready", "pending", "failing", or null if unknown)
 * @param hasConflicts - Whether the PR has merge conflicts
 * @returns State info with urgency score and prompted action
 */
export function detectPRState(
  pr: { isDraft: boolean; createdAt: string },
  details: PRDetails | null,
  unresolvedCount: number = 0,
  ciStatus: "ready" | "pending" | "failing" | null = null,
  hasConflicts: boolean = false,
): StateInfo {
  // DRAFT: PR is still in draft mode
  if (pr.isDraft) {
    return {
      state: "DRAFT",
      urgency: 10,
      label: "DRAFT",
      color: "#6b7089",
      action: "Mark ready for review",
      keybind: "R",
    }
  }

  const reviews = details?.reviews ?? []

  // RESOLVE_CONFLICTS: merge conflicts block everything
  if (hasConflicts) {
    return {
      state: "RESOLVE_CONFLICTS",
      urgency: 70,
      label: "CONFLICTS",
      color: "#f7768e",
      action: "Resolve merge conflicts",
      keybind: "",
    }
  }

  // FIX_CI: CI failing blocks merge
  if (ciStatus === "failing") {
    return {
      state: "FIX_CI",
      urgency: 70,
      label: "CI FAIL",
      color: "#f7768e",
      action: "Fix failing CI checks",
      keybind: "",
    }
  }

  // MERGE_NOW: approved, CI passing, no unresolved threads
  if (
    hasHumanApproval(reviews) &&
    !hasHumanChangesRequested(reviews) &&
    unresolvedCount === 0 &&
    (ciStatus === "ready" || ciStatus === null)
  ) {
    const approvalCount = countHumanApprovals(reviews)
    return {
      state: "MERGE_NOW",
      urgency: 100,
      label: "MERGE",
      color: "#9ece6a",
      action: `Approved (${approvalCount}). Merge now`,
      keybind: "m",
    }
  }

  // FIX_REVIEW: human reviewer requested changes
  if (hasHumanChangesRequested(reviews)) {
    return {
      state: "FIX_REVIEW",
      urgency: 90,
      label: "FIX",
      color: "#e0af68",
      action: `${unresolvedCount || "?"} comments to fix`,
      keybind: "F",
    }
  }

  // AI_REVIEW: only bot reviews, likely greploop running
  if (hasOnlyBotReviews(reviews) && unresolvedCount > 0) {
    return {
      state: "AI_REVIEW",
      urgency: 50,
      label: "AI REVIEW",
      color: "#7aa2f7",
      action: `Greploop: ${unresolvedCount} comments left`,
      keybind: "",
    }
  }

  // PING_REVIEWERS: no human reviews yet, clean state
  if (!hasAnyHumanReview(reviews) && unresolvedCount === 0) {
    return {
      state: "PING_REVIEWERS",
      urgency: 80,
      label: "PING",
      color: "#73daca",
      action: "Ready! Ping reviewers",
      keybind: "P",
    }
  }

  // WAITING: reviewers have been engaged but haven't completed
  const daysWaiting = daysSince(pr.createdAt)
  // Urgency increases with time: base 30 + 5 per day, capped at 70
  const waitUrgency = Math.min(70, 30 + daysWaiting * 5)
  const waitDesc = daysWaiting > 0 ? `Waiting ${daysWaiting}d` : "Waiting"

  return {
    state: "WAITING",
    urgency: waitUrgency,
    label: "WAIT",
    color: "#e0af68",
    action: waitDesc,
    keybind: "N",
  }
}

/**
 * Compare two PRs by urgency score for attention-based sorting.
 * Higher urgency sorts first (descending). Ties broken by creation date (newer first).
 */
export function compareByUrgency(
  a: { urgency: number; createdAt: string },
  b: { urgency: number; createdAt: string },
): number {
  if (a.urgency !== b.urgency) return b.urgency - a.urgency
  // Tiebreak: newer PRs first (more likely to need action)
  return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
}
