import type { Review } from "./types"

/** Converts an ISO date string to a compact relative age label (e.g. "3d", "2w"). */
export function formatRelativeAge(dateStr: string): string {
  const now = Date.now()
  const then = new Date(dateStr).getTime()
  const diffMs = now - then
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMins / 60)
  const diffDays = Math.floor(diffHours / 24)
  const diffWeeks = Math.floor(diffDays / 7)
  const diffMonths = Math.floor(diffDays / 30)

  if (diffMins < 1) return "now"
  if (diffMins < 60) return `${diffMins}m`
  if (diffHours < 24) return `${diffHours}h`
  if (diffDays < 7) return `${diffDays}d`
  if (diffWeeks < 5) return `${diffWeeks}w`
  return `${diffMonths}mo`
}

/** Extracts the repo name from a full `owner/repo` string. */
export function shortRepoName(fullRepo: string): string {
  const parts = fullRepo.split("/")
  return parts.length > 1 ? parts[1] : fullRepo
}

/** Truncates a string to `max` characters, appending an ellipsis if needed. */
export function truncate(str: string, max: number): string {
  if (str.length <= max) return str
  return str.slice(0, max - 1) + "\u2026"
}

/**
 * Truncate and pad text to exactly fit a fixed width box.
 * This prevents OpenTUI rendering artifacts when text changes length.
 */
export function truncateFixed(str: string, width: number): string {
  if (str.length >= width) {
    return str.slice(0, width - 1) + "\u2026"
  }
  return str.padEnd(width, " ")
}

/** Deduplicate reviews by user (last review wins), then count approved/changes_requested. */
export function formatReviewStatus(reviews: Review[]): string {
  const byUser = new Map<string, Review>()
  for (const r of reviews) {
    byUser.set(r.user, r)
  }
  let approved = 0
  let changesRequested = 0
  for (const r of byUser.values()) {
    if (r.state === "APPROVED") approved++
    if (r.state === "CHANGES_REQUESTED") changesRequested++
  }
  const parts: string[] = []
  if (approved > 0) parts.push(`v${approved}`)
  if (changesRequested > 0) parts.push(`x${changesRequested}`)
  return parts.join(" ")
}

/** Formats additions and deletions as a compact `+N -N` string. */
export function formatLinesChanged(additions: number, deletions: number): string {
  return `+${additions} -${deletions}`
}
