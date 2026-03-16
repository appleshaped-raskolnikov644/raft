import { useEffect, useState } from "react"
import type { FileDiff } from "../lib/types"

interface PanelFilesProps {
  files: FileDiff[]
  width: number
  scrollOffset: number
  maxLines: number
  onContentHeight?: (height: number) => void
}

export function PanelFiles({ files, width, scrollOffset, maxLines, onContentHeight }: PanelFilesProps) {
  const [lines, setLines] = useState<string[]>([])

  useEffect(() => {
    const output: string[] = []

    if (files.length === 0) {
      output.push("No files changed")
    } else {
      // Summary line
      const totalAdd = files.reduce((sum, f) => sum + f.additions, 0)
      const totalDel = files.reduce((sum, f) => sum + f.deletions, 0)
      output.push(`${files.length} files changed, +${totalAdd} -${totalDel}`)
      output.push("")

      // File list
      for (const file of files) {
        const statusIcon =
          file.status === "added" ? "+" :
          file.status === "removed" ? "-" :
          file.status === "renamed" ? "→" :
          "•"

        const stats = `+${file.additions} -${file.deletions}`
        const name = file.status === "renamed" && file.previousFilename
          ? `${file.previousFilename} → ${file.filename}`
          : file.filename

        output.push(`${statusIcon} ${name} (${stats})`)
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
          <text>{line}</text>
        </box>
      ))}
    </box>
  )
}
