import { useState, useEffect } from "react"

interface SkeletonBlockProps {
  width: number
  color?: string
}

function SkeletonBlock({ width, color = "#292e42" }: SkeletonBlockProps) {
  return (
    <box width={width} height={1}>
      <text fg={color}>{"\u2588".repeat(width)}</text>
    </box>
  )
}

interface SkeletonRowProps {
  visible: boolean
}

function SkeletonRow({ visible }: SkeletonRowProps) {
  if (!visible) return <box height={1} />
  return (
    <box flexDirection="row" paddingX={1} height={1} gap={1}>
      <SkeletonBlock width={1} />
      <SkeletonBlock width={1} />
      <SkeletonBlock width={5} color="#1f2335" />
      <SkeletonBlock width={14} color="#24283b" />
      <SkeletonBlock width={35} color="#292e42" />
      <SkeletonBlock width={3} color="#1f2335" />
    </box>
  )
}

interface SkeletonListProps {
  rows?: number
}

export function SkeletonList({ rows = 10 }: SkeletonListProps) {
  const [visibleCount, setVisibleCount] = useState(0)

  useEffect(() => {
    if (visibleCount >= rows) return
    const timer = setTimeout(() => {
      setVisibleCount((c) => c + 1)
    }, 40)
    return () => clearTimeout(timer)
  }, [visibleCount, rows])

  return (
    <box flexDirection="column" width="100%">
      {Array.from({ length: rows }, (_, i) => (
        <SkeletonRow key={i} visible={i < visibleCount} />
      ))}
    </box>
  )
}
