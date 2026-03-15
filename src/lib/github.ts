import type { PullRequest } from "./types"
import { STACK_COMMENT_MARKER } from "./types"

interface RawSearchResult {
  number: number
  title: string
  url: string
  body: string
  state: string
  isDraft: boolean
  repository: { nameWithOwner: string }
  createdAt: string
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
    }
  })
}

export function stripStackPrefix(title: string): string {
  return title.replace(/^\[\d+\/\d+\]\s*/, "")
}

async function runGh(args: string[]): Promise<string> {
  // Strip GITHUB_TOKEN and GH_TOKEN from env so gh CLI uses its own keyring auth.
  // Bun auto-loads .env files, which may contain project-specific tokens that
  // override gh's auth and cause 401 errors.
  const cleanEnv = { ...process.env }
  delete cleanEnv.GITHUB_TOKEN
  delete cleanEnv.GH_TOKEN
  const proc = Bun.spawn(["gh", ...args], {
    stdout: "pipe",
    stderr: "pipe",
    env: cleanEnv,
  })
  const stdout = await new Response(proc.stdout).text()
  const stderr = await new Response(proc.stderr).text()
  const exitCode = await proc.exited
  if (exitCode !== 0) {
    throw new Error(`gh ${args.join(" ")} failed: ${stderr}`)
  }
  return stdout.trim()
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
export async function fetchAllAccountPRs(): Promise<PullRequest[]> {
  const accounts = await getGhAccounts()
  const originalAccount = await getActiveAccount()
  const allPRs: PullRequest[] = []
  const seen = new Set<string>()

  for (const account of accounts) {
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
        for (const pr of parseSearchResults(json)) {
          if (!seen.has(pr.url)) {
            seen.add(pr.url)
            allPRs.push(pr)
          }
        }
      }
    } catch { /* skip account if query fails */ }
  }

  // Restore original account
  if (accounts.length > 1 && originalAccount) {
    try { await switchAccount(originalAccount) } catch { /* ignore */ }
  }

  return allPRs
}

export async function fetchOpenPRs(author?: string): Promise<PullRequest[]> {
  if (author) {
    const json = await runGh([
      "search", "prs",
      `--author=${author}`,
      "--state=open",
      "--limit=100",
      "--json", "number,title,url,body,state,repository,isDraft,createdAt",
    ])
    if (!json) return []
    return parseSearchResults(json)
  }
  // No author specified: fetch from all accounts
  return fetchAllAccountPRs()
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
