import { useEffect, useState } from "react"
import type { FileDiff } from "../lib/types"

interface PanelFilesProps {
  files: FileDiff[]
  width: number
  scrollOffset: number
  maxLines: number
  onContentHeight?: (height: number) => void
}

function renderDiffLine(line: string): { fg: string; text: string } {
  if (line.startsWith("+")) {
    return { fg: "#9ece6a", text: line }
  } else if (line.startsWith("-")) {
    return { fg: "#f7768e", text: line }
  } else if (line.startsWith("@@")) {
    return { fg: "#7aa2f7", text: line }
  } else {
    return { fg: "#6b7089", text: line }
  }
}

export function PanelFiles({ files, width, scrollOffset, maxLines, onContentHeight }: PanelFilesProps) {
  const [lines, setLines] = useState<Array<{ fg: string; text: string }>>([])

  useEffect(() => {
    const output: Array<{ fg: string; text: string }> = []

    if (files.length === 0) {
      output.push({ fg: "#6b7089", text: "No files changed" })
    } else {
      // Summary
      const totalAdd = files.reduce((sum, f) => sum + f.additions, 0)
      const totalDel = files.reduce((sum, f) => sum + f.deletions, 0)
      output.push({ fg: "#9aa5ce", text: `${files.length} files changed, +${totalAdd} -${totalDel}` })
      output.push({ fg: "#6b7089", text: "" })

      // Show diff for each file
      for (let i = 0; i < files.length; i++) {
        const file = files[i]
        const name = file.status === "renamed" && file.previousFilename
          ? `${file.previousFilename} → ${file.filename}`
          : file.filename

        output.push({ fg: "#7aa2f7", text: `diff --git a/${name} b/${name}` })
        output.push({ fg: "#9aa5ce", text: `+${file.additions} -${file.deletions}` })

        if (file.patch) {
          const patchLines = file.patch.split("\n")
          for (const line of patchLines) {
            output.push(renderDiffLine(line))
          }
        } else {
          output.push({ fg: "#6b7089", text: "Binary file or no diff available" })
        }

        // Add spacing between files
        if (i < files.length - 1) {
          output.push({ fg: "#6b7089", text: "" })
        }
      }
    }

    setLines(output)
    onContentHeight?.(output.length)
  }, [files, onContentHeight])

  const visibleLines = lines.slice(scrollOffset, scrollOffset + maxLines)

  return (
    <box flexDirection="column" paddingX={1}>
      {visibleLines.map((line, i) => (
        <box key={scrollOffset + i} height={1}>
          <text fg={line.fg}>{line.text}</text>
        </box>
      ))}
    </box>
  )
}
