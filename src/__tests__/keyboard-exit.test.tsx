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

    // Mirrors the global handler in index.tsx
    testSetup.renderer.keyInput.on("keypress", (key) => {
      if (key.ctrl && key.name === "c") {
        destroyed = true
      }
    })

    simulateKey("c", { ctrl: true })
    expect(destroyed).toBe(true)
  })

  test("q does NOT trigger global destroy (handled by commands)", async () => {
    let destroyed = false
    testSetup = await createTestRenderer({ width: 40, height: 10 })

    testSetup.renderer.keyInput.on("keypress", (key) => {
      if (key.ctrl && key.name === "c") {
        destroyed = true
      }
    })

    simulateKey("q")
    expect(destroyed).toBe(false)
  })

  test("escape does NOT trigger global destroy (handled by commands)", async () => {
    let destroyed = false
    testSetup = await createTestRenderer({ width: 40, height: 10 })

    testSetup.renderer.keyInput.on("keypress", (key) => {
      if (key.ctrl && key.name === "c") {
        destroyed = true
      }
    })

    simulateKey("escape")
    expect(destroyed).toBe(false)
  })
})

describe("command-level keyboard handler", () => {
  test("q triggers destroy in normal mode", async () => {
    let destroyed = false
    let searchMode = false
    testSetup = await createTestRenderer({ width: 40, height: 10 })

    // Mirrors the ls command keyboard handler
    testSetup.renderer.keyInput.on("keypress", (key) => {
      if (searchMode) {
        if (key.name === "escape") {
          searchMode = false
          return
        }
        return
      }
      if (key.name === "q" || key.name === "escape") {
        destroyed = true
      }
    })

    simulateKey("q")
    expect(destroyed).toBe(true)
  })

  test("escape exits search mode instead of quitting", async () => {
    let destroyed = false
    let searchMode = true
    testSetup = await createTestRenderer({ width: 40, height: 10 })

    testSetup.renderer.keyInput.on("keypress", (key) => {
      if (searchMode) {
        if (key.name === "escape") {
          searchMode = false
          return
        }
        return
      }
      if (key.name === "q" || key.name === "escape") {
        destroyed = true
      }
    })

    simulateKey("escape")
    expect(destroyed).toBe(false)
    expect(searchMode).toBe(false)
  })

  test("q types into search instead of quitting in search mode", async () => {
    let destroyed = false
    let searchMode = true
    let query = ""
    testSetup = await createTestRenderer({ width: 40, height: 10 })

    testSetup.renderer.keyInput.on("keypress", (key) => {
      if (searchMode) {
        if (key.name === "escape") {
          searchMode = false
          return
        }
        if (key.name.length === 1 && !key.ctrl) {
          query += key.name
          return
        }
        return
      }
      if (key.name === "q" || key.name === "escape") {
        destroyed = true
      }
    })

    simulateKey("q")
    expect(destroyed).toBe(false)
    expect(query).toBe("q")
  })
})
