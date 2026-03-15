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
    headRefName: "",
    baseRefName: "",
    createdAt: new Date(Date.now() - 2 * 86400000).toISOString(),
  },
  {
    number: 7,
    title: "Fix login redirect",
    url: "https://github.com/acme/web/pull/7",
    body: "Fixes issue where users were",
    state: "open",
    isDraft: true,
    repo: "acme/web",
    headRefName: "",
    baseRefName: "",
    createdAt: new Date(Date.now() - 14 * 86400000).toISOString(),
  },
]

test("PRTable renders PR numbers and short repo names", async () => {
  testSetup = await testRender(
    <PRTable prs={mockPRs} selectedIndex={0} />,
    { width: 100, height: 10 }
  )
  await testSetup.renderOnce()
  const frame = testSetup.captureCharFrame()

  expect(frame).toContain("#42")
  expect(frame).toContain("#7")
  expect(frame).toContain("api")
  expect(frame).toContain("web")
  expect(frame).toContain("Add rate limiting")
  expect(frame).toContain("Fix login redirect")
})

test("PRTable shows selection cursor on selected row", async () => {
  testSetup = await testRender(
    <PRTable prs={mockPRs} selectedIndex={0} />,
    { width: 100, height: 10 }
  )
  await testSetup.renderOnce()
  const frame = testSetup.captureCharFrame()
  expect(frame).toContain("\u25B8")
})

test("PRTable shows status dots", async () => {
  testSetup = await testRender(
    <PRTable prs={mockPRs} selectedIndex={0} />,
    { width: 100, height: 10 }
  )
  await testSetup.renderOnce()
  const frame = testSetup.captureCharFrame()
  expect(frame).toContain("\u25CF")
  expect(frame).toContain("\u25CB")
})

test("PRTable shows relative age", async () => {
  testSetup = await testRender(
    <PRTable prs={mockPRs} selectedIndex={0} />,
    { width: 100, height: 10 }
  )
  await testSetup.renderOnce()
  const frame = testSetup.captureCharFrame()
  expect(frame).toContain("2d")
  expect(frame).toContain("2w")
})

test("PRTable shows empty message when no PRs", async () => {
  testSetup = await testRender(
    <PRTable prs={[]} selectedIndex={0} />,
    { width: 100, height: 10 }
  )
  await testSetup.renderOnce()
  const frame = testSetup.captureCharFrame()
  expect(frame).toContain("No PRs match")
})

test("PRTable selection changes highlighted row", async () => {
  // First PR selected
  testSetup = await testRender(
    <PRTable prs={mockPRs} selectedIndex={0} />,
    { width: 100, height: 10 }
  )
  await testSetup.renderOnce()
  const frame0 = testSetup.captureCharFrame()
  testSetup.renderer.destroy()

  // Second PR selected
  testSetup = await testRender(
    <PRTable prs={mockPRs} selectedIndex={1} />,
    { width: 100, height: 10 }
  )
  await testSetup.renderOnce()
  const frame1 = testSetup.captureCharFrame()

  // Both frames should have the cursor but at different positions
  expect(frame0).toContain("\u25B8")
  expect(frame1).toContain("\u25B8")
  // The frames should be different (different row highlighted)
  expect(frame0).not.toBe(frame1)
})
