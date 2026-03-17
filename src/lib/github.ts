import type { PullRequest, PRDetails, Review, PRPanelData, Comment, CodeComment, FileDiff } from "./types"
import { STACK_COMMENT_MARKER } from "./types"
import { safeSpawn, buildCleanEnv } from "./process"

interface RawSearchResult {
  number: number
  title: string
  url: string
  body: string
  state: string
  isDraft: boolean
  repository: { nameWithOwner: string }
  createdAt: string
  author?: { login: string }
}

export function parseSearchResults(jsonStr: string): PullRequest[] {
  const raw: RawSearchResult[] = JSON.parse(jsonStr)
  return raw.map((pr) => {
    const firstLine = (pr.body ?? "").split("\n")[0] ?? ""
    return {
      number: pr.number,
      title: pr.title,
      url: pr.url,
      body: firstLine.slice(0, 80),
      state: pr.state,
      isDraft: pr.isDraft,
      repo: pr.repository.nameWithOwner,
      headRefName: "",
      baseRefName: "",
      createdAt: pr.createdAt,
      author: pr.author?.login,
    }
  })
}

export function stripStackPrefix(title: string): string {
  return title.replace(/^\[\d+\/\d+\]\s*/, "")
}

async function runGh(args: string[]): Promise<string> {
  // Use safeSpawn to prevent fd leaks that caused segfaults after ~72s
  const { stdout, stderr, exitCode } = await safeSpawn(["gh", ...args], {
    env: buildCleanEnv(),
  })
  if (exitCode !== 0) {
    throw new Error(`gh ${args.join(" ")} failed: ${stderr}`)
  }
  return stdout
}

/** Get all authenticated gh account usernames. */
export async function getGhAccounts(): Promise<string[]> {
  try {
    const output = await runGh(["auth", "status"])
    // Parse account names from "Logged in to github.com account <name>"
    const accounts: string[] = []
    for (const line of output.split("\n")) {
      const match = line.match(/account\s+(\S+)/)
      if (match) accounts.push(match[1])
    }
    return accounts
  } catch (e) {
    // gh auth status exits non-zero sometimes; parse stderr too
    const msg = e instanceof Error ? e.message : ""
    const accounts: string[] = []
    for (const line of msg.split("\n")) {
      const match = line.match(/account\s+(\S+)/)
      if (match) accounts.push(match[1])
    }
    return accounts.length > 0 ? accounts : ["@me"]
  }
}

/** Get the currently active gh account. */
async function getActiveAccount(): Promise<string | null> {
  try {
    const output = await runGh(["auth", "status"])
    const lines = output.split("\n")
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes("Active account: true")) {
        // Account name is on a preceding line
        for (let j = i - 1; j >= 0; j--) {
          const match = lines[j].match(/account\s+(\S+)/)
          if (match) return match[1]
        }
      }
    }
  } catch { /* ignore */ }
  return null
}

async function switchAccount(username: string): Promise<void> {
  await runGh(["auth", "switch", "--user", username])
}

/** Fetch open PRs across all gh accounts, deduped by URL.
 *  Switches accounts and uses @me for each, since the GitHub username
 *  may not match the PR author (e.g., org-linked accounts). */
export async function fetchAllAccountPRs(
  onProgress?: (status: string) => void,
): Promise<PullRequest[]> {
  onProgress?.("Discovering accounts...")
  const accounts = await getGhAccounts()
  const originalAccount = await getActiveAccount()
  const allPRs: PullRequest[] = []
  const seen = new Set<string>()

  for (let i = 0; i < accounts.length; i++) {
    const account = accounts[i]
    onProgress?.(`Fetching PRs for ${account} (${i + 1}/${accounts.length})...`)
    if (accounts.length > 1) {
      try { await switchAccount(account) } catch { continue }
    }
    try {
      const json = await runGh([
        "search", "prs",
        "--author=@me",
        "--state=open",
        "--limit=100",
        "--json", "number,title,url,body,state,repository,isDraft,createdAt",
      ])
      if (json) {
        const parsed = parseSearchResults(json)
        for (const pr of parsed) {
          if (!seen.has(pr.url)) {
            seen.add(pr.url)
            allPRs.push(pr)
          }
        }
        onProgress?.(`Found ${allPRs.length} PRs so far...`)
      }
    } catch { /* skip account if query fails */ }
  }

  onProgress?.(`Loaded ${allPRs.length} PRs across ${accounts.length} accounts`)

  // Restore original account
  if (accounts.length > 1 && originalAccount) {
    try { await switchAccount(originalAccount) } catch { /* ignore */ }
  }

  return allPRs
}

export async function fetchOpenPRs(
  author?: string,
  onProgress?: (status: string) => void,
): Promise<PullRequest[]> {
  if (author === "") {
    // Empty string means fetch all PRs across all repos the user has access to
    onProgress?.("Fetching all open PRs...")
    const json = await runGh([
      "search", "prs",
      "--state=open",
      "--limit=1000",
      "--json", "number,title,url,body,state,repository,isDraft,createdAt,author",
    ])
    if (!json) return []
    return parseSearchResults(json)
  }
  if (author) {
    onProgress?.(`Fetching PRs for ${author}...`)
    const json = await runGh([
      "search", "prs",
      `--author=${author}`,
      "--state=open",
      "--limit=100",
      "--json", "number,title,url,body,state,repository,isDraft,createdAt,author",
    ])
    if (!json) return []
    return parseSearchResults(json)
  }
  return fetchAllAccountPRs(onProgress)
}

/** Try fetching repo PRs, attempting each account if needed. */
export async function fetchRepoPRs(repo: string): Promise<PullRequest[]> {
  const accounts = await getGhAccounts()
  const originalAccount = await getActiveAccount()

  for (const account of accounts) {
    if (accounts.length > 1) {
      try { await switchAccount(account) } catch { continue }
    }
    try {
      const json = await runGh([
        "pr", "list",
        "--repo", repo,
        "--state=open",
        "--limit=100",
        "--json", "number,title,url,body,state,isDraft,headRefName,baseRefName,createdAt",
      ])
      // Restore original account before returning
      if (accounts.length > 1 && originalAccount) {
        try { await switchAccount(originalAccount) } catch { /* ignore */ }
      }
      if (!json) return []
      const raw = JSON.parse(json) as Array<{
        number: number
        title: string
        url: string
        body: string
        state: string
        isDraft: boolean
        headRefName: string
        baseRefName: string
        createdAt: string
      }>
      return raw.map((pr) => ({
        number: pr.number,
        title: pr.title,
        url: `https://github.com/${repo}/pull/${pr.number}`,
        body: (pr.body ?? "").split("\n")[0]?.slice(0, 80) ?? "",
        state: pr.state,
        isDraft: pr.isDraft,
        repo,
        headRefName: pr.headRefName,
        baseRefName: pr.baseRefName,
        createdAt: pr.createdAt,
      }))
    } catch {
      // This account can't access the repo, try next
      continue
    }
  }

  // Restore original account
  if (accounts.length > 1 && originalAccount) {
    try { await switchAccount(originalAccount) } catch { /* ignore */ }
  }

  return []
}

export async function updatePRTitle(repo: string, prNumber: number, title: string): Promise<void> {
  await runGh(["pr", "edit", String(prNumber), "--repo", repo, "--title", title])
}

export async function findStackComment(repo: string, prNumber: number): Promise<number | null> {
  const json = await runGh([
    "api",
    `repos/${repo}/issues/${prNumber}/comments`,
    "--jq", `.[] | select(.body | contains("${STACK_COMMENT_MARKER}")) | .id`,
  ])
  if (!json) return null
  const id = parseInt(json.split("\n")[0], 10)
  return isNaN(id) ? null : id
}

export async function upsertStackComment(
  repo: string,
  prNumber: number,
  body: string,
): Promise<void> {
  const existingId = await findStackComment(repo, prNumber)
  const fullBody = `${STACK_COMMENT_MARKER}\n${body}`
  if (existingId) {
    await runGh([
      "api",
      `repos/${repo}/issues/comments/${existingId}`,
      "--method", "PATCH",
      "--field", `body=${fullBody}`,
    ])
  } else {
    await runGh([
      "api",
      `repos/${repo}/issues/${prNumber}/comments`,
      "--method", "POST",
      "--field", `body=${fullBody}`,
    ])
  }
}

export async function getCurrentRepo(): Promise<string | null> {
  try {
    const result = await runGh(["repo", "view", "--json", "nameWithOwner", "--jq", ".nameWithOwner"])
    return result || null
  } catch {
    return null
  }
}

/** Helper: try fetching with account switching for repos that may need different auth */
async function tryMultiAccountFetch<T>(
  fetchFn: () => Promise<T>
): Promise<T> {
  const accounts = await getGhAccounts()
  const originalAccount = await getActiveAccount()

  // Try with current account first
  try {
    return await fetchFn()
  } catch (firstError) {
    // If there's only one account, rethrow
    if (accounts.length <= 1) {
      throw firstError
    }

    // Try other accounts
    for (const account of accounts) {
      if (account === originalAccount) continue
      try {
        await switchAccount(account)
        const result = await fetchFn()
        // Restore original account before returning
        if (originalAccount) {
          try { await switchAccount(originalAccount) } catch {}
        }
        return result
      } catch {
        continue
      }
    }

    // Restore original account
    if (originalAccount) {
      try { await switchAccount(originalAccount) } catch {}
    }
    throw firstError
  }
}

/** Fetch detailed PR metadata: additions, deletions, comments count, reviews. */
export async function fetchPRDetails(repo: string, prNumber: number): Promise<PRDetails> {
  return tryMultiAccountFetch(async () => {
    const [prJson, reviewsJson] = await Promise.all([
      runGh([
        "api", `repos/${repo}/pulls/${prNumber}`,
        "--jq", "{additions, deletions, comments, head: .head.ref}",
      ]),
      runGh([
        "api", `repos/${repo}/pulls/${prNumber}/reviews`,
        "--jq", "[.[] | {user: .user.login, state: .state}]",
      ]),
    ])

    const pr = JSON.parse(prJson)
    const reviews: Review[] = JSON.parse(reviewsJson)

    return {
      additions: pr.additions,
      deletions: pr.deletions,
      commentCount: pr.comments,
      reviews,
      headRefName: pr.head,
    }
  })
}

/** Fetch full PR data for the preview panel: body, conversation comments, code comments. */
export async function fetchPRPanelData(repo: string, prNumber: number): Promise<PRPanelData> {
  return tryMultiAccountFetch(async () => {
    const [bodyJson, issueCommentsJson, codeCommentsJson, filesJson] = await Promise.all([
      runGh([
        "api", `repos/${repo}/pulls/${prNumber}`,
        "--jq", ".body",
      ]),
      runGh([
        "api", `repos/${repo}/issues/${prNumber}/comments`,
        "--jq", "[.[] | {author: .user.login, body: .body, createdAt: .created_at, authorAssociation: .author_association}]",
      ]),
      runGh([
        "api", `repos/${repo}/pulls/${prNumber}/comments`,
        "--jq", "[.[] | {id: .id, author: .user.login, body: .body, path: .path, line: (.line // .original_line // 0), diffHunk: .diff_hunk, createdAt: .created_at}]",
      ]),
      runGh([
        "api", `repos/${repo}/pulls/${prNumber}/files`,
        "--jq", "[.[] | {filename: .filename, status: .status, additions: .additions, deletions: .deletions, changes: .changes, patch: .patch, previousFilename: .previous_filename}]",
      ]),
    ])

    const body = bodyJson || ""
    const comments: Comment[] = JSON.parse(issueCommentsJson || "[]")
    const codeComments: CodeComment[] = JSON.parse(codeCommentsJson || "[]")
    const files: FileDiff[] = JSON.parse(filesJson || "[]")

    return { body, comments, codeComments, files }
  })
}

/** Valid review event types for the GitHub PR review API. */
export type ReviewEvent = "APPROVE" | "REQUEST_CHANGES" | "COMMENT"

/**
 * Submits a PR review (approve, request changes, or comment) via the GitHub API.
 *
 * Uses the pull request review endpoint to create a review with the specified
 * event type and optional body text. Handles multi-account auth automatically.
 *
 * @param repo - Full repository name in `owner/repo` format.
 * @param prNumber - The pull request number.
 * @param event - The review action: APPROVE, REQUEST_CHANGES, or COMMENT.
 * @param body - Optional review comment body (required for REQUEST_CHANGES).
 */
export async function submitPRReview(
  repo: string,
  prNumber: number,
  event: ReviewEvent,
  body?: string,
): Promise<void> {
  return tryMultiAccountFetch(async () => {
    const args = [
      "api", "--method", "POST",
      `repos/${repo}/pulls/${prNumber}/reviews`,
      "--field", `event=${event}`,
    ]
    if (body) {
      args.push("--field", `body=${body}`)
    }
    await runGh(args)
  })
}

/**
 * Replies to an existing review comment on a pull request.
 *
 * Uses the pull request review comment reply endpoint. The `commentId` is
 * the ID of the review comment being replied to (from the Code tab).
 *
 * @param repo - Full repository name in `owner/repo` format.
 * @param prNumber - The pull request number.
 * @param commentId - The ID of the review comment to reply to.
 * @param body - The reply text.
 */
export async function replyToReviewComment(
  repo: string,
  prNumber: number,
  commentId: number,
  body: string,
): Promise<void> {
  return tryMultiAccountFetch(async () => {
    await runGh([
      "api", "--method", "POST",
      `repos/${repo}/pulls/${prNumber}/comments/${commentId}/replies`,
      "--field", `body=${body}`,
    ])
  })
}

/**
 * Posts a general comment on a pull request (issue-level, not inline).
 *
 * @param repo - Full repository name in `owner/repo` format.
 * @param prNumber - The pull request number.
 * @param body - The comment text.
 */
export async function postPRComment(
  repo: string,
  prNumber: number,
  body: string,
): Promise<void> {
  return tryMultiAccountFetch(async () => {
    await runGh([
      "api", "--method", "POST",
      `repos/${repo}/issues/${prNumber}/comments`,
      "--field", `body=${body}`,
    ])
  })
}

/** A review thread with resolution status and associated comments. */
export interface ReviewThread {
  id: string
  isResolved: boolean
  comments: Array<{
    author: string
    body: string
    path: string
    line: number | null
    createdAt: string
  }>
}

/**
 * Fetch review threads with resolution status via GraphQL.
 *
 * Uses the pullRequest.reviewThreads connection to get thread-level
 * resolution state, which isn't available from the REST API.
 *
 * @param repo - Full repository name in owner/repo format.
 * @param prNumber - The pull request number.
 * @returns Array of review threads with their resolution status.
 */
export async function fetchReviewThreads(repo: string, prNumber: number): Promise<ReviewThread[]> {
  const [owner, name] = repo.split("/")
  const query = `query {
    repository(owner: "${owner}", name: "${name}") {
      pullRequest(number: ${prNumber}) {
        reviewThreads(first: 100) {
          nodes {
            id
            isResolved
            comments(first: 10) {
              nodes {
                author { login }
                body
                path
                line
                createdAt
              }
            }
          }
        }
      }
    }
  }`

  return tryMultiAccountFetch(async () => {
    const result = await runGh(["api", "graphql", "-f", `query=${query}`])
    const data = JSON.parse(result)
    const threads = data.data?.repository?.pullRequest?.reviewThreads?.nodes ?? []
    return threads.map((t: any) => ({
      id: t.id,
      isResolved: t.isResolved,
      comments: (t.comments?.nodes ?? []).map((c: any) => ({
        author: c.author?.login ?? "unknown",
        body: c.body,
        path: c.path,
        line: c.line,
        createdAt: c.createdAt,
      })),
    }))
  })
}

/**
 * Resolve a review thread via GraphQL mutation.
 *
 * @param threadId - The GraphQL node ID of the review thread to resolve.
 */
export async function resolveReviewThread(threadId: string): Promise<void> {
  const query = `mutation {
    resolveReviewThread(input: { threadId: "${threadId}" }) {
      thread { id isResolved }
    }
  }`

  return tryMultiAccountFetch(async () => {
    await runGh(["api", "graphql", "-f", `query=${query}`])
  })
}

/**
 * Fetch CI check status for a PR's head commit.
 *
 * @param repo - Full repository name in owner/repo format.
 * @param ref - Git ref (branch name or SHA) to check.
 * @returns "ready" if all pass, "pending" if running, "failing" if any failed.
 */
export async function fetchCIStatus(repo: string, ref: string): Promise<"ready" | "pending" | "failing"> {
  try {
    const result = await tryMultiAccountFetch(async () => {
      return runGh(["api", `repos/${repo}/commits/${ref}/check-runs`, "--jq", ".check_runs"])
    })
    const checks = JSON.parse(result) as Array<{ status: string; conclusion: string | null }>
    if (checks.length === 0) return "ready"
    if (checks.some(c => c.conclusion === "failure" || c.conclusion === "timed_out")) return "failing"
    if (checks.some(c => c.status !== "completed")) return "pending"
    return "ready"
  } catch {
    return "ready" // Can't determine, assume ok
  }
}

/**
 * Check if a PR has merge conflicts.
 *
 * @param repo - Full repository name in owner/repo format.
 * @param prNumber - The pull request number.
 * @returns true if the PR has merge conflicts.
 */
export async function fetchHasConflicts(repo: string, prNumber: number): Promise<boolean> {
  try {
    const result = await tryMultiAccountFetch(async () => {
      return runGh(["pr", "view", String(prNumber), "--repo", repo, "--json", "mergeable,mergeStateStatus"])
    })
    const data = JSON.parse(result) as { mergeable: string; mergeStateStatus: string }
    return data.mergeable === "CONFLICTING" || data.mergeStateStatus === "DIRTY"
  } catch {
    return false
  }
}
