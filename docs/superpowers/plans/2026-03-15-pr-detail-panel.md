# PR Detail Panel & Density Toggle Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add density toggle (compact/normal/detailed) and a preview overlay drawer with PR body, comments, and code comments to `raft ls`.

**Architecture:** Two independent features layered onto the existing `LsCommand`. Feature 1 (density) modifies `pr-table.tsx` to support multiple row layouts and adds lazy-fetched PR metadata. Feature 2 (panel) adds a right-side overlay drawer with tabbed content (body/comments/code comments), scrollable via `j`/`k` with mouse support. Both features share new GitHub API functions and types.

**Tech Stack:** Bun, React 19, @opentui/react, gh CLI API

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `src/lib/types.ts` | Modify | Add PRDetails, Review, PRPanelData, Comment, CodeComment interfaces |
| `src/lib/github.ts` | Modify | Add fetchPRDetails, fetchPRPanelData functions |
| `src/lib/cache.ts` | Create | In-memory Map-based cache for PRDetails and PRPanelData |
| `src/lib/format.ts` | Modify | Add formatReviewStatus, formatLinesChanged helpers |
| `src/components/pr-table.tsx` | Modify | Accept density prop, render normal/detailed/compressed row layouts |
| `src/components/markdown.tsx` | Create | Basic markdown-to-OpenTUI-JSX renderer |
| `src/components/panel-body.tsx` | Create | PR body tab using markdown renderer |
| `src/components/panel-comments.tsx` | Create | Review/conversation comments tab |
| `src/components/panel-code.tsx` | Create | Inline code comments tab |
| `src/components/preview-panel.tsx` | Create | Drawer container with header, tabs, scrollable content |
| `src/commands/ls.tsx` | Modify | Add density/panel state, split keyboard handlers, layout logic |
| `src/lib/__tests__/github.test.ts` | Create | Unit tests for new github functions |
| `src/lib/__tests__/format.test.ts` | Create | Unit tests for new format helpers |
| `src/lib/__tests__/cache.test.ts` | Create | Unit tests for cache |
| `src/lib/__tests__/markdown.test.ts` | Create | Unit tests for markdown parser |

---

## Chunk 1: Types, API, Cache, Formatting

### Task 1: Add new type interfaces

**Files:**
- Modify: `src/lib/types.ts`

- [ ] **Step 1: Add the new interfaces to types.ts**

```typescript
// Append after the existing Stack interface and STACK_COMMENT_MARKER

export interface Review {
  user: string
  state: "APPROVED" | "CHANGES_REQUESTED" | "COMMENTED" | "PENDING"
}

export interface PRDetails {
  additions: number
  deletions: number
  commentCount: number
  reviews: Review[]
  headRefName: string
}

export interface Comment {
  author: string
  body: string
  createdAt: string
  authorAssociation: string
}

export interface CodeComment {
  author: string
  body: string
  path: string
  line: number
  diffHunk: string
  createdAt: string
}

export interface PRPanelData {
  body: string
  comments: Comment[]
  codeComments: CodeComment[]
}

export type Density = "compact" | "normal" | "detailed" | "compressed"
export type PanelTab = "body" | "comments" | "code"
```

- [ ] **Step 2: Verify types compile**

Run: `bunx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/lib/types.ts
git commit -m "feat(types): add PRDetails, PRPanelData, and related interfaces"
```

---

### Task 2: Add format helpers

**Files:**
- Modify: `src/lib/format.ts`
- Create: `src/lib/__tests__/format.test.ts`

- [ ] **Step 1: Write failing tests for new format functions**

Create `src/lib/__tests__/format.test.ts`:

```typescript
import { test, expect, describe } from "bun:test"
import { formatReviewStatus, formatLinesChanged } from "../format"
import type { Review } from "../types"

describe("formatReviewStatus", () => {
  test("returns empty string for no reviews", () => {
    expect(formatReviewStatus([])).toBe("")
  })

  test("shows approved count", () => {
    const reviews: Review[] = [
      { user: "alice", state: "APPROVED" },
      { user: "bob", state: "APPROVED" },
    ]
    expect(formatReviewStatus(reviews)).toContain("2")
  })

  test("shows changes requested count", () => {
    const reviews: Review[] = [
      { user: "alice", state: "CHANGES_REQUESTED" },
    ]
    expect(formatReviewStatus(reviews)).toContain("1")
  })

  test("deduplicates by user (latest state wins)", () => {
    const reviews: Review[] = [
      { user: "alice", state: "CHANGES_REQUESTED" },
      { user: "alice", state: "APPROVED" },
    ]
    // alice's latest review is APPROVED, so should show 1 approved, 0 changes
    const result = formatReviewStatus(reviews)
    expect(result).toContain("1")
    expect(result).not.toContain("x")
  })

  test("ignores COMMENTED and PENDING states in count", () => {
    const reviews: Review[] = [
      { user: "alice", state: "COMMENTED" },
      { user: "bob", state: "PENDING" },
    ]
    expect(formatReviewStatus(reviews)).toBe("")
  })
})

describe("formatLinesChanged", () => {
  test("formats additions and deletions", () => {
    expect(formatLinesChanged(142, 38)).toBe("+142 -38")
  })

  test("handles zero additions", () => {
    expect(formatLinesChanged(0, 10)).toBe("+0 -10")
  })

  test("handles zero deletions", () => {
    expect(formatLinesChanged(50, 0)).toBe("+50 -0")
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test src/lib/__tests__/format.test.ts`
Expected: FAIL (formatReviewStatus and formatLinesChanged not found)

- [ ] **Step 3: Implement the format functions**

Add to `src/lib/format.ts`:

```typescript
import type { Review } from "./types"

// ... existing functions ...

/** Deduplicate reviews by user (last review wins), then count approved/changes_requested. */
export function formatReviewStatus(reviews: Review[]): string {
  // Dedupe: last review per user wins
  const byUser = new Map<string, Review>()
  for (const r of reviews) {
    byUser.set(r.user, r)
  }
  let approved = 0
  let changesRequested = 0
  for (const r of byUser.values()) {
    if (r.state === "APPROVED") approved++
    if (r.state === "CHANGES_REQUESTED") changesRequested++
  }
  const parts: string[] = []
  if (approved > 0) parts.push(`v${approved}`)
  if (changesRequested > 0) parts.push(`x${changesRequested}`)
  return parts.join(" ")
}

export function formatLinesChanged(additions: number, deletions: number): string {
  return `+${additions} -${deletions}`
}
```

Note: The existing `format.ts` has no imports. You will need to add the `import type { Review } from "./types"` at the top.

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test src/lib/__tests__/format.test.ts`
Expected: All PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/format.ts src/lib/__tests__/format.test.ts
git commit -m "feat(format): add formatReviewStatus and formatLinesChanged helpers"
```

---

### Task 3: Create in-memory cache

**Files:**
- Create: `src/lib/cache.ts`
- Create: `src/lib/__tests__/cache.test.ts`

- [ ] **Step 1: Write failing tests for cache**

Create `src/lib/__tests__/cache.test.ts`:

```typescript
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test src/lib/__tests__/cache.test.ts`
Expected: FAIL (PRCache not found)

- [ ] **Step 3: Implement the cache**

Create `src/lib/cache.ts`:

```typescript
import type { PRDetails, PRPanelData } from "./types"

export class PRCache {
  private details = new Map<string, PRDetails>()
  private panelData = new Map<string, PRPanelData>()

  getDetails(url: string): PRDetails | undefined {
    return this.details.get(url)
  }

  setDetails(url: string, data: PRDetails): void {
    this.details.set(url, data)
  }

  hasDetails(url: string): boolean {
    return this.details.has(url)
  }

  getPanelData(url: string): PRPanelData | undefined {
    return this.panelData.get(url)
  }

  setPanelData(url: string, data: PRPanelData): void {
    this.panelData.set(url, data)
  }

  hasPanelData(url: string): boolean {
    return this.panelData.has(url)
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test src/lib/__tests__/cache.test.ts`
Expected: All PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/cache.ts src/lib/__tests__/cache.test.ts
git commit -m "feat(cache): add in-memory PRCache for details and panel data"
```

---

### Task 4: Add GitHub API fetch functions

**Files:**
- Modify: `src/lib/github.ts`
- Create: `src/lib/__tests__/github.test.ts`

- [ ] **Step 1: Write failing tests for new fetch functions**

Create `src/lib/__tests__/github.test.ts`:

```typescript
import { test, expect, describe, setDefaultTimeout } from "bun:test"
import { fetchPRDetails, fetchPRPanelData } from "../github"

setDefaultTimeout(30_000)

// These tests hit real gh CLI. They need a known open PR.
// Using OctavianTocan/to-do-app which has open PRs.

describe("fetchPRDetails (real gh CLI)", () => {
  test("returns details for a known PR", async () => {
    const details = await fetchPRDetails("OctavianTocan/to-do-app", 1)
    expect(typeof details.additions).toBe("number")
    expect(typeof details.deletions).toBe("number")
    expect(typeof details.commentCount).toBe("number")
    expect(Array.isArray(details.reviews)).toBe(true)
    expect(typeof details.headRefName).toBe("string")
  })
})

describe("fetchPRPanelData (real gh CLI)", () => {
  test("returns panel data for a known PR", async () => {
    const data = await fetchPRPanelData("OctavianTocan/to-do-app", 1)
    expect(typeof data.body).toBe("string")
    expect(Array.isArray(data.comments)).toBe(true)
    expect(Array.isArray(data.codeComments)).toBe(true)
  })

  test("comments have required fields", async () => {
    const data = await fetchPRPanelData("OctavianTocan/to-do-app", 1)
    for (const c of data.comments) {
      expect(typeof c.author).toBe("string")
      expect(typeof c.body).toBe("string")
      expect(typeof c.createdAt).toBe("string")
      expect(typeof c.authorAssociation).toBe("string")
    }
  })

  test("code comments have required fields", async () => {
    const data = await fetchPRPanelData("OctavianTocan/to-do-app", 1)
    for (const c of data.codeComments) {
      expect(typeof c.author).toBe("string")
      expect(typeof c.body).toBe("string")
      expect(typeof c.path).toBe("string")
      expect(typeof c.createdAt).toBe("string")
    }
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test src/lib/__tests__/github.test.ts`
Expected: FAIL (fetchPRDetails and fetchPRPanelData not found)

- [ ] **Step 3: Implement fetchPRDetails**

Add to `src/lib/github.ts` (after the existing exports, before the end of file):

```typescript
import type { PRDetails, Review, PRPanelData, Comment, CodeComment } from "./types"

/** Fetch detailed PR metadata: additions, deletions, comments count, reviews. */
export async function fetchPRDetails(repo: string, prNumber: number): Promise<PRDetails> {
  const [prJson, reviewsJson] = await Promise.all([
    runGh([
      "api", `repos/${repo}/pulls/${prNumber}`,
      "--jq", "{additions, deletions, comments, head: .head.ref}",
    ]),
    runGh([
      "api", `repos/${repo}/pulls/${prNumber}/reviews`,
      "--jq", "[.[] | {user: .user.login, state: .state}]",
    ]),
  ])

  const pr = JSON.parse(prJson)
  const reviews: Review[] = JSON.parse(reviewsJson)

  return {
    additions: pr.additions,
    deletions: pr.deletions,
    commentCount: pr.comments,
    reviews,
    headRefName: pr.head,
  }
}
```

- [ ] **Step 4: Implement fetchPRPanelData**

Add to `src/lib/github.ts`:

```typescript
/** Fetch full PR data for the preview panel: body, conversation comments, code comments. */
export async function fetchPRPanelData(repo: string, prNumber: number): Promise<PRPanelData> {
  const [bodyJson, issueCommentsJson, codeCommentsJson] = await Promise.all([
    runGh([
      "api", `repos/${repo}/pulls/${prNumber}`,
      "--jq", ".body",
    ]),
    runGh([
      "api", `repos/${repo}/issues/${prNumber}/comments`,
      "--jq", "[.[] | {author: .user.login, body: .body, createdAt: .created_at, authorAssociation: .author_association}]",
    ]),
    runGh([
      "api", `repos/${repo}/pulls/${prNumber}/comments`,
      "--jq", "[.[] | {author: .user.login, body: .body, path: .path, line: (.line // .original_line // 0), diffHunk: .diff_hunk, createdAt: .created_at}]",
    ]),
  ])

  const body = bodyJson || ""
  const comments: Comment[] = JSON.parse(issueCommentsJson || "[]")
  const codeComments: CodeComment[] = JSON.parse(codeCommentsJson || "[]")

  return { body, comments, codeComments }
}
```

Note: The `runGh` function is already defined in `github.ts` but is not exported. The new functions go in the same file so they can use it directly.

Also note: You need to add the import for the new types at the top of `github.ts`. The existing import is:
```typescript
import type { PullRequest } from "./types"
```
Change it to:
```typescript
import type { PullRequest, PRDetails, Review, PRPanelData, Comment, CodeComment } from "./types"
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `bun test src/lib/__tests__/github.test.ts`
Expected: All PASS

- [ ] **Step 6: Also run existing tests to check nothing broke**

Run: `bun test`
Expected: All PASS

- [ ] **Step 7: Commit**

```bash
git add src/lib/github.ts src/lib/__tests__/github.test.ts
git commit -m "feat(github): add fetchPRDetails and fetchPRPanelData API functions"
```

---

## Chunk 2: Density Toggle UI

### Task 5: Update PRTable for density modes

**Files:**
- Modify: `src/components/pr-table.tsx`

- [ ] **Step 1: Update PRTableProps to accept density**

The `PRTable` and `PRRow` components need to accept a `density` prop and optionally `PRDetails` per row. Update `pr-table.tsx`:

```typescript
import type { PullRequest, Density, PRDetails } from "../lib/types"
import { formatRelativeAge, shortRepoName, truncate, formatReviewStatus, formatLinesChanged } from "../lib/format"

interface PRTableProps {
  prs: PullRequest[]
  selectedIndex: number
  density: Density
  detailsMap?: Map<string, PRDetails>
  onSelect?: (index: number) => void
}

function PRRow({ pr, isSelected, index, density, details, onSelect }: {
  pr: PullRequest
  isSelected: boolean
  index: number
  density: Density
  details?: PRDetails
  onSelect?: (index: number) => void
}) {
  const dotColor = pr.isDraft ? "#6b7089" : "#9ece6a"
  const dot = pr.isDraft ? "\u25CB" : "\u25CF"
  const cursor = isSelected ? "\u25B8" : " "
  const bgColor = isSelected ? "#292e42" : "transparent"
  const age = formatRelativeAge(pr.createdAt)
  const repo = shortRepoName(pr.repo)

  // Compressed mode: minimal columns for when panel is open
  if (density === "compressed") {
    return (
      <box
        flexDirection="row"
        backgroundColor={bgColor}
        paddingX={1}
        height={1}
        onMouseDown={() => onSelect?.(index)}
      >
        <box width={2}>
          <text fg={isSelected ? "#7aa2f7" : "#6b7089"}>{cursor}</text>
        </box>
        <box width={2}>
          <text fg={dotColor}>{dot}</text>
        </box>
        <box width={6}>
          <text fg="#7aa2f7">#{pr.number}</text>
        </box>
        <box flexGrow={1}>
          <text fg="#c0caf5">{truncate(pr.title, 30)}</text>
        </box>
      </box>
    )
  }

  // Compact mode: current layout (default)
  if (density === "compact") {
    return (
      <box
        flexDirection="row"
        backgroundColor={bgColor}
        paddingX={1}
        height={1}
        onMouseDown={() => onSelect?.(index)}
      >
        <box width={2}>
          <text fg={isSelected ? "#7aa2f7" : "#6b7089"}>{cursor}</text>
        </box>
        <box width={2}>
          <text fg={dotColor}>{dot}</text>
        </box>
        <box width={6}>
          <text fg="#7aa2f7">#{pr.number}</text>
        </box>
        <box width={20}>
          <text fg="#bb9af7">{truncate(repo, 18)}</text>
        </box>
        <box flexGrow={1}>
          <text fg="#c0caf5">{truncate(pr.title, 60)}</text>
        </box>
        <box width={5}>
          <text fg="#6b7089">{age}</text>
        </box>
      </box>
    )
  }

  // Normal mode: adds review status + comment count
  const reviewStr = details ? formatReviewStatus(details.reviews) : ""
  const commentStr = details && details.commentCount > 0 ? String(details.commentCount) : ""

  if (density === "normal") {
    return (
      <box
        flexDirection="row"
        backgroundColor={bgColor}
        paddingX={1}
        height={1}
        onMouseDown={() => onSelect?.(index)}
      >
        <box width={2}>
          <text fg={isSelected ? "#7aa2f7" : "#6b7089"}>{cursor}</text>
        </box>
        <box width={2}>
          <text fg={dotColor}>{dot}</text>
        </box>
        <box width={6}>
          <text fg="#7aa2f7">#{pr.number}</text>
        </box>
        <box width={20}>
          <text fg="#bb9af7">{truncate(repo, 18)}</text>
        </box>
        <box flexGrow={1}>
          <text fg="#c0caf5">{truncate(pr.title, 45)}</text>
        </box>
        <box width={8}>
          <text>
            {reviewStr.includes("v") && <span fg="#9ece6a">{reviewStr.split(" ")[0]}</span>}
            {reviewStr.includes("v") && reviewStr.includes("x") && <span fg="#6b7089"> </span>}
            {reviewStr.includes("x") && <span fg="#f7768e">{reviewStr.split(" ").find(s => s.startsWith("x"))}</span>}
          </text>
        </box>
        <box width={4}>
          <text fg="#9aa5ce">{commentStr}</text>
        </box>
        <box width={5}>
          <text fg="#6b7089">{age}</text>
        </box>
      </box>
    )
  }

  // Detailed mode: two lines per PR. Normal row + branch + lines changed
  const branchName = details?.headRefName || pr.headRefName || ""
  const linesStr = details ? formatLinesChanged(details.additions, details.deletions) : ""

  return (
    <box
      flexDirection="column"
      backgroundColor={bgColor}
      onMouseDown={() => onSelect?.(index)}
    >
      {/* Line 1: same as normal */}
      <box flexDirection="row" paddingX={1} height={1}>
        <box width={2}>
          <text fg={isSelected ? "#7aa2f7" : "#6b7089"}>{cursor}</text>
        </box>
        <box width={2}>
          <text fg={dotColor}>{dot}</text>
        </box>
        <box width={6}>
          <text fg="#7aa2f7">#{pr.number}</text>
        </box>
        <box width={20}>
          <text fg="#bb9af7">{truncate(repo, 18)}</text>
        </box>
        <box flexGrow={1}>
          <text fg="#c0caf5">{truncate(pr.title, 45)}</text>
        </box>
        <box width={8}>
          <text>
            {reviewStr.includes("v") && <span fg="#9ece6a">{reviewStr.split(" ")[0]}</span>}
            {reviewStr.includes("v") && reviewStr.includes("x") && <span fg="#6b7089"> </span>}
            {reviewStr.includes("x") && <span fg="#f7768e">{reviewStr.split(" ").find(s => s.startsWith("x"))}</span>}
          </text>
        </box>
        <box width={4}>
          <text fg="#9aa5ce">{commentStr}</text>
        </box>
        <box width={5}>
          <text fg="#6b7089">{age}</text>
        </box>
      </box>
      {/* Line 2: branch + lines changed */}
      <box flexDirection="row" paddingX={1} height={1}>
        <box width={32} />
        <box flexGrow={1}>
          <text fg="#6b7089">{truncate(branchName, 40)}</text>
        </box>
        <box width={17}>
          {linesStr && (
            <text>
              <span fg="#9ece6a">{linesStr.split(" ")[0]}</span>
              <span fg="#6b7089"> </span>
              <span fg="#f7768e">{linesStr.split(" ")[1]}</span>
            </text>
          )}
        </box>
      </box>
    </box>
  )
}

export function PRTable({ prs, selectedIndex, density, detailsMap, onSelect }: PRTableProps) {
  if (prs.length === 0) {
    return (
      <box padding={2}>
        <text fg="#6b7089">No PRs match your filters.</text>
      </box>
    )
  }

  return (
    <box flexDirection="column" width="100%">
      {prs.map((pr, i) => (
        <PRRow
          key={`${pr.repo}-${pr.number}`}
          pr={pr}
          isSelected={i === selectedIndex}
          index={i}
          density={density}
          details={detailsMap?.get(pr.url)}
          onSelect={onSelect}
        />
      ))}
    </box>
  )
}
```

- [ ] **Step 2: Update ls.tsx to pass density prop**

In `src/commands/ls.tsx`, add the density state and pass it to PRTable. For now, just wire up the prop with "compact" as default so nothing changes visually yet:

Add to imports:
```typescript
import type { PullRequest, Density } from "../lib/types"
```

Add state:
```typescript
const [density, setDensity] = useState<Density>("compact")
```

Update the PRTable call:
```typescript
<PRTable prs={visiblePRs} selectedIndex={visibleSelectedIndex} density={density} onSelect={handleSelect} />
```

- [ ] **Step 3: Verify the app still renders correctly**

Run: `bun src/index.tsx ls`
Expected: Same visual as before (compact mode). Ctrl+C to exit.

- [ ] **Step 4: Commit**

```bash
git add src/components/pr-table.tsx src/commands/ls.tsx
git commit -m "feat(pr-table): add density prop with compact/normal/detailed/compressed modes"
```

---

### Task 6: Wire up density toggle and data fetching in ls.tsx

**Files:**
- Modify: `src/commands/ls.tsx`

- [ ] **Step 1: Add density toggle keyboard handler and detail fetching logic**

Add imports:
```typescript
import { fetchPRDetails } from "../lib/github"
import { PRCache } from "../lib/cache"
import type { PullRequest, Density, PRDetails } from "../lib/types"
```

Add state/refs:
```typescript
const [density, setDensity] = useState<Density>("compact")
const [detailsMap, setDetailsMap] = useState<Map<string, PRDetails>>(new Map())
const cacheRef = useRef(new PRCache())
```

Add a `useRef` import if not already present.

Add an effect that fetches details when density changes to normal or detailed:
```typescript
useEffect(() => {
  if (density === "compact" || density === "compressed") return
  if (filteredPRs.length === 0) return

  const cache = cacheRef.current
  const toFetch = filteredPRs.filter(pr => !cache.hasDetails(pr.url))

  if (toFetch.length === 0) {
    // All cached, just update the map
    const map = new Map<string, PRDetails>()
    for (const pr of filteredPRs) {
      const d = cache.getDetails(pr.url)
      if (d) map.set(pr.url, d)
    }
    setDetailsMap(map)
    return
  }

  // Parse repo and number from PR URL to call fetchPRDetails
  Promise.all(
    toFetch.map(async (pr) => {
      try {
        const details = await fetchPRDetails(pr.repo, pr.number)
        cache.setDetails(pr.url, details)
      } catch { /* skip on error */ }
    })
  ).then(() => {
    const map = new Map<string, PRDetails>()
    for (const pr of filteredPRs) {
      const d = cache.getDetails(pr.url)
      if (d) map.set(pr.url, d)
    }
    setDetailsMap(map)
  })
}, [density, filteredPRs])
```

Add the `v` key handler in the normal mode keyboard handler (after the `r` handler):
```typescript
} else if (key.name === "v") {
  setDensity((d) => {
    if (d === "compact") return "normal"
    if (d === "normal") return "detailed"
    return "compact"
  })
}
```

Update the header to show density mode:
```typescript
<text fg="#9aa5ce">{filteredPRs.length} PRs  sort: {SORT_LABELS[sortMode]}  view: {density}</text>
```

Update PRTable call to pass detailsMap:
```typescript
<PRTable prs={visiblePRs} selectedIndex={visibleSelectedIndex} density={density} detailsMap={detailsMap} onSelect={handleSelect} />
```

Update the keybinds help text:
```typescript
Enter: open  c: copy  /: search  r: repo  s: sort  v: view  Tab: status  q: quit
```

- [ ] **Step 2: Adjust listHeight for detailed mode**

In the listHeight calculation, account for detailed mode using 2 lines per PR:
```typescript
const rowHeight = density === "detailed" ? 2 : 1
const listHeight = Math.max(3, Math.floor((termHeight - 9) / rowHeight))
```

- [ ] **Step 3: Test manually**

Run: `bun src/index.tsx ls`
- Press `v` to cycle compact -> normal -> detailed
- In normal mode, review counts and comment counts should appear (after brief loading)
- In detailed mode, branch names and line counts should appear on second line
- Press `v` again to go back to compact
Expected: All three modes render correctly. No crashes.

- [ ] **Step 4: Commit**

```bash
git add src/commands/ls.tsx
git commit -m "feat(ls): add density toggle with v key, lazy-fetch PR details"
```

---

## Chunk 3: Markdown Renderer & Panel Components

### Task 7: Create markdown renderer

**Files:**
- Create: `src/components/markdown.tsx`
- Create: `src/lib/__tests__/markdown.test.ts`

- [ ] **Step 1: Write tests for markdown parsing**

Create `src/lib/__tests__/markdown.test.ts`:

```typescript
import { test, expect, describe } from "bun:test"
import { parseMarkdownLines } from "../../components/markdown"

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
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test src/lib/__tests__/markdown.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement the markdown parser and renderer**

Create `src/components/markdown.tsx`:

```typescript
export type MdLine =
  | { type: "header"; text: string; level: number }
  | { type: "list"; text: string }
  | { type: "code"; text: string }
  | { type: "text"; text: string }
  | { type: "blank" }

export function parseMarkdownLines(input: string): MdLine[] {
  const rawLines = input.split("\n")
  const result: MdLine[] = []
  let inCode = false
  let codeBuffer: string[] = []

  for (const line of rawLines) {
    if (line.startsWith("```")) {
      if (inCode) {
        // End code block
        result.push({ type: "code", text: codeBuffer.join("\n") })
        codeBuffer = []
        inCode = false
      } else {
        inCode = true
      }
      continue
    }

    if (inCode) {
      codeBuffer.push(line)
      continue
    }

    if (line.trim() === "") {
      result.push({ type: "blank" })
      continue
    }

    const headerMatch = line.match(/^(#{1,3})\s+(.+)/)
    if (headerMatch) {
      result.push({ type: "header", text: headerMatch[2], level: headerMatch[1].length })
      continue
    }

    if (line.match(/^[-*]\s+/)) {
      result.push({ type: "list", text: line.replace(/^[-*]\s+/, "") })
      continue
    }

    result.push({ type: "text", text: line })
  }

  // Handle unclosed code block
  if (inCode && codeBuffer.length > 0) {
    result.push({ type: "code", text: codeBuffer.join("\n") })
  }

  return result
}

interface MarkdownViewProps {
  content: string
  width: number
  scrollOffset: number
  maxLines: number
}

export function MarkdownView({ content, width, scrollOffset, maxLines }: MarkdownViewProps) {
  const lines = parseMarkdownLines(content)

  // Flatten to renderable lines with styles
  const rendered: { key: string; element: JSX.Element }[] = []
  let lineIdx = 0

  for (const line of lines) {
    const key = `md-${lineIdx++}`
    switch (line.type) {
      case "header":
        rendered.push({
          key,
          element: (
            <box height={1} paddingX={1}>
              <text fg="#c0caf5"><strong>{line.text}</strong></text>
            </box>
          ),
        })
        break
      case "list":
        rendered.push({
          key,
          element: (
            <box height={1} paddingX={1}>
              <text>
                <span fg="#6b7089">  - </span>
                <span fg="#c0caf5">{line.text}</span>
              </text>
            </box>
          ),
        })
        break
      case "code":
        for (const codeLine of line.text.split("\n")) {
          const codeKey = `md-${lineIdx++}`
          rendered.push({
            key: codeKey,
            element: (
              <box height={1} paddingX={2} backgroundColor="#1a1b26">
                <text fg="#9aa5ce">{codeLine}</text>
              </box>
            ),
          })
        }
        break
      case "blank":
        rendered.push({
          key,
          element: <box height={1} />,
        })
        break
      case "text":
        rendered.push({
          key,
          element: (
            <box height={1} paddingX={1}>
              <text fg="#c0caf5">{line.text}</text>
            </box>
          ),
        })
        break
    }
  }

  const visible = rendered.slice(scrollOffset, scrollOffset + maxLines)

  return (
    <box flexDirection="column" width={width}>
      {visible.map(({ key, element }) => (
        <box key={key}>{element}</box>
      ))}
    </box>
  )
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test src/lib/__tests__/markdown.test.ts`
Expected: All PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/markdown.tsx src/lib/__tests__/markdown.test.ts
git commit -m "feat(markdown): add basic markdown parser and MarkdownView component"
```

---

### Task 8: Create panel tab components

**Files:**
- Create: `src/components/panel-body.tsx`
- Create: `src/components/panel-comments.tsx`
- Create: `src/components/panel-code.tsx`

- [ ] **Step 1: Create panel-body.tsx**

```typescript
import { MarkdownView } from "./markdown"

interface PanelBodyProps {
  body: string
  width: number
  scrollOffset: number
  maxLines: number
}

export function PanelBody({ body, width, scrollOffset, maxLines }: PanelBodyProps) {
  if (!body) {
    return (
      <box paddingX={1}>
        <text fg="#6b7089">No description provided.</text>
      </box>
    )
  }
  return <MarkdownView content={body} width={width} scrollOffset={scrollOffset} maxLines={maxLines} />
}
```

- [ ] **Step 2: Create panel-comments.tsx**

```typescript
import type { Comment } from "../lib/types"
import { formatRelativeAge } from "../lib/format"

interface PanelCommentsProps {
  comments: Comment[]
  width: number
  scrollOffset: number
  maxLines: number
}

export function PanelComments({ comments, width, scrollOffset, maxLines }: PanelCommentsProps) {
  if (comments.length === 0) {
    return (
      <box paddingX={1}>
        <text fg="#6b7089">No comments.</text>
      </box>
    )
  }

  // Build renderable lines
  const lines: { key: string; element: JSX.Element }[] = []
  let idx = 0

  for (const comment of comments) {
    const age = formatRelativeAge(comment.createdAt)
    const isBot = comment.authorAssociation === "BOT" ||
                  comment.author.includes("[bot]") ||
                  comment.author.includes("bot")
    const authorColor = isBot ? "#6b7089" : "#bb9af7"
    const textColor = isBot ? "#6b7089" : "#c0caf5"

    // Header line
    lines.push({
      key: `c-${idx}-header`,
      element: (
        <box height={1} paddingX={1}>
          <text>
            <span fg="#6b7089">{"\u250C"} </span>
            <span fg={authorColor}>@{comment.author}</span>
            <span fg="#6b7089"> {"\u00B7"} {age}</span>
          </text>
        </box>
      ),
    })

    // Body lines
    const bodyLines = comment.body.split("\n")
    for (const bodyLine of bodyLines) {
      lines.push({
        key: `c-${idx}-${lines.length}`,
        element: (
          <box height={1} paddingX={1}>
            <text>
              <span fg="#6b7089">{"\u2502"} </span>
              <span fg={textColor}>{bodyLine}</span>
            </text>
          </box>
        ),
      })
    }

    // Footer line
    lines.push({
      key: `c-${idx}-footer`,
      element: (
        <box height={1} paddingX={1}>
          <text fg="#6b7089">{"\u2514"}</text>
        </box>
      ),
    })

    // Spacer
    lines.push({
      key: `c-${idx}-spacer`,
      element: <box height={1} />,
    })

    idx++
  }

  const visible = lines.slice(scrollOffset, scrollOffset + maxLines)

  return (
    <box flexDirection="column" width={width}>
      {visible.map(({ key, element }) => (
        <box key={key}>{element}</box>
      ))}
    </box>
  )
}
```

- [ ] **Step 3: Create panel-code.tsx**

```typescript
import type { CodeComment } from "../lib/types"
import { formatRelativeAge, truncate } from "../lib/format"

interface PanelCodeProps {
  codeComments: CodeComment[]
  width: number
  scrollOffset: number
  maxLines: number
}

export function PanelCode({ codeComments, width, scrollOffset, maxLines }: PanelCodeProps) {
  if (codeComments.length === 0) {
    return (
      <box paddingX={1}>
        <text fg="#6b7089">No code comments.</text>
      </box>
    )
  }

  const lines: { key: string; element: JSX.Element }[] = []
  let idx = 0

  for (const comment of codeComments) {
    const age = formatRelativeAge(comment.createdAt)

    // Header
    lines.push({
      key: `cc-${idx}-header`,
      element: (
        <box height={1} paddingX={1}>
          <text>
            <span fg="#6b7089">{"\u250C"} </span>
            <span fg="#bb9af7">@{comment.author}</span>
            <span fg="#6b7089"> {"\u00B7"} {age}</span>
          </text>
        </box>
      ),
    })

    // File path + line
    lines.push({
      key: `cc-${idx}-path`,
      element: (
        <box height={1} paddingX={1}>
          <text>
            <span fg="#6b7089">{"\u2502"} </span>
            <span fg="#7aa2f7">{comment.path}</span>
            <span fg="#6b7089">:{comment.line}</span>
          </text>
        </box>
      ),
    })

    // Diff hunk (last line only, as context)
    if (comment.diffHunk) {
      const hunkLines = comment.diffHunk.split("\n")
      const lastLine = hunkLines[hunkLines.length - 1] || ""
      lines.push({
        key: `cc-${idx}-hunk`,
        element: (
          <box height={1} paddingX={1}>
            <text>
              <span fg="#6b7089">{"\u2502"} {">"} </span>
              <span fg="#9aa5ce">{truncate(lastLine, width - 8)}</span>
            </text>
          </box>
        ),
      })
    }

    // Blank separator before comment body
    lines.push({
      key: `cc-${idx}-sep`,
      element: (
        <box height={1} paddingX={1}>
          <text fg="#6b7089">{"\u2502"}</text>
        </box>
      ),
    })

    // Comment body
    const bodyLines = comment.body.split("\n")
    for (const bodyLine of bodyLines) {
      lines.push({
        key: `cc-${idx}-${lines.length}`,
        element: (
          <box height={1} paddingX={1}>
            <text>
              <span fg="#6b7089">{"\u2502"} </span>
              <span fg="#c0caf5">{bodyLine}</span>
            </text>
          </box>
        ),
      })
    }

    // Footer
    lines.push({
      key: `cc-${idx}-footer`,
      element: (
        <box height={1} paddingX={1}>
          <text fg="#6b7089">{"\u2514"}</text>
        </box>
      ),
    })

    lines.push({
      key: `cc-${idx}-spacer`,
      element: <box height={1} />,
    })

    idx++
  }

  const visible = lines.slice(scrollOffset, scrollOffset + maxLines)

  return (
    <box flexDirection="column" width={width}>
      {visible.map(({ key, element }) => (
        <box key={key}>{element}</box>
      ))}
    </box>
  )
}
```

- [ ] **Step 4: Verify all three compile**

Run: `bunx tsc --noEmit`
Expected: No errors

- [ ] **Step 5: Commit**

```bash
git add src/components/panel-body.tsx src/components/panel-comments.tsx src/components/panel-code.tsx
git commit -m "feat(panel): add PanelBody, PanelComments, and PanelCode tab components"
```

---

### Task 9: Create the PreviewPanel container

**Files:**
- Create: `src/components/preview-panel.tsx`

- [ ] **Step 1: Create the preview panel**

```typescript
import type { PullRequest, PRPanelData, PanelTab } from "../lib/types"
import { shortRepoName } from "../lib/format"
import { Spinner } from "./spinner"
import { PanelBody } from "./panel-body"
import { PanelComments } from "./panel-comments"
import { PanelCode } from "./panel-code"

interface PreviewPanelProps {
  pr: PullRequest
  panelData: PRPanelData | null
  loading: boolean
  tab: PanelTab
  scrollOffset: number
  width: number
  height: number
}

export function PreviewPanel({ pr, panelData, loading, tab, scrollOffset, width, height }: PreviewPanelProps) {
  const commentCount = panelData?.comments.length ?? 0
  const codeCount = panelData?.codeComments.length ?? 0
  // 4 lines reserved: title, subtitle, divider, tab bar
  const contentHeight = Math.max(1, height - 4)

  return (
    <box flexDirection="column" width={width} height={height} borderColor="#292e42" border>
      {/* Title */}
      <box height={1} paddingX={1}>
        <text>
          <span fg="#7aa2f7"><strong>#{pr.number}</strong></span>
          <span fg="#c0caf5"> {pr.title}</span>
        </text>
      </box>

      {/* Subtitle */}
      <box height={1} paddingX={1}>
        <text>
          <span fg="#bb9af7">{shortRepoName(pr.repo)}</span>
          <span fg="#6b7089"> {"\u00B7"} </span>
          <span fg="#6b7089">{pr.headRefName || "unknown"}</span>
        </text>
      </box>

      {/* Tab bar */}
      <box height={1} paddingX={1} flexDirection="row">
        <box marginRight={2}>
          <text fg={tab === "body" ? "#7aa2f7" : "#6b7089"}>
            {tab === "body" ? <u>Body</u> : "Body"}
          </text>
        </box>
        <box marginRight={2}>
          <text fg={tab === "comments" ? "#7aa2f7" : "#6b7089"}>
            {tab === "comments" ? <u>Comments ({commentCount})</u> : `Comments (${commentCount})`}
          </text>
        </box>
        <box>
          <text fg={tab === "code" ? "#7aa2f7" : "#6b7089"}>
            {tab === "code" ? <u>Code ({codeCount})</u> : `Code (${codeCount})`}
          </text>
        </box>
      </box>

      {/* Divider */}
      <box height={1} paddingX={1}>
        <text fg="#292e42">{"\u2500".repeat(Math.max(1, width - 4))}</text>
      </box>

      {/* Content */}
      <box flexGrow={1} overflow="hidden">
        {loading ? (
          <box paddingX={1}>
            <Spinner text="Loading..." />
          </box>
        ) : panelData ? (
          <>
            {tab === "body" && (
              <PanelBody body={panelData.body} width={width - 2} scrollOffset={scrollOffset} maxLines={contentHeight} />
            )}
            {tab === "comments" && (
              <PanelComments comments={panelData.comments} width={width - 2} scrollOffset={scrollOffset} maxLines={contentHeight} />
            )}
            {tab === "code" && (
              <PanelCode codeComments={panelData.codeComments} width={width - 2} scrollOffset={scrollOffset} maxLines={contentHeight} />
            )}
          </>
        ) : (
          <box paddingX={1}>
            <text fg="#f7768e">Failed to load data.</text>
          </box>
        )}
      </box>
    </box>
  )
}
```

- [ ] **Step 2: Verify it compiles**

Run: `bunx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/components/preview-panel.tsx
git commit -m "feat(panel): add PreviewPanel container with header, tabs, and content routing"
```

---

## Chunk 4: Wire Panel Into ls.tsx

### Task 10: Integrate preview panel into LsCommand

**Files:**
- Modify: `src/commands/ls.tsx`

This is the largest task. It wires up panel state, keyboard handlers, data fetching, and the split layout.

- [ ] **Step 1: Add panel-related state**

Add imports:
```typescript
import { PreviewPanel } from "../components/preview-panel"
import { fetchPRPanelData } from "../lib/github"
import type { PullRequest, Density, PRDetails, PRPanelData, PanelTab } from "../lib/types"
```

Add state:
```typescript
const [panelOpen, setPanelOpen] = useState(false)
const [panelTab, setPanelTab] = useState<PanelTab>("body")
const [panelScroll, setPanelScroll] = useState(0)
const [splitRatio, setSplitRatio] = useState(0.6)
const [panelData, setPanelData] = useState<PRPanelData | null>(null)
const [panelLoading, setPanelLoading] = useState(false)
```

- [ ] **Step 2: Add panel data fetching effect**

This effect fetches panel data whenever the selected PR changes while the panel is open:

```typescript
useEffect(() => {
  if (!panelOpen || !selectedPR) return

  const cache = cacheRef.current
  const cached = cache.getPanelData(selectedPR.url)
  if (cached) {
    setPanelData(cached)
    setPanelLoading(false)
    return
  }

  setPanelLoading(true)
  setPanelData(null)
  fetchPRPanelData(selectedPR.repo, selectedPR.number)
    .then((data) => {
      cache.setPanelData(selectedPR.url, data)
      setPanelData(data)
    })
    .catch(() => setPanelData(null))
    .finally(() => setPanelLoading(false))
}, [panelOpen, selectedPR?.url])
```

- [ ] **Step 3: Add prefetching for adjacent PRs**

```typescript
useEffect(() => {
  if (!panelOpen) return
  const cache = cacheRef.current

  // Prefetch prev and next
  const neighbors = [filteredPRs[selectedIndex - 1], filteredPRs[selectedIndex + 1]].filter(Boolean)
  for (const pr of neighbors) {
    if (!cache.hasPanelData(pr.url)) {
      fetchPRPanelData(pr.repo, pr.number)
        .then((data) => cache.setPanelData(pr.url, data))
        .catch(() => {})
    }
  }
}, [panelOpen, selectedIndex, filteredPRs])
```

- [ ] **Step 4: Update keyboard handler for panel mode**

Replace the existing `useKeyboard` with a handler that branches on `panelOpen`:

```typescript
useKeyboard((key) => {
  if (searchMode) {
    // ... existing search mode handler (unchanged) ...
    return
  }

  if (panelOpen) {
    // Panel open mode
    if (key.name === "j") {
      setPanelScroll((s) => s + 1)
    } else if (key.name === "k") {
      setPanelScroll((s) => Math.max(0, s - 1))
    } else if (key.name === "down") {
      setSelectedIndex((i) => Math.min(filteredPRs.length - 1, i + 1))
      setPanelScroll(0)
    } else if (key.name === "up") {
      setSelectedIndex((i) => Math.max(0, i - 1))
      setPanelScroll(0)
    } else if (key.name === "1") {
      setPanelTab("body"); setPanelScroll(0)
    } else if (key.name === "2") {
      setPanelTab("comments"); setPanelScroll(0)
    } else if (key.name === "3") {
      setPanelTab("code"); setPanelScroll(0)
    } else if (key.name === "tab") {
      setPanelTab((t) => {
        if (t === "body") return "comments"
        if (t === "comments") return "code"
        return "body"
      })
      setPanelScroll(0)
    } else if (key.name === "+" || key.name === "=") {
      setSplitRatio((r) => Math.min(0.8, r + 0.1))
    } else if (key.name === "-") {
      setSplitRatio((r) => Math.max(0.3, r - 0.1))
    } else if (key.name === "p" || key.name === "escape") {
      setPanelOpen(false)
    } else if (key.name === "enter" || key.name === "return") {
      if (selectedPR) {
        Bun.spawn(["open", selectedPR.url], { stdout: "ignore", stderr: "ignore" })
        showFlash("Opening " + selectedPR.url)
      }
    } else if (key.name === "c" && selectedPR) {
      renderer.copyToClipboardOSC52(selectedPR.url)
      showFlash("Copied URL!")
    } else if (key.name === "q") {
      renderer.destroy()
    }
    return
  }

  // Normal mode (existing handler)
  if (key.name === "q" || key.name === "escape") {
    if (searchQuery) { setSearchQuery(""); return }
    if (repoFilter && !initialRepoFilter) { setRepoFilter(null); return }
    renderer.destroy()
  } else if (key.name === "j" || key.name === "down") {
    setSelectedIndex((i) => Math.min(filteredPRs.length - 1, i + 1))
  } else if (key.name === "k" || key.name === "up") {
    setSelectedIndex((i) => Math.max(0, i - 1))
  } else if (key.name === "enter" || key.name === "return") {
    if (selectedPR) {
      Bun.spawn(["open", selectedPR.url], { stdout: "ignore", stderr: "ignore" })
      showFlash("Opening " + selectedPR.url)
    }
  } else if (key.name === "c" && selectedPR) {
    renderer.copyToClipboardOSC52(selectedPR.url)
    showFlash("Copied URL!")
  } else if (key.name === "/") {
    setSearchMode(true)
    setSearchQuery("")
  } else if (key.name === "tab") {
    setStatusFilter((f) => {
      if (f === "all") return "open"
      if (f === "open") return "draft"
      return "all"
    })
    setSelectedIndex(0)
  } else if (key.name === "s") {
    setSortMode((m) => {
      const idx = SORT_MODES.indexOf(m)
      return SORT_MODES[(idx + 1) % SORT_MODES.length]
    })
    setSelectedIndex(0)
  } else if (key.name === "r") {
    if (repoFilter === null) {
      if (repos.length > 0) setRepoFilter(repos[0])
    } else {
      const idx = repos.indexOf(repoFilter)
      if (idx >= 0 && idx < repos.length - 1) {
        setRepoFilter(repos[idx + 1])
      } else {
        setRepoFilter(null)
      }
    }
    setSelectedIndex(0)
  } else if (key.name === "v") {
    setDensity((d) => {
      if (d === "compact") return "normal"
      if (d === "normal") return "detailed"
      return "compact"
    })
  } else if (key.name === "p") {
    setPanelOpen(true)
    setPanelScroll(0)
    setPanelTab("body")
  }
})
```

- [ ] **Step 5: Update the render layout**

Replace the main return JSX with a layout that conditionally shows the panel. Use `useTerminalDimensions` width to compute split sizes:

Add `width: termWidth` to the existing destructuring:
```typescript
const { height: termHeight, width: termWidth } = useTerminalDimensions()
```

Then update the main content area (the PR list section) to conditionally render with a split:

```tsx
{/* Main content area */}
{panelOpen ? (
  <box flexDirection="row" flexGrow={1} overflow="hidden">
    {/* Compressed PR list */}
    <box flexDirection="column" width={Math.floor(termWidth * (1 - splitRatio))}>
      <box flexDirection="column" flexGrow={1} overflow="hidden">
        <PRTable
          prs={visiblePRs}
          selectedIndex={visibleSelectedIndex}
          density="compressed"
          onSelect={handleSelect}
        />
      </box>
    </box>
    {/* Preview panel */}
    {selectedPR && (
      <PreviewPanel
        pr={selectedPR}
        panelData={panelData}
        loading={panelLoading}
        tab={panelTab}
        scrollOffset={panelScroll}
        width={Math.floor(termWidth * splitRatio)}
        height={termHeight - 6}
      />
    )}
  </box>
) : (
  <box flexDirection="column" flexGrow={1} overflow="hidden">
    <PRTable
      prs={visiblePRs}
      selectedIndex={visibleSelectedIndex}
      density={density}
      detailsMap={detailsMap}
      onSelect={handleSelect}
    />
    {filteredPRs.length > listHeight && (
      <box paddingX={1} height={1}>
        <text fg="#6b7089">
          {scrollOffset + 1}-{Math.min(scrollOffset + listHeight, filteredPRs.length)} of {filteredPRs.length}
        </text>
      </box>
    )}
  </box>
)}
```

- [ ] **Step 6: Update keybinds help text for panel mode**

In the bottom detail panel, conditionally show different keybinds:

```tsx
{flash ? (
  <text fg="#9ece6a">{flash}</text>
) : panelOpen ? (
  <text fg="#6b7089">
    j/k: scroll  1-3: tab  +/-: resize  p: close  Enter: open  c: copy  q: quit
  </text>
) : (
  <text fg="#6b7089">
    Enter: open  c: copy  /: search  r: repo  s: sort  v: view  p: preview  Tab: status  q: quit
  </text>
)}
```

- [ ] **Step 7: Test manually**

Run: `bun src/index.tsx ls`
- Press `p` to open the preview panel
- Verify panel shows PR body with loading spinner then content
- Press `j`/`k` to scroll panel content
- Press `1`/`2`/`3` to switch tabs
- Press up/down to change selected PR (panel should update)
- Press `+`/`-` to resize
- Press `p` or `Escape` to close
- Verify `v` still works for density toggle when panel is closed
Expected: Everything works without crashes.

- [ ] **Step 8: Commit**

```bash
git add src/commands/ls.tsx
git commit -m "feat(ls): integrate preview panel with split layout, keyboard navigation, and data fetching"
```

---

## Chunk 5: Polish & Final Testing

### Task 11: Run full test suite and fix any issues

- [ ] **Step 1: Run all tests**

Run: `bun test`
Expected: All PASS

- [ ] **Step 2: Run type checker**

Run: `bunx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Manual end-to-end test**

Run through the full workflow:
1. `bun src/index.tsx ls` - verify loads correctly
2. Navigate with `j`/`k` and arrow keys
3. Press `v` three times to cycle compact -> normal -> detailed -> compact
4. In normal mode, verify review counts and comment counts appear
5. In detailed mode, verify branch names and +/- lines appear
6. Press `p` to open panel
7. Scroll with `j`/`k`, switch tabs with `1`/`2`/`3`
8. Change PR with up/down arrows, verify panel updates
9. Resize with `+`/`-`
10. Close with `p`, verify list returns to chosen density
11. Press `c` to copy URL (both with and without panel)
12. Press `Enter` to open in browser
13. Test search mode still works
14. Press `q` to quit

- [ ] **Step 4: Fix any issues found**

Address any visual glitches, layout issues, or crashes found during testing.

- [ ] **Step 5: Final commit**

```bash
git add -A
git commit -m "fix(ls): address polish issues from end-to-end testing"
```

(Only if there were changes to commit.)
