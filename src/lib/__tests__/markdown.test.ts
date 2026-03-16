import { test, expect, describe } from "bun:test"
import { parseMarkdownLines, parseInlineSegments } from "../../components/markdown"

describe("parseMarkdownLines", () => {
  test("parses headers as bold lines", () => {
    const lines = parseMarkdownLines("# Hello\n## World")
    expect(lines[0]).toEqual({ type: "header", text: "Hello", level: 1 })
    expect(lines[1]).toEqual({ type: "header", text: "World", level: 2 })
  })

  test("parses list items", () => {
    const lines = parseMarkdownLines("- item one\n* item two")
    expect(lines[0]).toEqual({ type: "list", text: "item one" })
    expect(lines[1]).toEqual({ type: "list", text: "item two" })
  })

  test("parses numbered list items", () => {
    const lines = parseMarkdownLines("1. first\n2. second\n10. tenth")
    expect(lines[0]).toEqual({ type: "list", text: "first" })
    expect(lines[1]).toEqual({ type: "list", text: "second" })
    expect(lines[2]).toEqual({ type: "list", text: "tenth" })
  })

  test("parses code blocks", () => {
    const lines = parseMarkdownLines("```\nconst x = 1\n```")
    expect(lines[0]).toEqual({ type: "code", text: "const x = 1" })
  })

  test("parses blank lines", () => {
    const lines = parseMarkdownLines("hello\n\nworld")
    expect(lines[0]).toEqual({ type: "text", text: "hello" })
    expect(lines[1]).toEqual({ type: "blank" })
    expect(lines[2]).toEqual({ type: "text", text: "world" })
  })

  test("parses plain text", () => {
    const lines = parseMarkdownLines("just text")
    expect(lines[0]).toEqual({ type: "text", text: "just text" })
  })

  test("preserves unicode characters like arrows", () => {
    const lines = parseMarkdownLines("before → after")
    expect(lines[0]).toEqual({ type: "text", text: "before → after" })
  })
})

describe("parseInlineSegments", () => {
  test("returns plain text when no formatting present", () => {
    const segments = parseInlineSegments("hello world")
    expect(segments).toEqual([{ kind: "text", text: "hello world" }])
  })

  test("parses bold text", () => {
    const segments = parseInlineSegments("this is **bold** text")
    expect(segments).toEqual([
      { kind: "text", text: "this is " },
      { kind: "bold", text: "bold" },
      { kind: "text", text: " text" },
    ])
  })

  test("parses inline code", () => {
    const segments = parseInlineSegments("use `bun test` here")
    expect(segments).toEqual([
      { kind: "text", text: "use " },
      { kind: "code", text: "bun test" },
      { kind: "text", text: " here" },
    ])
  })

  test("parses mixed bold and code in one line", () => {
    const segments = parseInlineSegments("**bold:** use `code` now")
    expect(segments).toEqual([
      { kind: "bold", text: "bold:" },
      { kind: "text", text: " use " },
      { kind: "code", text: "code" },
      { kind: "text", text: " now" },
    ])
  })

  test("handles bold at start of line", () => {
    const segments = parseInlineSegments("**Status:** Ready")
    expect(segments).toEqual([
      { kind: "bold", text: "Status:" },
      { kind: "text", text: " Ready" },
    ])
  })

  test("handles bold at end of line", () => {
    const segments = parseInlineSegments("this is **important**")
    expect(segments).toEqual([
      { kind: "text", text: "this is " },
      { kind: "bold", text: "important" },
    ])
  })

  test("preserves unicode characters", () => {
    const segments = parseInlineSegments("before → **after**")
    expect(segments).toEqual([
      { kind: "text", text: "before → " },
      { kind: "bold", text: "after" },
    ])
  })
})
