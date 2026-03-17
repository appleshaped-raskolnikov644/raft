/**
 * Panel tab for rendering inline code review comments on a PR.
 *
 * Shows resolved/unresolved thread distinction with visual markers:
 * - Unresolved: full color with red left-border
 * - Resolved: dimmed with strikethrough-style treatment
 *
 * Unresolved count shown in header for quick status check.
 */

import React from "react"
import type { CodeComment } from "../lib/types"
import { formatRelativeAge, truncate } from "../lib/format"

/** Props for the {@link PanelCode} component. */
interface PanelCodeProps {
  /** Array of inline code review comments to render. */
  codeComments: CodeComment[]
  /** Available width in columns. */
  width: number
}

/**
 * Renders all inline code review comments as styled cards with file context.
 * Unresolved threads render with full color and a red border marker.
 * Resolved threads render dimmed to visually recede.
 */
export function PanelCode({ codeComments, width }: PanelCodeProps) {
  if (codeComments.length === 0) {
    return (
      <box paddingX={1}>
        <text fg="#6b7089">No code comments.</text>
      </box>
    )
  }

  const unresolvedCount = codeComments.filter(c => !c.isResolved).length
  const totalCount = codeComments.length

  return (
    <box flexDirection="column" width={width}>
      {/* Thread count header */}
      <box height={1} paddingX={1} marginBottom={1}>
        <text>
          {unresolvedCount > 0 ? (
            <span fg="#f7768e">{unresolvedCount} unresolved</span>
          ) : (
            <span fg="#9ece6a">All resolved</span>
          )}
          <span fg="#6b7089"> / {totalCount} threads  (n: next unresolved, R: resolve)</span>
        </text>
      </box>

      {codeComments.map((comment, idx) => {
        const age = formatRelativeAge(comment.createdAt)
        const isResolved = comment.isResolved === true

        // Resolved threads use muted colors, unresolved use full colors
        const borderColor = isResolved ? "#3b3d57" : "#f7768e"
        const authorColor = isResolved ? "#565f89" : "#bb9af7"
        const pathColor = isResolved ? "#565f89" : "#7aa2f7"
        const bodyColor = isResolved ? "#565f89" : "#c0caf5"
        const metaColor = isResolved ? "#3b3d57" : "#6b7089"

        return (
          <box key={`cc-${idx}`} flexDirection="column" marginBottom={1}>
            {/* Header: resolution status + author + timestamp */}
            <box height={1} paddingX={1}>
              <text>
                <span fg={borderColor}>{"\u250C"} </span>
                {isResolved && <span fg="#565f89">[resolved] </span>}
                <span fg={authorColor}>@{comment.author}</span>
                <span fg={metaColor}> {"\u00B7"} {age}</span>
              </text>
            </box>

            {/* File path and line number */}
            <box height={1} paddingX={1}>
              <text>
                <span fg={borderColor}>{"\u2502"} </span>
                <span fg={pathColor}>{comment.path}</span>
                <span fg={metaColor}>:{comment.line}</span>
              </text>
            </box>

            {/* Diff hunk context (last line only) */}
            {comment.diffHunk && (
              <box height={1} paddingX={1}>
                <text>
                  <span fg={borderColor}>{"\u2502"} {">"} </span>
                  <span fg={isResolved ? "#3b3d57" : "#9aa5ce"}>
                    {truncate(comment.diffHunk.split("\n").pop() || "", width - 8)}
                  </span>
                </text>
              </box>
            )}

            {/* Blank separator before body */}
            <box height={1} paddingX={1}>
              <text fg={borderColor}>{"\u2502"}</text>
            </box>

            {/* Comment body */}
            {comment.body.split("\n").map((bodyLine, li) => (
              <box key={`cc-${idx}-${li}`} height={1} paddingX={1}>
                <text>
                  <span fg={borderColor}>{"\u2502"} </span>
                  <span fg={bodyColor}>{bodyLine}</span>
                </text>
              </box>
            ))}

            {/* Footer */}
            <box height={1} paddingX={1}>
              <text fg={borderColor}>{"\u2514"}</text>
            </box>
          </box>
        )
      })}
    </box>
  )
}
