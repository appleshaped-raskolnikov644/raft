import { test, expect, describe } from "bun:test"
import { formatRelativeAge, shortRepoName, truncate, formatReviewStatus, formatLinesChanged } from "../format"
import type { Review } from "../types"

describe("formatRelativeAge", () => {
  test("returns 'now' for just now", () => {
    expect(formatRelativeAge(new Date().toISOString())).toBe("now")
  })

  test("returns minutes for < 1 hour", () => {
    const thirtyMinsAgo = new Date(Date.now() - 30 * 60000).toISOString()
    expect(formatRelativeAge(thirtyMinsAgo)).toBe("30m")
  })

  test("returns hours for < 1 day", () => {
    const fiveHoursAgo = new Date(Date.now() - 5 * 3600000).toISOString()
    expect(formatRelativeAge(fiveHoursAgo)).toBe("5h")
  })

  test("returns days for < 1 week", () => {
    const threeDaysAgo = new Date(Date.now() - 3 * 86400000).toISOString()
    expect(formatRelativeAge(threeDaysAgo)).toBe("3d")
  })

  test("returns weeks for < 5 weeks", () => {
    const twoWeeksAgo = new Date(Date.now() - 14 * 86400000).toISOString()
    expect(formatRelativeAge(twoWeeksAgo)).toBe("2w")
  })

  test("returns months for > 5 weeks", () => {
    const threeMonthsAgo = new Date(Date.now() - 90 * 86400000).toISOString()
    expect(formatRelativeAge(threeMonthsAgo)).toBe("3mo")
  })
})

describe("shortRepoName", () => {
  test("strips owner prefix", () => {
    expect(shortRepoName("OctavianTocan/ai-nexus")).toBe("ai-nexus")
  })

  test("handles repo name without owner", () => {
    expect(shortRepoName("ai-nexus")).toBe("ai-nexus")
  })
})

describe("truncate", () => {
  test("leaves short strings unchanged", () => {
    expect(truncate("hello", 10)).toBe("hello")
  })

  test("truncates long strings with ellipsis", () => {
    const result = truncate("this is a long string", 10)
    expect(result.length).toBe(10)
    expect(result).toEndWith("\u2026")
  })

  test("handles exact length", () => {
    expect(truncate("exact", 5)).toBe("exact")
  })
})

describe("formatReviewStatus", () => {
  test("returns empty string for no reviews", () => {
    expect(formatReviewStatus([])).toBe("")
  })

  test("shows approved count", () => {
    const reviews: Review[] = [
      { user: "alice", state: "APPROVED" },
      { user: "bob", state: "APPROVED" },
    ]
    expect(formatReviewStatus(reviews)).toContain("2")
  })

  test("shows changes requested count", () => {
    const reviews: Review[] = [
      { user: "alice", state: "CHANGES_REQUESTED" },
    ]
    expect(formatReviewStatus(reviews)).toContain("1")
  })

  test("deduplicates by user (latest state wins)", () => {
    const reviews: Review[] = [
      { user: "alice", state: "CHANGES_REQUESTED" },
      { user: "alice", state: "APPROVED" },
    ]
    const result = formatReviewStatus(reviews)
    expect(result).toContain("1")
    expect(result).not.toContain("x")
  })

  test("ignores COMMENTED and PENDING states in count", () => {
    const reviews: Review[] = [
      { user: "alice", state: "COMMENTED" },
      { user: "bob", state: "PENDING" },
    ]
    expect(formatReviewStatus(reviews)).toBe("")
  })
})

describe("formatLinesChanged", () => {
  test("formats additions and deletions", () => {
    expect(formatLinesChanged(142, 38)).toBe("+142 -38")
  })

  test("handles zero additions", () => {
    expect(formatLinesChanged(0, 10)).toBe("+0 -10")
  })

  test("handles zero deletions", () => {
    expect(formatLinesChanged(50, 0)).toBe("+50 -0")
  })
})
