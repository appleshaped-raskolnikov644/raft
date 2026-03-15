import { useState, useEffect } from "react"
import { useKeyboard, useRenderer } from "@opentui/react"
import { getCurrentRepo } from "../lib/github"
import { Spinner } from "../components/spinner"

interface SyncCommandProps {
  repo?: string
}

interface BranchInfo {
  name: string
  prNumber: number | null
  prState: string | null // MERGED, CLOSED, OPEN
  isLocal: boolean
  action: "delete" | "keep" | "skip"
}

async function runGit(args: string[]): Promise<string> {
  const proc = Bun.spawn(["git", ...args], { stdout: "pipe", stderr: "pipe" })
  const stdout = await new Response(proc.stdout).text()
  const code = await proc.exited
  if (code !== 0) throw new Error(`git ${args.join(" ")} failed`)
  return stdout.trim()
}

async function runGh(args: string[]): Promise<string> {
  const cleanEnv = { ...process.env }
  delete cleanEnv.GITHUB_TOKEN
  delete cleanEnv.GH_TOKEN
  const proc = Bun.spawn(["gh", ...args], { stdout: "pipe", stderr: "pipe", env: cleanEnv })
  const stdout = await new Response(proc.stdout).text()
  const code = await proc.exited
  if (code !== 0) throw new Error(`gh ${args.join(" ")} failed`)
  return stdout.trim()
}

export function SyncCommand({ repo }: SyncCommandProps) {
  const renderer = useRenderer()
  const [branches, setBranches] = useState<BranchInfo[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loadingStatus, setLoadingStatus] = useState("Syncing...")
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [phase, setPhase] = useState<"loading" | "review" | "done">("loading")
  const [deleted, setDeleted] = useState<string[]>([])

  useKeyboard((key) => {
    if (key.name === "q" || key.name === "escape") {
      renderer.destroy()
    }
    if (phase === "review" && branches) {
      if (key.name === "j" || key.name === "down") {
        setSelectedIndex((i) => Math.min(branches.length - 1, i + 1))
      } else if (key.name === "k" || key.name === "up") {
        setSelectedIndex((i) => Math.max(0, i - 1))
      } else if (key.name === "d") {
        // Toggle delete for selected branch
        setBranches((prev) => {
          if (!prev) return prev
          const updated = [...prev]
          const b = updated[selectedIndex]
          b.action = b.action === "delete" ? "keep" : "delete"
          return updated
        })
      } else if (key.name === "enter" || key.name === "return") {
        executeDeletes()
      }
    }
  })

  async function executeDeletes() {
    if (!branches) return
    const toDelete = branches.filter((b) => b.action === "delete")
    const deletedNames: string[] = []
    for (const b of toDelete) {
      try {
        await runGit(["branch", "-D", b.name])
        deletedNames.push(b.name)
      } catch { /* skip */ }
    }
    setDeleted(deletedNames)
    setPhase("done")
  }

  useEffect(() => {
    async function load() {
      try {
        const targetRepo = repo ?? await getCurrentRepo()
        if (!targetRepo) {
          setError("Not in a git repo. Use: raft sync --repo=owner/repo")
          return
        }

        // Fetch latest from remote
        setLoadingStatus("Pulling latest from remote...")
        try {
          await runGit(["fetch", "--prune"])
        } catch { /* not fatal */ }

        // Get local branches
        setLoadingStatus("Scanning local branches...")
        const branchOutput = await runGit(["branch", "--format=%(refname:short)"])
        const localBranches = branchOutput.split("\n").filter(Boolean)

        // Get PR status for each branch
        setLoadingStatus("Checking PR statuses...")
        const results: BranchInfo[] = []
        for (const branch of localBranches) {
          if (branch === "main" || branch === "master" || branch === "develop") continue
          try {
            const prJson = await runGh([
              "pr", "list",
              "--repo", targetRepo,
              "--head", branch,
              "--state=all",
              "--limit=1",
              "--json", "number,state",
            ])
            const prs = JSON.parse(prJson) as Array<{ number: number; state: string }>
            if (prs.length > 0) {
              const pr = prs[0]
              const isMergedOrClosed = pr.state === "MERGED" || pr.state === "CLOSED"
              results.push({
                name: branch,
                prNumber: pr.number,
                prState: pr.state,
                isLocal: true,
                action: isMergedOrClosed ? "delete" : "keep",
              })
            }
          } catch { /* skip */ }
        }

        if (results.length === 0) {
          setError("No branches with associated PRs found")
          return
        }

        setBranches(results)
        setPhase("review")
      } catch (e) {
        setError(e instanceof Error ? e.message : "Sync failed")
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

  if (phase === "loading") {
    return (
      <box padding={1}>
        <Spinner text={loadingStatus} />
      </box>
    )
  }

  if (phase === "done") {
    return (
      <box flexDirection="column" padding={1}>
        <text fg="#9ece6a">Sync complete!</text>
        {deleted.length > 0 && (
          <box paddingTop={1} flexDirection="column">
            <text fg="#9aa5ce">Deleted {deleted.length} branches:</text>
            {deleted.map((name) => (
              <box key={name} paddingLeft={2}>
                <text fg="#f7768e">{name}</text>
              </box>
            ))}
          </box>
        )}
        {deleted.length === 0 && (
          <text fg="#9aa5ce">No branches deleted.</text>
        )}
        <box paddingTop={1}>
          <text fg="#6b7089">Press q to exit</text>
        </box>
      </box>
    )
  }

  // Review phase
  return (
    <box flexDirection="column" width="100%" padding={1}>
      <box paddingBottom={1}>
        <text>
          <span fg="#7aa2f7"><strong>raft sync</strong></span>
          <span fg="#9aa5ce"> - review branches</span>
        </text>
      </box>
      {branches?.map((b, i) => (
        <box
          key={b.name}
          flexDirection="row"
          paddingX={1}
          height={1}
          backgroundColor={i === selectedIndex ? "#292e42" : "transparent"}
          onMouseDown={() => setSelectedIndex(i)}
        >
          <box width={2}>
            <text fg={i === selectedIndex ? "#7aa2f7" : "#6b7089"}>
              {i === selectedIndex ? "\u25B8" : " "}
            </text>
          </box>
          <box width={8}>
            <text fg={b.action === "delete" ? "#f7768e" : "#9ece6a"}>
              {b.action === "delete" ? "DELETE" : "KEEP"}
            </text>
          </box>
          <box width={10}>
            <text fg={
              b.prState === "MERGED" ? "#9ece6a" :
              b.prState === "CLOSED" ? "#f7768e" :
              "#7aa2f7"
            }>
              {b.prState ?? "?"}
            </text>
          </box>
          <box width={7}>
            <text fg="#7aa2f7">{b.prNumber ? `#${b.prNumber}` : ""}</text>
          </box>
          <box flexGrow={1}>
            <text fg="#c0caf5">{b.name}</text>
          </box>
        </box>
      ))}
      <box paddingTop={1}>
        <text fg="#6b7089">d: toggle delete  Enter: execute  j/k: navigate  q: quit</text>
      </box>
    </box>
  )
}
