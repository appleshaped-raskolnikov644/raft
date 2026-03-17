/**
 * Shared panel state management hook.
 *
 * Extracts the duplicated panel state + data fetching logic that was
 * identical in ls.tsx and stack.tsx. Handles panel open/close, tab
 * switching, split ratio, fullscreen, data fetching with caching,
 * and neighbor prefetching.
 */

import { useState, useEffect, useRef, type MutableRefObject } from "react"
import { fetchPRPanelData } from "../lib/github"
import { PRCache } from "../lib/cache"
import { LAYOUT } from "../lib/constants"
import type { PullRequest, PanelTab, PRPanelData } from "../lib/types"

/** All state and actions exposed by the usePanel hook. */
export interface PanelState {
  panelOpen: boolean
  panelTab: PanelTab
  splitRatio: number
  panelFullscreen: boolean
  panelData: PRPanelData | null
  panelLoading: boolean
  cacheRef: MutableRefObject<PRCache>
  setPanelOpen: (open: boolean) => void
  setPanelTab: (tab: PanelTab | ((prev: PanelTab) => PanelTab)) => void
  setSplitRatio: (ratio: number | ((prev: number) => number)) => void
  setPanelFullscreen: (fs: boolean | ((prev: boolean) => boolean)) => void
  setPanelData: (data: PRPanelData | null) => void
}

/**
 * Hook for managing preview panel state, data fetching, and caching.
 *
 * Handles the full panel lifecycle: opening/closing, tab navigation,
 * data fetching with caching, and neighbor prefetching for smooth
 * navigation between PRs.
 *
 * @param selectedPR - The currently selected PR (null if none)
 * @param allPRs - All PRs in the current list (for neighbor prefetching)
 * @param selectedIndex - Index of the selected PR in allPRs
 * @returns Panel state and setter functions
 */
export function usePanel(
  selectedPR: PullRequest | null,
  allPRs: PullRequest[],
  selectedIndex: number,
): PanelState {
  const [panelOpen, setPanelOpen] = useState(false)
  const [panelTab, setPanelTab] = useState<PanelTab>("body")
  const [splitRatio, setSplitRatio] = useState(LAYOUT.defaultSplitRatio)
  const [panelFullscreen, setPanelFullscreen] = useState(false)
  const [panelData, setPanelData] = useState<PRPanelData | null>(null)
  const [panelLoading, setPanelLoading] = useState(false)
  const cacheRef = useRef(new PRCache())

  // Fetch panel data when panel opens or selected PR changes
  useEffect(() => {
    if (!panelOpen || !selectedPR) return
    let cancelled = false

    const cache = cacheRef.current
    const cached = cache.getPanelData(selectedPR.url)
    if (cached) {
      setPanelData(cached)
      setPanelLoading(false)
      return () => { cancelled = true }
    }

    setPanelLoading(true)
    setPanelData(null)
    fetchPRPanelData(selectedPR.repo, selectedPR.number)
      .then((data) => {
        if (cancelled) return
        cache.setPanelData(selectedPR.url, data)
        setPanelData(data)
      })
      .catch(() => { if (!cancelled) setPanelData(null) })
      .finally(() => { if (!cancelled) setPanelLoading(false) })

    return () => { cancelled = true }
  }, [panelOpen, selectedPR?.url])

  // Prefetch neighbor PR data for smooth navigation
  useEffect(() => {
    if (!panelOpen) return
    const cache = cacheRef.current

    const neighbors = [allPRs[selectedIndex - 1], allPRs[selectedIndex + 1]].filter(Boolean)
    for (const pr of neighbors) {
      if (!cache.hasPanelData(pr.url)) {
        fetchPRPanelData(pr.repo, pr.number)
          .then((data) => cache.setPanelData(pr.url, data))
          .catch(() => {})
      }
    }
  }, [panelOpen, selectedIndex, allPRs])

  return {
    panelOpen,
    panelTab,
    splitRatio,
    panelFullscreen,
    panelData,
    panelLoading,
    cacheRef,
    setPanelOpen,
    setPanelTab,
    setSplitRatio,
    setPanelFullscreen,
    setPanelData,
  }
}
