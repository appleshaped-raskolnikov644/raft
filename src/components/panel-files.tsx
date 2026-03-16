import { useEffect, useState } from "react"
import type { FileDiff } from "../lib/types"

/**
 * Props for the {@link PanelFiles} component.
 */
interface PanelFilesProps {
  /** Array of file diffs to render in the panel. */
  files: FileDiff[]
  /** Available terminal width in columns, used for sizing separator lines. */
  width: number
  /** Number of lines to skip from the top (for vertical scrolling). */
  scrollOffset: number
  /** Maximum number of visible lines to render at once. */
  maxLines: number
  /** Callback invoked when total content height changes, for scroll bounds. */
  onContentHeight?: (height: number) => void
}

/** A single styled line in the diff output. */
interface StyledLine {
  /** Foreground color (hex). */
  fg: string
  /** Text content for the line. */
  text: string
}

/**
 * Pads or truncates a string with trailing fill characters to reach
 * the desired width, used to build box-drawing header/footer rows.
 *
 * @param text  - The content to place at the start of the line.
 * @param width - The target width in columns.
 * @param fill  - The character used to fill remaining space (default `"\u2500"` i.e. `─`).
 * @returns The padded string, exactly `width` characters long.
 */
function padLine(text: string, width: number, fill = "\u2500"): string {
  if (text.length >= width) return text.slice(0, width)
  return text + fill.repeat(width - text.length)
}

/**
 * Colorizes a single diff line based on its leading character.
 *
 * - Lines starting with `+` are additions (green).
 * - Lines starting with `-` are deletions (red).
 * - Lines starting with `@@` are hunk headers (blue) and have their
 *   `@@` markers stripped for a cleaner display.
 * - All other lines are context (muted gray, slightly lighter than
 *   the "no diff" placeholder color to distinguish them visually).
 *
 * @param line - Raw diff line text.
 * @returns A {@link StyledLine} with the appropriate color and cleaned text.
 */
function renderDiffLine(line: string): StyledLine {
  if (line.startsWith("+")) {
    return { fg: "#9ece6a", text: line }
  } else if (line.startsWith("-")) {
    return { fg: "#f7768e", text: line }
  } else if (line.startsWith("@@")) {
    // Strip @@ markers, show just the range info cleanly
    const match = line.match(/^@@\s+(.+?)\s+@@(.*)$/)
    if (match) {
      const rangeInfo = match[1].trim()
      const sectionLabel = match[2].trim()
      const display = sectionLabel ? `${rangeInfo}  ${sectionLabel}` : rangeInfo
      return { fg: "#7aa2f7", text: `  ${display}` }
    }
    return { fg: "#7aa2f7", text: line }
  } else {
    // Context lines: use a slightly lighter shade than "no diff" (#6b7089)
    return { fg: "#787c99", text: line }
  }
}

/**
 * Builds a box-drawing file header block for a single file diff.
 *
 * Produces three styled lines:
 * ```
 * ┌─ filename ──────────────────────────────
 * │ +N -N · status
 * └─────────────────────────────────────────
 * ```
 *
 * @param name   - Display name for the file (may include rename arrow).
 * @param file   - The file diff data, used for additions/deletions/status.
 * @param boxWidth - Width of the box in columns.
 * @returns An array of three {@link StyledLine} entries.
 */
function buildFileHeader(name: string, file: FileDiff, boxWidth: number): StyledLine[] {
  const topLine = padLine(`\u250C\u2500 ${name} `, boxWidth, "\u2500")
  const midLine = `\u2502 +${file.additions} -${file.deletions} \u00B7 ${file.status}`
  const botLine = padLine("\u2514", boxWidth, "\u2500")
  return [
    { fg: "#7aa2f7", text: topLine },
    { fg: "#9aa5ce", text: midLine },
    { fg: "#7aa2f7", text: botLine },
  ]
}

/**
 * Builds a box-drawing explanation block for an AI-generated summary.
 *
 * Produces three styled lines:
 * ```
 * ┌ AI Summary ─────────────────────────────
 * │ <explanation text>
 * └─────────────────────────────────────────
 * ```
 *
 * @param explanation - The explanation text to display.
 * @param boxWidth    - Width of the box in columns.
 * @returns An array of three {@link StyledLine} entries.
 */
function buildExplanationBlock(explanation: string, boxWidth: number): StyledLine[] {
  const topLine = padLine("\u250C AI Summary ", boxWidth, "\u2500")
  const botLine = padLine("\u2514", boxWidth, "\u2500")
  return [
    { fg: "#bb9af7", text: topLine },
    { fg: "#bb9af7", text: `\u2502 ${explanation}` },
    { fg: "#bb9af7", text: botLine },
  ]
}

/**
 * Renders a scrollable list of file diffs with box-drawing file headers,
 * AI explanation blocks, colorized diff lines, and visual separators.
 *
 * The component computes all styled lines eagerly in a `useEffect`, stores
 * them in state, and slices the visible window based on `scrollOffset` and
 * `maxLines`.
 *
 * @param props - See {@link PanelFilesProps}.
 */
export function PanelFiles({ files, width, scrollOffset, maxLines, onContentHeight }: PanelFilesProps) {
  const [lines, setLines] = useState<StyledLine[]>([])

  useEffect(() => {
    const output: StyledLine[] = []
    // Reserve some space for padding
    const boxWidth = Math.max(width - 4, 40)

    if (files.length === 0) {
      output.push({ fg: "#6b7089", text: "No files changed" })
    } else {
      // Summary
      const totalAdd = files.reduce((sum, f) => sum + f.additions, 0)
      const totalDel = files.reduce((sum, f) => sum + f.deletions, 0)
      const explainedCount = files.filter(f => f.explanation).length

      output.push({ fg: "#9aa5ce", text: `${files.length} files changed, +${totalAdd} -${totalDel}` })

      if (explainedCount > 0) {
        output.push({ fg: "#6b7089", text: `${explainedCount}/${files.length} files explained` })
      } else {
        output.push({ fg: "#6b7089", text: "Press 'e' to generate AI explanations" })
      }

      output.push({ fg: "#6b7089", text: "" })

      // Show diff for each file
      for (let i = 0; i < files.length; i++) {
        const file = files[i]
        const name = file.status === "renamed" && file.previousFilename
          ? `${file.previousFilename} \u2192 ${file.filename}`
          : file.filename

        // Box-drawing file header
        output.push(...buildFileHeader(name, file, boxWidth))

        // Show explanation if available, in a box
        if (file.explanation) {
          output.push({ fg: "#6b7089", text: "" })
          output.push(...buildExplanationBlock(file.explanation, boxWidth))
          output.push({ fg: "#6b7089", text: "" })
        }

        if (file.patch) {
          const patchLines = file.patch.split("\n")
          for (const line of patchLines) {
            // Skip the diff --git header lines from the patch since we
            // already render a styled file header above
            if (line.startsWith("diff --git ")) continue
            output.push(renderDiffLine(line))
          }
        } else {
          output.push({ fg: "#6b7089", text: "Binary file or no diff available" })
        }

        // Visual separator between files
        if (i < files.length - 1) {
          output.push({ fg: "#6b7089", text: "" })
          output.push({ fg: "#3b3d57", text: "\u2500".repeat(boxWidth) })
          output.push({ fg: "#6b7089", text: "" })
        }
      }
    }

    setLines(output)
    onContentHeight?.(output.length)
  }, [files, width, onContentHeight])

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
