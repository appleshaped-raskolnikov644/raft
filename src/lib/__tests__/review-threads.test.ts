import { describe, expect, test } from "bun:test"
import type { ReviewThread } from "../github"
import type { CodeComment } from "../types"
import {
  findNextUnresolvedCommentIndex,
  getCodeCommentThreadStats,
  hydrateCodeComments,
  markThreadResolved,
} from "../review-threads"

const codeComments: CodeComment[] = [
  {
    id: 101,
    author: "alice",
    body: "First comment in thread one",
    path: "src/a.ts",
    line: 10,
    diffHunk: "@@ -8,3 +8,4 @@",
    createdAt: "2026-03-17T10:00:00Z",
  },
  {
    id: 102,
    author: "bob",
    body: "Reply in thread one",
    path: "src/a.ts",
    line: 10,
    diffHunk: "@@ -8,3 +8,4 @@",
    createdAt: "2026-03-17T10:05:00Z",
  },
  {
    id: 103,
    author: "carol",
    body: "Resolved thread",
    path: "src/b.ts",
    line: 20,
    diffHunk: "@@ -18,3 +18,4 @@",
    createdAt: "2026-03-17T10:10:00Z",
  },
  {
    id: 104,
    author: "dave",
    body: "Second unresolved thread",
    path: "src/c.ts",
    line: 30,
    diffHunk: "@@ -28,3 +28,4 @@",
    createdAt: "2026-03-17T10:15:00Z",
  },
]

const reviewThreads: ReviewThread[] = [
  {
    id: "THREAD_1",
    isResolved: false,
    comments: [
      {
        id: 101,
        author: "alice",
        body: "First comment in thread one",
        path: "src/a.ts",
        line: 10,
        createdAt: "2026-03-17T10:00:00Z",
      },
      {
        id: 102,
        author: "bob",
        body: "Reply in thread one",
        path: "src/a.ts",
        line: 10,
        createdAt: "2026-03-17T10:05:00Z",
      },
    ],
  },
  {
    id: "THREAD_2",
    isResolved: true,
    comments: [
      {
        id: 103,
        author: "carol",
        body: "Resolved thread",
        path: "src/b.ts",
        line: 20,
        createdAt: "2026-03-17T10:10:00Z",
      },
    ],
  },
  {
    id: "THREAD_3",
    isResolved: false,
    comments: [
      {
        id: 104,
        author: "dave",
        body: "Second unresolved thread",
        path: "src/c.ts",
        line: 30,
        createdAt: "2026-03-17T10:15:00Z",
      },
    ],
  },
]

describe("thread-aware code comments", () => {
  test("hydrates review comments with thread metadata", () => {
    const hydrated = hydrateCodeComments(codeComments, reviewThreads)

    expect(hydrated[0].threadId).toBe("THREAD_1")
    expect(hydrated[0].isResolved).toBe(false)
    expect(hydrated[2].threadId).toBe("THREAD_2")
    expect(hydrated[2].isResolved).toBe(true)
  })

  test("counts unique total and unresolved threads", () => {
    const hydrated = hydrateCodeComments(codeComments, reviewThreads)

    expect(getCodeCommentThreadStats(hydrated)).toEqual({
      totalThreads: 3,
      unresolvedThreads: 2,
    })
  })

  test("finds the next unresolved thread instead of another comment in the same thread", () => {
    const hydrated = hydrateCodeComments(codeComments, reviewThreads)

    expect(findNextUnresolvedCommentIndex(hydrated, 0)).toBe(3)
    expect(findNextUnresolvedCommentIndex(hydrated, 3)).toBe(0)
  })

  test("marks every comment in a resolved thread as resolved", () => {
    const hydrated = hydrateCodeComments(codeComments, reviewThreads)
    const resolved = markThreadResolved(hydrated, "THREAD_1")

    expect(resolved[0].isResolved).toBe(true)
    expect(resolved[1].isResolved).toBe(true)
    expect(getCodeCommentThreadStats(resolved)).toEqual({
      totalThreads: 3,
      unresolvedThreads: 1,
    })
  })
})
