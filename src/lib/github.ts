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
  headRefName: string
  baseRefName: string
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
      headRefName: pr.headRefName,
      baseRefName: pr.baseRefName,
      createdAt: pr.createdAt,
    }
  })
}

export function stripStackPrefix(title: string): string {
  return title.replace(/^\[\d+\/\d+\]\s*/, "")
}

async function runGh(args: string[]): Promise<string> {
  const proc = Bun.spawn(["gh", ...args], {
    stdout: "pipe",
    stderr: "pipe",
  })
  const stdout = await new Response(proc.stdout).text()
  const stderr = await new Response(proc.stderr).text()
  const exitCode = await proc.exited
  if (exitCode !== 0) {
    throw new Error(`gh ${args.join(" ")} failed: ${stderr}`)
  }
  return stdout.trim()
}

export async function fetchOpenPRs(author?: string): Promise<PullRequest[]> {
  const authorFlag = author ? `--author=${author}` : "--author=@me"
  const json = await runGh([
    "search", "prs",
    authorFlag,
    "--state=open",
    "--limit=100",
    "--json", "number,title,url,body,state,repository,isDraft,headRefName,baseRefName,createdAt",
  ])
  if (!json) return []
  return parseSearchResults(json)
}

export async function fetchRepoPRs(repo: string): Promise<PullRequest[]> {
  const json = await runGh([
    "pr", "list",
    "--repo", repo,
    "--state=open",
    "--limit=100",
    "--json", "number,title,url,body,state,isDraft,headRefName,baseRefName,createdAt",
  ])
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
