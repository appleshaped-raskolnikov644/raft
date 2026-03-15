import type { PullRequest } from "../lib/types"

interface PRTableProps {
  prs: PullRequest[]
}

function truncate(str: string, max: number): string {
  return str.length > max ? str.slice(0, max - 1) + "..." : str
}

function PRRow({ pr, isEven }: { pr: PullRequest; isEven: boolean }) {
  const status = pr.isDraft ? "DRAFT" : "OPEN"
  const statusColor = pr.isDraft ? "#888888" : "#00FF00"
  const bgColor = isEven ? "#1a1a2e" : "#16161e"

  return (
    <box flexDirection="row" backgroundColor={bgColor} paddingX={1}>
      <box width={8}>
        <text>
          <span fg="#7aa2f7">#{pr.number}</span>
        </text>
      </box>
      <box width={35}>
        <text fg="#888888">{truncate(pr.repo, 33)}</text>
      </box>
      <box width={40}>
        <text fg="#c0caf5">{truncate(pr.title, 38)}</text>
      </box>
      <box flexGrow={1}>
        <text fg="#565f89">{truncate(pr.body, 50)}</text>
      </box>
      <box width={8}>
        <text fg={statusColor}>{status}</text>
      </box>
    </box>
  )
}

function TableHeader() {
  return (
    <box flexDirection="row" paddingX={1} borderBottom borderColor="#414868">
      <box width={8}>
        <text>
          <strong>PR</strong>
        </text>
      </box>
      <box width={35}>
        <text>
          <strong>Repo</strong>
        </text>
      </box>
      <box width={40}>
        <text>
          <strong>Title</strong>
        </text>
      </box>
      <box flexGrow={1}>
        <text>
          <strong>Description</strong>
        </text>
      </box>
      <box width={8}>
        <text>
          <strong>Status</strong>
        </text>
      </box>
    </box>
  )
}

export function PRTable({ prs }: PRTableProps) {
  if (prs.length === 0) {
    return (
      <box padding={2}>
        <text fg="#888888">No open PRs found.</text>
      </box>
    )
  }

  return (
    <box flexDirection="column" width="100%">
      <TableHeader />
      {prs.map((pr, i) => (
        <PRRow key={`${pr.repo}-${pr.number}`} pr={pr} isEven={i % 2 === 0} />
      ))}
      <box paddingTop={1} paddingX={1}>
        <text fg="#565f89">COUNT={prs.length}</text>
      </box>
    </box>
  )
}
