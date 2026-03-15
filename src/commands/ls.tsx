import { useState, useEffect } from "react"
import { PRTable } from "../components/pr-table"
import { fetchOpenPRs } from "../lib/github"
import type { PullRequest } from "../lib/types"

interface LsCommandProps {
  author?: string
  repoFilter?: string
}

export function LsCommand({ author, repoFilter }: LsCommandProps) {
  const [prs, setPRs] = useState<PullRequest[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      try {
        let results = await fetchOpenPRs(author)

        if (repoFilter) {
          const filter = repoFilter.toLowerCase()
          results = results.filter((pr) =>
            pr.repo.toLowerCase().includes(filter)
          )
        }

        results.sort((a, b) => {
          const repoCompare = a.repo.localeCompare(b.repo)
          if (repoCompare !== 0) return repoCompare
          return a.number - b.number
        })

        setPRs(results)
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to fetch PRs")
      }
    }
    load()
  }, [author, repoFilter])

  if (error) {
    return (
      <box padding={1}>
        <text fg="#ff0000">Error: {error}</text>
      </box>
    )
  }

  if (prs === null) {
    return (
      <box padding={1}>
        <text fg="#888888">Loading PRs...</text>
      </box>
    )
  }

  return (
    <box flexDirection="column" width="100%" height="100%">
      <box paddingX={1} paddingBottom={1}>
        <text>
          <span fg="#7aa2f7">
            <strong>Open Pull Requests</strong>
          </span>
          {repoFilter && <span fg="#565f89"> (filtered: {repoFilter})</span>}
        </text>
      </box>
      <PRTable prs={prs} />
      <box paddingX={1} paddingTop={1}>
        <text fg="#565f89">Press q to exit</text>
      </box>
    </box>
  )
}
