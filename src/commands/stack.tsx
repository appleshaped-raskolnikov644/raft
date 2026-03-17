import { useState, useEffect, useMemo } from "react"
import { useKeyboard, useRenderer, useTerminalDimensions } from "@opentui/react"
import { fetchRepoPRs, fetchOpenPRs, getCurrentRepo, updatePRTitle, upsertStackComment } from "../lib/github"
import { detectStacks, buildStackComment, formatStackedTitle } from "../lib/stack"
import { Spinner } from "../components/spinner"
import { PreviewPanel } from "../components/preview-panel"
import { usePanel } from "../hooks/usePanel"
import type { Stack, PullRequest } from "../lib/types"

interface StackCommandProps {
  repo?: string
  sync: boolean
}

function StackView({ stack, syncing, selectedPR }: { stack: Stack; syncing: boolean; selectedPR: PullRequest | null }) {
  return (
    <box flexDirection="column" paddingBottom={1}>
      <box paddingX={1} paddingBottom={1}>
        <text>
          <span fg="#7aa2f7">
            <strong>Stack in {stack.repo}</strong>
          </span>
          <span fg="#9aa5ce"> ({stack.prs.length} PRs)</span>
        </text>
      </box>
      {stack.prs.map((pr) => {
        const isSelected = selectedPR?.url === pr.url
        const bgColor = isSelected ? "#292e42" : "transparent"
        const cursor = isSelected ? "▸ " : "  "

        return (
          <box key={pr.number} flexDirection="row" paddingX={2} backgroundColor={bgColor}>
            <box width={2}>
              <text fg={isSelected ? "#7aa2f7" : "transparent"}>{cursor}</text>
            </box>
            <box width={8}>
              <text fg="#bb9af7">[{pr.position}/{pr.stackSize}]</text>
            </box>
            <box width={8}>
              <text>
                <span fg="#7aa2f7">#{pr.number}</span>
              </text>
            </box>
            <box flexGrow={1}>
              <text fg="#c0caf5">{pr.originalTitle}</text>
            </box>
            <box width={8}>
              <text fg={pr.isDraft ? "#6b7089" : "#9ece6a"}>
                {pr.isDraft ? "DRAFT" : "OPEN"}
              </text>
            </box>
          </box>
        )
      })}
      {syncing && (
        <box paddingX={1} paddingTop={1}>
          <Spinner text="Syncing stack metadata..." color="#e0af68" />
        </box>
      )}
    </box>
  )
}

export function StackCommand({ repo, sync }: StackCommandProps) {
  const renderer = useRenderer()
  const { width: termWidth, height: termHeight } = useTerminalDimensions()
  const [stacks, setStacks] = useState<Stack[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [syncing, setSyncing] = useState(false)
  const [syncDone, setSyncDone] = useState(false)
  const [loadingStatus, setLoadingStatus] = useState("Detecting stacks across your repos...")

  // Selection state
  const [selectedIndex, setSelectedIndex] = useState(0)

  // Flatten all PRs for navigation
  const allPRs = useMemo(() => {
    if (!stacks) return []
    return stacks.flatMap(stack => stack.prs)
  }, [stacks])

  const selectedPR = allPRs[selectedIndex] ?? null

  // Panel state management (shared hook handles data fetching + caching + prefetching)
  const { panelOpen, panelTab, splitRatio, panelFullscreen, panelData, panelLoading,
    setPanelOpen, setPanelTab, setSplitRatio, setPanelFullscreen } = usePanel(selectedPR, allPRs, selectedIndex)

  useKeyboard((key) => {
    if (panelOpen) {
      // Panel mode: scrolling handled by scrollbox natively,
      // only PR navigation and panel controls managed here
      if (key.name === "down") {
        setSelectedIndex((i) => Math.min(allPRs.length - 1, i + 1))
      } else if (key.name === "up") {
        setSelectedIndex((i) => Math.max(0, i - 1))
      } else if (key.name === "1") {
        setPanelTab("body")
      } else if (key.name === "2") {
        setPanelTab("comments")
      } else if (key.name === "3") {
        setPanelTab("code")
      } else if (key.name === "4") {
        setPanelTab("files")
      } else if (key.name === "tab") {
        setPanelTab((t) => {
          if (t === "body") return "comments"
          if (t === "comments") return "code"
          if (t === "code") return "files"
          return "body"
        })
      } else if (key.name === "+" || key.name === "=" || key.sequence === "+") {
        setSplitRatio((r) => Math.min(0.8, r + 0.1))
      } else if (key.name === "-" || key.name === "_" || key.sequence === "-") {
        setSplitRatio((r) => Math.max(0.3, r - 0.1))
      } else if (key.name === "f") {
        setPanelFullscreen((f) => !f)
      } else if (key.name === "p" || key.name === "escape") {
        if (panelFullscreen) {
          setPanelFullscreen(false)
        } else {
          setPanelOpen(false)
        }
      } else if (key.name === "enter" || key.name === "return") {
        if (selectedPR) {
          Bun.spawn(["open", selectedPR.url], { stdout: "ignore", stderr: "ignore" })
        }
      } else if (key.name === "c" && selectedPR) {
        renderer.copyToClipboardOSC52(selectedPR.url)
      } else if (key.name === "q") {
        renderer.destroy()
      }
      return
    }

    // Normal mode
    if (key.name === "q" || key.name === "escape") {
      renderer.destroy()
    } else if (key.name === "j" || key.name === "down") {
      setSelectedIndex((i) => Math.min(allPRs.length - 1, i + 1))
    } else if (key.name === "k" || key.name === "up") {
      setSelectedIndex((i) => Math.max(0, i - 1))
    } else if (key.name === "p") {
      setPanelOpen(true)
      setPanelTab("body")
    } else if (key.name === "enter" || key.name === "return") {
      if (selectedPR) {
        Bun.spawn(["open", selectedPR.url], { stdout: "ignore", stderr: "ignore" })
      }
    } else if (key.name === "c" && selectedPR) {
      renderer.copyToClipboardOSC52(selectedPR.url)
    }
  })

  useEffect(() => {
    async function load() {
      try {
        let allStacks: Stack[] = []

        if (repo) {
          setLoadingStatus(`Scanning ${repo}...`)
          const prs = await fetchRepoPRs(repo)
          allStacks = detectStacks(prs)
        } else {
          const currentRepo = await getCurrentRepo()
          if (currentRepo) {
            setLoadingStatus(`Scanning ${currentRepo}...`)
            const prs = await fetchRepoPRs(currentRepo)
            allStacks = detectStacks(prs)
          } else {
            setLoadingStatus("Fetching your PRs across all accounts...")
            const allPRs = await fetchOpenPRs()
            const byRepo = new Map<string, typeof allPRs>()
            for (const pr of allPRs) {
              const existing = byRepo.get(pr.repo) ?? []
              existing.push(pr)
              byRepo.set(pr.repo, existing)
            }
            const multiPRRepos = [...byRepo.entries()].filter(([, prs]) => prs.length >= 2)
            for (let i = 0; i < multiPRRepos.length; i++) {
              const [repoName] = multiPRRepos[i]
              setLoadingStatus(`Checking ${repoName} (${i + 1}/${multiPRRepos.length})...`)
              try {
                const repoPRs = await fetchRepoPRs(repoName)
                const repoStacks = detectStacks(repoPRs)
                allStacks.push(...repoStacks)
              } catch { /* skip */ }
            }
          }
        }

        setStacks(allStacks)

        if (sync && allStacks.length > 0) {
          setSyncing(true)
          for (const stack of allStacks) {
            for (const pr of stack.prs) {
              const newTitle = formatStackedTitle(pr.position, pr.stackSize, pr.originalTitle)
              await updatePRTitle(stack.repo, pr.number, newTitle)
              const comment = buildStackComment(stack.prs, pr.number)
              await upsertStackComment(stack.repo, pr.number, comment)
            }
          }
          setSyncing(false)
          setSyncDone(true)
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to detect stacks")
      }
    }
    load()
  }, [repo, sync])

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

  if (stacks.length === 0) {
    return (
      <box padding={1}>
        <text fg="#9aa5ce">No stacks detected. PRs must target each other's branches to form a stack.</text>
      </box>
    )
  }

  return (
    <box flexDirection="column" width="100%" height="100%">
      {panelOpen && selectedPR ? (
        <box flexDirection="row" flexGrow={1}>
          {/* Stack list (hidden in fullscreen) */}
          {!panelFullscreen && (
            <box flexDirection="column" width={Math.floor(termWidth * (1 - splitRatio))}>
              {stacks.map((stack, i) => (
                <StackView key={i} stack={stack} syncing={syncing} selectedPR={selectedPR} />
              ))}
            </box>
          )}
          <PreviewPanel
            pr={selectedPR}
            panelData={panelData}
            loading={panelLoading}
            tab={panelTab}
            width={panelFullscreen ? termWidth : Math.floor(termWidth * splitRatio)}
            height={termHeight - 2}
          />
        </box>
      ) : (
        <>
          {stacks.map((stack, i) => (
            <StackView key={i} stack={stack} syncing={syncing} selectedPR={selectedPR} />
          ))}
          {syncDone && (
            <box paddingX={1}>
              <text fg="#9ece6a">Stack synced! Titles and comments updated.</text>
            </box>
          )}
          <box paddingX={1} paddingTop={1}>
            <text fg="#6b7089">
              j/k: navigate {"\u00B7"} p: preview {"\u00B7"} Enter: open {"\u00B7"} c: copy {"\u00B7"} q: exit
            </text>
          </box>
        </>
      )}
    </box>
  )
}
