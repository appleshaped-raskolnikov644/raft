/**
 * Shared git and GitHub CLI helper functions.
 *
 * Centralizes subprocess spawning for git and gh commands that were
 * previously duplicated across nav.tsx, merge.tsx, and sync.tsx.
 * All calls route through safeSpawn() to prevent fd leaks.
 */

import { safeSpawn, buildCleanEnv } from "./process"

/**
 * Run a git command and return its stdout.
 *
 * @param args - Arguments to pass to git (e.g. ["checkout", "main"])
 * @throws Error if the command exits with non-zero status
 * @returns Trimmed stdout output
 */
export async function runGit(args: string[]): Promise<string> {
  const { stdout, stderr, exitCode } = await safeSpawn(["git", ...args])
  if (exitCode !== 0) throw new Error(stderr || `git ${args[0]} failed`)
  return stdout
}

/**
 * Merge a PR using gh CLI with squash and auto-merge.
 *
 * @param repo - Repository in owner/repo format
 * @param prNumber - PR number to merge
 * @throws Error if the merge command fails
 */
export async function runGhMerge(repo: string, prNumber: number): Promise<void> {
  const { stderr, exitCode } = await safeSpawn(
    ["gh", "pr", "merge", String(prNumber), "--repo", repo, "--squash", "--auto"],
    { env: buildCleanEnv() },
  )
  if (exitCode !== 0) {
    throw new Error(stderr)
  }
}

/**
 * Check CI status for a PR.
 *
 * Handles gh pr checks exit codes:
 * - 0: command succeeded (parse JSON for check states)
 * - 8: at least one check pending
 * - 4: auth required
 * - 1: generic failure (checks failing or command error)
 *
 * @param repo - Repository in owner/repo format
 * @param prNumber - PR number to check
 * @returns "ready", "pending", or "failing"
 */
export async function checkPRCIStatus(repo: string, prNumber: number): Promise<"ready" | "pending" | "failing"> {
  const { stdout, exitCode } = await safeSpawn(
    ["gh", "pr", "checks", String(prNumber), "--repo", repo, "--json", "state"],
    { env: buildCleanEnv() },
  )

  // Exit code 8 = checks pending
  if (exitCode === 8) return "pending"
  // Exit code 4 = auth error, 1 = generic failure
  if (exitCode === 4 || exitCode === 1) return "failing"

  // Exit code 0: parse the JSON output
  if (exitCode === 0) {
    try {
      const checks = JSON.parse(stdout) as Array<{ state: string }>
      if (checks.length === 0) return "ready"
      if (checks.some((c) => c.state === "FAILURE" || c.state === "ERROR")) return "failing"
      if (checks.some((c) => c.state === "PENDING" || c.state === "EXPECTED")) return "pending"
      return "ready"
    } catch {
      return "failing"
    }
  }

  // Unknown exit code
  return "failing"
}
