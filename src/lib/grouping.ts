import type { PullRequest } from "./types"
import { detectStacks } from "./stack"

/** The available strategies for grouping pull requests in the table view. */
export type GroupMode = "none" | "repo" | "stack" | "repo-stack"

/** A group of pull requests that belong to the same repository. */
export interface RepoGroup {
  type: "repo"
  repo: string
  prs: PullRequest[]
}

/** A group of pull requests that form a dependent stack within a repository. */
export interface StackGroup {
  type: "stack"
  repo: string
  prs: PullRequest[]
}

/** A group of pull requests that are not part of any detected stack. */
export interface StandaloneGroup {
  type: "standalone"
  prs: PullRequest[]
}

/** A repository group that further subdivides its PRs into stacks and standalone items. */
export interface HierarchicalRepoGroup {
  type: "hierarchical"
  repo: string
  stacks: PullRequest[][]
  standalone: PullRequest[]
}

/** Union of all possible group shapes returned by the grouping functions. */
export type GroupedData = RepoGroup | StackGroup | StandaloneGroup | HierarchicalRepoGroup

/**
 * Groups pull requests by their repository, sorted alphabetically by repo name.
 * @param prs - The pull requests to group.
 * @returns An array of repo groups, each containing the PRs for that repository.
 */
export function groupByRepo(prs: PullRequest[]): RepoGroup[] {
  const byRepo = new Map<string, PullRequest[]>()
  for (const pr of prs) {
    const existing = byRepo.get(pr.repo) ?? []
    existing.push(pr)
    byRepo.set(pr.repo, existing)
  }
  return Array.from(byRepo.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([repo, prs]) => ({ type: "repo", repo, prs }))
}

/**
 * Groups pull requests by detected stacks across all repositories.
 * PRs that are not part of any stack are collected into a single standalone group.
 * @param prs - The pull requests to group.
 * @returns An array of stack groups and at most one standalone group for ungrouped PRs.
 */
export function groupByStack(prs: PullRequest[]): GroupedData[] {
  const byRepo = new Map<string, PullRequest[]>()
  for (const pr of prs) {
    const existing = byRepo.get(pr.repo) ?? []
    existing.push(pr)
    byRepo.set(pr.repo, existing)
  }

  const groups: GroupedData[] = []
  const allStandalone: PullRequest[] = []

  for (const [repo, repoPRs] of byRepo.entries()) {
    const stacks = detectStacks(repoPRs)

    // Find PRs in stacks
    const stackedURLs = new Set(stacks.flatMap(s => s.prs.map(pr => pr.url)))

    // Add stack groups
    for (const stack of stacks) {
      groups.push({ type: "stack", repo, prs: stack.prs })
    }

    // Collect standalone PRs
    for (const pr of repoPRs) {
      if (!stackedURLs.has(pr.url)) {
        allStandalone.push(pr)
      }
    }
  }

  if (allStandalone.length > 0) {
    groups.push({ type: "standalone", prs: allStandalone })
  }

  return groups
}

/**
 * Groups pull requests first by repository, then subdivides each repo into stacks and standalone PRs.
 * Repos are sorted alphabetically by name.
 * @param prs - The pull requests to group.
 * @returns An array of hierarchical repo groups, each containing its stacks and standalone PRs.
 */
export function groupByRepoAndStack(prs: PullRequest[]): HierarchicalRepoGroup[] {
  const byRepo = new Map<string, PullRequest[]>()
  for (const pr of prs) {
    const existing = byRepo.get(pr.repo) ?? []
    existing.push(pr)
    byRepo.set(pr.repo, existing)
  }

  return Array.from(byRepo.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([repo, repoPRs]) => {
      const stacks = detectStacks(repoPRs)
      const stackedURLs = new Set(stacks.flatMap(s => s.prs.map(pr => pr.url)))

      const standalone = repoPRs.filter(pr => !stackedURLs.has(pr.url))

      return {
        type: "hierarchical",
        repo,
        stacks: stacks.map(s => s.prs),
        standalone
      }
    })
}
