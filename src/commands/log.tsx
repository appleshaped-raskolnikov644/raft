import { useState, useEffect, useCallback } from "react"
import { useKeyboard, useRenderer, useTerminalDimensions } from "@opentui/react"
import { fetchRepoPRs, fetchOpenPRs, getCurrentRepo } from "../lib/github"
import { detectStacks } from "../lib/stack"
import { Spinner } from "../components/spinner"
import { shortRepoName, formatRelativeAge, truncate } from "../lib/format"
import type { Stack, StackedPR, PullRequest } from "../lib/types"

interface LogCommandProps {
  repo?: string
}

interface TreeNode {
  pr: StackedPR
  isLast: boolean
  depth: number
}

function buildTreeNodes(stacks: Stack[]): TreeNode[] {
  const nodes: TreeNode[] = []
  for (const stack of stacks) {
    for (let i = 0; i < stack.prs.length; i++) {
      const pr = stack.prs[i]
      const isLast = i === stack.prs.length - 1
      nodes.push({ pr, isLast, depth: i })
    }
  }
  return nodes
}

function TreeRow({ node, isSelected, index, onSelect }: {
  node: TreeNode
  isSelected: boolean
  index: number
  onSelect?: (i: number) => void
}) {
  const { pr, depth } = node
  const bgColor = isSelected ? "#292e42" : "transparent"
  const cursor = isSelected ? "\u25B8" : " "
  const dotColor = pr.isDraft ? "#6b7089" : "#9ece6a"
  const dot = pr.isDraft ? "\u25CB" : "\u25CF"
  const age = formatRelativeAge(pr.createdAt)

  // Build tree connector
  let connector = ""
  if (depth === 0) {
    connector = "\u251C\u2500\u2500 "  // ├──
  } else {
    const padding = "\u2502   ".repeat(depth - 1)
    connector = padding + "\u2514\u2500\u2500 "  // └──
  }

  const statusLabel = pr.isDraft ? "DRAFT" : "OPEN"
  const statusColor = pr.isDraft ? "#6b7089" : "#9ece6a"

  return (
    <box
      flexDirection="row"
      backgroundColor={bgColor}
      paddingX={1}
      height={1}
      onMouseDown={() => onSelect?.(index)}
    >
      <box width={2}>
        <text fg={isSelected ? "#7aa2f7" : "#6b7089"}>{cursor}</text>
      </box>
      <box width={depth * 4 + 4}>
        <text fg="#414868">{connector}</text>
      </box>
      <box width={2}>
        <text fg={dotColor}>{dot}</text>
      </box>
      <box width={7}>
        <text fg="#7aa2f7">#{pr.number}</text>
      </box>
      <box flexGrow={1}>
        <text fg="#c0caf5">{truncate(pr.originalTitle, 50)}</text>
      </box>
      <box width={6}>
        <text fg={statusColor}>{statusLabel}</text>
      </box>
      <box width={5}>
        <text fg="#6b7089">{age}</text>
      </box>
    </box>
  )
}

function RepoHeader({ repo }: { repo: string }) {
  return (
    <box paddingX={1} height={1}>
      <text>
        <span fg="#bb9af7"><strong>{repo}</strong></span>
      </text>
    </box>
  )
}

function TrunkLine({ branchName }: { branchName: string }) {
  return (
    <box paddingX={1} height={1}>
      <text>
        <span fg="#9ece6a">{"\u25CF"}</span>
        <span fg="#9aa5ce"> {branchName}</span>
      </text>
    </box>
  )
}

interface RepoSection {
  repo: string
  stacks: Stack[]
  nodes: TreeNode[]
  trunkBranch: string
}

export function LogCommand({ repo }: LogCommandProps) {
  const renderer = useRenderer()
  const { height: termHeight } = useTerminalDimensions()
  const [sections, setSections] = useState<RepoSection[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loadingStatus, setLoadingStatus] = useState("Loading stacks...")
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [flash, setFlash] = useState<string | null>(null)

  // Flatten all nodes for navigation
  const allNodes = sections?.flatMap((s) => s.nodes) ?? []
  const selectedNode = allNodes[selectedIndex] ?? null

  const showFlash = useCallback((msg: string) => {
    setFlash(msg)
    setTimeout(() => setFlash(null), 2000)
  }, [])

  useKeyboard((key) => {
    if (key.name === "q" || key.name === "escape") {
      renderer.destroy()
    } else if (key.name === "j" || key.name === "down") {
      setSelectedIndex((i) => Math.min(allNodes.length - 1, i + 1))
    } else if (key.name === "k" || key.name === "up") {
      setSelectedIndex((i) => Math.max(0, i - 1))
    } else if ((key.name === "enter" || key.name === "return") && selectedNode) {
      Bun.spawn(["open", selectedNode.pr.url], { stdout: "ignore", stderr: "ignore" })
      showFlash("Opening " + selectedNode.pr.url)
    } else if (key.name === "c" && selectedNode) {
      renderer.copyToClipboardOSC52(selectedNode.pr.url)
      showFlash("Copied URL!")
    }
  })

  useEffect(() => {
    async function load() {
      try {
        if (repo) {
          setLoadingStatus(`Scanning ${repo}...`)
          const prs = await fetchRepoPRs(repo)
          const stacks = detectStacks(prs)
          const trunkBranch = stacks[0]?.prs[0]?.baseRefName ?? "main"
          setSections([{
            repo,
            stacks,
            nodes: buildTreeNodes(stacks),
            trunkBranch,
          }])
        } else {
          const currentRepo = await getCurrentRepo()
          if (currentRepo) {
            setLoadingStatus(`Scanning ${currentRepo}...`)
            const prs = await fetchRepoPRs(currentRepo)
            const stacks = detectStacks(prs)
            const trunkBranch = stacks[0]?.prs[0]?.baseRefName ?? "main"
            setSections([{
              repo: currentRepo,
              stacks,
              nodes: buildTreeNodes(stacks),
              trunkBranch,
            }])
          } else {
            setLoadingStatus("Fetching PRs across all accounts...")
            const allPRs = await fetchOpenPRs()
            const byRepo = new Map<string, PullRequest[]>()
            for (const pr of allPRs) {
              const existing = byRepo.get(pr.repo) ?? []
              existing.push(pr)
              byRepo.set(pr.repo, existing)
            }
            const multiRepos = [...byRepo.entries()].filter(([, prs]) => prs.length >= 2)
            const results: RepoSection[] = []
            for (let i = 0; i < multiRepos.length; i++) {
              const [repoName] = multiRepos[i]
              setLoadingStatus(`Checking ${shortRepoName(repoName)} (${i + 1}/${multiRepos.length})...`)
              try {
                const repoPRs = await fetchRepoPRs(repoName)
                const stacks = detectStacks(repoPRs)
                if (stacks.length > 0) {
                  const trunkBranch = stacks[0]?.prs[0]?.baseRefName ?? "main"
                  results.push({
                    repo: repoName,
                    stacks,
                    nodes: buildTreeNodes(stacks),
                    trunkBranch,
                  })
                }
              } catch { /* skip */ }
            }
            setSections(results)
          }
        }
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

  if (sections === null) {
    return (
      <box padding={1}>
        <Spinner text={loadingStatus} />
      </box>
    )
  }

  if (sections.length === 0 || allNodes.length === 0) {
    return (
      <box padding={1}>
        <text fg="#9aa5ce">No stacks found. PRs must target each other's branches to form a stack.</text>
      </box>
    )
  }

  // Windowing
  const listHeight = Math.max(3, termHeight - 6)
  const scrollOffset = selectedIndex < listHeight ? 0 : selectedIndex - listHeight + 1

  // Build the rendered lines: interleave repo headers, trunk lines, and tree nodes
  type RenderLine = { type: "header"; repo: string } | { type: "trunk"; branch: string } | { type: "node"; node: TreeNode; globalIndex: number }
  const renderLines: RenderLine[] = []
  let nodeCounter = 0
  for (const section of sections) {
    renderLines.push({ type: "header", repo: section.repo })
    renderLines.push({ type: "trunk", branch: section.trunkBranch })
    for (const node of section.nodes) {
      renderLines.push({ type: "node", node, globalIndex: nodeCounter })
      nodeCounter++
    }
  }

  const visibleLines = renderLines.slice(scrollOffset, scrollOffset + listHeight)

  return (
    <box flexDirection="column" width="100%" height="100%">
      {/* Header */}
      <box flexDirection="row" paddingX={1} height={1}>
        <box flexGrow={1}>
          <text>
            <span fg="#7aa2f7"><strong>raft log</strong></span>
            <span fg="#9aa5ce"> - stack graph</span>
          </text>
        </box>
        <box>
          <text fg="#9aa5ce">{allNodes.length} PRs in {sections.length} {sections.length === 1 ? "repo" : "repos"}</text>
        </box>
      </box>

      {/* Tree */}
      <box flexDirection="column" flexGrow={1} overflow="hidden">
        {visibleLines.map((line, i) => {
          if (line.type === "header") {
            return <RepoHeader key={`h-${line.repo}`} repo={line.repo} />
          }
          if (line.type === "trunk") {
            return <TrunkLine key={`t-${line.branch}-${i}`} branchName={line.branch} />
          }
          return (
            <TreeRow
              key={`n-${line.node.pr.repo}-${line.node.pr.number}`}
              node={line.node}
              isSelected={line.globalIndex === selectedIndex}
              index={line.globalIndex}
              onSelect={setSelectedIndex}
            />
          )
        })}
      </box>

      {/* Detail panel */}
      <box flexDirection="column" paddingX={1} paddingY={1} borderColor="#292e42" border>
        {selectedNode ? (
          <>
            <box height={1}>
              <text>
                <span fg="#bb9af7">{selectedNode.pr.repo}</span>
                <span fg="#9aa5ce"> #</span>
                <span fg="#7aa2f7">{selectedNode.pr.number}</span>
                <span fg="#9aa5ce"> [{selectedNode.pr.position}/{selectedNode.pr.stackSize}]</span>
              </text>
            </box>
            <box height={1}>
              <text fg="#c0caf5">{selectedNode.pr.originalTitle}</text>
            </box>
          </>
        ) : (
          <box height={2}>
            <text fg="#9aa5ce">No PR selected</text>
          </box>
        )}
        <box height={1}>
          {flash ? (
            <text fg="#9ece6a">{flash}</text>
          ) : (
            <text fg="#6b7089">Enter: open  c: copy URL  j/k: navigate  q: quit</text>
          )}
        </box>
      </box>
    </box>
  )
}
