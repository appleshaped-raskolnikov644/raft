/** Core pull request data returned from the GitHub search API. */
export interface PullRequest {
  number: number
  title: string
  url: string
  body: string
  state: string
  isDraft: boolean
  /** Full repository name in `owner/repo` format. */
  repo: string
  headRefName: string
  baseRefName: string
  createdAt: string
  /** GitHub login of the PR author; only populated when using `--all` or `--author`. */
  author?: string
}

/** A pull request that belongs to a detected stack, with position metadata. */
export interface StackedPR extends PullRequest {
  /** 1-based position in the stack (1 = bottom, closest to main). */
  position: number
  /** Total number of PRs in this stack. */
  stackSize: number
  /** Original title before any `[N/M]` prefix was added. */
  originalTitle: string
}

/** A group of stacked PRs that target each other's branches in sequence. */
export interface Stack {
  repo: string
  prs: StackedPR[]
}

/** HTML comment marker used to identify auto-generated stack navigation comments. */
export const STACK_COMMENT_MARKER = "<!-- pr-cli-stack -->"

/** A single code review on a pull request. */
export interface Review {
  user: string
  state: "APPROVED" | "CHANGES_REQUESTED" | "COMMENTED" | "PENDING"
}

/** Extended PR details fetched separately from the main search results. */
export interface PRDetails {
  additions: number
  deletions: number
  commentCount: number
  reviews: Review[]
  headRefName: string
}

/** An issue-level comment on a pull request. */
export interface Comment {
  author: string
  body: string
  createdAt: string
  authorAssociation: string
}

/** An inline code review comment attached to a specific file and line. */
export interface CodeComment {
  /** GitHub API comment ID, used for replying to this comment. */
  id: number
  author: string
  body: string
  path: string
  line: number
  diffHunk: string
  createdAt: string
}

/** A single file's diff within a pull request. */
export interface FileDiff {
  filename: string
  status: "added" | "removed" | "modified" | "renamed"
  additions: number
  deletions: number
  changes: number
  /** Unified diff patch text; may be empty for binary files. */
  patch: string
  /** Original filename before a rename, if applicable. */
  previousFilename?: string
  /** AI-generated summary of changes, populated by the explain-diff feature. */
  explanation?: string
}

/** Full panel data for a PR's preview, fetched on demand when the panel opens. */
export interface PRPanelData {
  body: string
  comments: Comment[]
  codeComments: CodeComment[]
  files: FileDiff[]
}

/** Controls how much detail each PR row shows in the table. */
export type Density = "compact" | "normal" | "detailed" | "compressed"

/** Active tab in the preview panel. */
export type PanelTab = "body" | "comments" | "code" | "files"

/** Lifecycle state info attached to a PR for attention-based sorting. */
export interface PRLifecycleInfo {
  /** Current lifecycle state label. */
  state: string
  /** Urgency score for sorting (0-100, higher = more urgent). */
  urgency: number
  /** Short badge label for the PR list. */
  label: string
  /** Badge color (hex). */
  color: string
  /** Description of what action is needed next. */
  action: string
  /** Keybind hint for the prompted action. */
  keybind: string
}
