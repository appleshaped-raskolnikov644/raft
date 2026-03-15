import { useState, useEffect, useMemo, useCallback, useRef } from "react"
import { useKeyboard, useRenderer, useTerminalDimensions } from "@opentui/react"
import { PRTable } from "../components/pr-table"
import { Spinner } from "../components/spinner"
import { SkeletonList } from "../components/skeleton"
import { fetchOpenPRs, getCurrentRepo, fetchPRDetails } from "../lib/github"
import { shortRepoName } from "../lib/format"
import { PRCache } from "../lib/cache"
import type { PullRequest, Density, PRDetails } from "../lib/types"

interface LsCommandProps {
  author?: string
  repoFilter?: string
}

type StatusFilter = "all" | "open" | "draft"
type SortMode = "repo" | "number" | "title" | "age" | "status"
const SORT_MODES: SortMode[] = ["repo", "number", "title", "age", "status"]
const SORT_LABELS: Record<SortMode, string> = {
  repo: "Repo",
  number: "#",
  title: "Title",
  age: "Age",
  status: "Status",
}

export function LsCommand({ author, repoFilter: initialRepoFilter }: LsCommandProps) {
  const renderer = useRenderer()
  const { height: termHeight } = useTerminalDimensions()
  const [allPRs, setAllPRs] = useState<PullRequest[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all")
  const [searchMode, setSearchMode] = useState(false)
  const [searchQuery, setSearchQuery] = useState("")
  const [repoFilter, setRepoFilter] = useState<string | null>(initialRepoFilter ?? null)
  const [currentRepo, setCurrentRepo] = useState<string | null>(null)
  const [sortMode, setSortMode] = useState<SortMode>("repo")
  const [loadingStatus, setLoadingStatus] = useState("Loading PRs...")
  const [flash, setFlash] = useState<string | null>(null)
  const [density, setDensity] = useState<Density>("compact")
  const [detailsMap, setDetailsMap] = useState<Map<string, PRDetails>>(new Map())
  const cacheRef = useRef(new PRCache())

  // Detect current repo on mount
  useEffect(() => {
    getCurrentRepo().then((repo) => {
      if (repo) {
        setCurrentRepo(repo)
        // Auto-filter to current repo if no explicit filter
        if (!initialRepoFilter) {
          setRepoFilter(repo)
        }
      }
    })
  }, [initialRepoFilter])

  useEffect(() => {
    async function load() {
      try {
        let results = await fetchOpenPRs(author, setLoadingStatus)
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
  }, [author])

  // Get unique repos for cycling
  const repos = useMemo(() => {
    const set = [...new Set(allPRs.map((pr) => pr.repo))].sort()
    return set
  }, [allPRs])

  const filteredPRs = useMemo(() => {
    let prs = allPRs
    // Repo filter
    if (repoFilter) {
      prs = prs.filter((pr) => pr.repo === repoFilter)
    }
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
    // Sort
    prs = [...prs].sort((a, b) => {
      switch (sortMode) {
        case "repo": {
          const rc = a.repo.localeCompare(b.repo)
          return rc !== 0 ? rc : a.number - b.number
        }
        case "number": return a.number - b.number
        case "title": return a.title.localeCompare(b.title)
        case "age": return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        case "status": {
          const sc = Number(a.isDraft) - Number(b.isDraft)
          return sc !== 0 ? sc : a.repo.localeCompare(b.repo)
        }
        default: return 0
      }
    })
    return prs
  }, [allPRs, repoFilter, statusFilter, searchQuery, sortMode])

  useEffect(() => {
    if (selectedIndex >= filteredPRs.length) {
      setSelectedIndex(Math.max(0, filteredPRs.length - 1))
    }
  }, [filteredPRs.length, selectedIndex])

  useEffect(() => {
    if (density === "compact" || density === "compressed") return
    if (filteredPRs.length === 0) return

    const cache = cacheRef.current
    const toFetch = filteredPRs.filter(pr => !cache.hasDetails(pr.url))

    if (toFetch.length === 0) {
      // All cached, just update the map
      const map = new Map<string, PRDetails>()
      for (const pr of filteredPRs) {
        const d = cache.getDetails(pr.url)
        if (d) map.set(pr.url, d)
      }
      setDetailsMap(map)
      return
    }

    // Fetch missing details
    Promise.all(
      toFetch.map(async (pr) => {
        try {
          const details = await fetchPRDetails(pr.repo, pr.number)
          cache.setDetails(pr.url, details)
        } catch { /* skip on error */ }
      })
    ).then(() => {
      const map = new Map<string, PRDetails>()
      for (const pr of filteredPRs) {
        const d = cache.getDetails(pr.url)
        if (d) map.set(pr.url, d)
      }
      setDetailsMap(map)
    })
  }, [density, filteredPRs])

  const selectedPR = filteredPRs[selectedIndex] ?? null

  // Compute visible window: reserve 7 lines for header/tabs/repo/search/detail/keybinds
  const rowHeight = density === "detailed" ? 2 : 1
  const listHeight = Math.max(3, Math.floor((termHeight - 9) / rowHeight))
  const scrollOffset = useMemo(() => {
    if (selectedIndex < listHeight) return 0
    return selectedIndex - listHeight + 1
  }, [selectedIndex, listHeight])
  const visiblePRs = filteredPRs.slice(scrollOffset, scrollOffset + listHeight)
  const visibleSelectedIndex = selectedIndex - scrollOffset

  const showFlash = useCallback((msg: string) => {
    setFlash(msg)
    setTimeout(() => setFlash(null), 2000)
  }, [])

  const handleSelect = useCallback((index: number) => {
    setSelectedIndex(scrollOffset + index)
  }, [scrollOffset])

  useKeyboard((key) => {
    if (searchMode) {
      if (key.name === "escape") {
        setSearchMode(false)
        return
      }
      if (key.name === "enter" || key.name === "return") {
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
      if (searchQuery) { setSearchQuery(""); return }
      if (repoFilter && !initialRepoFilter) { setRepoFilter(null); return }
      renderer.destroy()
    } else if (key.name === "j" || key.name === "down") {
      setSelectedIndex((i) => Math.min(filteredPRs.length - 1, i + 1))
    } else if (key.name === "k" || key.name === "up") {
      setSelectedIndex((i) => Math.max(0, i - 1))
    } else if (key.name === "enter" || key.name === "return") {
      if (selectedPR) {
        Bun.spawn(["open", selectedPR.url], {
          stdout: "ignore",
          stderr: "ignore",
        })
        showFlash("Opening " + selectedPR.url)
      }
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
    } else if (key.name === "s") {
      setSortMode((m) => {
        const idx = SORT_MODES.indexOf(m)
        return SORT_MODES[(idx + 1) % SORT_MODES.length]
      })
      setSelectedIndex(0)
    } else if (key.name === "r") {
      // Cycle repo filter: null -> repo1 -> repo2 -> ... -> null
      if (repoFilter === null) {
        if (repos.length > 0) setRepoFilter(repos[0])
      } else {
        const idx = repos.indexOf(repoFilter)
        if (idx >= 0 && idx < repos.length - 1) {
          setRepoFilter(repos[idx + 1])
        } else {
          setRepoFilter(null)
        }
      }
      setSelectedIndex(0)
    } else if (key.name === "v") {
      setDensity((d) => {
        if (d === "compact") return "normal"
        if (d === "normal") return "detailed"
        return "compact"
      })
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
      <box flexDirection="column" width="100%" height="100%">
        <box paddingX={1} height={1}>
          <Spinner text={loadingStatus} />
        </box>
        <box height={1} />
        <SkeletonList rows={12} />
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
          <text fg="#9aa5ce">{filteredPRs.length} PRs  sort: {SORT_LABELS[sortMode]}  view: {density}</text>
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

      {/* Repo filter */}
      {repoFilter && (
        <box flexDirection="row" paddingX={1} height={1}>
          <text>
            <span fg="#bb9af7">repo: {shortRepoName(repoFilter)}</span>
            <span fg="#9aa5ce"> (r: cycle, Esc: clear)</span>
          </text>
        </box>
      )}

      {/* Search bar */}
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

      {/* PR List - manual windowing, no scrollbox */}
      <box flexDirection="column" flexGrow={1} overflow="hidden">
        <PRTable
          prs={visiblePRs}
          selectedIndex={visibleSelectedIndex}
          density={density}
          detailsMap={detailsMap}
          onSelect={handleSelect}
        />
        {filteredPRs.length > listHeight && (
          <box paddingX={1} height={1}>
            <text fg="#6b7089">
              {scrollOffset + 1}-{Math.min(scrollOffset + listHeight, filteredPRs.length)} of {filteredPRs.length}
            </text>
          </box>
        )}
      </box>

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
              Enter: open  c: copy  /: search  r: repo  s: sort  v: view  Tab: status  q: quit
            </text>
          )}
        </box>
      </box>
    </box>
  )
}
