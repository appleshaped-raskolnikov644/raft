/**
 * Panel tab for rendering PR file diffs with syntax-highlighted native diffs.
 *
 * Uses OpenTUI's native `<diff>` component (via {@link DiffView}) for proper
 * split/unified diff rendering with Tree-sitter syntax highlighting and
 * word-level change detection. File headers and AI explanation blocks are
 * rendered as styled text above each diff.
 *
 * Architecture follows Critique (remorses/critique): GitHub API patches are
 * converted to unified diff format, then passed to the native `<diff>` element.
 */

import React from "react"
import type { FileDiff } from "../lib/types"
import { buildUnifiedDiff, detectFiletype, getViewMode } from "../lib/diff-utils"
import { DiffView } from "./diff-view"

/**
 * Props for the {@link PanelFiles} component.
 */
interface PanelFilesProps {
  /** Array of file diffs to render in the panel. */
  files: FileDiff[]
  /** Available terminal width in columns, used for sizing and view mode selection. */
  width: number
}

/**
 * Pads or truncates a string with trailing fill characters to reach
 * the desired width, used to build box-drawing header/footer rows.
 *
 * @param text  - The content to place at the start of the line.
 * @param width - The target width in columns.
 * @param fill  - The character used to fill remaining space (default `"\u2500"` i.e. `\u2500`).
 * @returns The padded string, exactly `width` characters long.
 */
function padLine(text: string, width: number, fill = "\u2500"): string {
  if (text.length >= width) return text.slice(0, width)
  return text + fill.repeat(width - text.length)
}

/**
 * Renders a box-drawing file header with filename, change stats, and status.
 *
 * ```
 * \u250C\u2500 filename \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
 * \u2502 +N -N \u00B7 status
 * \u2514\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
 * ```
 */
function FileHeader({ name, file, boxWidth }: { name: string; file: FileDiff; boxWidth: number }) {
  const topLine = padLine(`\u250C\u2500 ${name} `, boxWidth, "\u2500")
  const midLine = `\u2502 +${file.additions} -${file.deletions} \u00B7 ${file.status}`
  const botLine = padLine("\u2514", boxWidth, "\u2500")

  return (
    <box flexDirection="column">
      <box height={1}><text fg="#7aa2f7">{topLine}</text></box>
      <box height={1}><text fg="#9aa5ce">{midLine}</text></box>
      <box height={1}><text fg="#7aa2f7">{botLine}</text></box>
    </box>
  )
}

/**
 * Renders a box-drawing block for an AI-generated explanation.
 *
 * ```
 * \u250C AI Summary \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
 * \u2502 <explanation text>
 * \u2514\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
 * ```
 */
function ExplanationBlock({ explanation, boxWidth }: { explanation: string; boxWidth: number }) {
  const topLine = padLine("\u250C AI Summary ", boxWidth, "\u2500")
  const botLine = padLine("\u2514", boxWidth, "\u2500")

  // Fix: render each line separately to prevent overflow on multi-line explanations
  const lines = explanation.split("\n")

  return (
    <box flexDirection="column" marginY={1}>
      <box height={1}><text fg="#bb9af7">{topLine}</text></box>
      {lines.map((line, i) => (
        <box key={`exp-${i}`} height={1}>
          <text fg="#bb9af7">{`\u2502 ${line}`}</text>
        </box>
      ))}
      <box height={1}><text fg="#bb9af7">{botLine}</text></box>
    </box>
  )
}

/**
 * Renders all file diffs for a PR with native syntax-highlighted diffs.
 *
 * Each file gets a box-drawing header, optional AI explanation block,
 * and a native `<diff>` component for the actual diff content. The component
 * is designed to be wrapped in a `<scrollbox>` by the parent for scrolling.
 *
 * @param props - See {@link PanelFilesProps}.
 */
export function PanelFiles({ files, width }: PanelFilesProps) {
  const boxWidth = Math.max(width - 4, 40)

  if (files.length === 0) {
    return (
      <box flexDirection="column" paddingX={1}>
        <box height={1}><text fg="#6b7089">No files changed</text></box>
      </box>
    )
  }

  // Summary stats
  const totalAdd = files.reduce((sum, f) => sum + f.additions, 0)
  const totalDel = files.reduce((sum, f) => sum + f.deletions, 0)
  const explainedCount = files.filter(f => f.explanation).length

  return (
    <box flexDirection="column" paddingX={1}>
      {/* Summary header */}
      <box height={1}>
        <text fg="#9aa5ce">
          {files.length} files changed, +{totalAdd} -{totalDel}
        </text>
      </box>
      <box height={1}>
        <text fg="#6b7089">
          {explainedCount > 0
            ? `${explainedCount}/${files.length} files explained`
            : "Press 'e' to generate AI explanations"}
        </text>
      </box>
      <box height={1} />

      {/* File diffs */}
      {files.map((file, i) => {
        const name = file.status === "renamed" && file.previousFilename
          ? `${file.previousFilename} \u2192 ${file.filename}`
          : file.filename
        const filetype = detectFiletype(file.filename)
        const unifiedDiff = buildUnifiedDiff(file)
        const viewMode = getViewMode(file.additions, file.deletions, width)

        return (
          <box key={file.filename} flexDirection="column" marginBottom={i < files.length - 1 ? 1 : 0}>
            {/* File header */}
            <FileHeader name={name} file={file} boxWidth={boxWidth} />

            {/* AI explanation if available */}
            {file.explanation && (
              <ExplanationBlock explanation={file.explanation} boxWidth={boxWidth} />
            )}

            {/* Native diff rendering */}
            {unifiedDiff ? (
              <DiffView
                diff={unifiedDiff}
                view={viewMode}
                filetype={filetype}
              />
            ) : (
              <box height={1}>
                <text fg="#6b7089">Binary file or no diff available</text>
              </box>
            )}

            {/* Separator between files */}
            {i < files.length - 1 && (
              <box height={1} marginTop={1}>
                <text fg="#3b3d57">{"\u2500".repeat(boxWidth)}</text>
              </box>
            )}
          </box>
        )
      })}
    </box>
  )
}
