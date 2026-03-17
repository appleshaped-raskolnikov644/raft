/**
 * Preview panel for displaying PR details in a side panel.
 *
 * Shows PR title, repo, branch, and tab bar with content for:
 * - Body: PR description rendered as markdown
 * - Comments: Issue-level conversation comments
 * - Code: Inline code review comments
 * - Files: File diffs with native syntax-highlighted rendering
 *
 * All tabs use OpenTUI's native `<scrollbox>` for interactive scrolling
 * (mouse wheel, clickable/draggable scrollbar, keyboard support).
 */

import React from "react"
import type { PullRequest, PRPanelData, PanelTab } from "../lib/types"
import { shortRepoName } from "../lib/format"
import { Spinner } from "./spinner"
import { PanelBody } from "./panel-body"
import { PanelComments } from "./panel-comments"
import { PanelCode } from "./panel-code"
import { PanelFiles } from "./panel-files"
import { getCodeCommentThreadStats } from "../lib/review-threads"

/** Props for the {@link PreviewPanel} component. */
interface PreviewPanelProps {
  /** The PR being previewed. */
  pr: PullRequest
  /** Fetched panel data (body, comments, code comments, files). */
  panelData: PRPanelData | null
  /** Whether panel data is still loading. */
  loading: boolean
  /** Currently active tab. */
  tab: PanelTab
  /** Available width in columns. */
  width: number
  /** Available height in rows. */
  height: number
  /** Currently active code comment index for keyboard navigation. */
  activeCodeCommentIndex?: number
}

/**
 * Shared scrollbox styling for all panel tabs.
 * Uses Tokyo Night colors matching the rest of the TUI.
 */
const SCROLLBOX_STYLE = {
  rootOptions: {
    backgroundColor: "#1a1b26",
  },
  scrollbarOptions: {
    showArrows: false,
    trackOptions: {
      foregroundColor: "#7aa2f7",
      backgroundColor: "#292e42",
    },
  },
}

/**
 * Renders the PR preview panel with tab navigation and scrollable content.
 *
 * All tabs are wrapped in OpenTUI's native `<scrollbox>` for interactive
 * scrolling with mouse wheel, clickable/draggable scrollbar, and keyboard
 * support. Keyboard scroll (j/k) is handled by the scrollbox when focused.
 *
 * @param props - See {@link PreviewPanelProps}.
 */
export function PreviewPanel({ pr, panelData, loading, tab, width, height, activeCodeCommentIndex = -1 }: PreviewPanelProps) {
  const commentCount = panelData?.comments.length ?? 0
  const codeCount = panelData ? getCodeCommentThreadStats(panelData.codeComments).totalThreads : 0
  const fileCount = panelData?.files.length ?? 0
  // 4 lines reserved: title, subtitle, divider, tab bar
  const contentHeight = Math.max(1, height - 4)

  return (
    <box flexDirection="column" width={width} height={height} borderColor="#292e42" border>
      {/* Title */}
      <box height={1} paddingX={1}>
        <text>
          <span fg="#7aa2f7"><strong>#{pr.number}</strong></span>
          <span fg="#c0caf5"> {pr.title}</span>
        </text>
      </box>

      {/* Subtitle */}
      <box height={1} paddingX={1}>
        <text>
          <span fg="#bb9af7">{shortRepoName(pr.repo)}</span>
          <span fg="#6b7089"> {"\u00B7"} </span>
          <span fg="#6b7089">{pr.headRefName || "unknown"}</span>
        </text>
      </box>

      {/* Tab bar */}
      <box height={1} paddingX={1} flexDirection="row">
        <box marginRight={2}>
          <text fg={tab === "body" ? "#7aa2f7" : "#6b7089"}>
            {tab === "body" ? <u>Body</u> : "Body"}
          </text>
        </box>
        <box marginRight={2}>
          <text fg={tab === "comments" ? "#7aa2f7" : "#6b7089"}>
            {tab === "comments" ? <u>Comments ({commentCount})</u> : `Comments (${commentCount})`}
          </text>
        </box>
        <box marginRight={2}>
          <text fg={tab === "code" ? "#7aa2f7" : "#6b7089"}>
            {tab === "code" ? <u>Code ({codeCount})</u> : `Code (${codeCount})`}
          </text>
        </box>
        <box>
          <text fg={tab === "files" ? "#7aa2f7" : "#6b7089"}>
            {tab === "files" ? <u>Files ({fileCount})</u> : `Files (${fileCount})`}
          </text>
        </box>
      </box>

      {/* Divider */}
      <box height={1} paddingX={1}>
        <text fg="#292e42">{"\u2500".repeat(Math.max(1, width - 4))}</text>
      </box>

      {/* Content area with native scrollbox */}
      <box flexGrow={1} overflow="hidden">
        {loading ? (
          <box paddingX={1}>
            <Spinner text="Loading..." />
          </box>
        ) : panelData ? (
          <scrollbox
            scrollY
            focused
            height={contentHeight}
            style={SCROLLBOX_STYLE}
          >
            {tab === "body" && (
              <PanelBody body={panelData.body} width={width - 4} />
            )}
            {tab === "comments" && (
              <PanelComments comments={panelData.comments} width={width - 4} />
            )}
            {tab === "code" && (
              <PanelCode
                codeComments={panelData.codeComments}
                width={width - 4}
                activeIndex={activeCodeCommentIndex}
              />
            )}
            {tab === "files" && (
              <PanelFiles files={panelData.files} width={width - 4} />
            )}
          </scrollbox>
        ) : (
          <box paddingX={1}>
            <text fg="#f7768e">Failed to load data.</text>
          </box>
        )}
      </box>
    </box>
  )
}
