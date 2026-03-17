/**
 * AI-powered diff explanation using Claude Code in pipe mode.
 *
 * Generates semantic summaries of file changes by sending preprocessed
 * diffs to Claude Code (`claude -p --model haiku`). Follows research
 * on optimal prompt design: focused prompts (~1800 tokens) with priority
 * weighting outperform exhaustive checklists.
 *
 * Key design decisions:
 * - Preprocess diffs before LLM consumption (skip noise, truncate large diffs)
 * - Extract entity-level context (function/class names from hunk headers)
 * - Streaming callback for progressive UI updates
 * - Concurrency limit to avoid overwhelming subprocess spawning
 */

import type { FileDiff } from "./types"
import { safeSpawn, buildCleanEnv } from "./process"

/** Files that are noise for review purposes and should be skipped. */
const SKIP_PATTERNS = [
  "package-lock.json",
  "pnpm-lock.yaml",
  "yarn.lock",
  "bun.lockb",
  "bun.lock",
  "Cargo.lock",
  "poetry.lock",
  "Gemfile.lock",
  "composer.lock",
  ".snap",
]

// buildCleanEnv is now imported from ./process

/**
 * Checks whether a file should be skipped for AI explanation.
 *
 * Skips lockfiles, binary files, and files with no meaningful patch content.
 *
 * @param file - The file diff to check.
 * @returns `true` if the file should be skipped.
 */
function shouldSkipFile(file: FileDiff): boolean {
  if (!file.patch) return true
  const basename = file.filename.split("/").pop() || ""
  return SKIP_PATTERNS.some(p => basename.endsWith(p))
}

/**
 * Extracts entity names (functions, classes, methods) from diff hunk headers.
 *
 * Git hunk headers (`@@ ... @@ functionName`) often contain the enclosing
 * function or class name, providing valuable entity-level context for the
 * AI explanation without needing a full AST parser.
 *
 * @param patch - The raw patch string from the GitHub API.
 * @returns Array of unique entity names found in hunk headers.
 */
function extractEntities(patch: string): string[] {
  const entities: Set<string> = new Set()
  const hunkPattern = /^@@\s+[^@]+@@\s*(.+)$/gm
  let match: RegExpExecArray | null

  while ((match = hunkPattern.exec(patch)) !== null) {
    const context = match[1].trim()
    if (context) entities.add(context)
  }

  return [...entities]
}

/**
 * Truncates a patch to a reasonable size for LLM consumption.
 *
 * Research shows LLM accuracy drops significantly beyond ~2000 tokens of
 * diff content. Large diffs are truncated with a note so the model knows
 * it's seeing a partial view.
 *
 * @param patch - The raw patch string.
 * @param maxLines - Maximum number of lines to keep (default 150).
 * @returns The truncated patch, with a note if truncation occurred.
 */
function truncatePatch(patch: string, maxLines = 150): string {
  const lines = patch.split("\n")
  if (lines.length <= maxLines) return patch
  return lines.slice(0, maxLines).join("\n") + `\n... (truncated, ${lines.length - maxLines} more lines)`
}

/**
 * Builds the prompt for explaining a single file's changes.
 *
 * Follows the RTCCO framework (Role, Task, Context, Constraints, Output)
 * with priority weighting. Keeps total prompt under ~1800 tokens for
 * optimal accuracy.
 *
 * @param file - The file diff to explain.
 * @returns The formatted prompt string.
 */
function buildPrompt(file: FileDiff): string {
  const entities = extractEntities(file.patch || "")
  const entityContext = entities.length > 0
    ? `\nAffected code entities: ${entities.join(", ")}`
    : ""

  const patch = truncatePatch(file.patch || "")

  return `You are a senior code reviewer. Explain this change.

PRIORITY:
1. WHY was this change made? (motivation, problem being solved)
2. What IMPACT does it have? (behavior change, API change, risk areas)
3. Any RISKS or concerns? (missing error handling, edge cases, breaking changes)

CONSTRAINTS:
- 2-3 sentences. Be substantive, not vague.
- Focus on WHY and IMPACT, not HOW (the diff shows how)
- If trivial (formatting, imports), say so in one sentence
- No markdown formatting

File: ${file.filename}
Status: ${file.status}
Changes: +${file.additions} -${file.deletions}${entityContext}

Diff:
${patch}`
}

/**
 * Generates a semantic explanation of a single file's changes using
 * Claude Code in pipe mode with the haiku model.
 *
 * Preprocesses the diff (skip noise files, truncate large diffs, extract
 * entity context) before sending to the LLM for optimal output quality.
 *
 * @param file - The file diff to explain.
 * @returns A short natural-language explanation, or a fallback message
 *          if the file should be skipped or the subprocess fails.
 */
export async function explainFileDiff(file: FileDiff): Promise<string> {
  if (shouldSkipFile(file)) {
    return "Dependency lockfile or binary, skipped."
  }

  const prompt = buildPrompt(file)

  try {
    // Use safeSpawn to prevent fd leaks from Claude subprocesses
    const { stdout, exitCode } = await safeSpawn(
      ["claude", "-p", "--model", "sonnet", prompt],
      { env: buildCleanEnv() },
    )

    if (exitCode !== 0) {
      return "Failed to generate explanation."
    }

    return stdout || "No explanation generated."
  } catch {
    return "Error generating explanation."
  }
}

/**
 * Callback invoked each time a single file's explanation is generated.
 * Allows the UI to update progressively instead of waiting for all files.
 */
export type ExplainProgressCallback = (
  filename: string,
  explanation: string,
  completedCount: number,
  totalCount: number,
) => void

/**
 * Generates AI explanations for multiple file diffs with progressive callbacks.
 *
 * Files are processed in parallel batches of 3 to balance speed with
 * resource usage. Noise files (lockfiles, binaries) are skipped automatically.
 * The `onProgress` callback fires after each file completes, enabling the UI
 * to update incrementally rather than waiting for the full batch.
 *
 * @param files - Array of file diffs to generate explanations for.
 * @param onProgress - Optional callback for progressive UI updates.
 * @returns A `Map` keyed by filename with the generated explanations.
 */
export async function explainAllDiffs(
  files: FileDiff[],
  onProgress?: ExplainProgressCallback,
): Promise<Map<string, string>> {
  const results = new Map<string, string>()
  const explainableFiles = files.filter(f => !shouldSkipFile(f))
  const totalCount = explainableFiles.length
  let completedCount = 0

  // Process in batches of 3 to avoid overwhelming the system
  const batchSize = 3
  for (let i = 0; i < explainableFiles.length; i += batchSize) {
    const batch = explainableFiles.slice(i, i + batchSize)
    const explanations = await Promise.all(
      batch.map(file => explainFileDiff(file))
    )

    for (let j = 0; j < batch.length; j++) {
      const filename = batch[j].filename
      const explanation = explanations[j]
      results.set(filename, explanation)
      completedCount++
      onProgress?.(filename, explanation, completedCount, totalCount)
    }
  }

  // Mark skipped files
  for (const file of files) {
    if (shouldSkipFile(file) && !results.has(file.filename)) {
      results.set(file.filename, "Dependency lockfile or binary, skipped.")
    }
  }

  return results
}

/**
 * Generate a holistic PR-level narrative summarizing all changes.
 *
 * Unlike per-file explanations, this sends ALL diffs together to Claude
 * (sonnet) so it can reason about the overall change. Returns a structured
 * narrative covering: what the PR does, why, key decisions, risks, and
 * what a reviewer should focus on.
 *
 * @param files - All file diffs in the PR.
 * @param prDescription - The PR body/description text.
 * @returns A multi-line narrative summary string.
 */
export async function explainPR(
  files: FileDiff[],
  prDescription: string,
): Promise<string> {
  const explainableFiles = files.filter(f => !shouldSkipFile(f))
  if (explainableFiles.length === 0) return "No meaningful changes to summarize."

  // Build combined diff context (truncate each file to keep total reasonable)
  const fileSummaries = explainableFiles.map(f => {
    const entities = extractEntities(f.patch || "")
    const entityStr = entities.length > 0 ? ` (entities: ${entities.join(", ")})` : ""
    const patch = truncatePatch(f.patch || "", 80) // Shorter per file since we send all
    return `### ${f.filename} (${f.status}, +${f.additions} -${f.deletions})${entityStr}\n${patch}`
  }).join("\n\n")

  const prompt = `You are a senior code reviewer writing a PR summary for another reviewer.

PR DESCRIPTION:
${prDescription || "(no description provided)"}

ALL FILE CHANGES:
${fileSummaries}

Write a concise review summary with these sections (use plain text, no markdown headers):

WHAT: 1-2 sentences on what this PR does overall.
WHY: Inferred motivation (from description, code patterns, commit style).
KEY DECISIONS: Notable architectural or design choices visible in the diff.
RISKS: Missing error handling, untested paths, potential regressions, edge cases.
REVIEW FOCUS: Which files/areas a reviewer should look at most carefully and why.

Keep the entire summary under 15 lines. Be specific, not generic.`

  try {
    const { stdout, exitCode } = await safeSpawn(
      ["claude", "-p", "--model", "sonnet", prompt],
      { env: buildCleanEnv() },
    )

    if (exitCode !== 0 || !stdout.trim()) {
      return "Failed to generate PR summary."
    }

    return stdout.trim()
  } catch {
    return "Error generating PR summary."
  }
}
