import type { ReviewThread } from "./github"
import type { CodeComment } from "./types"

function getThreadKey(comment: CodeComment): string {
  return comment.threadId ?? `comment:${comment.id}`
}

/** Merge GraphQL thread metadata into flat review comments fetched from REST. */
export function hydrateCodeComments(
  codeComments: CodeComment[],
  reviewThreads: ReviewThread[],
): CodeComment[] {
  const threadByCommentId = new Map<number, { threadId: string; isResolved: boolean }>()

  for (const thread of reviewThreads) {
    for (const comment of thread.comments) {
      threadByCommentId.set(comment.id, {
        threadId: thread.id,
        isResolved: thread.isResolved,
      })
    }
  }

  return codeComments.map((comment) => {
    const thread = threadByCommentId.get(comment.id)
    if (!thread) return comment
    return {
      ...comment,
      threadId: thread.threadId,
      isResolved: thread.isResolved,
    }
  })
}

/** Count unique total and unresolved review threads represented by flat comments. */
export function getCodeCommentThreadStats(codeComments: CodeComment[]): {
  totalThreads: number
  unresolvedThreads: number
} {
  const threadStates = new Map<string, boolean>()

  for (const comment of codeComments) {
    const key = getThreadKey(comment)
    const isResolved = comment.isResolved === true
    const previous = threadStates.get(key)
    threadStates.set(key, previous === undefined ? isResolved : previous && isResolved)
  }

  let unresolvedThreads = 0
  for (const isResolved of threadStates.values()) {
    if (!isResolved) unresolvedThreads++
  }

  return {
    totalThreads: threadStates.size,
    unresolvedThreads,
  }
}

/** Find the first comment belonging to the next unresolved thread after the current index. */
export function findNextUnresolvedCommentIndex(
  codeComments: CodeComment[],
  currentIndex: number,
): number {
  if (codeComments.length === 0) return -1

  const currentComment = codeComments[currentIndex]
  const currentThreadKey = currentComment ? getThreadKey(currentComment) : null

  for (let offset = 1; offset <= codeComments.length; offset++) {
    const index = (currentIndex + offset + codeComments.length) % codeComments.length
    const comment = codeComments[index]
    if (comment.isResolved === true) continue
    if (getThreadKey(comment) !== currentThreadKey) return index
  }

  if (currentComment && currentComment.isResolved !== true) {
    return currentIndex
  }

  for (let index = 0; index < codeComments.length; index++) {
    if (codeComments[index].isResolved !== true) return index
  }

  return -1
}

/** Mark every comment in a thread as resolved after a successful mutation. */
export function markThreadResolved(
  codeComments: CodeComment[],
  threadId: string,
): CodeComment[] {
  return codeComments.map((comment) => {
    if (comment.threadId !== threadId) return comment
    return {
      ...comment,
      isResolved: true,
    }
  })
}
