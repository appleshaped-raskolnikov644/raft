/**
 * Review session persistence and smart file ordering.
 *
 * Tracks which files a reviewer has examined, persists across sessions,
 * and orders files by review impact (most important first).
 *
 * State is saved to ~/.config/raft/reviews/{repo}-{pr}.json so you can
 * close raft and resume your review where you left off.
 */

import { homedir } from "node:os"
import type { FileDiff } from "./types"

/** Persistent review state for a single file. */
interface FileReviewState {
  viewed: boolean
  viewedAt: string | null
}

/** Persistent review session data. */
export interface ReviewSession {
  repo: string
  prNumber: number
  /** Per-file review state keyed by filename. */
  files: Record<string, FileReviewState>
  /** ISO timestamp of last activity. */
  lastActivity: string
}

/** Get the config base directory, respecting XDG and platform conventions. */
function getConfigDir(): string | null {
  if (process.env.XDG_CONFIG_HOME) return process.env.XDG_CONFIG_HOME
  try {
    const home = homedir()
    if (home) return `${home}/.config`
  } catch {}
  return null
}

/** Get the path to the review session file for a PR. Returns null if home is unset. */
function sessionPath(repo: string, prNumber: number): string | null {
  const configDir = getConfigDir()
  if (!configDir) return null
  const safeRepo = repo.replace("/", "-")
  return `${configDir}/raft/reviews/${safeRepo}-${prNumber}.json`
}

/**
 * Load a review session from disk, or create a new one.
 *
 * @param repo - Repository in owner/repo format.
 * @param prNumber - PR number.
 * @returns The loaded or new review session.
 */
export async function loadSession(repo: string, prNumber: number): Promise<ReviewSession> {
  const path = sessionPath(repo, prNumber)
  if (!path) return { repo, prNumber, files: {}, lastActivity: new Date().toISOString() }

  try {
    const file = Bun.file(path)
    if (await file.exists()) {
      const data = await file.json()
      // Basic shape validation before trusting the file
      if (
        typeof data === "object" && data !== null &&
        typeof data.repo === "string" &&
        typeof data.prNumber === "number" &&
        typeof data.files === "object"
      ) {
        return data as ReviewSession
      }
    }
  } catch { /* file doesn't exist or is corrupt */ }

  return {
    repo,
    prNumber,
    files: {},
    lastActivity: new Date().toISOString(),
  }
}

/**
 * Save a review session to disk.
 *
 * Creates the ~/.config/raft/reviews/ directory if it doesn't exist.
 *
 * @param session - The session to save.
 */
export async function saveSession(session: ReviewSession): Promise<void> {
  const path = sessionPath(session.repo, session.prNumber)
  if (!path) return

  const dir = path.substring(0, path.lastIndexOf("/"))
  try {
    const { exitCode } = await import("./process").then(m =>
      m.safeSpawn(["mkdir", "-p", dir])
    )
    if (exitCode !== 0) return

    session.lastActivity = new Date().toISOString()
    await Bun.write(path, JSON.stringify(session, null, 2))
  } catch { /* best effort */ }
}

/**
 * Mark a file as viewed in the review session.
 *
 * @param session - The active review session (modified in place).
 * @param filename - The file to mark as viewed.
 */
export function markViewed(session: ReviewSession, filename: string): void {
  session.files[filename] = {
    viewed: true,
    viewedAt: new Date().toISOString(),
  }
}

/**
 * Mark a file as unviewed in the review session.
 *
 * @param session - The active review session (modified in place).
 * @param filename - The file to mark as unviewed.
 */
export function markUnviewed(session: ReviewSession, filename: string): void {
  session.files[filename] = {
    viewed: false,
    viewedAt: null,
  }
}

/**
 * Check if a file has been viewed in the session.
 *
 * @param session - The review session to check.
 * @param filename - The file to check.
 * @returns true if the file has been viewed.
 */
export function isViewed(session: ReviewSession, filename: string): boolean {
  return session.files[filename]?.viewed === true
}

/**
 * Count viewed and total files.
 *
 * @param session - The review session.
 * @param files - The file diffs to count against.
 * @returns Object with viewed count and total count.
 */
export function reviewProgress(session: ReviewSession, files: FileDiff[]): { viewed: number; total: number } {
  const total = files.length
  const viewed = files.filter(f => isViewed(session, f.filename)).length
  return { viewed, total }
}

/**
 * Sort files by review impact (most important first).
 *
 * Impact heuristic: (additions + deletions) * weight, where:
 * - Source code files get 1.5x weight
 * - Test files appear after their implementation files
 * - Config/generated files go last
 *
 * @param files - The file diffs to sort.
 * @returns A new array sorted by review impact (descending).
 */
export function sortByImpact(files: FileDiff[]): FileDiff[] {
  return [...files].sort((a, b) => {
    const aImpact = fileImpact(a)
    const bImpact = fileImpact(b)
    return bImpact - aImpact
  })
}

/** Compute a review impact score for a file. */
function fileImpact(file: FileDiff): number {
  const changes = file.additions + file.deletions
  const name = file.filename.toLowerCase()

  // Config and generated files have low impact
  if (name.endsWith(".json") || name.endsWith(".yaml") || name.endsWith(".yml") ||
      name.endsWith(".lock") || name.endsWith(".config.ts") || name.endsWith(".config.js") ||
      name.includes("generated") || name.includes(".snap")) {
    return changes * 0.3
  }

  // Test files have moderate impact but should follow their implementation
  if (name.includes("test") || name.includes("spec") || name.includes("__tests__")) {
    return changes * 0.7
  }

  // Source code files have highest impact
  return changes * 1.5
}

/**
 * Find the index of the next unviewed file.
 *
 * @param session - The review session.
 * @param files - The file diffs in display order.
 * @param currentIndex - The current file index.
 * @returns Index of the next unviewed file, or -1 if all viewed.
 */
export function nextUnviewed(session: ReviewSession, files: FileDiff[], currentIndex: number): number {
  // Search forward from current position
  for (let i = currentIndex + 1; i < files.length; i++) {
    if (!isViewed(session, files[i].filename)) return i
  }
  // Wrap around to beginning
  for (let i = 0; i <= currentIndex; i++) {
    if (!isViewed(session, files[i].filename)) return i
  }
  return -1
}
