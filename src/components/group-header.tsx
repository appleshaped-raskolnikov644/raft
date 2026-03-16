/** Props for the {@link GroupHeader} separator component. */
interface GroupHeaderProps {
  /** Display label for the group (e.g. repo name or "Standalone PRs"). */
  title: string
  /** Number of items in the group, shown in parentheses. */
  count: number
  /** Available width in columns for the horizontal rule fill. */
  width: number
}

/**
 * Renders a horizontal separator line labelled with a group title and item count.
 * Used to visually separate groups of PRs in the table view.
 */
export function GroupHeader({ title, count, width }: GroupHeaderProps) {
  const text = `─── ${title} (${count}) `
  const remaining = Math.max(0, width - text.length - 2)
  const line = text + "─".repeat(remaining)

  return (
    <box height={1} paddingX={1}>
      <text fg="#414868">{line}</text>
    </box>
  )
}
