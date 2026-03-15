#!/usr/bin/env bun
import { createCliRenderer } from "@opentui/core"
import { createRoot } from "@opentui/react"
import { useKeyboard, useRenderer } from "@opentui/react"
import { LsCommand } from "./commands/ls"
import { StackCommand } from "./commands/stack"

function parseArgs(argv: string[]): {
  command: "ls" | "stack" | "help"
  author?: string
  repoFilter?: string
  sync: boolean
} {
  const args = argv.slice(2)
  const command = args[0] as string | undefined

  let author: string | undefined
  let repoFilter: string | undefined
  let sync = false

  for (const arg of args.slice(1)) {
    if (arg.startsWith("--author=")) {
      author = arg.split("=")[1]
    } else if (arg.startsWith("--repo=")) {
      repoFilter = arg.split("=")[1]
    } else if (arg === "sync") {
      sync = true
    }
  }

  if (command === "ls") return { command: "ls", author, repoFilter, sync: false }
  if (command === "stack") return { command: "stack", repoFilter, sync }
  return { command: "help", sync: false }
}

function HelpScreen() {
  const renderer = useRenderer()
  useKeyboard((key) => {
    if (key.name === "q" || key.name === "escape") {
      renderer.destroy()
    }
  })
  return (
    <box flexDirection="column" padding={2}>
      <text>
        <span fg="#7aa2f7">
          <strong>raft</strong>
        </span>
        <span fg="#565f89"> - TUI for GitHub PR management</span>
      </text>
      <box height={1} />
      <text>
        <strong>Usage:</strong>
      </text>
      <box paddingLeft={2} flexDirection="column" gap={0}>
        <text>
          <span fg="#9ece6a">raft ls</span>
          <span fg="#565f89">                    List all your open PRs</span>
        </text>
        <text>
          <span fg="#9ece6a">raft ls --repo=web</span>
          <span fg="#565f89">           Filter PRs by repo name</span>
        </text>
        <text>
          <span fg="#9ece6a">raft ls --author=user</span>
          <span fg="#565f89">        List PRs by specific author</span>
        </text>
        <text>
          <span fg="#9ece6a">raft stack</span>
          <span fg="#565f89">                  Show detected PR stacks</span>
        </text>
        <text>
          <span fg="#9ece6a">raft stack sync</span>
          <span fg="#565f89">             Rename PRs and update stack comments</span>
        </text>
        <text>
          <span fg="#9ece6a">raft stack --repo=owner/repo</span>
          <span fg="#565f89"> Stack for specific repo</span>
        </text>
      </box>
      <box height={1} />
      <text fg="#565f89">Press q to exit</text>
    </box>
  )
}

const config = parseArgs(process.argv)

const renderer = await createCliRenderer({
  exitOnCtrlC: false,
})

// Hard quit: only Ctrl+C is the universal escape hatch.
// q and Escape are handled by individual commands (context-sensitive).
renderer.keyInput.on("keypress", (key) => {
  if (key.ctrl && key.name === "c") {
    renderer.destroy()
  }
})

const root = createRoot(renderer)

switch (config.command) {
  case "ls":
    root.render(<LsCommand author={config.author} repoFilter={config.repoFilter} />)
    break
  case "stack":
    root.render(<StackCommand repo={config.repoFilter} sync={config.sync} />)
    break
  default:
    root.render(<HelpScreen />)
    break
}
