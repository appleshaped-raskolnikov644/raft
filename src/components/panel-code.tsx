import React from "react"
import type { CodeComment } from "../lib/types"
import { formatRelativeAge, truncate } from "../lib/format"

interface PanelCodeProps {
  codeComments: CodeComment[]
  width: number
  scrollOffset: number
  maxLines: number
}

export function PanelCode({ codeComments, width, scrollOffset, maxLines }: PanelCodeProps) {
  if (codeComments.length === 0) {
    return (
      <box paddingX={1}>
        <text fg="#6b7089">No code comments.</text>
      </box>
    )
  }

  const lines: { key: string; element: React.ReactNode }[] = []
  let idx = 0

  for (const comment of codeComments) {
    const age = formatRelativeAge(comment.createdAt)

    // Header
    lines.push({
      key: `cc-${idx}-header`,
      element: (
        <box height={1} paddingX={1}>
          <text>
            <span fg="#6b7089">{"\u250C"} </span>
            <span fg="#bb9af7">@{comment.author}</span>
            <span fg="#6b7089"> {"\u00B7"} {age}</span>
          </text>
        </box>
      ),
    })

    // File path + line
    lines.push({
      key: `cc-${idx}-path`,
      element: (
        <box height={1} paddingX={1}>
          <text>
            <span fg="#6b7089">{"\u2502"} </span>
            <span fg="#7aa2f7">{comment.path}</span>
            <span fg="#6b7089">:{comment.line}</span>
          </text>
        </box>
      ),
    })

    // Diff hunk (last line only, as context)
    if (comment.diffHunk) {
      const hunkLines = comment.diffHunk.split("\n")
      const lastLine = hunkLines[hunkLines.length - 1] || ""
      lines.push({
        key: `cc-${idx}-hunk`,
        element: (
          <box height={1} paddingX={1}>
            <text>
              <span fg="#6b7089">{"\u2502"} {">"} </span>
              <span fg="#9aa5ce">{truncate(lastLine, width - 8)}</span>
            </text>
          </box>
        ),
      })
    }

    // Blank separator before comment body
    lines.push({
      key: `cc-${idx}-sep`,
      element: (
        <box height={1} paddingX={1}>
          <text fg="#6b7089">{"\u2502"}</text>
        </box>
      ),
    })

    // Comment body
    const bodyLines = comment.body.split("\n")
    for (const bodyLine of bodyLines) {
      lines.push({
        key: `cc-${idx}-${lines.length}`,
        element: (
          <box height={1} paddingX={1}>
            <text>
              <span fg="#6b7089">{"\u2502"} </span>
              <span fg="#c0caf5">{bodyLine}</span>
            </text>
          </box>
        ),
      })
    }

    // Footer
    lines.push({
      key: `cc-${idx}-footer`,
      element: (
        <box height={1} paddingX={1}>
          <text fg="#6b7089">{"\u2514"}</text>
        </box>
      ),
    })

    lines.push({
      key: `cc-${idx}-spacer`,
      element: <box height={1} />,
    })

    idx++
  }

  const visible = lines.slice(scrollOffset, scrollOffset + maxLines)

  return (
    <box flexDirection="column" width={width}>
      {visible.map(({ key, element }) => (
        <box key={key}>{element}</box>
      ))}
    </box>
  )
}
