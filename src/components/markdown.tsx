import React from "react"

export type MdLine =
  | { type: "header"; text: string; level: number }
  | { type: "list"; text: string }
  | { type: "code"; text: string }
  | { type: "text"; text: string }
  | { type: "blank" }

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

    result.push({ type: "text", text: line })
  }

  // Handle unclosed code block
  if (inCode && codeBuffer.length > 0) {
    result.push({ type: "code", text: codeBuffer.join("\n") })
  }

  return result
}

interface MarkdownViewProps {
  content: string
  width: number
  scrollOffset: number
  maxLines: number
}

export function MarkdownView({ content, width, scrollOffset, maxLines }: MarkdownViewProps) {
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
              <text fg="#c0caf5"><strong>{line.text}</strong></text>
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
                <span fg="#c0caf5">{line.text}</span>
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
              <text fg="#c0caf5">{line.text}</text>
            </box>
          ),
        })
        break
    }
  }

  const visible = rendered.slice(scrollOffset, scrollOffset + maxLines)

  return (
    <box flexDirection="column" width={width}>
      {visible.map(({ key, element }) => (
        <box key={key}>{element}</box>
      ))}
    </box>
  )
}
