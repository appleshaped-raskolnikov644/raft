import { useState, useEffect } from "react"
import { useKeyboard, useRenderer } from "@opentui/react"
import { fetchRepoPRs, getCurrentRepo, updatePRTitle, upsertStackComment } from "../lib/github"
import { detectStacks, buildStackComment, formatStackedTitle } from "../lib/stack"
import type { Stack } from "../lib/types"

interface StackCommandProps {
  repo?: string
  sync: boolean
}

function StackView({ stack, syncing }: { stack: Stack; syncing: boolean }) {
  return (
    <box flexDirection="column" paddingBottom={1}>
      <box paddingX={1} paddingBottom={1}>
        <text>
          <span fg="#7aa2f7">
            <strong>Stack in {stack.repo}</strong>
          </span>
          <span fg="#565f89"> ({stack.prs.length} PRs)</span>
        </text>
      </box>
      {stack.prs.map((pr) => (
        <box key={pr.number} flexDirection="row" paddingX={2}>
          <box width={8}>
            <text fg="#bb9af7">[{pr.position}/{pr.stackSize}]</text>
          </box>
          <box width={8}>
            <text>
              <span fg="#7aa2f7">#{pr.number}</span>
            </text>
          </box>
          <box flexGrow={1}>
            <text fg="#c0caf5">{pr.originalTitle}</text>
          </box>
          <box width={8}>
            <text fg={pr.isDraft ? "#888888" : "#00FF00"}>
              {pr.isDraft ? "DRAFT" : "OPEN"}
            </text>
          </box>
        </box>
      ))}
      {syncing && (
        <box paddingX={1} paddingTop={1}>
          <text fg="#e0af68">Syncing stack metadata...</text>
        </box>
      )}
    </box>
  )
}

export function StackCommand({ repo, sync }: StackCommandProps) {
  const renderer = useRenderer()
  const [stacks, setStacks] = useState<Stack[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [syncing, setSyncing] = useState(false)
  const [syncDone, setSyncDone] = useState(false)

  useKeyboard((key) => {
    if (key.name === "q" || key.name === "escape") {
      renderer.destroy()
    }
  })

  useEffect(() => {
    async function load() {
      try {
        const targetRepo = repo ?? await getCurrentRepo()
        if (!targetRepo) {
          setError("Not in a git repo and no --repo specified")
          return
        }

        const prs = await fetchRepoPRs(targetRepo)
        const detected = detectStacks(prs)
        setStacks(detected)

        if (sync && detected.length > 0) {
          setSyncing(true)
          for (const stack of detected) {
            for (const pr of stack.prs) {
              const newTitle = formatStackedTitle(pr.position, pr.stackSize, pr.originalTitle)
              await updatePRTitle(stack.repo, pr.number, newTitle)
              const comment = buildStackComment(stack.prs, pr.number)
              await upsertStackComment(stack.repo, pr.number, comment)
            }
          }
          setSyncing(false)
          setSyncDone(true)
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to detect stacks")
      }
    }
    load()
  }, [repo, sync])

  if (error) {
    return (
      <box padding={1}>
        <text fg="#ff0000">Error: {error}</text>
      </box>
    )
  }

  if (stacks === null) {
    return (
      <box padding={1}>
        <text fg="#888888">Detecting stacks...</text>
      </box>
    )
  }

  if (stacks.length === 0) {
    return (
      <box padding={1}>
        <text fg="#888888">No stacks detected. PRs must target each other's branches to form a stack.</text>
      </box>
    )
  }

  return (
    <box flexDirection="column" width="100%" height="100%">
      {stacks.map((stack, i) => (
        <StackView key={i} stack={stack} syncing={syncing} />
      ))}
      {syncDone && (
        <box paddingX={1}>
          <text fg="#9ece6a">Stack synced! Titles and comments updated.</text>
        </box>
      )}
      <box paddingX={1} paddingTop={1}>
        <text fg="#565f89">Press q to exit</text>
      </box>
    </box>
  )
}
