import { useState, useEffect, useMemo, useCallback } from "react"
import { useKeyboard, useRenderer, useTerminalDimensions } from "@opentui/react"
import { PRTable } from "../components/pr-table"
import { Spinner } from "../components/spinner"
import { SkeletonList } from "../components/skeleton"
import { StatusView } from "../components/status-view"
import { fetchOpenPRs, getCurrentRepo, fetchPRDetails, submitPRReview, postPRComment, replyToReviewComment, resolveReviewThread } from "../lib/github"
import { shortRepoName } from "../lib/format"
import { PreviewPanel } from "../components/preview-panel"
import { usePanel } from "../hooks/usePanel"
import { detectPRState, compareByUrgency } from "../lib/pr-lifecycle"
import { findNextUnresolvedCommentIndex, getCodeCommentThreadStats, markThreadResolved } from "../lib/review-threads"
import type { PullRequest, Density, PRDetails, PanelTab, PRPanelData, PRLifecycleInfo } from "../lib/types"
import { groupByRepo, groupByStack, groupByRepoAndStack, type GroupMode, type GroupedData } from "../lib/grouping"

interface LsCommandProps {
  author?: string
  repoFilter?: string
}

type StatusFilter = "all" | "open" | "draft"
type SortMode = "attention" | "repo" | "number" | "title" | "age" | "status"
const SORT_MODES: SortMode[] = ["attention", "repo", "number", "title", "age", "status"]
const SORT_LABELS: Record<SortMode, string> = {
  attention: "Attention",
  repo: "Repo",
  number: "#",
  title: "Title",
  age: "Age",
  status: "Status",
}

export function LsCommand({ author, repoFilter: initialRepoFilter }: LsCommandProps) {
  const renderer = useRenderer()
  const { height: termHeight, width: termWidth } = useTerminalDimensions()
  const [allPRs, setAllPRs] = useState<PullRequest[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all")
  const [searchMode, setSearchMode] = useState(false)
  const [searchQuery, setSearchQuery] = useState("")
  const [repoFilter, setRepoFilter] = useState<string | null>(initialRepoFilter ?? null)
  const [currentRepo, setCurrentRepo] = useState<string | null>(null)
  const [sortMode, setSortMode] = useState<SortMode>("attention")
  const [loadingStatus, setLoadingStatus] = useState("Loading PRs...")
  const [flash, setFlash] = useState<string | null>(null)
  const [density, setDensity] = useState<Density>("compact")
  const [detailsMap, setDetailsMap] = useState<Map<string, PRDetails>>(new Map())
  const [groupMode, setGroupMode] = useState<GroupMode>("none")
  // Reply mode: composing a reply to a code comment
  const [replyMode, setReplyMode] = useState(false)
  const [replyText, setReplyText] = useState("")
  const [replyCommentId, setReplyCommentId] = useState<number | null>(null)
  const [activeCodeCommentIndex, setActiveCodeCommentIndex] = useState(0)

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

  // Get unique repos and authors for cycling
  const repos = useMemo(() => {
    const set = [...new Set(allPRs.map((pr) => pr.repo))].sort()
    return set
  }, [allPRs])

  const authors = useMemo(() => {
    const set = [...new Set(allPRs.map((pr) => pr.author).filter(Boolean))].sort()
    return set as string[]
  }, [allPRs])

  const [authorFilter, setAuthorFilter] = useState<string | null>(null)

  const filteredPRs = useMemo(() => {
    let prs = allPRs
    // Repo filter
    if (repoFilter) {
      prs = prs.filter((pr) => pr.repo === repoFilter)
    }
    // Author filter
    if (authorFilter) {
      prs = prs.filter((pr) => pr.author === authorFilter)
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
        case "attention": {
          // Sort by lifecycle urgency score (computed below in lifecycleMap)
          const aState = detailsMap.has(a.url) ? detectPRState(a, detailsMap.get(a.url)!) : detectPRState(a, null)
          const bState = detailsMap.has(b.url) ? detectPRState(b, detailsMap.get(b.url)!) : detectPRState(b, null)
          return compareByUrgency(
            { urgency: aState.urgency, createdAt: a.createdAt },
            { urgency: bState.urgency, createdAt: b.createdAt },
          )
        }
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
  }, [allPRs, repoFilter, authorFilter, statusFilter, searchQuery, sortMode, detailsMap])

  // Grouped data computation
  const groupedData = useMemo(() => {
    if (groupMode === "none") return null

    if (groupMode === "repo") {
      return groupByRepo(filteredPRs)
    } else if (groupMode === "stack") {
      return groupByStack(filteredPRs)
    } else if (groupMode === "repo-stack") {
      return groupByRepoAndStack(filteredPRs)
    }
    return null
  }, [filteredPRs, groupMode])

  useEffect(() => {
    if (selectedIndex >= filteredPRs.length) {
      setSelectedIndex(Math.max(0, filteredPRs.length - 1))
    }
  }, [filteredPRs.length, selectedIndex])

  // Always fetch details - needed for lifecycle state detection and attention sort
  useEffect(() => {
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
  }, [filteredPRs])

  const selectedPR = filteredPRs[selectedIndex] ?? null

  // Panel state management (shared hook handles data fetching + caching + prefetching)
  const panel = usePanel(selectedPR, filteredPRs, selectedIndex)
  const { panelOpen, panelTab, splitRatio, panelFullscreen, panelData, panelLoading,
    setPanelOpen, setPanelTab, setSplitRatio, setPanelFullscreen, setPanelData, cacheRef } = panel

  // Compute lifecycle state for the selected PR
  const selectedLifecycle = useMemo<PRLifecycleInfo | null>(() => {
    if (!selectedPR) return null
    const details = detailsMap.get(selectedPR.url) ?? null
    return detectPRState(selectedPR, details)
  }, [selectedPR, detailsMap])

  useEffect(() => {
    if (!panelOpen || panelTab !== "code" || !panelData || panelData.codeComments.length === 0) {
      setActiveCodeCommentIndex(0)
      return
    }
    const nextIndex = findNextUnresolvedCommentIndex(panelData.codeComments, -1)
    setActiveCodeCommentIndex(nextIndex >= 0 ? nextIndex : 0)
  }, [panelOpen, panelTab, panelData])

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

    // Reply mode: composing a reply to a code review comment
    if (replyMode) {
      if (key.name === "escape") {
        setReplyMode(false)
        setReplyText("")
        setReplyCommentId(null)
        return
      }
      if (key.name === "enter" || key.name === "return") {
        if (replyText.trim() && replyCommentId && selectedPR) {
          showFlash("Sending reply...")
          replyToReviewComment(selectedPR.repo, selectedPR.number, replyCommentId, replyText.trim())
            .then(() => showFlash("Reply sent!"))
            .catch(() => showFlash("Failed to send reply"))
        }
        setReplyMode(false)
        setReplyText("")
        setReplyCommentId(null)
        return
      }
      if (key.name === "backspace") {
        setReplyText((t) => t.slice(0, -1))
        return
      }
      if (key.name.length === 1 && !key.ctrl && !key.meta) {
        setReplyText((t) => t + key.name)
        return
      }
      return
    }

    if (panelOpen) {
      // Panel open mode: scrolling is handled by the scrollbox natively,
      // so only PR navigation and panel controls are managed here
      if (key.name === "down") {
        setSelectedIndex((i) => Math.min(filteredPRs.length - 1, i + 1))
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
        // Exit fullscreen first, then close panel on second press
        if (panelFullscreen) {
          setPanelFullscreen(false)
        } else {
          setPanelOpen(false)
        }
      } else if (key.name === "enter" || key.name === "return") {
        if (selectedPR) {
          Bun.spawn(["open", selectedPR.url], { stdout: "ignore", stderr: "ignore" })
          showFlash("Opening " + selectedPR.url)
        }
      } else if (key.name === "n" && panelTab === "code" && panelData) {
        const nextIndex = findNextUnresolvedCommentIndex(panelData.codeComments, activeCodeCommentIndex)
        if (nextIndex >= 0) {
          setActiveCodeCommentIndex(nextIndex)
          const nextComment = panelData.codeComments[nextIndex]
          showFlash(`Next unresolved: ${nextComment.path}:${nextComment.line}`)
        } else {
          showFlash("No unresolved threads")
        }
      } else if (key.sequence === "R" && panelTab === "code" && panelData && selectedPR) {
        const fallbackIndex = findNextUnresolvedCommentIndex(panelData.codeComments, -1)
        const currentComment = panelData.codeComments[activeCodeCommentIndex]
        const targetComment =
          currentComment && currentComment.isResolved !== true && currentComment.threadId
            ? currentComment
            : (fallbackIndex >= 0 ? panelData.codeComments[fallbackIndex] : null)

        if (!targetComment?.threadId) {
          showFlash("No unresolved thread selected")
        } else {
          showFlash("Resolving thread...")
          resolveReviewThread(targetComment.threadId)
            .then(() => {
              const updatedComments = markThreadResolved(panelData.codeComments, targetComment.threadId!)
              const updatedPanelData = { ...panelData, codeComments: updatedComments }
              setPanelData(updatedPanelData)
              cacheRef.current.setPanelData(selectedPR.url, updatedPanelData)

              setDetailsMap((prev) => {
                const details = prev.get(selectedPR.url)
                if (!details) return prev
                const next = new Map(prev)
                next.set(selectedPR.url, {
                  ...details,
                  unresolvedThreadCount: getCodeCommentThreadStats(updatedComments).unresolvedThreads,
                })
                return next
              })

              const nextIndex = findNextUnresolvedCommentIndex(updatedComments, activeCodeCommentIndex)
              setActiveCodeCommentIndex(nextIndex >= 0 ? nextIndex : 0)
              showFlash("Thread resolved")
            })
            .catch(() => showFlash("Failed to resolve thread"))
        }
      } else if (key.name === "e" && panelTab === "files" && panelData && selectedPR) {
        // Generate AI explanations with progressive per-file updates
        showFlash("Generating explanations...")
        const prUrl = selectedPR.url
        import("../lib/explain-diff").then(async ({ explainAllDiffs }) => {
          const files = [...panelData.files]

          await explainAllDiffs(files, (filename, explanation, completed, total) => {
            // Update the specific file's explanation progressively
            const idx = files.findIndex(f => f.filename === filename)
            if (idx >= 0) files[idx] = { ...files[idx], explanation }

            const updated = { ...panelData, files: [...files] }
            setPanelData(updated)
            cacheRef.current.setPanelData(prUrl, updated)
            showFlash(`Explaining files... ${completed}/${total}`)
          })

          showFlash(`Explained ${files.filter(f => f.explanation).length} files`)
        }).catch(() => {
          showFlash("Failed to generate explanations")
        })
      } else if (key.name === "c" && selectedPR) {
        renderer.copyToClipboardOSC52(selectedPR.url)
        showFlash("Copied URL!")
      } else if (key.name === "r" && panelTab === "code" && panelData && selectedPR) {
        // Reply to the currently selected code comment
        const comments = panelData.codeComments
        const targetComment = comments[activeCodeCommentIndex] ?? comments[comments.length - 1]
        if (targetComment) {
          setReplyCommentId(targetComment.id)
          setReplyMode(true)
          setReplyText("")
          showFlash(`Replying to @${targetComment.author} on ${targetComment.path}...`)
        } else {
          showFlash("No code comments to reply to")
        }
      } else if (key.sequence === "A" && selectedPR) {
        // Shift+A: approve the PR
        showFlash("Approving PR...")
        submitPRReview(selectedPR.repo, selectedPR.number, "APPROVE")
          .then(() => showFlash("Approved!"))
          .catch(() => showFlash("Failed to approve"))
      } else if (key.sequence === "X" && selectedPR) {
        // Shift+X: request changes (with a default body)
        showFlash("Requesting changes...")
        submitPRReview(selectedPR.repo, selectedPR.number, "REQUEST_CHANGES", "Changes requested from raft TUI")
          .then(() => showFlash("Changes requested!"))
          .catch(() => showFlash("Failed to submit review"))
      } else if (key.sequence === "C" && selectedPR) {
        // Shift+C: post a general comment on the PR
        showFlash("Posting comment...")
        postPRComment(selectedPR.repo, selectedPR.number, "Reviewed in raft TUI")
          .then(() => showFlash("Comment posted!"))
          .catch(() => showFlash("Failed to post comment"))
      } else if (key.name === "q") {
        renderer.destroy()
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
        Bun.spawn(["open", selectedPR.url], { stdout: "ignore", stderr: "ignore" })
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
    } else if (key.name === "a") {
      if (authors.length === 0) {
        showFlash("No authors found")
      } else if (authorFilter === null) {
        setAuthorFilter(authors[0])
        showFlash(`Author: ${authors[0]}`)
      } else {
        const idx = authors.indexOf(authorFilter)
        if (idx >= 0 && idx < authors.length - 1) {
          setAuthorFilter(authors[idx + 1])
          showFlash(`Author: ${authors[idx + 1]}`)
        } else {
          setAuthorFilter(null)
          showFlash("Author: All")
        }
      }
      setSelectedIndex(0)
    } else if (key.name === "r") {
      if (groupMode === "repo") {
        showFlash("Repo filter disabled in Repo view")
      } else {
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
      }
    } else if (key.name === "v") {
      setDensity((d) => {
        if (d === "compact") return "normal"
        if (d === "normal") return "detailed"
        return "compact"
      })
    } else if (key.name === "g") {
      setGroupMode((mode) => {
        if (mode === "none") {
          showFlash("Group by: Repo")
          return "repo"
        }
        if (mode === "repo") {
          showFlash("Group by: Stack")
          return "stack"
        }
        if (mode === "stack") {
          showFlash("Group by: Repo → Stack")
          return "repo-stack"
        }
        showFlash("Group by: None")
        return "none"
      })
      setSelectedIndex(0)
    } else if (key.name === "p") {
      setPanelOpen(true)
      setPanelTab("body")
    } else if (key.name === "m" && selectedPR && selectedLifecycle?.state === "MERGE_NOW") {
      // Lifecycle action: merge an approved PR
      showFlash("Merging PR...")
      import("../lib/git-utils").then(({ runGhMerge }) => {
        runGhMerge(selectedPR.repo, selectedPR.number)
          .then(() => showFlash(`Merged #${selectedPR.number}!`))
          .catch((e) => showFlash(`Merge failed: ${e instanceof Error ? e.message : "unknown"}`))
      })
    } else if (key.sequence === "F" && selectedPR && selectedLifecycle?.state === "FIX_REVIEW") {
      // Lifecycle action: open fix mode for review comments
      // For now, open panel to code tab to show the threads
      setPanelOpen(true)
      setPanelTab("code")
      showFlash("Showing review threads. (Full fix mode coming soon)")
    } else if (key.sequence === "P" && selectedPR && selectedLifecycle?.state === "PING_REVIEWERS") {
      // Lifecycle action: copy PR URL for pinging reviewers
      renderer.copyToClipboardOSC52(selectedPR.url)
      showFlash(`Copied URL for #${selectedPR.number}. Ping your reviewers!`)
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
          <text fg="#9aa5ce">
            {filteredPRs.length} PRs  sort: {SORT_LABELS[sortMode]}  view: {density}  group: {groupMode === "none" ? "None" : groupMode === "repo-stack" ? "Repo→Stack" : groupMode}
          </text>
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

      {/* Author filter */}
      {authorFilter && (
        <box flexDirection="row" paddingX={1} height={1}>
          <text fg="#9aa5ce">
            Author: <span fg="#bb9af7">{authorFilter}</span>
          </text>
        </box>
      )}

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

      {/* Main content area */}
      {panelOpen ? (
        <box flexDirection="row" flexGrow={1} overflow="hidden">
          {/* Compressed PR list (hidden in fullscreen) */}
          {!panelFullscreen && (
            <box flexDirection="column" width={Math.floor(termWidth * (1 - splitRatio))}>
              <box flexDirection="column" flexGrow={1} overflow="hidden">
                <PRTable
                  prs={visiblePRs}
                  selectedIndex={visibleSelectedIndex}
                  density="compressed"
                  onSelect={handleSelect}
                  groupedData={groupedData}
                  groupMode={groupMode}
                />
              </box>
            </box>
          )}
          {/* Preview panel: full width in fullscreen, split ratio otherwise */}
          {selectedPR && (
            <PreviewPanel
              pr={selectedPR}
              panelData={panelData}
              loading={panelLoading}
              tab={panelTab}
              activeCodeCommentIndex={activeCodeCommentIndex}
              width={panelFullscreen ? termWidth : Math.floor(termWidth * splitRatio)}
              height={termHeight - 6}
            />
          )}
        </box>
      ) : (
        <box flexDirection="column" flexGrow={1} overflow="hidden">
          <PRTable
            prs={visiblePRs}
            selectedIndex={visibleSelectedIndex}
            density={density}
            detailsMap={detailsMap}
            onSelect={handleSelect}
            groupedData={groupedData}
            groupMode={groupMode}
          />
          {filteredPRs.length > listHeight && (
            <box paddingX={1} height={1}>
              <text fg="#6b7089">
                {scrollOffset + 1}-{Math.min(scrollOffset + listHeight, filteredPRs.length)} of {filteredPRs.length}
              </text>
            </box>
          )}
        </box>
      )}

      {/* Status diagnostic view - shows lifecycle state, review summary, prompted action */}
      {selectedPR ? (
        <StatusView
          pr={selectedPR}
          details={detailsMap.get(selectedPR.url) ?? null}
          lifecycle={selectedLifecycle}
          flash={flash}
          replyMode={replyMode}
          replyText={replyText}
          panelOpen={panelOpen}
        />
      ) : (
        <box flexDirection="column" paddingX={1} paddingY={1} borderColor="#292e42" border>
          <box height={3}>
            <text fg="#9aa5ce">No PR selected</text>
          </box>
        </box>
      )}
    </box>
  )
}
