import { test, expect, describe } from "bun:test"
import { parseSearchResults, stripStackPrefix } from "../github"

describe("parseSearchResults", () => {
  test("parses gh search prs JSON output into PullRequest array", () => {
    const raw = JSON.stringify([
      {
        number: 42,
        title: "Add feature",
        url: "https://github.com/acme/api/pull/42",
        body: "First line of body\nSecond line",
        state: "open",
        isDraft: false,
        repository: { nameWithOwner: "acme/api" },
        headRefName: "feat/add-feature",
        baseRefName: "main",
        createdAt: "2026-03-15T00:00:00Z",
      },
    ])
    const result = parseSearchResults(raw)
    expect(result).toHaveLength(1)
    expect(result[0].repo).toBe("acme/api")
    expect(result[0].number).toBe(42)
    expect(result[0].body).toBe("First line of body")
  })

  test("truncates body to first line, max 80 chars", () => {
    const longLine = "A".repeat(100)
    const raw = JSON.stringify([
      {
        number: 1,
        title: "T",
        url: "u",
        body: longLine + "\nSecond",
        state: "open",
        isDraft: false,
        repository: { nameWithOwner: "a/b" },
        headRefName: "h",
        baseRefName: "b",
        createdAt: "2026-01-01T00:00:00Z",
      },
    ])
    const result = parseSearchResults(raw)
    expect(result[0].body.length).toBeLessThanOrEqual(80)
  })

  test("handles empty body", () => {
    const raw = JSON.stringify([
      {
        number: 1,
        title: "T",
        url: "u",
        body: "",
        state: "open",
        isDraft: false,
        repository: { nameWithOwner: "a/b" },
        headRefName: "h",
        baseRefName: "b",
        createdAt: "2026-01-01T00:00:00Z",
      },
    ])
    const result = parseSearchResults(raw)
    expect(result[0].body).toBe("")
  })
})

describe("stripStackPrefix", () => {
  test("removes [1/3] prefix", () => {
    expect(stripStackPrefix("[1/3] Add feature")).toBe("Add feature")
  })

  test("removes [12/25] prefix", () => {
    expect(stripStackPrefix("[12/25] Big change")).toBe("Big change")
  })

  test("leaves title without prefix unchanged", () => {
    expect(stripStackPrefix("Add feature")).toBe("Add feature")
  })

  test("does not strip non-stack brackets", () => {
    expect(stripStackPrefix("[WIP] Add feature")).toBe("[WIP] Add feature")
  })
})
