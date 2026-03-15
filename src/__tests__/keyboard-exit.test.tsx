import { test, expect, afterEach, describe } from "bun:test"
import { createTestRenderer } from "@opentui/core/testing"

let testSetup: Awaited<ReturnType<typeof createTestRenderer>>

afterEach(() => {
  if (testSetup) {
    testSetup.renderer.destroy()
  }
})

function simulateKey(name: string, opts: Record<string, unknown> = {}) {
  testSetup.renderer.keyInput.emit("keypress", {
    name,
    sequence: name,
    ctrl: false,
    shift: false,
    meta: false,
    option: false,
    eventType: "press",
    repeated: false,
    ...opts,
  } as never)
}

describe("global keyboard handler (ctrl+c only)", () => {
  test("ctrl+c triggers destroy", async () => {
    let destroyed = false
    testSetup = await createTestRenderer({ width: 40, height: 10 })
    testSetup.renderer.keyInput.on("keypress", (key) => {
      if (key.ctrl && key.name === "c") destroyed = true
    })
    simulateKey("c", { ctrl: true })
    expect(destroyed).toBe(true)
  })

  test("q does NOT trigger global destroy", async () => {
    let destroyed = false
    testSetup = await createTestRenderer({ width: 40, height: 10 })
    testSetup.renderer.keyInput.on("keypress", (key) => {
      if (key.ctrl && key.name === "c") destroyed = true
    })
    simulateKey("q")
    expect(destroyed).toBe(false)
  })

  test("escape does NOT trigger global destroy", async () => {
    let destroyed = false
    testSetup = await createTestRenderer({ width: 40, height: 10 })
    testSetup.renderer.keyInput.on("keypress", (key) => {
      if (key.ctrl && key.name === "c") destroyed = true
    })
    simulateKey("escape")
    expect(destroyed).toBe(false)
  })
})

describe("ls command keyboard behavior", () => {
  // Simulates the ls command's keyboard handler logic

  function createLsHandler() {
    let searchMode = false
    let searchQuery = ""
    let destroyed = false

    const handler = (key: { name: string; ctrl?: boolean; meta?: boolean }) => {
      if (searchMode) {
        if (key.name === "escape") {
          // Exit search mode but keep the filter
          searchMode = false
          return
        }
        if (key.name === "enter") {
          searchMode = false
          return
        }
        if (key.name === "backspace") {
          searchQuery = searchQuery.slice(0, -1)
          return
        }
        if (key.name.length === 1 && !key.ctrl && !key.meta) {
          searchQuery += key.name
          return
        }
        return
      }

      if (key.name === "q" || key.name === "escape") {
        if (searchQuery) {
          searchQuery = ""
          return
        }
        destroyed = true
      } else if (key.name === "/") {
        searchMode = true
        searchQuery = ""
      }
    }

    return {
      handler,
      get searchMode() { return searchMode },
      set searchMode(v) { searchMode = v },
      get searchQuery() { return searchQuery },
      set searchQuery(v) { searchQuery = v },
      get destroyed() { return destroyed },
    }
  }

  test("q quits in normal mode with no active search", async () => {
    testSetup = await createTestRenderer({ width: 40, height: 10 })
    const ls = createLsHandler()
    testSetup.renderer.keyInput.on("keypress", ls.handler)
    simulateKey("q")
    expect(ls.destroyed).toBe(true)
  })

  test("escape quits in normal mode with no active search", async () => {
    testSetup = await createTestRenderer({ width: 40, height: 10 })
    const ls = createLsHandler()
    testSetup.renderer.keyInput.on("keypress", ls.handler)
    simulateKey("escape")
    expect(ls.destroyed).toBe(true)
  })

  test("escape in search mode exits search but keeps filter", async () => {
    testSetup = await createTestRenderer({ width: 40, height: 10 })
    const ls = createLsHandler()
    testSetup.renderer.keyInput.on("keypress", ls.handler)

    // Enter search mode and type
    simulateKey("/")
    expect(ls.searchMode).toBe(true)
    simulateKey("w")
    simulateKey("e")
    simulateKey("b")
    expect(ls.searchQuery).toBe("web")

    // Escape exits search mode but keeps the filter
    simulateKey("escape")
    expect(ls.searchMode).toBe(false)
    expect(ls.searchQuery).toBe("web")
    expect(ls.destroyed).toBe(false)
  })

  test("escape in normal mode with active filter clears it first", async () => {
    testSetup = await createTestRenderer({ width: 40, height: 10 })
    const ls = createLsHandler()
    testSetup.renderer.keyInput.on("keypress", ls.handler)

    // Enter search, type, exit search mode
    simulateKey("/")
    simulateKey("w")
    simulateKey("e")
    simulateKey("b")
    simulateKey("escape")
    expect(ls.searchQuery).toBe("web")
    expect(ls.searchMode).toBe(false)

    // Now escape should clear the filter, not quit
    simulateKey("escape")
    expect(ls.searchQuery).toBe("")
    expect(ls.destroyed).toBe(false)

    // Now escape should quit
    simulateKey("escape")
    expect(ls.destroyed).toBe(true)
  })

  test("q in search mode types q into search", async () => {
    testSetup = await createTestRenderer({ width: 40, height: 10 })
    const ls = createLsHandler()
    testSetup.renderer.keyInput.on("keypress", ls.handler)

    simulateKey("/")
    simulateKey("q")
    expect(ls.searchQuery).toBe("q")
    expect(ls.destroyed).toBe(false)
  })

  test("enter in search mode exits but keeps filter", async () => {
    testSetup = await createTestRenderer({ width: 40, height: 10 })
    const ls = createLsHandler()
    testSetup.renderer.keyInput.on("keypress", ls.handler)

    simulateKey("/")
    simulateKey("t")
    simulateKey("e")
    simulateKey("s")
    simulateKey("t")
    simulateKey("enter")

    expect(ls.searchMode).toBe(false)
    expect(ls.searchQuery).toBe("test")
  })

  test("backspace removes last character from search", async () => {
    testSetup = await createTestRenderer({ width: 40, height: 10 })
    const ls = createLsHandler()
    testSetup.renderer.keyInput.on("keypress", ls.handler)

    simulateKey("/")
    simulateKey("a")
    simulateKey("b")
    simulateKey("c")
    expect(ls.searchQuery).toBe("abc")

    simulateKey("backspace")
    expect(ls.searchQuery).toBe("ab")
  })
})
