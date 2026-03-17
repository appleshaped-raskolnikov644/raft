/**
 * Semantic color token system for raft.
 *
 * New code should use theme tokens (e.g. getTheme().accent.primary)
 * instead of raw hex strings. Existing code is being migrated
 * incrementally - constants.ts COLORS is the legacy source that
 * will eventually be replaced by theme tokens.
 *
 * Tokyo Night is the single shipped theme. The infrastructure exists
 * for future extensibility but we don't waste time on multiple themes
 * when the product needs shipping.
 */

/** Semantic color tokens for a raft theme. */
export interface Theme {
  name: string
  text: {
    primary: string
    secondary: string
    muted: string
  }
  bg: {
    primary: string
    surface: string
    elevated: string
  }
  accent: {
    primary: string
    success: string
    warning: string
    error: string
    info: string
    /** Teal accent for ready/ping states */
    ready: string
  }
  diff: {
    added: string
    removed: string
    context: string
    addedWord: string
    removedWord: string
  }
  border: {
    default: string
    active: string
    subtle: string
  }
  /** Colors for PR lifecycle state badges */
  state: {
    mergeNow: string
    fixReview: string
    pingReviewers: string
    waiting: string
    aiReview: string
    fixCi: string
    draft: string
    blocked: string
  }
  /** Colors for review scan finding severity levels */
  finding: {
    bug: string
    test: string
    security: string
    warning: string
    info: string
  }
  /** Repo name color */
  repo: string
}

/** Tokyo Night color scheme - the default and currently only theme. */
export const tokyoNight: Theme = {
  name: "Tokyo Night",
  text: {
    primary: "#c0caf5",
    secondary: "#9aa5ce",
    muted: "#6b7089",
  },
  bg: {
    primary: "#1a1b26",
    surface: "#292e42",
    elevated: "#414868",
  },
  accent: {
    primary: "#7aa2f7",
    success: "#9ece6a",
    warning: "#e0af68",
    error: "#f7768e",
    info: "#7aa2f7",
    ready: "#73daca",
  },
  diff: {
    added: "#1a2e1a",
    removed: "#2e1a1a",
    context: "#3b3d57",
    addedWord: "#9ece6a",
    removedWord: "#f7768e",
  },
  border: {
    default: "#292e42",
    active: "#414868",
    subtle: "#3b3d57",
  },
  state: {
    mergeNow: "#9ece6a",
    fixReview: "#e0af68",
    pingReviewers: "#73daca",
    waiting: "#e0af68",
    aiReview: "#7aa2f7",
    fixCi: "#f7768e",
    draft: "#6b7089",
    blocked: "#f7768e",
  },
  finding: {
    bug: "#f7768e",
    test: "#e0af68",
    security: "#f7768e",
    warning: "#e0af68",
    info: "#7aa2f7",
  },
  repo: "#bb9af7",
}

/** Get the active theme. Currently always Tokyo Night. */
export function getTheme(): Theme {
  return tokyoNight
}
