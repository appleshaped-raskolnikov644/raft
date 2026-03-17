/**
 * PR status diagnostic view replacing the detail panel footer.
 *
 * Shows lifecycle state, approvals, CI status, thread count, and
 * the prompted next action. This is the first thing you see when
 * selecting a PR - it answers "what do I need to do" in 2 seconds.
 */

import type { PullRequest, PRDetails, PRLifecycleInfo } from "../lib/types"

interface StatusViewProps {
  pr: PullRequest
  details: PRDetails | null
  lifecycle: PRLifecycleInfo | null
  flash: string | null
  replyMode: boolean
  replyText: string
  panelOpen: boolean
}

/**
 * Renders a compact diagnostic status view for the selected PR.
 * Replaces the old repo/number/title/url footer with actionable intelligence.
 */
export function StatusView({ pr, details, lifecycle, flash, replyMode, replyText, panelOpen }: StatusViewProps) {
  const reviewSummary = details ? buildReviewSummary(details) : ""

  return (
    <box flexDirection="column" paddingX={1} paddingY={1} borderColor="#292e42" border>
      {/* Line 1: Repo + number + lifecycle badge */}
      <box flexDirection="row" height={1}>
        <text>
          <span fg="#bb9af7">{pr.repo}</span>
          <span fg="#9aa5ce"> #</span>
          <span fg="#7aa2f7">{pr.number}</span>
          {lifecycle && (
            <span fg={lifecycle.color}> {lifecycle.label}</span>
          )}
        </text>
      </box>

      {/* Line 2: Title */}
      <box height={1}>
        <text fg="#c0caf5">{pr.title}</text>
      </box>

      {/* Line 3: Review summary (if details loaded) */}
      {details && (
        <box height={1}>
          <text fg="#9aa5ce">{reviewSummary}</text>
        </box>
      )}

      {/* Line 4: Action prompt / flash / keybinds */}
      <box flexDirection="row" height={1}>
        {replyMode ? (
          <text>
            <span fg="#e0af68">reply: </span>
            <span fg="#c0caf5">{replyText}</span>
            <span fg="#7aa2f7">_</span>
            <span fg="#6b7089"> (Enter: send, Esc: cancel)</span>
          </text>
        ) : flash ? (
          <text fg="#9ece6a">{flash}</text>
        ) : lifecycle && lifecycle.keybind ? (
          <text>
            <span fg={lifecycle.color}>{lifecycle.keybind}: {lifecycle.action}</span>
            <span fg="#6b7089">  Enter: open  c: copy  p: preview  q: quit</span>
          </text>
        ) : panelOpen ? (
          <text fg="#6b7089">
            1-4: tab  r: reply  e: explain  A: approve  X: req changes  f: fullscreen  +/-: resize  p: close  q: quit
          </text>
        ) : (
          <text fg="#6b7089">
            Enter: open  c: copy  /: search  s: sort  v: view  g: group  p: preview  q: quit
          </text>
        )}
      </box>
    </box>
  )
}

/** Build a compact review summary string from PR details. */
function buildReviewSummary(details: PRDetails): string {
  if (details.reviews.length === 0) return "No reviews yet"

  // Deduplicate reviews by user (keep latest)
  const byUser = new Map<string, string>()
  for (const r of details.reviews) {
    byUser.set(r.user, r.state)
  }

  const parts: string[] = []
  for (const [user, state] of byUser) {
    const icon = state === "APPROVED" ? "v" : state === "CHANGES_REQUESTED" ? "x" : "~"
    parts.push(`${icon}${user}`)
  }

  const lines = `+${details.additions} -${details.deletions}`
  const comments = details.commentCount > 0 ? `  ${details.commentCount} comments` : ""

  return `${parts.join("  ")}  ${lines}${comments}`
}
