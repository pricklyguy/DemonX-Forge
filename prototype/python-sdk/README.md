# DemonX Forge Python SDK

This optional SDK creates version 1 Forge JSON scripts and submits them through the existing
authenticated Forge MCP bridge. Python runs outside the CAD application; native SolidCraft
commands perform all modeling. A submitted script is one `forge_run_commands` batch, inheriting
the bridge's modeling command allowlist and native all-or-nothing rollback.

## Configure

Requirements: Python 3.10+ and Node.js 22.12+. Forge must be open. On Windows the SDK uses the
stable installed launcher `C:\DemonX-Forge-Native\forge-mcp-native.mjs` by default. Elsewhere, or
for a custom installation, set `FORGE_MCP_LAUNCHER` to the stable `forge-mcp-native.mjs` path.
Set `FORGE_NODE` if the `node` executable is not on `PATH`.

Install the SDK from a Forge checkout with `py -m pip install -e prototype/python-sdk` on Windows
or `python3 -m pip install -e prototype/python-sdk` on Linux/macOS.

The SDK never reads Forge's authentication token, accepts arbitrary filesystem permissions, or
submits raw control-channel requests. The bridge discovers and authenticates to the running app.

## Example

```python
from demonx_forge import ForgeScript, submit

script = ForgeScript("Mounting plate", description="Base plate and four mounting bosses")
script.add("solid.box", length=80, width=50, height=8, body_name="Plate")
script.add("solid.box", length=8, width=8, height=10, corner=[8, 8, 8], operation="join", targets=["Plate"], body_name="Plate")
script.save("mounting-plate.json")  # Also importable in Help > Scripts & Add-Ins.
result = submit(script)             # One atomic Forge MCP batch, at most 200 commands.
print(result)
```

Forge validates command names and parameters against the existing command registry and its MCP
permissions. A failed command reports the failing step; the native batch restores the pre-run
document. Large scripts above 200 commands can be opened in the native Scripts & Add-Ins editor,
which supports up to 10,000 steps and its own checkpointed GUI runner.

## Tests

Run from this directory with `python -m unittest discover -s tests`.
