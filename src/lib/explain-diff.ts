import type { FileDiff } from "./types"

/**
 * Builds a clean environment for spawning Claude Code subprocesses.
 *
 * Strips GITHUB_TOKEN and GH_TOKEN from the inherited environment so that
 * Claude Code (and any `gh` calls it may make internally) uses its own
 * keyring auth rather than tokens that Bun auto-loads from `.env`.
 *
 * @returns A copy of `process.env` without GitHub token variables.
 */
function buildCleanEnv(): Record<string, string | undefined> {
  const cleanEnv = { ...process.env }
  delete cleanEnv.GITHUB_TOKEN
  delete cleanEnv.GH_TOKEN
  return cleanEnv
}

/**
 * Generates a semantic explanation of a single file's changes using
 * Claude Code in pipe mode (`-p`) with the `haiku` model.
 *
 * The function constructs a prompt containing the filename, status,
 * change stats, and full patch, then asks Claude for a 1-2 sentence
 * business-logic summary.
 *
 * @param file - The file diff to explain, including its patch content.
 * @returns A short natural-language explanation, or a fallback message
 *          if the file has no patch, the subprocess fails, or an error
 *          is thrown.
 */
export async function explainFileDiff(file: FileDiff): Promise<string> {
  if (!file.patch) {
    return "Binary file or no changes to explain."
  }

  const prompt = `Explain what changed in this file in 1-2 clear sentences. Focus on the business logic/functionality, not implementation details.

Filename: ${file.filename}
Status: ${file.status}
Changes: +${file.additions} -${file.deletions}

Diff:
${file.patch}

Explanation:`

  try {
    const proc = Bun.spawn(["claude", "-p", "--model", "haiku", prompt], {
      stdout: "pipe",
      stderr: "pipe",
      env: buildCleanEnv(),
    })

    const stdout = await new Response(proc.stdout).text()
    const exitCode = await proc.exited

    if (exitCode !== 0) {
      return "Failed to generate explanation."
    }

    // Extract the explanation (Claude Code may include formatting)
    const explanation = stdout.trim()
    return explanation || "No explanation generated."
  } catch (error) {
    console.error("Error calling Claude Code:", error)
    return "Error generating explanation."
  }
}

/**
 * Generates AI explanations for multiple file diffs in parallel batches.
 *
 * Files are processed in batches of 3 to avoid overwhelming the system
 * with too many concurrent Claude Code subprocesses.
 *
 * @param files - Array of file diffs to generate explanations for.
 * @returns A `Map` keyed by filename, where each value is the generated
 *          explanation string for that file.
 */
export async function explainAllDiffs(files: FileDiff[]): Promise<Map<string, string>> {
  const results = new Map<string, string>()

  // Limit concurrency to avoid overwhelming the system
  const batchSize = 3
  for (let i = 0; i < files.length; i += batchSize) {
    const batch = files.slice(i, i + batchSize)
    const explanations = await Promise.all(
      batch.map(file => explainFileDiff(file))
    )

    for (let j = 0; j < batch.length; j++) {
      results.set(batch[j].filename, explanations[j])
    }
  }

  return results
}
