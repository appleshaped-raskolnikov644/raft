/**
 * Proactive AI review intelligence.
 *
 * Runs a one-shot analysis of all PR diffs using Claude (sonnet) to
 * identify potential bugs, missing tests, security issues, and
 * cross-PR conflicts. Findings are cached per PR session.
 *
 * This is the feature that doesn't exist anywhere else: a local tool
 * with full repo context that proactively flags problems before a
 * human reviewer has to find them manually.
 */

import { safeSpawn, buildCleanEnv } from "./process"
import type { FileDiff } from "./types"

/** Severity level for a review finding. */
export type FindingSeverity = "bug" | "test" | "security" | "warning" | "info"

/** Result of a review scan: either findings or a scan failure. */
export type ScanResult =
  | { ok: true; findings: ReviewFinding[] }
  | { ok: false; error: string }

/** A single finding from the AI review scan. */
export interface ReviewFinding {
  severity: FindingSeverity
  /** File path where the issue was found. */
  path: string
  /** Line number (approximate, from the AI). */
  line: number | null
  /** Short description of the finding. */
  summary: string
  /** Whether the user has dismissed this finding. */
  dismissed: boolean
}

/** Skip patterns for files that don't need review scanning. */
const SKIP_PATTERNS = [
  "package-lock.json", "pnpm-lock.yaml", "yarn.lock",
  "bun.lockb", "bun.lock", "Cargo.lock",
  ".snap", ".min.js", ".min.css",
]

function shouldSkipFile(filename: string): boolean {
  const basename = filename.split("/").pop() || ""
  return SKIP_PATTERNS.some(p => basename.endsWith(p))
}

/**
 * Run a proactive review scan on all PR file diffs.
 *
 * Sends all diffs to Claude (sonnet) with instructions to look for
 * bugs, missing tests, security issues, and breaking changes.
 * Returns structured findings that can be displayed in the UI.
 *
 * This is a one-shot analysis (takes 10-20s) that should be cached
 * for the session. Cost is approximately $0.02 per PR.
 *
 * @param files - All file diffs in the PR.
 * @param prDescription - The PR body/description.
 * @param onProgress - Optional callback for streaming progress updates.
 * @returns ScanResult with findings on success, or error on failure.
 */
export async function runReviewScan(
  files: FileDiff[],
  prDescription: string,
  onProgress?: (status: string) => void,
): Promise<ScanResult> {
  const scannable = files.filter(f => f.patch && !shouldSkipFile(f.filename))
  if (scannable.length === 0) return { ok: true, findings: [] }

  onProgress?.("Scanning PR for issues...")

  // Build combined diff context
  const fileDiffs = scannable.map(f => {
    const patch = (f.patch || "").split("\n").slice(0, 100).join("\n")
    return `### ${f.filename} (${f.status}, +${f.additions} -${f.deletions})\n${patch}`
  }).join("\n\n")

  const prompt = `You are a senior code reviewer doing a thorough review. Analyze these changes and find REAL issues (not style nitpicks).

PR DESCRIPTION:
${prDescription || "(none)"}

FILE CHANGES:
${fileDiffs}

Look for:
1. BUGS: Logic errors, null pointer risks, race conditions, off-by-one errors
2. MISSING TESTS: New functions/paths without test coverage
3. SECURITY: SQL injection, XSS, auth bypasses, secret exposure
4. BREAKING CHANGES: Changed return types, removed fields, API contract violations
5. MISSING ERROR HANDLING: Uncaught exceptions, unhandled promise rejections

Output ONLY a JSON array of findings. Each finding must have:
- "severity": "bug" | "test" | "security" | "warning" | "info"
- "path": the file path
- "line": line number or null
- "summary": one sentence describing the issue

If no real issues found, output an empty array: []
Do NOT include markdown fences, explanations, or anything other than the JSON array.`

  try {
    onProgress?.("AI analyzing diffs...")

    const { stdout, exitCode } = await safeSpawn(
      ["claude", "-p", "--model", "sonnet", prompt],
      { env: buildCleanEnv() },
    )

    if (exitCode !== 0) {
      return { ok: false, error: `Claude exited with code ${exitCode}` }
    }
    if (!stdout.trim()) {
      return { ok: false, error: "Empty response from Claude" }
    }

    // Parse the JSON response, handling potential markdown fences
    let jsonStr = stdout.trim()
    if (jsonStr.startsWith("```")) {
      jsonStr = jsonStr.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "")
    }

    let parsed: unknown
    try {
      parsed = JSON.parse(jsonStr)
    } catch (e) {
      return { ok: false, error: `Failed to parse scan output: ${e instanceof Error ? e.message : "unknown"}` }
    }

    const findings = parsed as Array<{
      severity: string
      path: string
      line: number | null
      summary: string
    }>

    // Validate and normalize findings
    const validSeverities = new Set(["bug", "test", "security", "warning", "info"])
    return {
      ok: true,
      findings: findings
        .filter(f => validSeverities.has(f.severity) && f.path && f.summary)
        .map(f => ({
          severity: f.severity as FindingSeverity,
          path: f.path,
          line: f.line,
          summary: f.summary,
          dismissed: false,
        }))
        .sort((a, b) => {
          const order: Record<string, number> = { bug: 0, security: 1, test: 2, warning: 3, info: 4 }
          return (order[a.severity] ?? 5) - (order[b.severity] ?? 5)
        }),
    }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Unknown scan error" }
  }
}
