import { test, expect, afterEach } from "bun:test"
import { testRender } from "@opentui/react/test-utils"
import { PRTable } from "../pr-table"
import type { PullRequest } from "../../lib/types"

let testSetup: Awaited<ReturnType<typeof testRender>>

afterEach(() => {
  if (testSetup) {
    testSetup.renderer.destroy()
  }
})

const mockPRs: PullRequest[] = [
  {
    number: 42,
    title: "Add rate limiting",
    url: "https://github.com/acme/api/pull/42",
    body: "Implements token bucket",
    state: "open",
    isDraft: false,
    repo: "acme/api",
    headRefName: "feat/rate-limit",
    baseRefName: "main",
    createdAt: "2026-03-15T00:00:00Z",
  },
  {
    number: 7,
    title: "Fix login redirect",
    url: "https://github.com/acme/web/pull/7",
    body: "Fixes issue where users were",
    state: "open",
    isDraft: true,
    repo: "acme/web",
    headRefName: "fix/login",
    baseRefName: "main",
    createdAt: "2026-03-14T00:00:00Z",
  },
]

test("PRTable renders PR data", async () => {
  testSetup = await testRender(
    <PRTable prs={mockPRs} />,
    { width: 120, height: 20 }
  )
  await testSetup.renderOnce()
  const frame = testSetup.captureCharFrame()

  expect(frame).toContain("#42")
  expect(frame).toContain("acme/api")
  expect(frame).toContain("Add rate limiting")
  expect(frame).toContain("OPEN")
  expect(frame).toContain("#7")
  expect(frame).toContain("DRAFT")
})

test("PRTable shows empty message when no PRs", async () => {
  testSetup = await testRender(
    <PRTable prs={[]} />,
    { width: 120, height: 10 }
  )
  await testSetup.renderOnce()
  const frame = testSetup.captureCharFrame()

  expect(frame).toContain("No open PRs found")
})
