# DemonX Forge: notes for Claude Code

DemonX Forge is a Fusion-style parametric 3D CAD application by Prickly Guy Creations: sketch, constrain, extrude and so on, with a feature timeline and parameters. It is **its own product in its own repository**. It shares the look and feel of DemonX CNC and DemonX Design (colours, dark and light), not their code, and it does not talk to their servers. Hand-off to them is by exported files only (STEP, STL, DXF, SVG).

The owner works on Windows (PowerShell; `npm.ps1` can be blocked by the execution policy, so `npm.cmd` or cmd.exe works), uses Home Assistant and ESPHome for their devices, and dislikes long numbered task lists: keep updates short and ask one question at a time.

## Commands

- `npm install` once. `npm run typecheck` and `npm test` (vitest) must pass before pushing. `npm run build` builds the UI into `web/dist`.
- `npm run dev:server` and `npm run dev:web` for development; `npm start` serves the built app on port 8120.
- The modelling engine is a separate program that is **not in this repo** (see below). Put it where `FORGE_ENGINE` points, or at `data/engine/solidcraft-cli`. Tests that need it skip themselves when it is missing.
- Browser checks live in `e2e/` (Playwright), each with its run instructions in its header. Add or extend one when you change UI behaviour.
- Do not use `pkill -f` to stop a test server (it can kill your own shell). Stop it by port: `fuser -k 8120/tcp`.

## Rules that matter

- **The engine is behind our interface.** Everything modelling-related goes through `server/src/engine/Engine.ts`. Today the one implementation drives SolidCraft's `solidcraft-cli mcp` over stdio. No other file may know about SolidCraft's command names or MCP. If the engine changes or is replaced (OpenCascade is the fallback), only the adapter changes.
- **Clean room.** We work from public documentation, general CAD conventions and observed behaviour. We never reverse engineer Autodesk Fusion or any proprietary CAD program, and we never read or convert its files. Open-source code (SolidCraft is MIT OR Apache-2.0) may be read and used under its licence: keep its notices.
- **Every action is a command** with JSON arguments, so buttons, scripts and AI/MCP tools do the same thing. Same idea as DemonX Design's `design/src/core/commands.ts`.
- **The server decides.** It answers only this computer (loopback address and Host header checked), and validates every request. Never trust the browser. Engine file access stays inside the engine's allowed folders.
- **Silent failures are bugs.** The engine ignores parameters it does not know. Our adapter checks names against the engine's command list and reports unknown ones.
- **Units.** Millimetres and degrees everywhere in the engine; the UI converts for display.
- **Honesty about testing.** Say plainly what was tried (simulator, unit test, real browser, real part) and what was not. PR descriptions say what was run.
- **Privacy.** Never commit personal details (addresses, hostnames, e-mail addresses, file paths of the owner's machine) or anything from `data/`.
- **Look and feel.** Use the DemonX colour variables (`web/src/styles.css`, copied from DemonX CNC) and both dark and light modes. Fusion-style layout: browser tree, viewport, timeline, parameters. No other project's branding.
- **Licence.** GPL-3.0-or-later, same as DemonX. Check the licence before reusing outside code.

## Where the plans live

`docs/PLAN.md` (decisions with dates and reasons, what is next), `docs/evaluation/` (why SolidCraft's engine, what was tried). Chats do not share memory: when you and the owner decide something, write it into `docs/PLAN.md` and commit it.

## Working with pull requests

Work on `main` for the first commits; after that use a branch and open a PR only when asked. The owner merges on the web. Commit messages and PR text follow the attribution lines you are given. Do not put model names in code, comments or PR text.
