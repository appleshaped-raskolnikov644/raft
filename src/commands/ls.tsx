import { useState, useEffect, useMemo, useCallback } from "react"
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
  const [flash, setFlash] = useState<string | null>(null)

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
    if (statusFilter === "open") prs = prs.filter((pr) => !pr.isDraft)
    if (statusFilter === "draft") prs = prs.filter((pr) => pr.isDraft)
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

  useEffect(() => {
    if (selectedIndex >= filteredPRs.length) {
      setSelectedIndex(Math.max(0, filteredPRs.length - 1))
    }
  }, [filteredPRs.length, selectedIndex])

  const selectedPR = filteredPRs[selectedIndex] ?? null

  const showFlash = useCallback((msg: string) => {
    setFlash(msg)
    setTimeout(() => setFlash(null), 2000)
  }, [])

  const handleSelect = useCallback((index: number) => {
    setSelectedIndex(index)
  }, [])

  useKeyboard((key) => {
    if (searchMode) {
      if (key.name === "escape") {
        // Exit search mode but KEEP the filter active
        setSearchMode(false)
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
      if (key.name.length === 1 && !key.ctrl && !key.meta) {
        setSearchQuery((q) => q + key.name)
        return
      }
      return
    }

    // Normal mode
    if (key.name === "q" || key.name === "escape") {
      // If there's an active search filter, clear it first instead of quitting
      if (searchQuery) {
        setSearchQuery("")
        return
      }
      renderer.destroy()
    } else if (key.name === "j" || key.name === "down") {
      setSelectedIndex((i) => Math.min(filteredPRs.length - 1, i + 1))
    } else if (key.name === "k" || key.name === "up") {
      setSelectedIndex((i) => Math.max(0, i - 1))
    } else if (key.name === "enter" && selectedPR) {
      Bun.spawn(["open", selectedPR.url], {
        stdout: "ignore", stderr: "ignore",
      })
      showFlash("Opening in browser...")
    } else if (key.name === "c" && selectedPR) {
      renderer.copyToClipboardOSC52(selectedPR.url)
      showFlash("Copied URL!")
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
        <text fg="#7aa2f7">Loading PRs...</text>
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
          <text fg="#9aa5ce">{filteredPRs.length} PRs  /: search  q: quit</text>
        </box>
      </box>

      {/* Tabs */}
      <box flexDirection="row" paddingX={1} height={1}>
        <box marginRight={2}>
          <text fg={statusFilter === "all" ? "#7aa2f7" : "#9aa5ce"}>
            {statusFilter === "all" ? <u>All ({allPRs.length})</u> : `All (${allPRs.length})`}
          </text>
        </box>
        <box marginRight={2}>
          <text fg={statusFilter === "open" ? "#9ece6a" : "#9aa5ce"}>
            {statusFilter === "open" ? <u>Open ({openCount})</u> : `Open (${openCount})`}
          </text>
        </box>
        <box>
          <text fg={statusFilter === "draft" ? "#e0af68" : "#9aa5ce"}>
            {statusFilter === "draft" ? <u>Draft ({draftCount})</u> : `Draft (${draftCount})`}
          </text>
        </box>
      </box>

      {/* Search bar - shown when in search mode OR when there's an active filter */}
      {(searchMode || searchQuery) && (
        <box flexDirection="row" paddingX={1} height={1}>
          <text>
            <span fg="#e0af68">/</span>
            <span fg="#c0caf5">{searchQuery}</span>
            {searchMode && <span fg="#7aa2f7">_</span>}
            {!searchMode && searchQuery && <span fg="#9aa5ce"> (Esc to clear)</span>}
          </text>
        </box>
      )}

      {/* PR List - no focused prop, we handle scrolling via selection */}
      <scrollbox flexGrow={1}>
        <PRTable prs={filteredPRs} selectedIndex={selectedIndex} onSelect={handleSelect} />
      </scrollbox>

      {/* Detail panel */}
      <box flexDirection="column" paddingX={1} paddingY={1} borderColor="#292e42" border>
        {selectedPR ? (
          <>
            <box flexDirection="row" height={1}>
              <text>
                <span fg="#bb9af7">{selectedPR.repo}</span>
                <span fg="#9aa5ce"> #</span>
                <span fg="#7aa2f7">{selectedPR.number}</span>
              </text>
            </box>
            <box height={1}>
              <text fg="#c0caf5">{selectedPR.title}</text>
            </box>
            <box height={1}>
              <text fg="#9aa5ce">{selectedPR.url}</text>
            </box>
          </>
        ) : (
          <box height={3}>
            <text fg="#9aa5ce">No PR selected</text>
          </box>
        )}
        <box flexDirection="row" height={1}>
          {flash ? (
            <text fg="#9ece6a">{flash}</text>
          ) : (
            <text fg="#6b7089">
              Enter: open  c: copy URL  /: search  Tab: filter  q: quit
            </text>
          )}
        </box>
      </box>
    </box>
  )
}
