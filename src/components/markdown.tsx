import React from "react"

/** A single parsed line from a markdown document. */
export type MdLine =
  | { type: "header"; text: string; level: number }
  | { type: "list"; text: string }
  | { type: "code"; text: string }
  | { type: "text"; text: string }
  | { type: "blank" }

/** A segment of inline-formatted text within a line. */
export type InlineSegment =
  | { kind: "text"; text: string }
  | { kind: "bold"; text: string }
  | { kind: "code"; text: string }

/** Parses inline markdown formatting (bold and inline code) within a single line of text. */
export function parseInlineSegments(text: string): InlineSegment[] {
  const segments: InlineSegment[] = []
  // Match **bold** or `code` spans
  const pattern = /(\*\*(.+?)\*\*|`([^`]+)`)/g
  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = pattern.exec(text)) !== null) {
    // Push any plain text before this match
    if (match.index > lastIndex) {
      segments.push({ kind: "text", text: text.slice(lastIndex, match.index) })
    }

    if (match[2] !== undefined) {
      // **bold**
      segments.push({ kind: "bold", text: match[2] })
    } else if (match[3] !== undefined) {
      // `code`
      segments.push({ kind: "code", text: match[3] })
    }

    lastIndex = match.index + match[0].length
  }

  // Push any remaining plain text
  if (lastIndex < text.length) {
    segments.push({ kind: "text", text: text.slice(lastIndex) })
  }

  // If nothing matched, return the whole thing as text
  if (segments.length === 0) {
    segments.push({ kind: "text", text })
  }

  return segments
}

/** Renders inline markdown segments as React elements with appropriate formatting. */
function renderInlineText(text: string, baseColor: string = "#c0caf5"): React.ReactNode {
  const segments = parseInlineSegments(text)

  // Fast path: single plain-text segment with no formatting
  if (segments.length === 1 && segments[0].kind === "text") {
    return <span fg={baseColor}>{segments[0].text}</span>
  }

  return (
    <>
      {segments.map((seg, i) => {
        switch (seg.kind) {
          case "bold":
            return <span key={i} fg={baseColor}><strong>{seg.text}</strong></span>
          case "code":
            return <span key={i} fg="#9aa5ce" bg="#1a1b26">{seg.text}</span>
          case "text":
            return <span key={i} fg={baseColor}>{seg.text}</span>
        }
      })}
    </>
  )
}

/** Parses a markdown string into an array of block-level line descriptors. */
export function parseMarkdownLines(input: string): MdLine[] {
  const rawLines = input.split("\n")
  const result: MdLine[] = []
  let inCode = false
  let codeBuffer: string[] = []

  for (const line of rawLines) {
    if (line.startsWith("```")) {
      if (inCode) {
        // End code block
        result.push({ type: "code", text: codeBuffer.join("\n") })
        codeBuffer = []
        inCode = false
      } else {
        inCode = true
      }
      continue
    }

    if (inCode) {
      codeBuffer.push(line)
      continue
    }

    if (line.trim() === "") {
      result.push({ type: "blank" })
      continue
    }

    const headerMatch = line.match(/^(#{1,3})\s+(.+)/)
    if (headerMatch) {
      result.push({ type: "header", text: headerMatch[2], level: headerMatch[1].length })
      continue
    }

    if (line.match(/^[-*]\s+/)) {
      result.push({ type: "list", text: line.replace(/^[-*]\s+/, "") })
      continue
    }

    const numberedMatch = line.match(/^\d+\.\s+(.+)/)
    if (numberedMatch) {
      result.push({ type: "list", text: numberedMatch[1] })
      continue
    }

    result.push({ type: "text", text: line })
  }

  // Handle unclosed code block
  if (inCode && codeBuffer.length > 0) {
    result.push({ type: "code", text: codeBuffer.join("\n") })
  }

  return result
}

/** Props for the MarkdownView component. */
interface MarkdownViewProps {
  content: string
  width: number
  scrollOffset: number
  maxLines: number
  onContentHeight?: (height: number) => void
}

/** Renders a markdown string as a scrollable terminal UI with block and inline formatting. */
export function MarkdownView({ content, width, scrollOffset, maxLines, onContentHeight }: MarkdownViewProps) {
  const lines = parseMarkdownLines(content)

  // Flatten to renderable lines with styles
  const rendered: { key: string; element: React.ReactNode }[] = []
  let lineIdx = 0

  for (const line of lines) {
    const key = `md-${lineIdx++}`
    switch (line.type) {
      case "header":
        rendered.push({
          key,
          element: (
            <box height={1} paddingX={1}>
              <text><strong>{renderInlineText(line.text)}</strong></text>
            </box>
          ),
        })
        break
      case "list":
        rendered.push({
          key,
          element: (
            <box height={1} paddingX={1}>
              <text>
                <span fg="#6b7089">  - </span>
                {renderInlineText(line.text)}
              </text>
            </box>
          ),
        })
        break
      case "code":
        for (const codeLine of line.text.split("\n")) {
          const codeKey = `md-${lineIdx++}`
          rendered.push({
            key: codeKey,
            element: (
              <box height={1} paddingX={2} backgroundColor="#1a1b26">
                <text fg="#9aa5ce">{codeLine}</text>
              </box>
            ),
          })
        }
        break
      case "blank":
        rendered.push({
          key,
          element: <box height={1} />,
        })
        break
      case "text":
        rendered.push({
          key,
          element: (
            <box height={1} paddingX={1}>
              <text>{renderInlineText(line.text)}</text>
            </box>
          ),
        })
        break
    }
  }

  const visible = rendered.slice(scrollOffset, scrollOffset + maxLines)

  // Report actual content height
  if (onContentHeight) {
    onContentHeight(rendered.length)
  }

  return (
    <box flexDirection="column" width={width}>
      {visible.map(({ key, element }) => (
        <box key={key}>{element}</box>
      ))}
    </box>
  )
}
