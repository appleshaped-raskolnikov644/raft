/**
 * Shared constants used across raft components.
 *
 * All colors follow the Tokyo Night color scheme. Using named constants
 * instead of raw hex strings prevents typos and makes future theming
 * possible by changing values in one place.
 */

/** Tokyo Night color palette used throughout the raft UI. */
export const COLORS = {
  /** Primary accent - blue, used for selected items, links, primary actions */
  blue: "#7aa2f7",
  /** Success/positive - green, used for approved, merged, added lines */
  green: "#9ece6a",
  /** Secondary accent - purple, used for repo names, stack indicators */
  purple: "#bb9af7",
  /** Error/danger - red, used for failed, deleted, errors */
  red: "#f7768e",
  /** Warning/caution - yellow/amber, used for draft, pending, in-progress */
  yellow: "#e0af68",
  /** Body text - light blue-gray */
  text: "#c0caf5",
  /** Secondary text - muted blue-gray */
  textSecondary: "#9aa5ce",
  /** Muted/disabled text - dim gray */
  textMuted: "#6b7089",
  /** Subtle borders and dividers */
  border: "#292e42",
  /** Slightly lighter surface for hover/selection */
  surface: "#292e42",
  /** Active/focused surface */
  surfaceActive: "#414868",
  /** Main background */
  bg: "#1a1b26",
  /** Diff added line background */
  diffAdded: "#1a2e1a",
  /** Diff removed line background */
  diffRemoved: "#2e1a1a",
  /** Diff context background */
  diffContext: "#3b3d57",
  /** Separator/rule color */
  separator: "#565f89",
} as const

/** Layout constants to avoid magic numbers throughout components. */
export const LAYOUT = {
  /** Lines reserved for header, tabs, search, detail panel in ls view */
  headerReservedLines: 9,
  /** Offset for list area start */
  listOffset: 7,
  /** Default panel split ratio (panel takes this fraction of width) */
  defaultSplitRatio: 0.6,
  /** Min panel split ratio */
  minSplitRatio: 0.3,
  /** Max panel split ratio */
  maxSplitRatio: 0.8,
  /** Split ratio step when resizing */
  splitStep: 0.1,
} as const
