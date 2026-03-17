/**
 * Review scan findings display for the Files tab header.
 *
 * Shows proactive AI-detected issues (bugs, missing tests, security,
 * breaking changes) with severity-coded badges. Each finding can be
 * dismissed or clicked to jump to the relevant code.
 */

import type { ReviewFinding, FindingSeverity } from "../lib/ai-review-scan"

/** Props for the ReviewFindings component. */
interface ReviewFindingsProps {
  findings: ReviewFinding[]
  width: number
}

/** Badge colors for each finding severity. */
const SEVERITY_COLORS: Record<FindingSeverity, string> = {
  bug: "#f7768e",
  security: "#f7768e",
  test: "#e0af68",
  warning: "#e0af68",
  info: "#7aa2f7",
}

/** Badge labels for each finding severity. */
const SEVERITY_LABELS: Record<FindingSeverity, string> = {
  bug: "BUG",
  security: "SEC",
  test: "TEST",
  warning: "WARN",
  info: "INFO",
}

/**
 * Renders the review scan findings bar at the top of the Files tab.
 * Shows count, severity badges, and brief summaries.
 */
export function ReviewFindings({ findings, width }: ReviewFindingsProps) {
  const active = findings.filter(f => !f.dismissed)

  if (active.length === 0) {
    return (
      <box height={1} paddingX={1}>
        <text fg="#9ece6a">Review scan: no issues found</text>
      </box>
    )
  }

  return (
    <box flexDirection="column" width={width} marginBottom={1}>
      {/* Header */}
      <box height={1} paddingX={1}>
        <text>
          <span fg="#e0af68">Review Scan ({active.length} finding{active.length > 1 ? "s" : ""})</span>
          <span fg="#6b7089">  Enter: jump  d: dismiss</span>
        </text>
      </box>

      {/* Finding rows */}
      {active.slice(0, 5).map((finding, idx) => {
        const color = SEVERITY_COLORS[finding.severity]
        const label = SEVERITY_LABELS[finding.severity]
        const lineStr = finding.line ? `:${finding.line}` : ""

        return (
          <box key={`finding-${idx}`} height={1} paddingX={1}>
            <text>
              <span fg={color}>{label}</span>
              <span fg="#6b7089"> </span>
              <span fg="#7aa2f7">{finding.path}{lineStr}</span>
              <span fg="#6b7089"> </span>
              <span fg="#9aa5ce">{finding.summary}</span>
            </text>
          </box>
        )
      })}

      {active.length > 5 && (
        <box height={1} paddingX={1}>
          <text fg="#6b7089">  ...and {active.length - 5} more</text>
        </box>
      )}
    </box>
  )
}
