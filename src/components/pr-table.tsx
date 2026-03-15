import type { PullRequest } from "../lib/types"
import { formatRelativeAge, shortRepoName, truncate } from "../lib/format"

interface PRTableProps {
  prs: PullRequest[]
  selectedIndex: number
  onSelect?: (index: number) => void
}

function PRRow({ pr, isSelected, index, onSelect }: {
  pr: PullRequest
  isSelected: boolean
  index: number
  onSelect?: (index: number) => void
}) {
  const dotColor = pr.isDraft ? "#6b7089" : "#9ece6a"
  const dot = pr.isDraft ? "\u25CB" : "\u25CF"
  const cursor = isSelected ? "\u25B8" : " "
  const bgColor = isSelected ? "#292e42" : "transparent"
  const age = formatRelativeAge(pr.createdAt)
  const repo = shortRepoName(pr.repo)

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
      <box width={2}>
        <text fg={dotColor}>{dot}</text>
      </box>
      <box width={6}>
        <text fg="#7aa2f7">#{pr.number}</text>
      </box>
      <box width={20}>
        <text fg="#bb9af7">{truncate(repo, 18)}</text>
      </box>
      <box flexGrow={1}>
        <text fg="#c0caf5">{truncate(pr.title, 60)}</text>
      </box>
      <box width={5}>
        <text fg="#6b7089">{age}</text>
      </box>
    </box>
  )
}

export function PRTable({ prs, selectedIndex, onSelect }: PRTableProps) {
  if (prs.length === 0) {
    return (
      <box padding={2}>
        <text fg="#6b7089">No PRs match your filters.</text>
      </box>
    )
  }

  return (
    <box flexDirection="column" width="100%">
      {prs.map((pr, i) => (
        <PRRow
          key={`${pr.repo}-${pr.number}`}
          pr={pr}
          isSelected={i === selectedIndex}
          index={i}
          onSelect={onSelect}
        />
      ))}
    </box>
  )
}
