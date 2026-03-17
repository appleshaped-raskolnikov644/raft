/**
 * Diff utilities for rendering PR file diffs using OpenTUI's native `<diff>` component.
 *
 * Follows the same architecture as Critique (remorses/critique):
 * - Converts GitHub API patches to proper unified diff format
 * - Detects file language for Tree-sitter syntax highlighting
 * - Auto-selects split vs unified view based on terminal width
 */

import type { FileDiff } from "./types"

/**
 * Wraps a GitHub API patch string with proper unified diff headers.
 *
 * GitHub's REST API returns patches starting at `@@` hunk markers without
 * the `--- a/file` / `+++ b/file` headers that OpenTUI's `<diff>` component
 * expects. This function prepends those headers to create a valid unified diff.
 *
 * @param file - The file diff from the GitHub API.
 * @returns A complete unified diff string suitable for OpenTUI's `<diff>` component,
 *          or an empty string if the file has no patch content.
 */
export function buildUnifiedDiff(file: FileDiff): string {
  if (!file.patch) return ""

  const oldName = file.status === "added" ? "/dev/null" : file.filename
  const newName = file.status === "removed" ? "/dev/null" : file.filename

  // For renames, use the previous filename as the old side
  const oldDisplay = file.previousFilename ?? oldName

  return `--- ${oldDisplay}\n+++ ${newName}\n${file.patch}`
}

/**
 * Detects the Tree-sitter language identifier from a filename's extension.
 *
 * Maps file extensions to the parser names recognized by OpenTUI's syntax
 * highlighting engine. Based on Critique's `detectFiletype` mapping with
 * coverage for common web, systems, and scripting languages.
 *
 * @param filePath - The file path or name to detect language for.
 * @returns The Tree-sitter language name, or `undefined` if the extension
 *          is not recognized.
 */
export function detectFiletype(filePath: string): string | undefined {
  const ext = filePath.split(".").pop()?.toLowerCase()
  switch (ext) {
    // TypeScript parser handles TS/TSX/JS/JSX as a superset
    case "ts":
    case "tsx":
    case "js":
    case "jsx":
    case "mjs":
    case "cjs":
    case "mts":
    case "cts":
      return "typescript"
    case "json":
    case "jsonc":
      return "json"
    case "md":
    case "mdx":
      return "markdown"
    case "py":
    case "pyw":
    case "pyi":
      return "python"
    case "rs":
      return "rust"
    case "go":
      return "go"
    case "cpp":
    case "cc":
    case "cxx":
    case "hpp":
    case "h":
      return "cpp"
    case "c":
      return "c"
    case "java":
      return "java"
    case "rb":
    case "rake":
      return "ruby"
    case "sh":
    case "bash":
    case "zsh":
      return "bash"
    case "html":
    case "htm":
    case "xml":
    case "svg":
      return "html"
    case "css":
    case "scss":
    case "less":
      return "css"
    case "yaml":
    case "yml":
      return "yaml"
    case "swift":
      return "swift"
    case "php":
      return "php"
    case "scala":
      return "scala"
    case "cs":
      return "csharp"
    default:
      return undefined
  }
}

/**
 * Determines whether to use split or unified diff view based on the
 * nature of changes and available terminal width.
 *
 * Follows Critique's logic:
 * - Files that are entirely added or deleted always use unified view
 *   (split would show one empty pane)
 * - Otherwise, split view is used when the terminal is wide enough
 *
 * @param additions - Number of added lines in the diff.
 * @param deletions - Number of deleted lines in the diff.
 * @param cols      - Available terminal width in columns.
 * @param splitThreshold - Minimum columns required for split view (default 100).
 * @returns `"split"` or `"unified"` view mode.
 */
export function getViewMode(
  additions: number,
  deletions: number,
  cols: number,
  splitThreshold: number = 100,
): "split" | "unified" {
  // Fully added or deleted files look wrong in split view (one side is empty)
  const isFullyAdded = additions > 0 && deletions === 0
  const isFullyDeleted = deletions > 0 && additions === 0
  if (isFullyAdded || isFullyDeleted) return "unified"

  return cols >= splitThreshold ? "split" : "unified"
}

/** Placeholder marker for collapsed diff regions. */
export const COLLAPSE_MARKER = "@@COLLAPSED@@"

/**
 * Collapse unchanged context regions in a unified diff.
 *
 * Identifies runs of context lines (those starting with " ") that
 * exceed the context threshold and replaces them with a collapse
 * marker showing how many lines were hidden. This makes large diffs
 * scannable by showing only changes + minimal surrounding context.
 *
 * @param patch - The unified diff patch string.
 * @param contextLines - Number of context lines to keep around each change (default 3).
 * @returns Object with collapsed patch and array of collapsed region info.
 */
export function collapseDiffRegions(
  patch: string,
  contextLines: number = 3,
): { collapsed: string; hiddenRegions: Array<{ startLine: number; count: number }> } {
  const lines = patch.split("\n")
  const result: string[] = []
  const hiddenRegions: Array<{ startLine: number; count: number }> = []

  let contextRun: string[] = []
  let contextStartLine = 0

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]

    // Hunk headers and change lines break context runs
    if (line.startsWith("@@") || line.startsWith("+") || line.startsWith("-")) {
      // Flush any accumulated context
      if (contextRun.length > contextLines * 2 + 1) {
        // Keep first N context lines, collapse middle, keep last N
        const kept = contextLines
        for (let j = 0; j < kept; j++) result.push(contextRun[j])
        const hidden = contextRun.length - kept * 2
        hiddenRegions.push({ startLine: contextStartLine + kept, count: hidden })
        result.push(`${COLLAPSE_MARKER} ${hidden} lines hidden`)
        for (let j = contextRun.length - kept; j < contextRun.length; j++) result.push(contextRun[j])
      } else {
        // Context run is short enough, keep all
        result.push(...contextRun)
      }
      contextRun = []
      result.push(line)
    } else {
      // Context line (starts with " " or is empty in the diff)
      if (contextRun.length === 0) contextStartLine = i
      contextRun.push(line)
    }
  }

  // Flush trailing context
  if (contextRun.length > contextLines + 1) {
    const kept = contextLines
    for (let j = 0; j < kept; j++) result.push(contextRun[j])
    const hidden = contextRun.length - kept
    hiddenRegions.push({ startLine: contextStartLine + kept, count: hidden })
    result.push(`${COLLAPSE_MARKER} ${hidden} lines hidden`)
  } else {
    result.push(...contextRun)
  }

  return { collapsed: result.join("\n"), hiddenRegions }
}
