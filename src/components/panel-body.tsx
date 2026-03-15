import { MarkdownView } from "./markdown"

interface PanelBodyProps {
  body: string
  width: number
  scrollOffset: number
  maxLines: number
}

export function PanelBody({ body, width, scrollOffset, maxLines }: PanelBodyProps) {
  if (!body) {
    return (
      <box paddingX={1}>
        <text fg="#6b7089">No description provided.</text>
      </box>
    )
  }
  return <MarkdownView content={body} width={width} scrollOffset={scrollOffset} maxLines={maxLines} />
}
