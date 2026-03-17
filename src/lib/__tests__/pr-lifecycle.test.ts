import { describe, expect, test } from "bun:test"
import { detectPRState } from "../pr-lifecycle"
import type { PRDetails } from "../types"

const basePr = {
  isDraft: false,
  createdAt: "2026-03-17T00:00:00Z",
}

function makeDetails(
  overrides: Partial<PRDetails> & {
    unresolvedThreadCount?: number
    ciStatus?: "ready" | "pending" | "failing" | null
    hasConflicts?: boolean
  } = {},
): PRDetails {
  return {
    additions: 12,
    deletions: 4,
    commentCount: 0,
    reviews: [{ user: "alice", state: "APPROVED" }],
    headRefName: "feature/test",
    ...overrides,
  } as PRDetails
}

describe("detectPRState", () => {
  test("does not mark approved PRs with unresolved threads as merge-ready", () => {
    const state = detectPRState(basePr, makeDetails({ unresolvedThreadCount: 2 }))

    expect(state.state).toBe("WAITING")
  })

  test("surfaces failing CI from fetched PR details", () => {
    const state = detectPRState(basePr, makeDetails({ ciStatus: "failing" }))

    expect(state.state).toBe("FIX_CI")
  })

  test("surfaces merge conflicts from fetched PR details", () => {
    const state = detectPRState(basePr, makeDetails({ hasConflicts: true }))

    expect(state.state).toBe("RESOLVE_CONFLICTS")
  })
})
