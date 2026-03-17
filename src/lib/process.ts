/**
 * Safe subprocess spawning with automatic cleanup.
 *
 * All subprocess calls in raft converge through this module to prevent
 * file descriptor leaks. The safeSpawn() function ensures proc.kill()
 * and proc.unref() are always called, even on error paths - fixing the
 * segfault that occurred after ~72 seconds of rapid gh spawning.
 */

/** Result of a subprocess execution. */
export interface SpawnResult {
  stdout: string
  stderr: string
  exitCode: number
}

/** Options for safeSpawn, passed through to Bun.spawn. */
export interface SafeSpawnOpts {
  env?: Record<string, string | undefined>
  cwd?: string
  /** Timeout in ms. Default 30s. Set 0 to disable. */
  timeoutMs?: number
  /** If true, trim stdout/stderr. Default true for backwards compat. */
  trim?: boolean
}

/**
 * Spawn a subprocess with guaranteed cleanup of file descriptors.
 *
 * Wraps Bun.spawn() in a try/finally that calls proc.kill() and
 * proc.unref() to prevent fd accumulation. By default stdout/stderr
 * are trimmed; pass `trim: false` to preserve exact output (needed
 * for AI-generated file content).
 *
 * Includes a 30s default timeout to prevent hung subprocesses from
 * blocking workflows. Override with `timeoutMs`.
 *
 * @param cmd - Command and arguments array (e.g. ["gh", "pr", "list"])
 * @param opts - Optional env, cwd, timeout, and trim overrides
 * @returns The process stdout, stderr, and exit code
 */
export async function safeSpawn(cmd: string[], opts?: SafeSpawnOpts): Promise<SpawnResult> {
  const timeoutMs = opts?.timeoutMs ?? 30_000
  const shouldTrim = opts?.trim ?? true
  const proc = Bun.spawn(cmd, {
    stdout: "pipe",
    stderr: "pipe",
    env: opts?.env,
    cwd: opts?.cwd,
  })
  const timeout = timeoutMs > 0
    ? setTimeout(() => { try { proc.kill() } catch {} }, timeoutMs)
    : null
  try {
    const [stdout, stderr, exitCode] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
      proc.exited,
    ])
    return {
      stdout: shouldTrim ? stdout.trim() : stdout,
      stderr: shouldTrim ? stderr.trim() : stderr,
      exitCode,
    }
  } finally {
    if (timeout) clearTimeout(timeout)
    try { proc.kill() } catch {}
    proc.unref()
  }
}

/**
 * Build a clean environment for GitHub CLI calls.
 *
 * Strips GITHUB_TOKEN and GH_TOKEN from the inherited environment so
 * the gh CLI uses its own keyring auth rather than tokens that Bun
 * auto-loads from .env files.
 *
 * @returns A copy of process.env without GitHub token variables.
 */
export function buildCleanEnv(): Record<string, string | undefined> {
  const cleanEnv = { ...process.env }
  delete cleanEnv.GITHUB_TOKEN
  delete cleanEnv.GH_TOKEN
  return cleanEnv
}
