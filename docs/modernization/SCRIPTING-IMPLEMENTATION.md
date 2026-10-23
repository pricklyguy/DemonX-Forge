# Native Forge scripting

## Version 1 format

Forge scripts are JSON files with `schema_version: 1`, a name, an optional description, and an
ordered list of native engine commands. Each command uses the same stable id and parameter object
as the SolidCraft command registry; Forge does not implement a second modeling engine.

```json
{
  "schema_version": 1,
  "name": "Scripted mounting plate",
  "description": "Example native modeling operation",
  "commands": [
    {
      "command": "solid.box",
      "params": { "length": 40, "width": 30, "height": 10, "body_name": "Plate" }
    }
  ]
}
```

The native **Help → Scripts & Add-Ins…** window provides a library, JSON editor, import, save,
run, and stop controls. The library lives in the user's data directory (`%LOCALAPPDATA%\DemonX
Forge\Scripts` on Windows, `~/Library/Application Support/DemonX Forge/Scripts` on macOS, and
`$XDG_DATA_HOME/demonx-forge/scripts` or `~/.local/share/demonx-forge/scripts` on Linux). It is
outside versioned installation folders and persists across updates. Import uses the native file
picker and reads only the selected JSON script.

## Validation and permissions

Before Run is enabled, Forge checks the byte and command-count limits, JSON structure and schema
version, command registry membership, implemented status, and typed argument contracts when the
command provides one. Commands must be in an approved modeling or inspection namespace. Body
renaming and selection are supported. Read-only inspection commands are explicitly enumerated;
other non-undoable commands are refused so view state cannot escape the model transaction. Script
permissions reject file/path operations, imports, exports, open/save, visibility/view control,
transaction controls, undo/redo, and nested script execution. The runner also refuses to start
while a sketch is being edited. Each actual engine command performs its own document-state checks;
failures report the 1-based command index, command id, and engine error.

Scripts do not inherit MCP permissions. No script execution tool or unrestricted file access was
added to Forge's established nine-tool MCP contract. MCP requests that change the design are held
while a native script is active.

## Transaction and undo behavior

The runner takes an engine `Session` checkpoint before the first command, executes one command per
UI frame, and shows progress. Stop and command failure restore the checkpoint, including document,
active sketch state, and undo/redo history. Success collapses the script-created undo entries into
one history entry labeled with the script name. Queries do not create undo entries. If checkpoint
restoration itself fails, the UI raises an explicit critical error rather than claiming rollback.

## Boundaries

Version 1 has no loops, variables, arbitrary Python execution, add-in loading, or script access to
filesystem operations. Scripts use explicit engine command parameters and references. The native
Python SDK is a follow-on after runner and compatibility acceptance; it will generate versioned
JSON and submit it through a separately scoped interface rather than executing Python in the CAD
process. Add-ins remain a labeled future feature.

## Verification record

The first native engine regressions cover command/schema/permission validation, transaction
rollback after a real failed fillet, a single undo and redo for a multi-command success, and native
project save/reopen preserving the created feature history. See
[`SCRIPTING-TEST-RESULTS.md`](SCRIPTING-TEST-RESULTS.md) for the commands run, outcomes, installed
build status, and the remaining large-model work. A test is not considered passing until the
reported run completes on the pinned engine build.
