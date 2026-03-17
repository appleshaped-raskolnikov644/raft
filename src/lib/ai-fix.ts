/**
 * AI-powered auto-fix pipeline for review comments.
 *
 * Takes an unresolved review thread (comment + code context) and generates
 * a proposed fix using Claude Code. The fix is returned as a diff that can
 * be applied to the working tree. The pipeline:
 * 1. Read the current file content from the local repo
 * 2. Build a prompt with: reviewer comment, surrounding code, PR context
 * 3. Send to Claude (sonnet) for a targeted fix
 * 4. Return the proposed change as before/after content
 */

import { safeSpawn, buildCleanEnv } from "./process"
import type { ReviewThread } from "./github"

/** A proposed fix for a single review thread. */
export interface ProposedFix {
  /** The file path the fix applies to. */
  path: string
  /** The reviewer's comment that prompted the fix. */
  comment: string
  /** The reviewer's username. */
  reviewer: string
  /** Line number in the file (if available). */
  line: number | null
  /** The proposed fix as a unified diff snippet. */
  diff: string
  /** Full modified file content to write if applying. */
  modifiedContent: string
  /** Original file content before the fix. */
  originalContent: string
  /** The thread ID for resolution after applying. */
  threadId: string
}

/**
 * Generate a fix for a single review thread using Claude Code.
 *
 * Reads the file from the working tree, sends the reviewer's comment
 * plus surrounding code to Claude, and returns a proposed fix.
 *
 * @param thread - The review thread with comment and file path.
 * @param repoRoot - Absolute path to the local git repo root.
 * @returns A proposed fix, or null if the fix couldn't be generated.
 */
export async function generateFix(
  thread: ReviewThread,
  repoRoot: string,
): Promise<ProposedFix | null> {
  if (thread.comments.length === 0) return null

  const firstComment = thread.comments[0]
  const filePath = firstComment.path
  const line = firstComment.line

  // Read the current file content from the working tree
  let fileContent: string
  try {
    const file = Bun.file(`${repoRoot}/${filePath}`)
    fileContent = await file.text()
  } catch {
    return null // File doesn't exist locally
  }

  // Build context: the reviewer's full comment chain
  const commentChain = thread.comments
    .map(c => `@${c.author}: ${c.body}`)
    .join("\n\n")

  // Extract surrounding code for context (20 lines around the target line)
  const lines = fileContent.split("\n")
  const targetLine = line ?? Math.floor(lines.length / 2)
  const contextStart = Math.max(0, targetLine - 10)
  const contextEnd = Math.min(lines.length, targetLine + 10)
  const contextLines = lines.slice(contextStart, contextEnd)
    .map((l, i) => `${contextStart + i + 1}: ${l}`)
    .join("\n")

  const prompt = `You are fixing a code review comment. Output ONLY the modified file content, nothing else.

FILE: ${filePath}
REVIEW COMMENT:
${commentChain}

SURROUNDING CODE (lines ${contextStart + 1}-${contextEnd}):
${contextLines}

FULL FILE:
${fileContent}

Fix the issue described in the review comment. Output the COMPLETE modified file content. Do not include any explanation, markdown fences, or anything other than the file content.`

  try {
    const { stdout, exitCode } = await safeSpawn(
      ["claude", "-p", "--model", "sonnet", prompt],
      { env: buildCleanEnv(), trim: false },
    )

    if (exitCode !== 0 || !stdout.trim()) {
      return null
    }

    // trimEnd to remove trailing whitespace but preserve leading content
    const modifiedContent = stdout.trimEnd()

    // Generate a simple diff for display
    const diff = generateSimpleDiff(fileContent, modifiedContent, filePath)

    return {
      path: filePath,
      comment: firstComment.body,
      reviewer: firstComment.author,
      line,
      diff,
      modifiedContent,
      originalContent: fileContent,
      threadId: thread.id,
    }
  } catch {
    return null
  }
}

/**
 * Apply a proposed fix by writing the modified content to the file.
 *
 * @param fix - The proposed fix to apply.
 * @param repoRoot - Absolute path to the local git repo root.
 */
export async function applyFix(fix: ProposedFix, repoRoot: string): Promise<void> {
  const filePath = `${repoRoot}/${fix.path}`
  await Bun.write(filePath, fix.modifiedContent)
}

/**
 * Generate a simple unified diff between original and modified content.
 * Shows only the changed lines with minimal context.
 */
function generateSimpleDiff(original: string, modified: string, filePath: string): string {
  const origLines = original.split("\n")
  const modLines = modified.split("\n")

  const diffLines: string[] = [`--- a/${filePath}`, `+++ b/${filePath}`]

  // Find changed regions (simple line-by-line comparison)
  let i = 0
  while (i < Math.max(origLines.length, modLines.length)) {
    if (origLines[i] !== modLines[i]) {
      // Found a difference - show context around it
      const start = Math.max(0, i - 2)
      const end = Math.min(Math.max(origLines.length, modLines.length), i + 5)

      diffLines.push(`@@ -${start + 1} +${start + 1} @@`)

      for (let j = start; j < end; j++) {
        if (j < origLines.length && j < modLines.length && origLines[j] === modLines[j]) {
          diffLines.push(` ${origLines[j]}`)
        } else {
          if (j < origLines.length) diffLines.push(`-${origLines[j]}`)
          if (j < modLines.length) diffLines.push(`+${modLines[j]}`)
        }
      }

      // Skip past this changed region
      i = end
    } else {
      i++
    }
  }

  return diffLines.join("\n")
}
