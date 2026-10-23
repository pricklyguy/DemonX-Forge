# DemonX Forge product identity and public-release preparation

**Official repository decision:** retain `pricklyguy/DemonX-Forge`. The native channel lives here
under `native-v*` tags and `native-preview` metadata. Do not move native releases into the shared
`DemonX` repository. This preparation is private; it does not publish a release, change visibility,
merge native code to `main`, enable automatic updates, or replace the installed app.

## Product-facing audit

The pinned engine at `prototype/solidcraft` is an upstream submodule and is not edited in place.
Forge-specific identity is applied by `prototype/apply-overlay.mjs` to a throwaway source clone.
Names such as Cargo package/crate names, Rust module paths, CLI compatibility commands, file-format
identifiers, and engine-specific debug logs may retain `SolidCraft` when changing them would break
the engine ABI, file compatibility, diagnostics, or attribution.

| Surface | Finding and disposition |
|---|---|
| Window, app bar, icon, settings and recovery paths | Forge identity and Forge-owned icon/wordmark are already applied by the overlay. Keep legacy upstream data paths isolated; do not adopt them as Forge profile data. |
| About and Help | Brand About in both the Help menu and home/navigation view. Help now opens the official Forge repository until a product manual is published. About shows the independent Forge version and retains a separate SolidCraft engine version in copied diagnostics. The About license list must include Forge GPL, upstream MIT and Apache texts, NOTICE, attribution, and third-party licenses. |
| Bug reports and crash reports | Send editable issue drafts only to `https://github.com/pricklyguy/DemonX-Forge/issues/new`. Brand generated error headings and identify engine/version/commit only in technical diagnostics. Drafts remain user reviewed; no issue is submitted automatically. |
| Updates and release links | Query only `pricklyguy/DemonX-Forge`, accept only signed `native-v*` tags with channel `native-preview`, and link to the Forge releases page. The pinned minisign public key remains required; automatic checks stay disabled unless explicitly compiled in after acceptance. |
| Version scheme | Forge release semver uses `MAJOR.MINOR.PATCH-preview.N`, for example `0.1.0-preview.1`, with Git tag `native-v0.1.0-preview.1`. `DEMONX_FORGE_VERSION` supplies app/About/update identity. `CARGO_PKG_VERSION` remains the pinned engine version and is shown only in technical diagnostics. The release ID is keyed to Forge version plus Forge commit; the manifest retains the engine commit as provenance. |
| Windows package identity | The managed package exposes `DemonXForge.exe`, `DemonX Forge.cmd`, `DemonX Forge.ico`, the Forge Start-menu entry, `.dxforge` association, and `DemonX-Forge-native-windows-x64-portable.zip`. Upstream Cargo target names and bundled CLI names remain build/runtime internals. |
| Scripts and user messages | Forge-authored install/update scripts use Forge product names. References to the SolidCraft CLI in upstream troubleshooting/build recipes describe the underlying engine tool and remain explicitly technical. Continue checking visible failure strings whenever upstream UI code is upgraded. |
| Documentation | No standalone public native manual exists yet. The Help item points to the official repository landing page. The installer, package README, and this private preparation guide are not substitutes for a finished user manual. |
| Platform metadata | The managed Windows package uses the Forge name/icon and registry ProgID. Linux desktop/MIME metadata is patched for Forge, but a Linux package and installed runtime remain unverified; macOS/Flatpak/MSI upstream recipes are not used by the managed Windows package and must not be presented as supported Forge installers. |
| Artwork | The Windows app icon is generated from Forge-owned `web/public/forge-mark.png`; the toolbar uses the Forge-owned wordmark. Do not copy upstream SolidCraft artwork into Forge branding. Retain required third-party font/theme attribution. |

### Remaining visible-name audit boundary

Search the complete generated package (including strings/resources), the installed Windows UI, shell
menus, Add/Remove Programs metadata if introduced, file associations, update dialogs, About, all
error flows, crash and bug drafts, installer logs, CLI help, and package readmes after each overlay
change. Inspect localized messages: upstream localized keys may not match the changed English
labels and should fall back cleanly to branded English. Do not globally replace `SolidCraft` in the
submodule; it would alter notices, legal attribution, engine identifiers, and technical provenance.

The build binary produced by Cargo is still named `solidcraft.exe` inside the isolated build tree;
the managed package stages the actual GUI executable as `DemonXForge.exe`. This is an implementation
detail and does not change the submodule checkout or existing installation.

## Licensing and redistribution review

The repository's root `LICENSE` is GPL-3.0-or-later for Forge-authored code. The pinned SolidCraft
source declares MIT OR Apache-2.0 and includes `LICENSE-MIT`, `LICENSE-APACHE`, `NOTICE`, and
`ATTRIBUTION.md`. Its generated `THIRD-PARTY-LICENSES.txt` enumerates 560 locked crates at the
pinned revision, including nonstandard licenses; the source also records fonts, bundled/vendor
changes, and adapted sibling-project code. The Windows package bundles the GPL text, MIT/Apache
texts, NOTICE, third-party license inventory, and Node runtime license. `ATTRIBUTION.md` is copied
into the managed Windows package and rendered in the About panel.

Before public binary redistribution, make the exact corresponding Forge and engine source
available from an equally accessible location, with build/overlay instructions and the same pinned
submodule revision. GPLv3 permits binary conveyance when its applicable source and notice
conditions are met; network distribution must provide equivalent access to corresponding source.
The About screen must present the appropriate GPL legal notice and a convenient license view. Keep
the permissive upstream notices and third-party terms intact. Review licenses for the exact release
dependency graph, generated assets, fonts, and bundled tools, and resolve every unknown/prohibited
license before publication. Sources: [GNU GPLv3 text](https://www.gnu.org/licenses/gpl.en.html),
[GNU GPL FAQ](https://www.gnu.org/licenses/gpl-faq.en.html).

**Recommendation:** public redistribution is not approved yet. The existing inventory is a strong
starting point, but it is not the final legal release review. The private engine submodule also
means public binary distribution cannot depend on the current submodule URL alone for corresponding
source; publish the exact Forge overlay and engine source together (or provide another durable,
equivalent source route) as part of the approved preview.

## Non-destructive React Forge archive plan

1. Preserve the current repository's complete Git object graph, all branches, tags, and React release
   tags. Never filter/rewrite history or delete old release tags/assets as part of native migration.
2. Inventory every React GitHub release, tag, attached asset, release note, and known-good rollback
   package. Export a Git mirror and `git bundle --all` to separately backed-up storage; record bundle
   and asset SHA-256 hashes. Keep the React rollback instructions and asset links in the repository.
3. Keep React commits/tags/releases in their current official repository. Add a clearly dated
   `archive/react-forge` branch only if a clean browseable code snapshot is useful; point it at the
   exact preserved React commit and do not create a second, misleading release channel.
4. Keep existing `v*` React tags/releases unchanged. Native update discovery must filter `native-v*`
   and validate signed metadata, not use generic `latest`.
5. Before any visibility or ownership change, separately test access to archived source, tags and
   release assets from a non-collaborator account. A backup bundle is recovery, not a replacement
   for normal GitHub archival access.

## Pre-publication security and repository-history checklist

Run against a disposable full mirror and preserve the audit evidence. A clean current tree alone is
insufficient: making a private repository public can expose old commits, refs, release objects,
metadata, and artifacts.

- [ ] Enumerate all branches, remote refs, annotated/lightweight tags, unreachable/dangling objects,
  Git LFS pointers/objects, submodules and their URLs, and all historical paths.
- [ ] Scan the full reachable and recoverable Git history for credentials, private keys, tokens,
  personal data, private designs, internal URLs, local paths, proprietary files, and generated
  binaries. Include deleted files and old commit messages. Revoke any found credentials; do not
  merely delete them from HEAD. Use a separately reviewed history rewrite only if necessary and
  only after the archive bundle is verified.
- [ ] Inventory GitHub releases and assets, prereleases/drafts, Actions artifacts and caches,
  workflow logs, packages/containers, Pages, wiki, discussions/issues/PRs, deployment records,
  secret/variable names, environments, branch rules, webhooks, and forks. Confirm no private token
  or signing material appears in logs, artifacts, or build output.
- [ ] Verify the private minisign key exists only in protected `native-preview` environment secret
  `DEMONX_FORGE_MINISIGN_SECRET_KEY` and encrypted offline backups. Never commit it, upload it as an
  artifact, expose it as an Actions output, or store it in release assets. The repository variable
  `DEMONX_FORGE_UPDATE_PUBLIC_KEY` is public verification material only.
- [ ] Verify least-privilege Actions permissions and environment required reviewers; confirm source
  checkout uses the read-only `SOLIDCRAFT_READ_TOKEN` secret and does not persist checkout
  credentials. Review pinned actions, external downloads, build outputs and workflow logs.
- [ ] Publish exact corresponding source, overlay, pinned engine source, dependency/license
  inventory, build instructions, notices, and the matching package digest alongside any binary.
- [ ] Confirm issue drafts contain only user-reviewed diagnostics and no design attachment or secret
  by default; the application must not submit issues automatically.
- [ ] Obtain owner approval for repository visibility, exact source commit, exact signed artifact,
  archive inventory, and public preview notes. Do not conflate public availability of source with
  a binary release approval.

## Approval gates and readiness decision

Keep signed release exercises private or in an access-controlled repository/environment until the
owner separately approves a public preview. The owner approved continuing implementation only. A
real signed release test must use an isolated install root/profile and the installed GUI; verify
download discovery, invalid signature/hash/channel/version rejection, dirty-document deferral,
successful update, failed-start rollback, previous-version retention, and MCP reconnection. Keep
the current known-good installation untouched as rollback.

When those Windows checks pass, report **Windows native preview readiness** separately from **Linux
release readiness**. Linux remains unverified until its package, installed update/rollback, MCP,
branding, and legal-notice path passes. Do not enable automatic update checks or publish until the
explicit approval gate is complete.
