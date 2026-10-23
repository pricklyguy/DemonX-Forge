# Native `.dxforge` project branding

## Design decision

New native Forge projects use the `.dxforge` filename extension while keeping SolidCraft's
existing versioned design container and serialization unchanged. File extension is only a product
identity and file-association choice; no container header, schema, feature history, geometry cache,
or migration step is introduced.

Forge recognizes `.dxforge`, `.solidcraft`, and the upstream compatibility extension
`.solvecraft` as native design files. Save As defaults to `.dxforge`; Save retains the active file's
extension. The Open picker, home-page recent files, command-line startup, `doc.open`, and linked
component commands accept both `.dxforge` and `.solidcraft`. Existing recent entries retain their
original path.

## Platform associations

- **Windows:** the per-user installer associates `.dxforge` with the stable Forge launcher and
  Forge project icon. It registers `.solidcraft` and `.solvecraft` under Open With and does not
  replace an existing default handler for either extension. The launcher follows the current
  version pointer, so upgrades do not leave file associations aimed at a retired version folder.
- **Linux:** the native packaging overlay advertises both `application/x-demonxforge` for
  `.dxforge` and the existing `application/x-solidcraft` association for `.solidcraft` and
  `.solvecraft`. The Linux app icon export is generated from Forge's own emblem. Linux package
  execution remains a separate platform acceptance item.

The project format remains the SolidCraft container. `.dxforge` files can be opened by builds
which recognize that container but do not know Forge's extension; those older builds may not list
the file in their filtered Open dialog. Users can continue opening `.solidcraft` copies with older
SolidCraft releases.

## Verification record — 2026-10-23

- `cargo test --locked -p solidcraft-io step_and_design`: 1 passed; extension classification
  includes `.dxforge`, `.solidcraft`, and `.solvecraft`.
- `cargo test --locked -p solidcraft-ui-egui --lib
  save_as_defaults_to_dxforge_and_writes_native_container`: 1 passed; Save As proposes
  `Untitled.dxforge`, offers `.solidcraft` and JSON, and writes a native container.
- `cargo test --locked -p solidcraft-ui-egui --lib recent_list_is_newest_first_and_bounded`:
  1 passed; recent entries retain a `.dxforge` path without rewriting it.
- `cargo test --locked -p solidcraft-engine
  relink_repairs_a_moved_source_for_every_instance_in_one_undo_step`: 1 passed; a linked source
  saved as `.dxforge` is inserted, relinked, and reopened through an assembly with the path intact.
- `cargo check --locked -p solidcraft -p xtask`: passed on Windows MSVC. The package build also
  succeeded from pinned engine commit `75261cd79733fe47cf898b54f865e6bfaffa1129`.
- The pinned-source overlay applied twice and its check mode passed. The repeat-application check
  also confirmed the deferred control test arm is not duplicated.
- The installed release `0.19.0-forge-437c4651a50b-engine-75261cd79733` passed
  `prototype/native-acceptance.mjs`: three-body sketch/extrude/fillet/history workflow, save/reopen
  of `.dxforge` and `.solidcraft`, mesh exports, all nine MCP tools, security refusals, MCP
  screenshot, and Python SDK success/rollback plus single-undo behavior.
- The signed-in Windows user hive contains the `.dxforge` Forge ProgID, stable launcher command,
  and installed Forge icon. `.solidcraft` and `.solvecraft` have Forge Open With entries; the
  installer does not assign their default handler.
- Linux desktop entry, MIME XML, AppStream metadata, and all eight generated Forge icon dimensions
  (16–512 px) validate in the overlaid source. A Linux native build/package/runtime was not run.

The prior Windows release remains retained at
`C:\DemonX-Forge-Native\versions\0.19.0-forge-bcbe72dcbc90-engine-75261cd79733` and is the
current rollback pointer.
