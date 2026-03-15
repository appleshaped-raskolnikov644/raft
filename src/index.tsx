#!/usr/bin/env bun
import { createCliRenderer } from "@opentui/core"
import { createRoot } from "@opentui/react"
import { useKeyboard, useRenderer } from "@opentui/react"
import { useState } from "react"
import { LsCommand } from "./commands/ls"
import { StackCommand } from "./commands/stack"
import { LogCommand } from "./commands/log"
import { MergeCommand } from "./commands/merge"
import { SyncCommand } from "./commands/sync"
import { NavCommand, CreateCommand, RestackCommand } from "./commands/nav"

type Command = "ls" | "stack" | "stack-sync" | "log" | "merge" | "sync"
  | "create" | "up" | "down" | "restack" | "home" | "help"

interface Config {
  command: Command
  author?: string
  repoFilter?: string
  branchName?: string
  commitMessage?: string
}

function parseArgs(argv: string[]): Config {
  const args = argv.slice(2)
  const command = args[0] as string | undefined

  if (args.includes("--help") || args.includes("-h")) {
    return { command: "help" }
  }

  let author: string | undefined
  let repoFilter: string | undefined
  let branchName: string | undefined
  let commitMessage: string | undefined

  for (let i = 1; i < args.length; i++) {
    const arg = args[i]
    if (arg.startsWith("--author=")) {
      author = arg.split("=")[1]
    } else if (arg.startsWith("--repo=")) {
      repoFilter = arg.split("=")[1]
    } else if (arg === "-m" && args[i + 1]) {
      commitMessage = args[++i]
    } else if (arg === "sync" && command === "stack") {
      // handled below
    } else if (!arg.startsWith("-") && !branchName) {
      branchName = arg
    }
  }

  if (command === "ls") return { command: "ls", author, repoFilter }
  if (command === "stack") {
    const hasSync = args.includes("sync")
    return { command: hasSync ? "stack-sync" : "stack", repoFilter }
  }
  if (command === "log") return { command: "log", repoFilter }
  if (command === "merge") return { command: "merge", repoFilter }
  if (command === "sync") return { command: "sync", repoFilter }
  if (command === "create") return { command: "create", branchName, commitMessage }
  if (command === "up") return { command: "up" }
  if (command === "down") return { command: "down" }
  if (command === "restack") return { command: "restack" }
  return { command: "home" }
}

function printHelp() {
  console.log(`raft - TUI for GitHub PR management

Usage:
  raft                         Interactive home screen
  raft ls                      List all your open PRs
  raft ls --repo=<name>        Filter PRs by repo name
  raft ls --author=<user>      List PRs by specific author
  raft log                     Visual stack graph
  raft stack                   Show detected PR stacks
  raft stack sync              Rename PRs and update stack comments
  raft merge                   Merge a stack bottom-up
  raft sync                    Cleanup merged branches
  raft create <name> [-m msg]  Create a stacked branch
  raft up                      Move up in the current stack
  raft down                    Move down in the current stack
  raft restack                 Rebase stack onto parents
  raft --help                  Show this help message`)
}

type HomeCommand = "ls" | "log" | "stack" | "stack-sync" | "merge" | "sync"

function HomeScreen() {
  const renderer = useRenderer()
  const [activeCommand, setActiveCommand] = useState<HomeCommand | null>(null)

  useKeyboard((key) => {
    if (activeCommand) return
    if (key.name === "q" || key.name === "escape") {
      renderer.destroy()
    }
  })

  if (activeCommand === "ls") return <LsCommand />
  if (activeCommand === "log") return <LogCommand />
  if (activeCommand === "stack") return <StackCommand repo={undefined} sync={false} />
  if (activeCommand === "stack-sync") return <StackCommand repo={undefined} sync={true} />
  if (activeCommand === "merge") return <MergeCommand />
  if (activeCommand === "sync") return <SyncCommand />

  const commands: Array<{ label: string; key: HomeCommand; desc: string; color: string }> = [
    { label: "List PRs", key: "ls", desc: "Browse all your open PRs", color: "#9ece6a" },
    { label: "Stack Graph", key: "log", desc: "Visual tree of stacked PRs", color: "#7aa2f7" },
    { label: "View Stacks", key: "stack", desc: "Detect stacked PR chains", color: "#bb9af7" },
    { label: "Sync Stacks", key: "stack-sync", desc: "Rename and link stacked PRs", color: "#e0af68" },
    { label: "Merge Stack", key: "merge", desc: "Merge a stack bottom-up", color: "#f7768e" },
    { label: "Cleanup", key: "sync", desc: "Delete merged branches", color: "#9aa5ce" },
  ]

  return (
    <box flexDirection="column" padding={2}>
      <text>
        <span fg="#7aa2f7">
          <strong>raft</strong>
        </span>
        <span fg="#9aa5ce"> - TUI for GitHub PR management</span>
      </text>
      <box height={1} />
      <box flexDirection="column" gap={1}>
        {commands.map((cmd) => (
          <box
            key={cmd.key}
            flexDirection="row"
            paddingX={2}
            paddingY={1}
            border
            borderStyle="rounded"
            borderColor="#292e42"
            onMouseDown={() => setActiveCommand(cmd.key)}
          >
            <box width={16}>
              <text>
                <span fg={cmd.color}>
                  <strong>{cmd.label}</strong>
                </span>
              </text>
            </box>
            <box flexGrow={1}>
              <text fg="#9aa5ce">{cmd.desc}</text>
            </box>
          </box>
        ))}
      </box>
      <box height={1} />
      <text fg="#6b7089">Click a command or press q to exit. Use --help for CLI usage.</text>
    </box>
  )
}

const config = parseArgs(process.argv)

if (config.command === "help") {
  printHelp()
  process.exit(0)
}

const renderer = await createCliRenderer({
  exitOnCtrlC: false,
})

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
  case "log":
    root.render(<LogCommand repo={config.repoFilter} />)
    break
  case "stack":
    root.render(<StackCommand repo={config.repoFilter} sync={false} />)
    break
  case "stack-sync":
    root.render(<StackCommand repo={config.repoFilter} sync={true} />)
    break
  case "merge":
    root.render(<MergeCommand repo={config.repoFilter} />)
    break
  case "sync":
    root.render(<SyncCommand repo={config.repoFilter} />)
    break
  case "create":
    root.render(<CreateCommand name={config.branchName} message={config.commitMessage} />)
    break
  case "up":
    root.render(<NavCommand direction="up" />)
    break
  case "down":
    root.render(<NavCommand direction="down" />)
    break
  case "restack":
    root.render(<RestackCommand />)
    break
  default:
    root.render(<HomeScreen />)
    break
}
