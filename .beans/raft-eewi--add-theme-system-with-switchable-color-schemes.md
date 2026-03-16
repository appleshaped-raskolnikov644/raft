---
# raft-eewi
title: Add theme system with switchable color schemes
status: todo
type: feature
created_at: 2026-03-16T15:51:37Z
updated_at: 2026-03-16T15:51:37Z
parent: raft-65vd
---

The body and code text colors feel nicer than the rest of the app. Critique has theme switching (30+ themes with live preview picker). We should have a consistent theme system for the entire app.

Requirements:
- Define a theme type with all color roles (text, muted, accent, added, removed, border, background, etc.)
- Create a Tokyo Night theme as default (what we use now, but formalized)
- Add at least 2-3 more themes (e.g. GitHub Light, Catppuccin, Dracula)
- Theme picker accessible via a keybind (t key, like Critique)
- Theme applies globally to all views (ls, stack, log, panel, diffs)
- Persist theme choice across sessions (save to config file)
- Use OpenTUI's Dropdown component for theme picker (Critique does this)

Reference: Critique's theme system with getSyntaxTheme, getResolvedTheme, 30+ themes, live preview on hover
