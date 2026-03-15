import { useState, useEffect } from "react"
import { useKeyboard, useRenderer } from "@opentui/react"
import { fetchRepoPRs, getCurrentRepo } from "../lib/github"
import { detectStacks } from "../lib/stack"
import { Spinner } from "../components/spinner"
import type { Stack, StackedPR } from "../lib/types"

interface MergeCommandProps {
  repo?: string
}

type MergeStatus = "pending" | "merging" | "merged" | "failed" | "waiting-ci"

interface MergeState {
  pr: StackedPR
  status: MergeStatus
  error?: string
}

async function runGhMerge(repo: string, prNumber: number): Promise<void> {
  const cleanEnv = { ...process.env }
  delete cleanEnv.GITHUB_TOKEN
  delete cleanEnv.GH_TOKEN
  const proc = Bun.spawn(
    ["gh", "pr", "merge", String(prNumber), "--repo", repo, "--squash", "--auto"],
    { stdout: "pipe", stderr: "pipe", env: cleanEnv }
  )
  const stderr = await new Response(proc.stderr).text()
  const code = await proc.exited
  if (code !== 0) {
    throw new Error(stderr.trim())
  }
}

async function checkPRStatus(repo: string, prNumber: number): Promise<"ready" | "pending" | "failing"> {
  const cleanEnv = { ...process.env }
  delete cleanEnv.GITHUB_TOKEN
  delete cleanEnv.GH_TOKEN
  const proc = Bun.spawn(
    ["gh", "pr", "checks", String(prNumber), "--repo", repo, "--json", "state"],
    { stdout: "pipe", stderr: "pipe", env: cleanEnv }
  )
  const stdout = await new Response(proc.stdout).text()
  const code = await proc.exited
  if (code !== 0) return "ready" // No checks configured
  try {
    const checks = JSON.parse(stdout) as Array<{ state: string }>
    if (checks.length === 0) return "ready"
    if (checks.some((c) => c.state === "FAILURE" || c.state === "ERROR")) return "failing"
    if (checks.some((c) => c.state === "PENDING" || c.state === "EXPECTED")) return "pending"
    return "ready"
  } catch {
    return "ready"
  }
}

function MergeRow({ state }: { state: MergeState }) {
  const statusIcon: Record<MergeStatus, string> = {
    "pending": "\u25CB",
    "merging": "\u25CF",
    "merged": "\u2714",
    "failed": "\u2718",
    "waiting-ci": "\u23F3",
  }
  const statusColor: Record<MergeStatus, string> = {
    "pending": "#6b7089",
    "merging": "#e0af68",
    "merged": "#9ece6a",
    "failed": "#f7768e",
    "waiting-ci": "#7aa2f7",
  }

  return (
    <box flexDirection="row" paddingX={2} height={1}>
      <box width={3}>
        <text fg={statusColor[state.status]}>{statusIcon[state.status]}</text>
      </box>
      <box width={8}>
        <text fg="#bb9af7">[{state.pr.position}/{state.pr.stackSize}]</text>
      </box>
      <box width={7}>
        <text fg="#7aa2f7">#{state.pr.number}</text>
      </box>
      <box flexGrow={1}>
        <text fg="#c0caf5">{state.pr.originalTitle}</text>
      </box>
      <box width={12}>
        <text fg={statusColor[state.status]}>{state.status}</text>
      </box>
    </box>
  )
}

export function MergeCommand({ repo }: MergeCommandProps) {
  const renderer = useRenderer()
  const [stacks, setStacks] = useState<Stack[] | null>(null)
  const [selectedStack, setSelectedStack] = useState<number>(0)
  const [mergeStates, setMergeStates] = useState<MergeState[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loadingStatus, setLoadingStatus] = useState("Loading stacks...")
  const [merging, setMerging] = useState(false)
  const [done, setDone] = useState(false)

  useKeyboard((key) => {
    if (key.name === "q" || key.name === "escape") {
      renderer.destroy()
    } else if (!merging && !done && stacks && stacks.length > 1) {
      if (key.name === "j" || key.name === "down") {
        setSelectedStack((i) => Math.min(stacks.length - 1, i + 1))
      } else if (key.name === "k" || key.name === "up") {
        setSelectedStack((i) => Math.max(0, i - 1))
      }
    }
    if ((key.name === "enter" || key.name === "return") && stacks && !merging && !done) {
      startMerge(stacks[selectedStack])
    }
  })

  async function startMerge(stack: Stack) {
    setMerging(true)
    const states: MergeState[] = stack.prs.map((pr) => ({
      pr,
      status: "pending" as MergeStatus,
    }))
    setMergeStates([...states])

    for (let i = 0; i < states.length; i++) {
      const state = states[i]

      // Check CI
      state.status = "waiting-ci"
      setMergeStates([...states])

      const ciStatus = await checkPRStatus(stack.repo, state.pr.number)
      if (ciStatus === "failing") {
        state.status = "failed"
        state.error = "CI checks failing"
        setMergeStates([...states])
        break
      }

      // Merge
      state.status = "merging"
      setMergeStates([...states])

      try {
        await runGhMerge(stack.repo, state.pr.number)
        state.status = "merged"
      } catch (e) {
        state.status = "failed"
        state.error = e instanceof Error ? e.message : "Unknown error"
        setMergeStates([...states])
        break
      }
      setMergeStates([...states])
    }

    setMerging(false)
    setDone(true)
  }

  useEffect(() => {
    async function load() {
      try {
        const targetRepo = repo ?? await getCurrentRepo()
        if (!targetRepo) {
          setError("Not in a git repo and no --repo specified. Use: raft merge --repo=owner/repo")
          return
        }
        setLoadingStatus(`Scanning ${targetRepo}...`)
        const prs = await fetchRepoPRs(targetRepo)
        const detected = detectStacks(prs)
        if (detected.length === 0) {
          setError("No stacks found in " + targetRepo)
          return
        }
        setStacks(detected)
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load stacks")
      }
    }
    load()
  }, [repo])

  if (error) {
    return (
      <box padding={1}>
        <text fg="#f7768e">Error: {error}</text>
      </box>
    )
  }

  if (stacks === null) {
    return (
      <box padding={1}>
        <Spinner text={loadingStatus} />
      </box>
    )
  }

  // Show merge progress
  if (mergeStates) {
    return (
      <box flexDirection="column" width="100%" padding={1}>
        <box paddingBottom={1}>
          <text>
            <span fg="#7aa2f7"><strong>raft merge</strong></span>
            <span fg="#9aa5ce"> - {stacks[selectedStack].repo}</span>
          </text>
        </box>
        {mergeStates.map((state) => (
          <MergeRow key={state.pr.number} state={state} />
        ))}
        {done && (
          <box paddingTop={1}>
            {mergeStates.some((s) => s.status === "failed") ? (
              <text fg="#f7768e">Merge stopped. {mergeStates.find((s) => s.status === "failed")?.error}</text>
            ) : (
              <text fg="#9ece6a">All PRs merged successfully!</text>
            )}
          </box>
        )}
        <box paddingTop={1}>
          <text fg="#6b7089">Press q to exit</text>
        </box>
      </box>
    )
  }

  // Stack selection
  return (
    <box flexDirection="column" width="100%" padding={1}>
      <box paddingBottom={1}>
        <text>
          <span fg="#7aa2f7"><strong>raft merge</strong></span>
          <span fg="#9aa5ce"> - select a stack to merge</span>
        </text>
      </box>
      {stacks.map((stack, i) => (
        <box
          key={i}
          flexDirection="row"
          paddingX={1}
          height={1}
          backgroundColor={i === selectedStack ? "#292e42" : "transparent"}
          onMouseDown={() => setSelectedStack(i)}
        >
          <box width={2}>
            <text fg={i === selectedStack ? "#7aa2f7" : "#6b7089"}>
              {i === selectedStack ? "\u25B8" : " "}
            </text>
          </box>
          <box width={5}>
            <text fg="#bb9af7">{stack.prs.length} PRs</text>
          </box>
          <box flexGrow={1}>
            <text fg="#c0caf5">
              #{stack.prs[0].number} {stack.prs[0].originalTitle} ... #{stack.prs[stack.prs.length - 1].number}
            </text>
          </box>
        </box>
      ))}
      <box paddingTop={1}>
        <text fg="#6b7089">Enter: start merge  j/k: select stack  q: quit</text>
      </box>
    </box>
  )
}
