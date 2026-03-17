---
# raft-25j2
title: 'Segfault in raft ls: file descriptor leak in runGh()'
status: completed
type: bug
priority: normal
created_at: 2026-03-16T21:13:00Z
updated_at: 2026-03-17T05:44:28Z
---

`raft ls` crashes with a Bun segfault after ~72 seconds. Crash report: https://bun.report/1.3.9/Ma1cf6cdbbiHswogC_____2utr+Cm7ir+Cm7ir+C__________urrh+C2uw1pCA2Cowgg0G

## Root cause

`runGh()` in `src/lib/github.ts` spawns `gh` processes via `Bun.spawn()` without explicit cleanup. The process handles and file descriptors are never closed. During multi-account PR fetching (`fetchAllAccountPRs`), the flow is:

1. `getGhAccounts()` - spawns `gh auth status`
2. `getActiveAccount()` - spawns `gh auth status` again
3. For each account: `switchAccount()` - spawns `gh auth switch`
4. For each account: `runGh(["search", "prs", ...])` - spawns `gh search prs`
5. Restore account: `switchAccount()` again

That's 2 + (2 * numAccounts) + 1 spawned processes minimum, none cleaned up. File descriptors accumulate until the OS refuses to create new ones, causing Bun to segfault.

## Environment

- Bun 1.3.9
- macOS Silicon (Darwin 25.3.0)
- RSS at crash: 0.20GB, Peak: 0.22GB

## Fix approach

Add explicit process cleanup in `runGh()`:
```ts
async function runGh(args: string[]): Promise<string> {
  const cleanEnv = { ...process.env }
  delete cleanEnv.GITHUB_TOKEN
  delete cleanEnv.GH_TOKEN
  const proc = Bun.spawn(["gh", ...args], {
    stdout: "pipe",
    stderr: "pipe",
    env: cleanEnv,
  })
  try {
    const stdout = await new Response(proc.stdout).text()
    const stderr = await new Response(proc.stderr).text()
    const exitCode = await proc.exited
    if (exitCode !== 0) {
      throw new Error(`gh ${args.join(" ")} failed: ${stderr}`)
    }
    return stdout.trim()
  } finally {
    proc.kill()
    proc.unref()
  }
}
```

Also check `explain-diff.ts` for same pattern with Claude subprocess spawning.



---
**Completed:** safeSpawn in src/lib/process.ts replaces Bun.spawn with proper stdout/stderr stream consumption and fd cleanup. merge.tsx and nav.tsx updated to use shared git-utils.
