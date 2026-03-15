import { useState, useEffect, useMemo } from "react"
import { useKeyboard, useRenderer } from "@opentui/react"
import { PRTable } from "../components/pr-table"
import { fetchOpenPRs } from "../lib/github"
import { shortRepoName } from "../lib/format"
import type { PullRequest } from "../lib/types"

interface LsCommandProps {
  author?: string
  repoFilter?: string
}

type StatusFilter = "all" | "open" | "draft"

export function LsCommand({ author, repoFilter }: LsCommandProps) {
  const renderer = useRenderer()
  const [allPRs, setAllPRs] = useState<PullRequest[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all")
  const [searchMode, setSearchMode] = useState(false)
  const [searchQuery, setSearchQuery] = useState("")

  useEffect(() => {
    async function load() {
      try {
        let results = await fetchOpenPRs(author)
        if (repoFilter) {
          const filter = repoFilter.toLowerCase()
          results = results.filter((pr) => pr.repo.toLowerCase().includes(filter))
        }
        results.sort((a, b) => {
          const repoCompare = a.repo.localeCompare(b.repo)
          if (repoCompare !== 0) return repoCompare
          return a.number - b.number
        })
        setAllPRs(results)
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to fetch PRs")
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [author, repoFilter])

  const filteredPRs = useMemo(() => {
    let prs = allPRs

    // Status filter
    if (statusFilter === "open") prs = prs.filter((pr) => !pr.isDraft)
    if (statusFilter === "draft") prs = prs.filter((pr) => pr.isDraft)

    // Search filter
    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      prs = prs.filter((pr) =>
        pr.title.toLowerCase().includes(q) ||
        shortRepoName(pr.repo).toLowerCase().includes(q) ||
        pr.repo.toLowerCase().includes(q) ||
        String(pr.number).includes(q)
      )
    }

    return prs
  }, [allPRs, statusFilter, searchQuery])

  // Keep selection in bounds
  useEffect(() => {
    if (selectedIndex >= filteredPRs.length) {
      setSelectedIndex(Math.max(0, filteredPRs.length - 1))
    }
  }, [filteredPRs.length, selectedIndex])

  const selectedPR = filteredPRs[selectedIndex] ?? null

  useKeyboard((key) => {
    if (searchMode) {
      if (key.name === "escape") {
        setSearchMode(false)
        setSearchQuery("")
        return
      }
      if (key.name === "enter") {
        setSearchMode(false)
        return
      }
      if (key.name === "backspace") {
        setSearchQuery((q) => q.slice(0, -1))
        return
      }
      // Printable character
      if (key.name.length === 1 && !key.ctrl && !key.meta) {
        setSearchQuery((q) => q + key.name)
        return
      }
      return
    }

    // Normal mode
    if (key.name === "q" || key.name === "escape") {
      renderer.destroy()
    } else if (key.name === "j" || key.name === "down") {
      setSelectedIndex((i) => Math.min(filteredPRs.length - 1, i + 1))
    } else if (key.name === "k" || key.name === "up") {
      setSelectedIndex((i) => Math.max(0, i - 1))
    } else if (key.name === "enter" && selectedPR) {
      Bun.spawn(["gh", "pr", "view", "--web", "--repo", selectedPR.repo, String(selectedPR.number)], {
        stdout: "ignore", stderr: "ignore",
      })
    } else if (key.name === "c" && selectedPR) {
      renderer.copyToClipboardOSC52(selectedPR.url)
    } else if (key.name === "/") {
      setSearchMode(true)
      setSearchQuery("")
    } else if (key.name === "tab") {
      setStatusFilter((f) => {
        if (f === "all") return "open"
        if (f === "open") return "draft"
        return "all"
      })
      setSelectedIndex(0)
    }
  })

  const openCount = allPRs.filter((pr) => !pr.isDraft).length
  const draftCount = allPRs.filter((pr) => pr.isDraft).length

  if (error) {
    return (
      <box padding={1}>
        <text fg="#f7768e">Error: {error}</text>
      </box>
    )
  }

  if (loading) {
    return (
      <box padding={1}>
        <text fg="#565f89">Loading PRs...</text>
      </box>
    )
  }

  return (
    <box flexDirection="column" width="100%" height="100%">
      {/* Header */}
      <box flexDirection="row" paddingX={1} height={1}>
        <box flexGrow={1}>
          <text>
            <span fg="#7aa2f7"><strong>raft</strong></span>
          </text>
        </box>
        <box>
          <text fg="#565f89">{filteredPRs.length} PRs  /: search  q: quit</text>
        </box>
      </box>

      {/* Tabs */}
      <box flexDirection="row" paddingX={1} height={1}>
        <box marginRight={2}>
          <text fg={statusFilter === "all" ? "#7aa2f7" : "#565f89"}>
            {statusFilter === "all" ? <u>All ({allPRs.length})</u> : `All (${allPRs.length})`}
          </text>
        </box>
        <box marginRight={2}>
          <text fg={statusFilter === "open" ? "#9ece6a" : "#565f89"}>
            {statusFilter === "open" ? <u>Open ({openCount})</u> : `Open (${openCount})`}
          </text>
        </box>
        <box>
          <text fg={statusFilter === "draft" ? "#e0af68" : "#565f89"}>
            {statusFilter === "draft" ? <u>Draft ({draftCount})</u> : `Draft (${draftCount})`}
          </text>
        </box>
      </box>

      {/* Search bar */}
      {searchMode && (
        <box flexDirection="row" paddingX={1} height={1}>
          <text>
            <span fg="#e0af68">/</span>
            <span fg="#c0caf5">{searchQuery}</span>
            <span fg="#7aa2f7">_</span>
          </text>
        </box>
      )}

      {/* PR List */}
      <scrollbox flexGrow={1} focused={!searchMode}>
        <PRTable prs={filteredPRs} selectedIndex={selectedIndex} />
      </scrollbox>

      {/* Detail panel */}
      <box flexDirection="column" paddingX={1} paddingY={1} borderColor="#292e42" border>
        {selectedPR ? (
          <>
            <box flexDirection="row" height={1}>
              <text>
                <span fg="#bb9af7">{selectedPR.repo}</span>
                <span fg="#565f89"> #</span>
                <span fg="#7aa2f7">{selectedPR.number}</span>
              </text>
            </box>
            <box height={1}>
              <text fg="#c0caf5">{selectedPR.title}</text>
            </box>
            <box height={1}>
              <text fg="#565f89">{selectedPR.url}</text>
            </box>
          </>
        ) : (
          <box height={3}>
            <text fg="#565f89">No PR selected</text>
          </box>
        )}
        <box flexDirection="row" height={1}>
          <text fg="#414868">
            Enter: open in browser  c: copy URL  /: search  Tab: filter  q: quit
          </text>
        </box>
      </box>
    </box>
  )
}
