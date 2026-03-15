import React from "react"
import type { Comment } from "../lib/types"
import { formatRelativeAge } from "../lib/format"

interface PanelCommentsProps {
  comments: Comment[]
  width: number
  scrollOffset: number
  maxLines: number
}

export function PanelComments({ comments, width, scrollOffset, maxLines }: PanelCommentsProps) {
  if (comments.length === 0) {
    return (
      <box paddingX={1}>
        <text fg="#6b7089">No comments.</text>
      </box>
    )
  }

  // Build renderable lines
  const lines: { key: string; element: React.ReactNode }[] = []
  let idx = 0

  for (const comment of comments) {
    const age = formatRelativeAge(comment.createdAt)
    const isBot = comment.authorAssociation === "BOT" ||
                  comment.author.includes("[bot]") ||
                  comment.author.includes("bot")
    const authorColor = isBot ? "#6b7089" : "#bb9af7"
    const textColor = isBot ? "#6b7089" : "#c0caf5"

    // Header line
    lines.push({
      key: `c-${idx}-header`,
      element: (
        <box height={1} paddingX={1}>
          <text>
            <span fg="#6b7089">{"\u250C"} </span>
            <span fg={authorColor}>@{comment.author}</span>
            <span fg="#6b7089"> {"\u00B7"} {age}</span>
          </text>
        </box>
      ),
    })

    // Body lines
    const bodyLines = comment.body.split("\n")
    for (const bodyLine of bodyLines) {
      lines.push({
        key: `c-${idx}-${lines.length}`,
        element: (
          <box height={1} paddingX={1}>
            <text>
              <span fg="#6b7089">{"\u2502"} </span>
              <span fg={textColor}>{bodyLine}</span>
            </text>
          </box>
        ),
      })
    }

    // Footer line
    lines.push({
      key: `c-${idx}-footer`,
      element: (
        <box height={1} paddingX={1}>
          <text fg="#6b7089">{"\u2514"}</text>
        </box>
      ),
    })

    // Spacer
    lines.push({
      key: `c-${idx}-spacer`,
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
