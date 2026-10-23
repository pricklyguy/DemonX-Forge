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

## Verification record

Implementation and acceptance status is tracked in [ROADMAP.md](ROADMAP.md) and the feature
matrix. Required checks are:

1. IO tests classify all three extensions and map each to native design format.
2. Native Save As presents `.dxforge` by default and writes the same native container.
3. Installed real-engine acceptance saves and reopens `.dxforge`, then saves and reopens
   `.solidcraft` while preserving bodies and parametric history.
4. Windows installation writes `.dxforge` ProgID/open/icon values while preserving existing
   `.solidcraft` defaults; Linux desktop and MIME metadata validate with both types present.
5. The source overlay can be checked and applied twice to a fresh pinned clone.

Checks not run on the current host are explicitly left unverified in the roadmap.
