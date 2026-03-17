/**
 * Interactive AI Q&A for code review.
 *
 * Enables asking Claude questions about code in the context of a PR.
 * The AI receives: the selected code region, all PR diffs, and the
 * PR description. Supports follow-up questions with conversation
 * history maintained per session.
 *
 * What makes this different from just asking Claude in another terminal:
 * raft automatically provides the complete PR context. You don't need
 * to copy-paste diffs or explain what PR you're looking at.
 */

import { safeSpawn, buildCleanEnv } from "./process"
import type { FileDiff } from "./types"

/** A single message in the Q&A conversation. */
interface QAMessage {
  role: "user" | "assistant"
  content: string
}

/** Q&A session state for a single PR. */
export interface QASession {
  /** Conversation history for follow-up questions. */
  messages: QAMessage[]
  /** The PR's file diffs for context. */
  files: FileDiff[]
  /** The PR description. */
  prDescription: string
}

/**
 * Create a new Q&A session for a PR.
 *
 * @param files - All file diffs in the PR.
 * @param prDescription - The PR body/description.
 * @returns A new empty QA session.
 */
export function createQASession(files: FileDiff[], prDescription: string): QASession {
  return {
    messages: [],
    files,
    prDescription,
  }
}

/**
 * Ask a question about code in the context of a PR.
 *
 * Builds a prompt with the question, code context, and conversation
 * history, then sends to Claude (sonnet) for an answer.
 *
 * @param session - The current Q&A session (modified in place with the new exchange).
 * @param question - The user's question.
 * @param codeContext - Optional code snippet the question is about.
 * @param filePath - Optional file path the code comes from.
 * @returns The AI's response text.
 */
export async function askQuestion(
  session: QASession,
  question: string,
  codeContext?: string,
  filePath?: string,
): Promise<string> {
  // Build the context for first question or follow-up
  let prompt: string

  if (session.messages.length === 0) {
    // First question: provide full PR context
    const fileSummaries = session.files
      .filter(f => f.patch)
      .map(f => `### ${f.filename} (${f.status}, +${f.additions} -${f.deletions})\n${(f.patch || "").split("\n").slice(0, 80).join("\n")}`)
      .join("\n\n")

    prompt = `You are helping a code reviewer understand a pull request. Answer questions concisely and specifically.

PR DESCRIPTION:
${session.prDescription || "(none)"}

ALL FILE CHANGES:
${fileSummaries}

${codeContext ? `SELECTED CODE (${filePath || "unknown file"}):\n${codeContext}\n\n` : ""}QUESTION: ${question}

Answer concisely. Reference specific line numbers and file names. If you're unsure, say so.`
  } else {
    // Follow-up: include conversation history with PR context
    const history = session.messages
      .map(m => `${m.role === "user" ? "Q" : "A"}: ${m.content}`)
      .join("\n\n")

    // Include PR context so follow-ups stay grounded
    const fileList = session.files.map(f => `  ${f.filename} (+${f.additions} -${f.deletions})`).join("\n")

    prompt = `Continuing a code review conversation.

PR DESCRIPTION:
${session.prDescription || "(none)"}

FILES IN THIS PR:
${fileList}

Previous exchange:
${history}

${codeContext ? `NEW SELECTED CODE (${filePath || "unknown file"}):\n${codeContext}\n\n` : ""}NEW QUESTION: ${question}

Answer concisely. Reference specific code when relevant.`
  }

  try {
    const { stdout, exitCode } = await safeSpawn(
      ["claude", "-p", "--model", "sonnet", prompt],
      { env: buildCleanEnv() },
    )

    const answer = (exitCode === 0 && stdout.trim()) ? stdout.trim() : "Failed to get a response."

    // Update session history
    session.messages.push({ role: "user", content: question })
    session.messages.push({ role: "assistant", content: answer })

    return answer
  } catch {
    const fallback = "Error communicating with Claude."
    session.messages.push({ role: "user", content: question })
    session.messages.push({ role: "assistant", content: fallback })
    return fallback
  }
}

/** Clear conversation history to start fresh. */
export function clearSession(session: QASession): void {
  session.messages = []
}
