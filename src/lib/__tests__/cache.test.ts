import { test, expect, describe } from "bun:test"
import { PRCache } from "../cache"

describe("PRCache", () => {
  test("get returns undefined for unknown keys", () => {
    const cache = new PRCache()
    expect(cache.getDetails("unknown")).toBeUndefined()
    expect(cache.getPanelData("unknown")).toBeUndefined()
  })

  test("stores and retrieves details", () => {
    const cache = new PRCache()
    const details = {
      additions: 10,
      deletions: 5,
      commentCount: 3,
      reviews: [],
      headRefName: "feat/test",
    }
    cache.setDetails("https://github.com/org/repo/pull/1", details)
    expect(cache.getDetails("https://github.com/org/repo/pull/1")).toEqual(details)
  })

  test("stores and retrieves panel data", () => {
    const cache = new PRCache()
    const panelData = {
      body: "# Hello",
      comments: [],
      codeComments: [],
    }
    cache.setPanelData("https://github.com/org/repo/pull/1", panelData)
    expect(cache.getPanelData("https://github.com/org/repo/pull/1")).toEqual(panelData)
  })

  test("has() returns correct boolean", () => {
    const cache = new PRCache()
    expect(cache.hasDetails("x")).toBe(false)
    cache.setDetails("x", { additions: 0, deletions: 0, commentCount: 0, reviews: [], headRefName: "" })
    expect(cache.hasDetails("x")).toBe(true)
  })
})
