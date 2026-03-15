import type { PullRequest, PRPanelData, PanelTab } from "../lib/types"
import { shortRepoName } from "../lib/format"
import { Spinner } from "./spinner"
import { PanelBody } from "./panel-body"
import { PanelComments } from "./panel-comments"
import { PanelCode } from "./panel-code"

interface PreviewPanelProps {
  pr: PullRequest
  panelData: PRPanelData | null
  loading: boolean
  tab: PanelTab
  scrollOffset: number
  width: number
  height: number
}

export function PreviewPanel({ pr, panelData, loading, tab, scrollOffset, width, height }: PreviewPanelProps) {
  const commentCount = panelData?.comments.length ?? 0
  const codeCount = panelData?.codeComments.length ?? 0
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
        <box>
          <text fg={tab === "code" ? "#7aa2f7" : "#6b7089"}>
            {tab === "code" ? <u>Code ({codeCount})</u> : `Code (${codeCount})`}
          </text>
        </box>
      </box>

      {/* Divider */}
      <box height={1} paddingX={1}>
        <text fg="#292e42">{"\u2500".repeat(Math.max(1, width - 4))}</text>
      </box>

      {/* Content */}
      <box flexGrow={1} overflow="hidden">
        {loading ? (
          <box paddingX={1}>
            <Spinner text="Loading..." />
          </box>
        ) : panelData ? (
          <>
            {tab === "body" && (
              <PanelBody body={panelData.body} width={width - 2} scrollOffset={scrollOffset} maxLines={contentHeight} />
            )}
            {tab === "comments" && (
              <PanelComments comments={panelData.comments} width={width - 2} scrollOffset={scrollOffset} maxLines={contentHeight} />
            )}
            {tab === "code" && (
              <PanelCode codeComments={panelData.codeComments} width={width - 2} scrollOffset={scrollOffset} maxLines={contentHeight} />
            )}
          </>
        ) : (
          <box paddingX={1}>
            <text fg="#f7768e">Failed to load data.</text>
          </box>
        )}
      </box>
    </box>
  )
}
