# Connecting an AI to DemonX Forge (MCP)

DemonX Forge has an MCP server. MCP (the Model Context Protocol) is the standard way for an AI program to use another program's tools. With it,
Claude, OpenAI's Codex or any other MCP client can look at the design you have open in Forge, add sketches and features, take a picture to check
its work, and undo. You watch it happen in the Forge window (it refreshes by itself within a couple of seconds), and Ctrl+Z takes any of it back.

**Not tested with the real programs yet.** This was checked with a script that speaks the protocol and with a real browser and the real engine
(see `e2e/mcp.mjs`), not yet with Claude Desktop, Claude Code or Codex themselves. The steps below are what their documentation describes; menus and
file names move, so if a step looks different, check the client's own MCP page. Tell me what you find and I will fix this page.

## How it works, and what it will not do

- The MCP server is a small program (`mcp.mjs`, in the Windows package) that the AI program **starts itself** and talks to over standard input and
  output. It does not open a port. It talks to the Forge that is already running on this computer (`http://127.0.0.1:8120`).
- **Forge must be running** (double-click `Start DemonX Forge.bat`) before the AI uses it. If it is not, the AI is told "Forge is not running".
- It can: read the design, list the modelling commands, run modelling commands (sketch, extrude, fillet, hole, patterns, Mesh to Solid ...), measure,
  take a screenshot, change a parameter, undo and redo.
- It **cannot** open, save, export, import or delete files, and cannot start a new design: those are not offered, and the Forge server refuses file
  commands, including engine sketch import/export and text commands that may read a font by path, parameter import/export, timeline script export,
  and linked component commands that read design files. Use the checked Forge file routes instead.
  **Save your work yourself** (File > Save): Forge keeps the design in memory and an AI edit is not saved
  until you save.
- Everything stays on this computer. What the AI sends to its own company (Anthropic, OpenAI) is whatever it reads from the design, for example
  names, sizes and screenshots. Do not connect it to a design you may not share.

## The tools

| Tool | What it does |
|---|---|
| `forge_get_design` | Bodies (size, face and edge counts), sketches, timeline, parameters. With `detail: "full"` also every face and edge (the numbers commands refer to) and every sketch's curves. |
| `forge_list_commands` | The commands it may run, with their parameters. Give a `filter` such as `fillet`. |
| `forge_run_commands` | Runs commands in order as one batch. If one fails, none are kept and the reason comes back. |
| `forge_query` | Read-only questions: a feature's definition, what depends on it, components. |
| `forge_measure` | Volume, area, centre of mass, bounding box. |
| `forge_screenshot` | A picture (PNG) of the design: `view` iso, front, top, ... |
| `forge_set_parameter` | Change a named parameter; what depends on it follows. |
| `forge_undo`, `forge_redo` | Step back and forward. |

## The command every client starts

In the Windows package, with Forge installed in `C:\DemonX-Forge` (change the paths below if you put it somewhere else):

```
C:\DemonX-Forge\node\node.exe C:\DemonX-Forge\launcher.mjs mcp
```

That one line is what every client below is told to start. (Using `launcher.mjs` means the path keeps working when Forge updates itself.) From a
source checkout use `npx tsx server/src/mcp.ts` in the folder of the repository (not `npm run`, which prints extra lines that would confuse the
client).

Forge on another port? Set `FORGE_PORT=8121` (or `FORGE_URL=http://127.0.0.1:8121`) in the environment the client starts it with.

**Try it by hand first** (optional): open Command Prompt, run the line above, type this and press Enter, and you should get one line of JSON back:

```
{"jsonrpc":"2.0","id":1,"method":"tools/list"}
```

Press Ctrl+C to leave.

## Claude Desktop

1. Close Claude Desktop completely (also from the tray icon).
2. Open (create it if it is not there) `%APPDATA%\Claude\claude_desktop_config.json` in Notepad. In Claude Desktop this is also under Settings >
   Developer > Edit Config. (If Desktop came from the Microsoft Store, the file is under
   `%LOCALAPPDATA%\Packages\Claude_<letters>\LocalCache\Roaming\Claude\` instead; Edit Config opens the right one.)
3. Put this in it. If the file already has an `"mcpServers"` section, add just the `"forge"` part inside it. Backslashes are doubled in JSON:

```json
{
  "mcpServers": {
    "forge": {
      "command": "C:\\DemonX-Forge\\node\\node.exe",
      "args": ["C:\\DemonX-Forge\\launcher.mjs", "mcp"]
    }
  }
}
```

4. Start Claude Desktop again. The tools appear under the tools (or connectors) button of a new chat as "forge". Start Forge first.
5. Try: *"Look at my open design in Forge and tell me what is in it."* then *"Make a 60 x 40 x 8 mm plate with four 5 mm holes 6 mm in from the corners, and show me a screenshot."*

## Claude Code (the command line program)

```
claude mcp add --scope user forge -- C:\DemonX-Forge\node\node.exe C:\DemonX-Forge\launcher.mjs mcp
claude mcp list
```

The `--scope user` (before the name `forge`, never after the `--`) makes it available in every folder, not just the current one. Inside Claude Code, `/mcp` shows whether it is connected.

## Claude on the web or phone (claude.ai)

Not possible with this server. Those connect only to MCP servers that are on the internet at an https address. Forge runs only on your computer, by
design (anyone who could reach it could change your design).

## OpenAI Codex (the command line program)

```
codex mcp add forge -- C:\DemonX-Forge\node\node.exe C:\DemonX-Forge\launcher.mjs mcp
codex mcp list
```

Or by hand, in `~/.codex/config.toml` (on Windows `C:\Users\<you>\.codex\config.toml`). Single quotes in TOML keep the backslashes as they are:

```toml
[mcp_servers.forge]
command = 'C:\DemonX-Forge\node\node.exe'
args = ['C:\DemonX-Forge\launcher.mjs', 'mcp']
```

OpenAI's page on this: <https://developers.openai.com/codex/mcp>.

## OpenAI's Agents SDK (your own Python program)

```python
import asyncio
from agents import Agent, Runner
from agents.mcp import MCPServerStdio

async def main():
    async with MCPServerStdio(params={
        "command": r"C:\DemonX-Forge\node\node.exe",
        "args": [r"C:\DemonX-Forge\launcher.mjs", "mcp"],
    }) as forge:
        agent = Agent(name="CAD helper", instructions="You design parts in DemonX Forge. Call forge_get_design first, check your work with forge_screenshot.", mcp_servers=[forge])
        result = await Runner.run(agent, "Add a 5 mm hole in the middle of the top face of the part.")
        print(result.final_output)

asyncio.run(main())
```

## ChatGPT (the app or website) and OpenAI's hosted MCP tool

Not possible with this server, for the same reason as Claude on the web: they need an MCP server reachable on the internet over https. Please do
**not** put Forge on the internet to get around this: it has no password, because it is meant for one computer only.

## Tips

- Say what you want in plain words and the dimensions in millimetres (Z is up). Ask it to **check its work with a screenshot** and to **read
  `forge_list_commands` before it uses a command it is not sure about**.
- Small steps work better than one huge request. Ctrl+Z in Forge steps back through what it did, one step at a time (a batch can be several steps).
- A mesh (an imported STL) has no faces to select: ask it to run Mesh to Solid first, or press the button yourself.
- If it breaks something, Ctrl+Z, or File > Open your last save.

## If it does not work

| What you see | Why, and what to do |
|---|---|
| The client says the server failed or has no tools | Run the command line by hand (see "Try it by hand"). A "cannot find" message means a wrong path: check that `C:\DemonX-Forge\launcher.mjs` and `node\node.exe` exist. In JSON files the backslashes must be doubled. |
| "Connection closed" right away, and `launcher.mjs` is older than your version | Forge installs from before 0.21 never refreshed `launcher.mjs` when they updated, and an old one does not know `mcp`. Download the newest zip and extract it to `C:\` over the folder (your designs and settings are kept), or copy `launcher.mjs` from the zip over the old one. From 0.21 on Forge refreshes it by itself. |
| A tool answers "Forge is not running at ..." | Start `Start DemonX Forge.bat` and try again. |
| It works but your window does not change | The window checks every two seconds and only while you are not in the middle of a dialog or a sketch. Finish or cancel what you are doing. |
| "Command not allowed" | It tried a file command or something that is not a modelling command. That is on purpose. |
| After a Forge update the AI stops working | Restart the AI program: it keeps the old server open. |
