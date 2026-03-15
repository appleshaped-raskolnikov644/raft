import { test, expect, describe } from "bun:test"
import { detectStacks, buildStackComment } from "../stack"
import type { PullRequest } from "../types"

function makePR(overrides: Partial<PullRequest>): PullRequest {
  return {
    number: 1,
    title: "Test PR",
    url: "https://github.com/test/repo/pull/1",
    body: "",
    state: "open",
    isDraft: false,
    repo: "test/repo",
    headRefName: "feature",
    baseRefName: "main",
    createdAt: "2026-01-01T00:00:00Z",
    ...overrides,
  }
}

describe("detectStacks", () => {
  test("detects a simple 3-PR stack", () => {
    const prs = [
      makePR({ number: 1, title: "Add model", headRefName: "feat/model", baseRefName: "main" }),
      makePR({ number: 2, title: "Add API", headRefName: "feat/api", baseRefName: "feat/model" }),
      makePR({ number: 3, title: "Add UI", headRefName: "feat/ui", baseRefName: "feat/api" }),
    ]
    const stacks = detectStacks(prs)
    expect(stacks).toHaveLength(1)
    expect(stacks[0].prs).toHaveLength(3)
    expect(stacks[0].prs[0].number).toBe(1)
    expect(stacks[0].prs[0].position).toBe(1)
    expect(stacks[0].prs[1].number).toBe(2)
    expect(stacks[0].prs[1].position).toBe(2)
    expect(stacks[0].prs[2].number).toBe(3)
    expect(stacks[0].prs[2].position).toBe(3)
    expect(stacks[0].prs[0].stackSize).toBe(3)
  })

  test("returns empty for PRs all targeting main", () => {
    const prs = [
      makePR({ number: 1, headRefName: "feat/a", baseRefName: "main" }),
      makePR({ number: 2, headRefName: "feat/b", baseRefName: "main" }),
    ]
    const stacks = detectStacks(prs)
    expect(stacks).toHaveLength(0)
  })

  test("detects two separate stacks", () => {
    const prs = [
      makePR({ number: 1, headRefName: "a/1", baseRefName: "main" }),
      makePR({ number: 2, headRefName: "a/2", baseRefName: "a/1" }),
      makePR({ number: 3, headRefName: "b/1", baseRefName: "main" }),
      makePR({ number: 4, headRefName: "b/2", baseRefName: "b/1" }),
    ]
    const stacks = detectStacks(prs)
    expect(stacks).toHaveLength(2)
    expect(stacks[0].prs).toHaveLength(2)
    expect(stacks[1].prs).toHaveLength(2)
  })

  test("strips existing [X/Y] prefix from titles", () => {
    const prs = [
      makePR({ number: 1, title: "[1/2] Add model", headRefName: "feat/model", baseRefName: "main" }),
      makePR({ number: 2, title: "[2/2] Add API", headRefName: "feat/api", baseRefName: "feat/model" }),
    ]
    const stacks = detectStacks(prs)
    expect(stacks[0].prs[0].originalTitle).toBe("Add model")
    expect(stacks[0].prs[1].originalTitle).toBe("Add API")
  })

  test("handles single PR targeting another branch (2-PR stack)", () => {
    const prs = [
      makePR({ number: 10, headRefName: "base-feat", baseRefName: "main" }),
      makePR({ number: 11, headRefName: "child-feat", baseRefName: "base-feat" }),
    ]
    const stacks = detectStacks(prs)
    expect(stacks).toHaveLength(1)
    expect(stacks[0].prs).toHaveLength(2)
  })
})

describe("buildStackComment", () => {
  test("generates markdown table with current PR highlighted", () => {
    const prs = [
      makePR({ number: 1, title: "Add model", url: "https://github.com/test/repo/pull/1" }),
      makePR({ number: 2, title: "Add API", url: "https://github.com/test/repo/pull/2" }),
      makePR({ number: 3, title: "Add UI", url: "https://github.com/test/repo/pull/3" }),
    ]
    const stackedPRs = prs.map((pr, i) => ({
      ...pr,
      position: i + 1,
      stackSize: 3,
      originalTitle: pr.title,
    }))

    const comment = buildStackComment(stackedPRs, 2)
    expect(comment).toContain("## Stack")
    expect(comment).toContain("[#1]")
    expect(comment).toContain("[#2]")
    expect(comment).toContain("[#3]")
    expect(comment).toContain("**Add API**")
    expect(comment).toContain(">>")
  })
})
