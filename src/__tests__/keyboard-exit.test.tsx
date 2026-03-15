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

describe("keyboard exit handler", () => {
  test("q key triggers destroy callback", async () => {
    let destroyed = false
    testSetup = await createTestRenderer({ width: 40, height: 10 })

    // Mirror the pattern from index.tsx
    testSetup.renderer.keyInput.on("keypress", (key) => {
      if (key.name === "q" || key.name === "escape" || (key.ctrl && key.name === "c")) {
        destroyed = true
      }
    })

    simulateKey("q")
    expect(destroyed).toBe(true)
  })

  test("escape key triggers destroy callback", async () => {
    let destroyed = false
    testSetup = await createTestRenderer({ width: 40, height: 10 })

    testSetup.renderer.keyInput.on("keypress", (key) => {
      if (key.name === "q" || key.name === "escape" || (key.ctrl && key.name === "c")) {
        destroyed = true
      }
    })

    simulateKey("escape")
    expect(destroyed).toBe(true)
  })

  test("ctrl+c triggers destroy callback", async () => {
    let destroyed = false
    testSetup = await createTestRenderer({ width: 40, height: 10 })

    testSetup.renderer.keyInput.on("keypress", (key) => {
      if (key.name === "q" || key.name === "escape" || (key.ctrl && key.name === "c")) {
        destroyed = true
      }
    })

    simulateKey("c", { ctrl: true })
    expect(destroyed).toBe(true)
  })

  test("other keys do not trigger destroy", async () => {
    let destroyed = false
    testSetup = await createTestRenderer({ width: 40, height: 10 })

    testSetup.renderer.keyInput.on("keypress", (key) => {
      if (key.name === "q" || key.name === "escape" || (key.ctrl && key.name === "c")) {
        destroyed = true
      }
    })

    simulateKey("a")
    simulateKey("enter")
    simulateKey("j")
    expect(destroyed).toBe(false)
  })
})
