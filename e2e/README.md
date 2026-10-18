# Browser checks

Each script says in its header how to run it. They need the real engine, a built app (`npm run build`) and a fresh server on port 8120.

| Script | What it checks |
|---|---|
| `viewport.mjs` | empty start, demo part, timeline, face picking, parameter edit, drill at a clicked point, undo, error display, theme |

Playwright's Chromium must be installed (`npx playwright install chromium`, or set `PLAYWRIGHT_BROWSERS_PATH`).
