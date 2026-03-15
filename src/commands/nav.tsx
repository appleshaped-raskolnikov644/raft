import { useState, useEffect } from "react"
import { useKeyboard, useRenderer } from "@opentui/react"
import { fetchRepoPRs, getCurrentRepo } from "../lib/github"
import { detectStacks } from "../lib/stack"
import { Spinner } from "../components/spinner"
import type { Stack, StackedPR } from "../lib/types"

// Shared by create, up, down, restack commands

async function runGit(args: string[]): Promise<string> {
  const proc = Bun.spawn(["git", ...args], { stdout: "pipe", stderr: "pipe" })
  const stdout = await new Response(proc.stdout).text()
  const stderr = await new Response(proc.stderr).text()
  const code = await proc.exited
  if (code !== 0) throw new Error(stderr.trim() || `git ${args[0]} failed`)
  return stdout.trim()
}

async function getCurrentBranch(): Promise<string> {
  return runGit(["rev-parse", "--abbrev-ref", "HEAD"])
}

interface NavCommandProps {
  direction: "up" | "down"
}

export function NavCommand({ direction }: NavCommandProps) {
  const renderer = useRenderer()
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useKeyboard((key) => {
    if (key.name === "q" || key.name === "escape") {
      renderer.destroy()
    }
  })

  useEffect(() => {
    async function nav() {
      try {
        const repo = await getCurrentRepo()
        if (!repo) { setError("Not in a git repo"); return }

        const currentBranch = await getCurrentBranch()
        const prs = await fetchRepoPRs(repo)
        const stacks = detectStacks(prs)

        // Find current branch in a stack
        let currentPR: StackedPR | null = null
        let currentStack: Stack | null = null
        for (const stack of stacks) {
          for (const pr of stack.prs) {
            if (pr.headRefName === currentBranch) {
              currentPR = pr
              currentStack = stack
              break
            }
          }
          if (currentPR) break
        }

        if (!currentPR || !currentStack) {
          setError(`Branch '${currentBranch}' is not part of any stack`)
          return
        }

        let targetPR: StackedPR | null = null
        if (direction === "up") {
          const nextIdx = currentStack.prs.findIndex((p) => p.number === currentPR!.number) + 1
          targetPR = currentStack.prs[nextIdx] ?? null
          if (!targetPR) { setError("Already at the top of the stack"); return }
        } else {
          const prevIdx = currentStack.prs.findIndex((p) => p.number === currentPR!.number) - 1
          targetPR = currentStack.prs[prevIdx] ?? null
          if (!targetPR) { setError("Already at the bottom of the stack"); return }
        }

        await runGit(["checkout", targetPR.headRefName])
        setMessage(`Switched to ${targetPR.headRefName} (#${targetPR.number}: ${targetPR.originalTitle})`)
      } catch (e) {
        setError(e instanceof Error ? e.message : "Navigation failed")
      }
    }
    nav()
  }, [direction])

  if (error) {
    return (
      <box padding={1}>
        <text fg="#f7768e">{error}</text>
      </box>
    )
  }

  if (!message) {
    return (
      <box padding={1}>
        <Spinner text={`Moving ${direction} the stack...`} />
      </box>
    )
  }

  // Auto-exit after success
  useEffect(() => {
    if (message) {
      const timer = setTimeout(() => renderer.destroy(), 1500)
      return () => clearTimeout(timer)
    }
  }, [message, renderer])

  return (
    <box padding={1}>
      <text fg="#9ece6a">{message}</text>
    </box>
  )
}

interface CreateCommandProps {
  name?: string
  message?: string
}

export function CreateCommand({ name, message: commitMsg }: CreateCommandProps) {
  const renderer = useRenderer()
  const [status, setStatus] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useKeyboard((key) => {
    if (key.name === "q" || key.name === "escape") {
      renderer.destroy()
    }
  })

  useEffect(() => {
    async function create() {
      try {
        if (!name) { setError("Usage: raft create <branch-name> [-m 'message']"); return }

        const currentBranch = await getCurrentBranch()
        setStatus(`Creating branch '${name}' on top of '${currentBranch}'...`)

        // Create and checkout new branch
        await runGit(["checkout", "-b", name])

        // Commit staged changes if there are any and a message is provided
        if (commitMsg) {
          try {
            await runGit(["commit", "-m", commitMsg])
            setStatus(`Created branch '${name}' with commit: ${commitMsg}`)
          } catch {
            setStatus(`Created branch '${name}' (no staged changes to commit)`)
          }
        } else {
          setStatus(`Created branch '${name}' on top of '${currentBranch}'`)
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Create failed")
      }
    }
    create()
  }, [name, commitMsg])

  useEffect(() => {
    if (status) {
      const timer = setTimeout(() => renderer.destroy(), 1500)
      return () => clearTimeout(timer)
    }
  }, [status, renderer])

  if (error) {
    return (
      <box padding={1}>
        <text fg="#f7768e">{error}</text>
      </box>
    )
  }

  if (!status) {
    return (
      <box padding={1}>
        <Spinner text="Creating branch..." />
      </box>
    )
  }

  return (
    <box padding={1}>
      <text fg="#9ece6a">{status}</text>
    </box>
  )
}

export function RestackCommand() {
  const renderer = useRenderer()
  const [logs, setLogs] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  useKeyboard((key) => {
    if (key.name === "q" || key.name === "escape") {
      renderer.destroy()
    }
  })

  function addLog(msg: string) {
    setLogs((prev) => [...prev, msg])
  }

  useEffect(() => {
    async function restack() {
      try {
        const repo = await getCurrentRepo()
        if (!repo) { setError("Not in a git repo"); return }

        const currentBranch = await getCurrentBranch()
        addLog(`Current branch: ${currentBranch}`)

        const prs = await fetchRepoPRs(repo)
        const stacks = detectStacks(prs)

        // Find the stack containing the current branch
        let currentStack: Stack | null = null
        for (const stack of stacks) {
          for (const pr of stack.prs) {
            if (pr.headRefName === currentBranch) {
              currentStack = stack
              break
            }
          }
          if (currentStack) break
        }

        if (!currentStack) {
          setError(`Branch '${currentBranch}' is not part of any stack`)
          return
        }

        addLog(`Found stack with ${currentStack.prs.length} PRs`)

        // Rebase each branch onto its parent, bottom-up
        for (let i = 1; i < currentStack.prs.length; i++) {
          const pr = currentStack.prs[i]
          const parent = currentStack.prs[i - 1]
          addLog(`Rebasing ${pr.headRefName} onto ${parent.headRefName}...`)

          await runGit(["checkout", pr.headRefName])
          try {
            await runGit(["rebase", parent.headRefName])
            addLog(`  Rebased successfully`)
          } catch (e) {
            addLog(`  CONFLICT - resolve manually, then run raft restack again`)
            await runGit(["rebase", "--abort"])
            setError(`Rebase conflict on ${pr.headRefName}. Resolve manually.`)
            return
          }
        }

        // Return to original branch
        await runGit(["checkout", currentBranch])
        addLog(`Returned to ${currentBranch}`)
        setDone(true)
      } catch (e) {
        setError(e instanceof Error ? e.message : "Restack failed")
      }
    }
    restack()
  }, [])

  return (
    <box flexDirection="column" padding={1}>
      <box paddingBottom={1}>
        <text>
          <span fg="#7aa2f7"><strong>raft restack</strong></span>
        </text>
      </box>
      {logs.map((log, i) => (
        <box key={i} paddingLeft={1}>
          <text fg="#9aa5ce">{log}</text>
        </box>
      ))}
      {error && (
        <box paddingTop={1}>
          <text fg="#f7768e">{error}</text>
        </box>
      )}
      {done && (
        <box paddingTop={1}>
          <text fg="#9ece6a">Stack rebased successfully!</text>
        </box>
      )}
      <box paddingTop={1}>
        <text fg="#6b7089">Press q to exit</text>
      </box>
    </box>
  )
}
