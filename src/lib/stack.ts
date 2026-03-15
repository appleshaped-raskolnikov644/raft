import type { PullRequest, Stack, StackedPR } from "./types"
import { stripStackPrefix } from "./github"

const TRUNK_BRANCHES = new Set(["main", "master", "develop", "dev"])

export function detectStacks(prs: PullRequest[]): Stack[] {
  if (prs.length === 0) return []

  const headToPR = new Map<string, PullRequest>()
  for (const pr of prs) {
    headToPR.set(pr.headRefName, pr)
  }

  // Build adjacency: parent's headRefName -> child PR
  const children = new Map<string, PullRequest>()
  for (const pr of prs) {
    if (headToPR.has(pr.baseRefName)) {
      children.set(pr.baseRefName, pr)
    }
  }

  // Stack roots: PRs targeting trunk that have at least one child
  const roots: PullRequest[] = []
  for (const pr of prs) {
    const isTrunkBase = TRUNK_BRANCHES.has(pr.baseRefName)
    const hasChild = children.has(pr.headRefName)
    if (isTrunkBase && hasChild) {
      roots.push(pr)
    }
  }

  const stacks: Stack[] = []
  for (const root of roots) {
    const chain: PullRequest[] = [root]
    let current = root
    while (children.has(current.headRefName)) {
      const child = children.get(current.headRefName)!
      chain.push(child)
      current = child
    }

    const stackSize = chain.length
    const stackedPRs: StackedPR[] = chain.map((pr, i) => ({
      ...pr,
      position: i + 1,
      stackSize,
      originalTitle: stripStackPrefix(pr.title),
    }))

    stacks.push({ repo: root.repo, prs: stackedPRs })
  }

  return stacks
}

export function buildStackComment(prs: StackedPR[], currentPRNumber: number): string {
  const rows = prs.map((pr) => {
    const isCurrent = pr.number === currentPRNumber
    const marker = isCurrent ? ">>" : ""
    const title = isCurrent ? `**${pr.originalTitle}**` : pr.originalTitle
    return `| ${marker} | [#${pr.number}](${pr.url}) | ${title} |`
  })

  return [
    "## Stack",
    "",
    "| | PR | Title |",
    "|---|---|---|",
    ...rows,
  ].join("\n")
}

export function formatStackedTitle(position: number, stackSize: number, originalTitle: string): string {
  return `[${position}/${stackSize}] ${originalTitle}`
}
