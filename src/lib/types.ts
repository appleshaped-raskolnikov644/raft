export interface PullRequest {
  number: number
  title: string
  url: string
  body: string
  state: string
  isDraft: boolean
  repo: string
  headRefName: string
  baseRefName: string
  createdAt: string
}

export interface StackedPR extends PullRequest {
  position: number
  stackSize: number
  originalTitle: string
}

export interface Stack {
  repo: string
  prs: StackedPR[]
}

export const STACK_COMMENT_MARKER = "<!-- pr-cli-stack -->"
