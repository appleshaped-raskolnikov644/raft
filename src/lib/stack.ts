/**
 * Stack detection and management for stacked PR workflows.
 *
 * Detects parent-child PR relationships by matching branch names and provides
 * utilities for building stack metadata comments and formatting PR titles.
 */

import type { PullRequest, Stack, StackedPR } from "./types"
import { stripStackPrefix } from "./github"

/**
 * Detect stacked PRs by analyzing branch relationships.
 *
 * A stack is a chain of PRs where each PR's base branch is another PR's head branch.
 * Roots are PRs with children that target non-PR branches (main, develop, etc).
 * Returns one stack per detected root, in dependency order.
 *
 * @param prs - Array of pull requests with headRefName and baseRefName set
 * @returns Array of detected stacks, each containing a linear chain of PRs
 */
export function detectStacks(prs: PullRequest[]): Stack[] {
  if (prs.length === 0) return []

  // Map: headRefName -> PR (each PR "owns" its head branch)
  const headToPR = new Map<string, PullRequest>()
  for (const pr of prs) {
    headToPR.set(pr.headRefName, pr)
  }

  // Build parent -> child: if a PR's base is another PR's head, it's a child
  const children = new Map<string, PullRequest>()
  for (const pr of prs) {
    if (headToPR.has(pr.baseRefName)) {
      children.set(pr.baseRefName, pr)
    }
  }

  // A root is any PR that has a child AND whose base is NOT another PR's head.
  // This means the root targets a non-PR branch (main, release/*, develop, etc.)
  const roots: PullRequest[] = []
  for (const pr of prs) {
    const hasChild = children.has(pr.headRefName)
    const baseIsAnotherPR = headToPR.has(pr.baseRefName)
    if (hasChild && !baseIsAnotherPR) {
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

/**
 * Build a markdown table showing the full stack for a PR comment.
 *
 * Marks the current PR with `>>` and bolds its title for visibility.
 *
 * @param prs - Array of StackedPR objects in the stack (already numbered)
 * @param currentPRNumber - The PR number of the PR the comment will be posted on
 * @returns Markdown formatted stack table with header
 */
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

/**
 * Format a PR title with stack position notation.
 *
 * Adds `[n/m]` prefix to indicate the PR's position in the stack.
 * Example: position=2, stackSize=4, title="Add auth" => "[2/4] Add auth"
 *
 * @param position - The PR's position in the stack (1-indexed)
 * @param stackSize - Total number of PRs in the stack
 * @param originalTitle - The PR's title without stack notation
 * @returns Title with `[n/m]` prefix
 */
export function formatStackedTitle(position: number, stackSize: number, originalTitle: string): string {
  return `[${position}/${stackSize}] ${originalTitle}`
}
