import { test, expect, describe, setDefaultTimeout } from "bun:test"

// Multi-account fetching takes longer
setDefaultTimeout(30_000)
import { fetchOpenPRs, fetchRepoPRs } from "../lib/github"
import { detectStacks, buildStackComment, formatStackedTitle } from "../lib/stack"
import { stripStackPrefix } from "../lib/github"
import type { PullRequest, StackedPR } from "../lib/types"

// These tests hit the real gh CLI. They require:
// - gh CLI installed and authenticated
// - The authenticated user (OctavianTocan) has open PRs

describe("fetchOpenPRs (real gh CLI)", () => {
  test("returns an array of PullRequest objects", async () => {
    const prs = await fetchOpenPRs()
    expect(Array.isArray(prs)).toBe(true)
    expect(prs.length).toBeGreaterThan(0)
  })

  test("each PR has required fields", async () => {
    const prs = await fetchOpenPRs()
    const pr = prs[0]
    expect(pr.number).toBeGreaterThan(0)
    expect(pr.title).toBeTruthy()
    expect(pr.url).toContain("github.com")
    expect(pr.repo).toContain("/")
    expect(typeof pr.isDraft).toBe("boolean")
    expect(typeof pr.state).toBe("string")
    expect(typeof pr.createdAt).toBe("string")
  })

  test("body is truncated to max 80 chars single line", async () => {
    const prs = await fetchOpenPRs()
    for (const pr of prs) {
      expect(pr.body.length).toBeLessThanOrEqual(80)
      expect(pr.body).not.toContain("\n")
    }
  })

  test("filters by repo substring", async () => {
    const allPRs = await fetchOpenPRs()
    // Pick a repo that exists in our results
    const sampleRepo = allPRs[0].repo
    const repoShort = sampleRepo.split("/")[1].slice(0, 4).toLowerCase()

    const filtered = allPRs.filter((pr) =>
      pr.repo.toLowerCase().includes(repoShort)
    )
    expect(filtered.length).toBeGreaterThan(0)
    expect(filtered.length).toBeLessThanOrEqual(allPRs.length)
    for (const pr of filtered) {
      expect(pr.repo.toLowerCase()).toContain(repoShort)
    }
  })

  test("sorting by repo then number works correctly", async () => {
    const prs = await fetchOpenPRs()
    const sorted = [...prs].sort((a, b) => {
      const repoCompare = a.repo.localeCompare(b.repo)
      if (repoCompare !== 0) return repoCompare
      return a.number - b.number
    })

    for (let i = 1; i < sorted.length; i++) {
      const prev = sorted[i - 1]
      const curr = sorted[i]
      if (prev.repo === curr.repo) {
        expect(prev.number).toBeLessThanOrEqual(curr.number)
      } else {
        expect(prev.repo.localeCompare(curr.repo)).toBeLessThan(0)
      }
    }
  })
})

describe("fetchRepoPRs (real gh CLI)", () => {
  test("returns PRs for a known repo with branch info", async () => {
    // OctavianTocan/to-do-app has many open PRs
    const prs = await fetchRepoPRs("OctavianTocan/to-do-app")
    expect(Array.isArray(prs)).toBe(true)
    expect(prs.length).toBeGreaterThan(0)

    const pr = prs[0]
    expect(pr.repo).toBe("OctavianTocan/to-do-app")
    expect(pr.headRefName).toBeTruthy()
    expect(pr.baseRefName).toBeTruthy()
    expect(pr.number).toBeGreaterThan(0)
    expect(pr.url).toContain("github.com/OctavianTocan/to-do-app/pull/")
  })

  test("body is truncated to max 80 chars single line", async () => {
    const prs = await fetchRepoPRs("OctavianTocan/to-do-app")
    for (const pr of prs) {
      expect(pr.body.length).toBeLessThanOrEqual(80)
      expect(pr.body).not.toContain("\n")
    }
  })

  test("all PRs have the correct repo field set", async () => {
    const repo = "OctavianTocan/to-do-app"
    const prs = await fetchRepoPRs(repo)
    for (const pr of prs) {
      expect(pr.repo).toBe(repo)
    }
  })
})

describe("detectStacks with real PR data", () => {
  test("processes real PRs without errors", async () => {
    const prs = await fetchRepoPRs("OctavianTocan/to-do-app")
    const stacks = detectStacks(prs)
    expect(Array.isArray(stacks)).toBe(true)

    // Each stack should have valid structure
    for (const stack of stacks) {
      expect(stack.repo).toBeTruthy()
      expect(stack.prs.length).toBeGreaterThanOrEqual(2)
      for (let i = 0; i < stack.prs.length; i++) {
        expect(stack.prs[i].position).toBe(i + 1)
        expect(stack.prs[i].stackSize).toBe(stack.prs.length)
        expect(stack.prs[i].originalTitle).toBeTruthy()
      }
    }
  })
})

describe("buildStackComment", () => {
  test("generates valid markdown for real-ish data", () => {
    const prs: StackedPR[] = [
      {
        number: 1, title: "[1/3] Add model", url: "https://github.com/test/repo/pull/1",
        body: "", state: "open", isDraft: false, repo: "test/repo",
        headRefName: "feat/model", baseRefName: "main", createdAt: "2026-01-01T00:00:00Z",
        position: 1, stackSize: 3, originalTitle: "Add model",
      },
      {
        number: 2, title: "[2/3] Add API", url: "https://github.com/test/repo/pull/2",
        body: "", state: "open", isDraft: false, repo: "test/repo",
        headRefName: "feat/api", baseRefName: "feat/model", createdAt: "2026-01-01T00:00:00Z",
        position: 2, stackSize: 3, originalTitle: "Add API",
      },
      {
        number: 3, title: "[3/3] Add UI", url: "https://github.com/test/repo/pull/3",
        body: "", state: "open", isDraft: true, repo: "test/repo",
        headRefName: "feat/ui", baseRefName: "feat/api", createdAt: "2026-01-01T00:00:00Z",
        position: 3, stackSize: 3, originalTitle: "Add UI",
      },
    ]

    // Test for each PR being "current"
    for (const pr of prs) {
      const comment = buildStackComment(prs, pr.number)
      expect(comment).toContain("## Stack")
      expect(comment).toContain("| | PR | Title |")
      expect(comment).toContain("|---|---|---|")

      // Current PR should be bold and have marker
      expect(comment).toContain(`**${pr.originalTitle}**`)
      expect(comment).toContain(">>")

      // All PRs should appear
      for (const other of prs) {
        expect(comment).toContain(`[#${other.number}]`)
        expect(comment).toContain(other.url)
      }

      // Non-current PRs should NOT be bold
      for (const other of prs) {
        if (other.number !== pr.number) {
          expect(comment).not.toContain(`**${other.originalTitle}**`)
        }
      }
    }
  })
})

describe("formatStackedTitle", () => {
  test("formats title with position prefix", () => {
    expect(formatStackedTitle(1, 3, "Add model")).toBe("[1/3] Add model")
    expect(formatStackedTitle(2, 3, "Add API")).toBe("[2/3] Add API")
    expect(formatStackedTitle(3, 3, "Add UI")).toBe("[3/3] Add UI")
  })

  test("is idempotent with stripStackPrefix", () => {
    const original = "Add model"
    const titled = formatStackedTitle(1, 3, original)
    const stripped = stripStackPrefix(titled)
    const retitled = formatStackedTitle(1, 3, stripped)
    expect(retitled).toBe(titled)
  })
})

describe("end-to-end: fetch -> detect -> format", () => {
  test("full pipeline works for a real repo", async () => {
    const prs = await fetchRepoPRs("OctavianTocan/to-do-app")
    expect(prs.length).toBeGreaterThan(0)

    const stacks = detectStacks(prs)
    // Even if no stacks detected, the pipeline shouldn't error

    for (const stack of stacks) {
      for (const pr of stack.prs) {
        // Format title
        const newTitle = formatStackedTitle(pr.position, pr.stackSize, pr.originalTitle)
        expect(newTitle).toMatch(/^\[\d+\/\d+\] .+/)

        // Generate comment
        const comment = buildStackComment(stack.prs, pr.number)
        expect(comment).toContain("## Stack")
        expect(comment).toContain(`[#${pr.number}]`)

        // Verify idempotency: stripping and reformatting should be stable
        const restripped = stripStackPrefix(newTitle)
        expect(restripped).toBe(pr.originalTitle)
      }
    }
  })
})
