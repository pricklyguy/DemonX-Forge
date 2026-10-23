import { cpSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const here = dirname(fileURLToPath(import.meta.url));
const PIN = '75261cd79733fe47cf898b54f865e6bfaffa1129';
const checkOnly = process.argv.includes('--check');
const sourceArg = process.argv.find((arg) => !arg.startsWith('--') && arg !== process.argv[0] && arg !== process.argv[1]);
const source = resolve(sourceArg ?? join(here, 'solidcraft'));

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function replaceNextUnpatched(text, before, after) {
  const replacedRanges = [];
  if (after.includes(before)) {
    let cursor = 0;
    while (true) {
      const start = text.indexOf(after, cursor);
      if (start < 0) break;
      replacedRanges.push([start, start + after.length]);
      cursor = start + after.length;
    }
  }
  let cursor = 0;
  while (true) {
    const start = text.indexOf(before, cursor);
    if (start < 0) return text;
    const end = start + before.length;
    if (!replacedRanges.some(([rangeStart, rangeEnd]) => start >= rangeStart && end <= rangeEnd)) {
      return text.slice(0, start) + after + text.slice(end);
    }
    cursor = end;
  }
}

const head = execFileSync('git', ['-C', source, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
assert(head === PIN, `SolidCraft source must be pinned at ${PIN}; found ${head}`);

const edits = [
  ['crates/io/src/lib.rs',
    'pub const LEGACY_DESIGN_EXT: &str = "solvecraft";\n/// Every extension a design file may have, current first.\npub const DESIGN_EXTS: [&str; 2] = [DESIGN_EXT, LEGACY_DESIGN_EXT];',
    'pub const LEGACY_DESIGN_EXT: &str = "solvecraft";\n/// Forge-branded extension for the unchanged native design container.\npub const FORGE_DESIGN_EXT: &str = "dxforge";\n/// Every extension a design file may have, current first.\npub const DESIGN_EXTS: [&str; 3] = [FORGE_DESIGN_EXT, DESIGN_EXT, LEGACY_DESIGN_EXT];'],
  ['crates/io/src/lib.rs',
    '/// Is this a design file name (`.solidcraft`, or the legacy extension), any case?',
    '/// Is this a native design file name (`.dxforge`, `.solidcraft`, or `.solvecraft`), any case?'],
  ['crates/io/src/lib.rs',
    '"solidcraft" | "solvecraft" | "json" => Format::Design,',
    '"dxforge" | "solidcraft" | "solvecraft" | "json" => Format::Design,'],
  ['crates/io/src/lib.rs',
    '        assert_eq!(Format::from_name("new.solidcraft").unwrap(), Format::Design);\n        assert!(is_design_path("/d/old.SOLVECRAFT") && is_design_path("new.solidcraft") && !is_design_path("a.step"));',
    '        assert_eq!(Format::from_name("new.solidcraft").unwrap(), Format::Design);\n        assert_eq!(Format::from_name("new.dxforge").unwrap(), Format::Design);\n        assert!(is_design_path("/d/old.SOLVECRAFT") && is_design_path("new.solidcraft") && is_design_path("new.DXFORGE") && !is_design_path("a.step"));'],
  ['crates/ui-egui/src/toolbar.rs',
    '// Brand mark: the SolidCraft logo, drawn in code from the SVG\'s own coordinates\n        // (viewBox 357 x 412). Same 20 px height and centre as the old block.\n        {\n            let c = pos2(left + 20.0, r.center().y);\n            crate::icons::glyphs::brand_mark(ui.painter(), c);\n        }',
    '// Forge-owned horizontal wordmark, scaled for compact and full app bars.\n        {\n            let (width, height) = if compact_actions { (112.0, 17.0) } else { (150.0, 22.0) };\n            let centre = pos2(left + 8.0 + width / 2.0, r.center().y);\n            let rect = Rect::from_center_size(centre, vec2(width, height));\n            let texture = demonx_forge_wordmark(ui.ctx());\n            ui.painter().image(texture.id(), rect, Rect::from_min_max(pos2(0.0, 0.0), pos2(1.0, 1.0)), egui::Rgba::WHITE.into());\n        }'],
  ['crates/ui-egui/src/toolbar.rs',
    '        let mut x = left + if compact_actions { 56.0 } else { 128.0 };',
    '        let mut x = left + if compact_actions { 140.0 } else { 172.0 };'],
  ['apps/solidcraft/src/main.rs', '.with_title("SolidCraft")', '.with_title("DemonX Forge")'],
  ['apps/solidcraft/src/main.rs',
    '                        io::DESIGN_EXT,\n                        io::LEGACY_DESIGN_EXT,\n                        "json",',
    '                        io::FORGE_DESIGN_EXT,\n                        io::DESIGN_EXT,\n                        io::LEGACY_DESIGN_EXT,\n                        "json",'],
  ['apps/solidcraft/src/main.rs',
    '.add_filter("SolidCraft design (container or JSON)", &[io::DESIGN_EXT, io::LEGACY_DESIGN_EXT, "json"])',
    '.add_filter("DemonX Forge and SolidCraft designs (container or JSON)", &[io::FORGE_DESIGN_EXT, io::DESIGN_EXT, io::LEGACY_DESIGN_EXT, "json"])'],
  ['apps/solidcraft/src/main.rs',
    'if exts == [io::DESIGN_EXT, "json"] {\n                if name.ends_with(".json") {\n                    dialog.add_filter("Plain JSON design", &["json"]).add_filter("SolidCraft container", &[io::DESIGN_EXT])\n                } else {\n                    dialog.add_filter("SolidCraft container", &[io::DESIGN_EXT]).add_filter("Plain JSON design", &["json"])\n                }',
    'if exts == [io::FORGE_DESIGN_EXT, io::DESIGN_EXT, "json"] {\n                let container_filter = &[io::FORGE_DESIGN_EXT, io::DESIGN_EXT];\n                if name.ends_with(".json") {\n                    dialog.add_filter("Plain JSON design", &["json"]).add_filter("DemonX Forge / SolidCraft container", container_filter)\n                } else {\n                    dialog.add_filter("DemonX Forge / SolidCraft container", container_filter).add_filter("Plain JSON design", &["json"])\n                }'],
  ['crates/ui-egui/src/toolbar.rs',
    'save_as_with_extension(app, solidcraft_engine::io::DESIGN_EXT);',
    'save_as_with_extension(app, solidcraft_engine::io::FORGE_DESIGN_EXT);'],
  ['crates/ui-egui/src/toolbar.rs',
    'app.pick_save(&name, &[solidcraft_engine::io::DESIGN_EXT, "json"], |app, path| {',
    'app.pick_save(&name, &[solidcraft_engine::io::FORGE_DESIGN_EXT, solidcraft_engine::io::DESIGN_EXT, "json"], |app, path| {'],
  ['crates/ui-egui/src/toolbar.rs',
    '/// File > Download design (browser build): the open design as a `.solidcraft` file download.',
    '/// File > Download design (browser build): the open design as a `.dxforge` file download.'],
  ['crates/ui-egui/src/toolbar.rs',
    'let name = format!("{}.{}", app.session.doc.name, solidcraft_engine::io::DESIGN_EXT);',
    'let name = format!("{}.{}", app.session.doc.name, solidcraft_engine::io::FORGE_DESIGN_EXT);'],
  ['crates/ui-egui/src/toolbar.rs',
    'assert_eq!(got[0].0, "Plate.solidcraft");',
    'assert_eq!(got[0].0, "Plate.dxforge");'],
  ['crates/ui-egui/src/toolbar.rs',
    '    /// File › Export STL… and Export 3MF… both open the Save as mesh dialog with their format',
    `    #[test]
    fn save_as_defaults_to_dxforge_and_writes_native_container() {
        let mut h = crate::scenario::Harness::new();
        h.app.run("solid.box", json!({"length":2,"width":3,"height":4})).unwrap();
        let dir = h.dir.clone();
        let requested = std::rc::Rc::new(std::cell::RefCell::new(Vec::<(String, Vec<String>)>::new()));
        let capture = requested.clone();
        h.app.services.pick_save = Some(Box::new(move |name, extensions| {
            capture.borrow_mut().push((name.to_string(), extensions.iter().map(|extension| extension.to_string()).collect()));
            Box::pin(std::future::ready(Some(dir.join(name).to_string_lossy().into_owned())))
        }));
        h.frames(3);
        h.step(&json!({"click":{"handle":"appbar:folder"}})).unwrap();
        h.step(&json!({"widget":"Save As…"})).unwrap();
        h.settle();
        let requested = requested.borrow();
        assert_eq!(requested[0].0, "Untitled.dxforge");
        assert_eq!(requested[0].1, ["dxforge", "solidcraft", "json"]);
        let saved = h.app.session.path.as_deref().unwrap();
        let bytes = std::fs::read(saved).unwrap();
        assert!(solidcraft_engine::io::is_design_container(&bytes));
        assert_eq!(solidcraft_engine::io::read_design(&bytes).unwrap(), *h.app.session.doc);
    }

    /// File › Export STL… and Export 3MF… both open the Save as mesh dialog with their format`],
  ['crates/ui-egui/src/home.rs',
    '        h.add_recent("/d/5.solidcraft");\n        assert_eq!(h.recent.len(), MAX_RECENT);',
    '        h.add_recent("/d/19.dxforge");\n        h.add_recent("/d/5.solidcraft");\n        assert!(h.recent.contains(&"/d/19.dxforge".to_string()), "recent-file paths preserve the Forge extension");\n        assert_eq!(h.recent.len(), MAX_RECENT);'],
  ['crates/ui-egui/src/toolbar.rs',
    '/// The browser build\'s File > Download design hands the open design to the host as a\n    /// `.solidcraft` container named after it; a host that saves real files shows no such item.',
    '/// The browser build\'s File > Download design hands the open design to the host as a\n    /// `.dxforge` container named after it; a host that saves real files shows no such item.'],
  ['apps/solidcraft/src/main.rs', '    let mut control_port: Option<u16> = solidcraft_engine::geom::env::var("CONTROL_PORT").and_then(|p| p.parse().ok());', '    let mut control_port: Option<u16> = solidcraft_engine::geom::env::var("CONTROL_PORT").and_then(|p| p.parse().ok());\n    let mut forge_control = false;'],
  ['apps/solidcraft/src/main.rs', '            "--control" => control_port = args.next().and_then(|p| p.parse().ok()),', '            "--control" => control_port = args.next().and_then(|p| p.parse().ok()),\n            "--forge-mcp" => {\n                forge_control = true;\n                control_port = Some(0);\n            }'],
  ['apps/solidcraft/src/main.rs', 'if files.is_empty() && !sample && control_port.is_none() {', 'if files.is_empty() && !sample && (control_port.is_none() || forge_control) {'],
  ['apps/solidcraft/src/main.rs', '                take_focus_unwanted: control_port.is_some(),', '                take_focus_unwanted: control_port.is_some() && !forge_control,'],
  ['apps/solidcraft/src/main.rs', 'usage: solidcraft [--control PORT] [--sample] [--crash-log] [--safe-mode] [design.solidcraft | part.step]', 'usage: solidcraft [--forge-mcp | --control PORT] [--sample] [--crash-log] [--safe-mode] [design.solidcraft | part.step]'],
  ['apps/solidcraft/src/main.rs',
    '#[cfg(not(target_os = "macos"))]\n#[path = "../../../assets/icons/app/shared/source/app_icon.rs"]\nmod app_icon;',
    '// Forge-owned window icon; supplied by this prototype overlay.'],
  ['apps/solidcraft/src/main.rs',
    'egui::IconData { rgba: app_icon::rgba(64).map_err(|e| eframe::Error::AppCreation(std::io::Error::other(e).into()))?, width: 64, height: 64 };',
    'forge_icon()?;'],
  ['apps/solidcraft/src/main.rs',
    '        assert_eq!(icon.rgba, super::app_icon::rgba(64).expect("original mark"));',
    '        assert_eq!(icon.rgba.len(), 64 * 64 * 4);'],
  ['apps/solidcraft/src/main.rs',
    'fn app_viewport() -> Result<egui::ViewportBuilder, eframe::Error> {',
    'fn forge_icon() -> Result<egui::IconData, eframe::Error> {\n    let image = image::load_from_memory(include_bytes!("../../../assets/icons/app/shared/source/demonx-forge-icon.png"))\n        .map_err(|e| eframe::Error::AppCreation(std::io::Error::other(e).into()))?\n        .resize_exact(64, 64, image::imageops::FilterType::Lanczos3)\n        .into_rgba8();\n    Ok(egui::IconData { rgba: image.into_raw(), width: 64, height: 64 })\n}\n\nfn app_viewport() -> Result<egui::ViewportBuilder, eframe::Error> {'],
  ['apps/solidcraft/Cargo.toml', 'log = { workspace = true }', 'log = { workspace = true }\nimage = { workspace = true }'],
  ['xtask/Cargo.toml', 'serde_json = { workspace = true }', 'serde_json = { workspace = true }\nimage = { workspace = true }'],
  ['xtask/src/app_icons.rs',
    'fn draw(path: &Path, size: usize) -> Result<(), String> {\n    let mut c = crate::cargo();\n    c.args(["run", "-q", "--profile", "ci", "-p", "solidcraft-cli", "--", "icon", "--size", &size.to_string(), "--out"]).arg(path);\n    crate::run(c, "solidcraft-cli icon")\n}',
    'fn draw(path: &Path, size: usize) -> Result<(), String> {\n    let image = image::load_from_memory(include_bytes!("../../assets/icons/app/shared/source/demonx-forge-icon.png"))\n        .map_err(|e| e.to_string())?\n        .resize_exact(size as u32, size as u32, image::imageops::FilterType::Lanczos3);\n    image.save_with_format(path, image::ImageFormat::Png).map_err(|e| e.to_string())\n}'],
  ['Cargo.lock', ' "getrandom 0.3.4",\n "hidapi",', ' "getrandom 0.3.4",\n "hidapi",\n "image",'],
  ['Cargo.lock', 'name = "xtask"\nversion = "0.19.0"\ndependencies = [\n "proc-macro2",', 'name = "xtask"\nversion = "0.19.0"\ndependencies = [\n "image",\n "proc-macro2",'],
  ['crates/io/src/legacy_dir.rs', '"ai.storyteller.solidcraft"', '"com.pricklyguy.demonxforge"'],
  ['crates/io/src/legacy_dir.rs', '"ai.storyteller.solvecraft"', '"com.pricklyguy.demonxforge.legacy"'],
  ['apps/solidcraft/src/main.rs', 'eframe::storage_dir("SolidCraft")', 'eframe::storage_dir("DemonX Forge")'],
  ['apps/solidcraft/src/main.rs', '    adopt_legacy_settings();', '    // DemonX Forge keeps its profile independent from SolidCraft and older SolveCraft installs.'],
  ['crates/engine/src/recovery.rs', 'Some(env("LOCALAPPDATA")?.join("SolidCraft"))', 'Some(env("LOCALAPPDATA")?.join("DemonX Forge"))'],
  ['crates/engine/src/recovery.rs', 'Some(env("HOME")?.join("Library/Application Support/SolidCraft"))', 'Some(env("HOME")?.join("Library/Application Support/DemonX Forge"))'],
  ['crates/engine/src/recovery.rs', '?.join("solidcraft"))', '?.join("demonx-forge"))'],
  ['crates/engine/src/recovery.rs', '("SolidCraft", "SolveCraft")', '("DemonX Forge", "DemonX Forge Legacy")'],
  ['crates/engine/src/recovery.rs', 'else { ("solidcraft", "solvecraft") }', 'else { ("demonx-forge", "demonx-forge-legacy") }'],
  ['crates/engine/src/cmd/component_link.rs',
    'path: a .solidcraft design → a new component linked to it, holding its solid bodies as placed in that design;',
    'path: a .dxforge or .solidcraft design → a new component linked to it, holding its solid bodies as placed in that design;'],
  ['crates/engine/src/cmd/component_link.rs',
    'path: a saved .solidcraft design — replaces the source and linked bodies for all its occurrences,',
    'path: a saved .dxforge or .solidcraft design — replaces the source and linked bodies for all its occurrences,'],
  ['crates/engine/src/cmd/component_link.rs',
    'if !file.extension().and_then(|e| e.to_str()).is_some_and(|e| e.eq_ignore_ascii_case("solidcraft")) {\n        return Err(bad(cmd, "choose a saved .solidcraft design"));',
    'if !file.extension().and_then(|e| e.to_str()).is_some_and(|e| ["dxforge", "solidcraft"].iter().any(|x| e.eq_ignore_ascii_case(x))) {\n        return Err(bad(cmd, "choose a saved .dxforge or .solidcraft design"));'],
  ['crates/engine/src/cmd/component_relink_tests.rs',
    '    let old = dir.join("old.solidcraft");\n    let moved = dir.join("moved.solidcraft");',
    '    let old = dir.join("old.dxforge");\n    let moved = dir.join("moved.dxforge");'],
  ['crates/engine/src/cmd/component_relink_tests.rs',
    'assert_eq!(result["previous_path"], "old.solidcraft");\n    assert_eq!(result["path"], "moved.solidcraft");',
    'assert_eq!(result["previous_path"], "old.dxforge");\n    assert_eq!(result["path"], "moved.dxforge");'],
  ['crates/engine/src/cmd/component_relink_tests.rs',
    'assert_eq!(run(&mut reopened, "component.links", json!({}))["links"][0]["path"], "moved.solidcraft");',
    'assert_eq!(run(&mut reopened, "component.links", json!({}))["links"][0]["path"], "moved.dxforge");'],
  ['assets/platforms/linux/ai.storyteller.solidcraft.desktop',
    'Name=SolidCraft',
    'Name=DemonX Forge'],
  ['assets/platforms/linux/ai.storyteller.solidcraft.metainfo.xml.in',
    '<name>SolidCraft</name>',
    '<name>DemonX Forge</name>'],
  ['assets/platforms/linux/ai.storyteller.solidcraft.desktop',
    'MimeType=application/x-solidcraft;model/step;',
    'MimeType=application/x-demonxforge;application/x-solidcraft;model/step;'],
  ['assets/platforms/linux/ai.storyteller.solidcraft.mime.xml',
    '  <mime-type type="application/x-solidcraft">',
    '  <mime-type type="application/x-demonxforge">\n    <comment>DemonX Forge design</comment>\n    <icon name="ai.storyteller.solidcraft"/>\n    <sub-class-of type="application/json"/>\n    <glob pattern="*.dxforge"/>\n  </mime-type>\n  <mime-type type="application/x-solidcraft">'],
  ['assets/platforms/linux/ai.storyteller.solidcraft.mime.xml',
    '<glob pattern="*.solidcraft"/>',
    '<glob pattern="*.solidcraft"/>'],
  ['crates/ui-egui/src/home.rs', 'root.join("SolidCraft").join("thumbnails")', 'root.join("DemonX Forge").join("thumbnails")'],
  ['crates/ui-egui/src/prefs.rs', 'theme: String = "dark".into(), PAGE_INTERFACE;', 'theme: String = "demonx-forge-dark".into(), PAGE_INTERFACE;'],
  ['crates/ui-egui/src/theme_files.rs',
    'const BUILTIN: [(&str, &str); 20] = [',
    'const BUILTIN: [(&str, &str); 22] = [\n    ("demonx-forge-dark", include_str!("../../../assets/styles/ui/themes/demonx-forge-dark.json")),\n    ("demonx-forge-light", include_str!("../../../assets/styles/ui/themes/demonx-forge-light.json")),'],
];

for (const [editIndex, [relative, before, after]] of edits.entries()) {
  const path = join(source, relative);
  assert(existsSync(path), `Missing pinned source file: ${relative}`);
  const text = readFileSync(path, 'utf8').replace(/\r\n/g, '\n');
  const hasAfter = text.includes(after);
  const hasBefore = text.includes(before);
  const legacyWordmark = relative === 'crates/ui-egui/src/toolbar.rs' && before.startsWith('// Brand mark:')
    ? '// Forge-owned horizontal wordmark, scaled for compact and full app bars.\n        {\n            let (width, height) = if compact_actions { (100.0, 15.0) } else { (132.0, 19.0) };\n            let centre = pos2(left + 8.0 + width / 2.0, r.center().y);\n            let rect = Rect::from_center_size(centre, vec2(width, height));\n            let texture = demonx_forge_wordmark(ui.ctx());\n            ui.painter().image(texture.id(), rect, Rect::from_min_max(pos2(0.0, 0.0), pos2(1.0, 1.0)), egui::Rgba::WHITE.into());\n        }'
    : undefined;
  assert(hasBefore || hasAfter || (legacyWordmark && text.includes(legacyWordmark)), `Overlay anchor ${editIndex + 1} drift in ${relative}: expected a recorded before/after snippet`);
  // Several overlays intentionally target repeated match arms in one file.
  // Replace each remaining source anchor even if a prior replacement already
  // introduced the same `after` snippet elsewhere in the file.
  if (!checkOnly && hasBefore && before !== after) {
    const updated = replaceNextUnpatched(text, before, after);
    if (updated !== text) writeFileSync(path, updated);
  } else if (!checkOnly && legacyWordmark && text.includes(legacyWordmark)) {
    writeFileSync(path, text.replace(legacyWordmark, after));
  }
}

const uxEdits = [
  ['crates/ui-egui/src/toolbar.rs', 'pub const APP_BAR_HEIGHT: f32 = 34.0;', 'pub const APP_BAR_HEIGHT: f32 = 42.0;'],
  ['crates/ui-egui/src/toolbar.rs', 'let (width, height) = if compact_actions { (100.0, 15.0) } else { (132.0, 19.0) };', 'let (width, height) = if compact_actions { (112.0, 17.0) } else { (150.0, 22.0) };'],
  ['crates/ui-egui/src/update.rs', 'pub const REPO: &str = "bherbruck/solidcraft";', 'pub const REPO: &str = "pricklyguy/DemonX-Forge";'],
  ['crates/ui-egui/src/update.rs', 'pub const LATEST_API: &str = "https://api.github.com/repos/bherbruck/solidcraft/releases/latest";', 'pub const LATEST_API: &str = "https://api.github.com/repos/pricklyguy/DemonX-Forge/releases/latest";'],
  ['crates/ui-egui/src/update.rs', 'pub const RELEASES_PAGE: &str = "https://github.com/bherbruck/solidcraft/releases/latest";', 'pub const RELEASES_PAGE: &str = "https://github.com/pricklyguy/DemonX-Forge/releases/latest";'],
  ['crates/ui-egui/src/update.rs', 'const RELEASE_PREFIXES: [&str; 2] = ["https://github.com/bherbruck/solidcraft/releases/", "https://github.com/tangency-labs/solidcraft/releases/"];', 'const RELEASE_PREFIXES: [&str; 1] = ["https://github.com/pricklyguy/DemonX-Forge/releases/"];'],
  ['crates/ui-egui/src/update.rs', 'unwrap_or_else(|| format!("SolidCraft {tag}"))', 'unwrap_or_else(|| format!("DemonX Forge {tag}"))'],
  ['crates/ui-egui/src/update.rs', 'pub fn available(app: &mut SolveApp) -> bool {\n    !app.updater.off && (app.updater.feed.is_some() || (app.services.http_get.is_some() && app.updater.kind().checks()))\n}', 'pub fn available(app: &mut SolveApp) -> bool {\n    // The inherited SolidCraft installer replaces binaries in place and is not safe for Forge\'s immutable version directories. Keep its updater hidden until the Forge package manager is wired.\n    if std::env::var_os("DEMONX_FORGE_NATIVE_MANAGED").is_some() {\n        return false;\n    }\n    !app.updater.off && (app.updater.feed.is_some() || (app.services.http_get.is_some() && app.updater.kind().checks()))\n}'],
  ['crates/ui-egui/src/toolbar.rs',
    '/// Panels shown on each tab (in order). Commands come from the registry by (tab, panel).',
    `/// Load the Forge wordmark once for this egui context.
fn demonx_forge_wordmark(ctx: &egui::Context) -> egui::TextureHandle {
    let key = egui::Id::new("demonx-forge-wordmark");
    if let Some(texture) = ctx.data(|data| data.get_temp::<egui::TextureHandle>(key)) {
        return texture;
    }
    let raster = image::load_from_memory(include_bytes!("../../../assets/icons/app/shared/source/demonx-forge-wordmark.png"))
        .expect("Forge wordmark is a valid image")
        .to_rgba8();
    let size = [raster.width() as usize, raster.height() as usize];
    let image = egui::ColorImage::from_rgba_unmultiplied(size, raster.as_raw());
    let texture = ctx.load_texture("demonx-forge-wordmark", image, egui::TextureOptions::LINEAR);
    ctx.data_mut(|data| data.insert_temp(key, texture.clone()));
    texture
}

/// Panels shown on each tab (in order). Commands come from the registry by (tab, panel).`],
  ['crates/ui-egui/src/toolbar.rs',
    `        if !compact_actions {
            ui.painter().text(
                pos2(left + 36.0, r.center().y),
                Align2::LEFT_CENTER,
                "SolidCraft",
                crate::fonts::semibold(t.font_heading),
                t.app_bar_text,
            );
        }`,
    '        // The Forge wordmark is the complete product identity in the app bar.'],
  ['crates/ui-egui/src/prefs.rs', '    #[default]\n    Axes,\n    Cube,', '    Axes,\n    #[default]\n    Cube,'],
  ['crates/ui-egui/src/prefs.rs',
    '        assert_eq!(p.navigator_style, super::NavigatorStyle::Axes);',
    '        assert_eq!(p.navigator_style, super::NavigatorStyle::Cube);'],
  ['crates/ui-egui/src/prefs.rs',
    '        assert_eq!(old.navigator_style, NavigatorStyle::Axes);\n        let mut h = crate::scenario::Harness::new();\n        assert!(crate::scenario::handle_at("axis_view:z").is_some());',
    '        assert_eq!(old.navigator_style, NavigatorStyle::Cube);\n        assert_eq!(Prefs::default().navigator_style, NavigatorStyle::Cube);\n        let mut h = crate::scenario::Harness::new();\n        assert!(crate::scenario::handle_at("navigation_cube:front").is_some());\n        h.call("ui.prefs", json!({"navigator_style":"axes"}));\n        assert!(crate::scenario::handle_at("axis_view:z").is_some());'],
  ['crates/ui-egui/src/prefs.rs',
    '        assert_eq!(h.app.preferences.navigator_style, NavigatorStyle::Axes);\n        h.call("ui.prefs", json!({"button":"cancel"}));',
    '        assert_eq!(h.app.preferences.navigator_style, NavigatorStyle::Cube);\n        h.call("ui.prefs", json!({"button":"cancel"}));'],
  ['crates/ui-egui/src/prefs.rs',
    'app.ui.dark && app.preferences.theme == "dark" &&',
    'app.ui.dark && app.preferences.theme == "demonx-forge-dark" &&'],
  ['crates/ui-egui/src/toolbar.rs',
    'let compact_actions = r.right() - left < 640.0;',
    'let compact_actions = r.right() - left < 760.0;'],
  ['crates/ui-egui/src/viewport_overlays_tests.rs',
    'fn compass_keeps_signed_targets_hover_and_clicks_at_both_scales() {\n    for mode in [LayoutMode::Floating, LayoutMode::Docked] {\n        for scale in [1.0, 2.0] {\n            let mut h = Harness::new();',
    'fn compass_keeps_signed_targets_hover_and_clicks_at_both_scales() {\n    for mode in [LayoutMode::Floating, LayoutMode::Docked] {\n        for scale in [1.0, 2.0] {\n            let mut h = Harness::new();\n            h.call("ui.prefs", json!({"navigator_style":"axes"}));'],
  ['crates/ui-egui/src/viewport_overlays_tests.rs',
    'fn compass_circle_grabs_on_hover_and_the_home_chip_points() {\n    let mut h = Harness::new();',
    'fn compass_circle_grabs_on_hover_and_the_home_chip_points() {\n    let mut h = Harness::new();\n    h.call("ui.prefs", json!({"navigator_style":"axes"}));'],
  ['crates/ui-egui/src/viewport.rs',
    '    if sketch_plane.is_some() || (app.ui.show_grid && !active_view(app).hide_grid) {',
    '    if app.ui.show_grid && (sketch_plane.is_some() || !active_view(app).hide_grid) {'],
  ['crates/ui-egui/src/viewport.rs',
    '        // An open sketch always has its grid on its own plane; otherwise the ground plane: XY with',
    '        // When enabled, an open sketch grid lies on its own plane; otherwise the ground plane: XY with'],
  ['crates/ui-egui/src/viewport.rs',
    '    /// An open sketch always has its grid, on its own plane, whatever the Grid switch and the\n    /// follow-the-view preference say; outside a sketch the switch decides.',
    '    /// The Grid switch controls the grid both in an open sketch and in the model view.'],
  ['crates/ui-egui/src/viewport.rs',
    '        app.ui.show_grid = false;\n        let grid = |app: &SolveApp| build_sketch_scene(app, &projection(app, rect)).under;\n        assert!(grid(&app).is_empty(), "no grid outside a sketch with the switch off");\n        app.run("sketch.create", json!({"plane": "XZ"})).unwrap();\n        for follows in [false, true] {\n            app.preferences.grid_follows_view = follows;\n            let under = grid(&app);\n            assert!(!under.is_empty(), "the open sketch shows a grid (follows the view: {follows})");',
    '        app.ui.show_grid = true;\n        let grid = |app: &SolveApp| build_sketch_scene(app, &projection(app, rect)).under;\n        assert!(!grid(&app).is_empty(), "the model view shows the grid when enabled");\n        app.run("sketch.create", json!({"plane": "XZ"})).unwrap();\n        for follows in [false, true] {\n            app.preferences.grid_follows_view = follows;\n            let under = grid(&app);\n            assert!(!under.is_empty(), "the open sketch shows a grid when enabled (follows the view: {follows})");\n            app.ui.show_grid = false;\n            assert!(grid(&app).is_empty(), "the Sketch Grid switch hides the open sketch grid");\n            app.ui.show_grid = true;'],
  ['crates/ui-egui/tests/icon_audit.rs',
    '        let expected = std::fs::read_to_string(&path).unwrap_or_default();',
    '        let expected = std::fs::read_to_string(&path).unwrap_or_default().replace("\\r\\n", "\\n");'],
];

const scenarioEdits = [
  ['crates/ui-egui/tests/scenarios/axis_view_hover.json',
    '[\n  {\n    "note": "Signed axis tips own one highlight at a time and choose principal views."',
    '[\n  {"call":"ui.prefs","params":{"navigator_style":"axes"}},\n  {\n    "note": "Signed axis tips own one highlight at a time and choose principal views."'],
  ['crates/ui-egui/tests/scenarios/axis_view_y_up.json',
    '      "up_axis": "y"\n    }',
    '      "up_axis": "y",\n      "navigator_style": "axes"\n    }'],
  ['crates/ui-egui/tests/scenarios/prefs_theme_files.json',
    '"theme": "dark"',
    '"theme": "demonx-forge-dark"'],
  ['crates/ui-egui/tests/scenarios/s45_preferences.json',
    '"theme": "dark"',
    '"theme": "demonx-forge-dark"'],
  ['crates/ui-egui/tests/scenarios/prefs_theme_files.json',
    '"prefs:theme:gruvbox-dark"',
    '"prefs:theme:demonx-forge-dark"'],
  ['crates/ui-egui/tests/scenarios/prefs_theme_files.json',
    '"theme": "gruvbox-dark"',
    '"theme": "demonx-forge-dark"'],
  ['crates/ui-egui/tests/scenarios/two_point_shapes_drawn_by_dragging.json',
    '  {"drag": [{"sketch": [10, 10]}, {"sketch": [40, 30]}], "steps": 8},\n  {"expect":',
    '  {"drag": [{"sketch": [10, 10]}, {"sketch": [40, 30]}], "steps": 8},\n  {"key":"Enter"},\n  {"expect":'],
  ['crates/ui-egui/tests/scenarios/two_point_shapes_drawn_by_dragging.json',
    '  {"drag": [{"sketch": [-30, 10]}, {"sketch": [-20, 10]}], "steps": 8},\n  {"expect":',
    '  {"drag": [{"sketch": [-30, 10]}, {"sketch": [-20, 10]}], "steps": 8},\n  {"key":"Enter"},\n  {"expect":'],
  ['crates/ui-egui/tests/scenarios/prefs_theme_files.json',
    '"theme": "dark"',
    '"theme": "demonx-forge-dark"'],
  ['crates/ui-egui/tests/scenarios/s45_preferences.json',
    '"theme": "dark"',
    '"theme": "demonx-forge-dark"'],
];

const scriptUiEdits = [
  ['crates/ui-egui/src/lib.rs', 'pub mod fonts;', 'pub mod fonts;\npub mod forge_scripts;'],
  ['crates/ui-egui/src/lib.rs', '    pub help: help::HelpState,', '    pub help: help::HelpState,\n    /// Native Forge scripts library and transactional runner.\n    pub forge_scripts: forge_scripts::Manager,'],
  ['crates/ui-egui/src/lib.rs', '            help: help::HelpState::default(),', '            help: help::HelpState::default(),\n            forge_scripts: forge_scripts::Manager::default(),'],
  ['crates/ui-egui/src/lib.rs', '        prefs_notice::show(self, ui.ctx());', '        prefs_notice::show(self, ui.ctx());\n        crate::forge_scripts::show(self, ui.ctx());'],
  ['crates/ui-egui/src/lib.rs', '            req.started.store(true, std::sync::atomic::Ordering::Relaxed);', '            if self.home.open && control_job::changes_the_design(&req.method) {\n                self.home.open = false;\n            }\n            req.started.store(true, std::sync::atomic::Ordering::Relaxed);'],
  ['crates/ui-egui/src/lib.rs', '            control::Outcome::Screenshot { .. } if window_hidden(ctx) => {', '            control::Outcome::Deferred => {}\n            control::Outcome::Screenshot { .. } if window_hidden(ctx) => {'],
  ['crates/ui-egui/src/control_job.rs', 'matches!(method, "engine.execute" | "command" | "engine.script" | "engine.batch")', 'matches!(method, "engine.execute" | "command" | "engine.script" | "engine.batch" | "forge.script.run")'],
  ['apps/solidcraft/src/control_server.rs', 'let wait = if patient || method == "engine.batch" { waits.long } else { waits.short };', 'let wait = if patient || matches!(method.as_str(), "engine.batch" | "forge.script.run") { waits.long } else { waits.short };'],
  ['crates/ui-egui/src/help.rs', '        "about" => app.help.about = true,', '        "about" => app.help.about = true,\n        "scripts" => app.forge_scripts.open(),'],
  ['crates/ui-egui/src/help.rs', '                        ("about", "About SolidCraft", "help"),', '                        ("about", "About DemonX Forge", "help"),\n                        ("scripts", "Scripts & Add-Ins…", "code"),'],
  ['crates/ui-egui/src/control.rs', '    Screenshot { path: Option<String> },\n}', '    Screenshot { path: Option<String> },\n    /// The native script runner will send the control reply when its transaction finishes.\n    Deferred,\n}'],
  ['crates/ui-egui/src/control.rs', 'pub fn handle(app: &mut SolveApp, ctx: &egui::Context, req: &ControlRequest) -> Outcome {\n    let scope = match request_scope(app, &req.params) {', 'pub fn handle(app: &mut SolveApp, ctx: &egui::Context, req: &ControlRequest) -> Outcome {\n    if req.method == "forge.script.run" {\n        if app.file_load.busy() || app.file_picker_busy() || app.applying.is_some() || app.deferred.is_some() || app.tool.is_some() || app.dialog.is_some() {\n            return err("Finish or close the active command or file operation before running a script");\n        }\n        let Some(script) = req.params.get("script") else { return err("missing script object") };\n        let text = match serde_json::to_string(script) { Ok(text) => text, Err(error) => return err(format!("invalid script object: {error}")) };\n        return match app.forge_scripts.start_external(&mut app.session, &text, req.reply.clone()) {\n            Ok(()) => Outcome::Deferred,\n            Err(error) => err(error),\n        };\n    }\n    let scope = match request_scope(app, &req.params) {'],
  ['crates/ui-egui/src/agent_cursor.rs', '        crate::control::Outcome::Screenshot { .. } => json!({"ok": false, "error": "not a command"}),', '        crate::control::Outcome::Screenshot { .. } => json!({"ok": false, "error": "not a command"}),\n        crate::control::Outcome::Deferred => json!({"ok": false, "error": "not a command"}),'],
  ['crates/ui-egui/src/control.rs', '                Outcome::Screenshot { path } => json!({"ok": true, "screenshot": path}),', '                Outcome::Screenshot { path } => json!({"ok": true, "screenshot": path}),\n                Outcome::Deferred => panic!("test helper received a deferred response"),'],
  ['crates/ui-egui/src/control.rs', '                Outcome::Screenshot { .. } => Value::Null,', '                Outcome::Screenshot { .. } => Value::Null,\n                Outcome::Deferred => Value::Null,'],
  ['crates/ui-egui/src/scenario.rs', '            Outcome::Screenshot { .. } => json!({"ok": true, "result": null}),', '            Outcome::Screenshot { .. } => json!({"ok": true, "result": null}),\n            Outcome::Deferred => json!({"ok": true, "result": null}),'],
  ['crates/ui-egui/src/toolbar.rs', '        // Assistant, Settings, Help and Report a bug form the right-hand cluster.', '        // Assistant, Settings, Help and Report a bug form the right-hand cluster.'],
];

for (const [editIndex, [relative, before, after]] of scriptUiEdits.entries()) {
  const path = join(source, relative);
  const text = readFileSync(path, 'utf8').replace(/\r\n/g, '\n');
  const formattedScriptHandler = relative === 'crates/ui-egui/src/control.rs'
    && before.startsWith('pub fn handle(app: &mut SolveApp, ctx: &egui::Context, req: &ControlRequest) -> Outcome')
    && text.includes('if req.method == "forge.script.run"');
  const formattedOutcome = relative === 'crates/ui-egui/src/control.rs'
    && before.includes('Screenshot { path: Option<String>')
    && text.includes('    Deferred,');
  const hasAfter = text.includes(after) || formattedScriptHandler || formattedOutcome;
  const hasBefore = text.includes(before);
  assert(hasBefore || hasAfter, `Script UI overlay anchor ${editIndex + 1} drift in ${relative}`);
  if (!checkOnly && hasBefore && before !== after) {
    const updated = replaceNextUnpatched(text, before, after);
    if (updated !== text) writeFileSync(path, updated);
  }
}

// The application and icon generator both consume the `image` crate. Older versions of this
// overlay inserted that dependency every time it ran, which could leave duplicate TOML keys in a
// reused build clone. Normalize those owned entries so repeated package runs stay valid.
for (const relative of ['apps/solidcraft/Cargo.toml', 'xtask/Cargo.toml']) {
  const path = join(source, relative);
  const text = readFileSync(path, 'utf8').replace(/\r\n/g, '\n');
  const normalized = text.replace(/^(image = \{ workspace = true \}\n)(?:image = \{ workspace = true \}\n)+/gm, '$1');
  assert(checkOnly ? text === normalized : true, `duplicate Forge image dependency in ${relative}; rerun the overlay to normalize it`);
  if (!checkOnly && text !== normalized) writeFileSync(path, normalized);
}

const mainPath = join(source, 'apps/solidcraft/src/main.rs');
let mainText = readFileSync(mainPath, 'utf8').replace(/\r\n/g, '\n');
const forgeControlArm = '            "--forge-mcp" => {\n                forge_control = true;\n                control_port = Some(0);\n            }\n';
const dedupedIcons = mainText.replace(/(fn forge_icon\(\) -> Result<egui::IconData, eframe::Error> \{[\s\S]*?\n\})(?:\s*\1)+/g, '$1');
assert(checkOnly ? dedupedIcons === mainText : true, 'duplicate Forge window icon helpers in apps/solidcraft/src/main.rs; rerun the overlay to normalize them');
mainText = dedupedIcons;
for (const [pattern, replacement, label] of [
  [/    let mut forge_control = false;\n(?:    let mut forge_control = false;\n)+/, '    let mut forge_control = false;\n', 'MCP control flag'],
  [/            "--forge-mcp" => \{\n                forge_control = true;\n                control_port = Some\(0\);\n            \}\n(?:            "--forge-mcp" => \{\n                forge_control = true;\n                control_port = Some\(0\);\n            \}\n)+/, forgeControlArm, 'MCP argument arm'],
]) {
  const normalized = mainText.replace(pattern, replacement);
  assert(checkOnly ? normalized === mainText : true, `duplicate ${label} in apps/solidcraft/src/main.rs; rerun the overlay to normalize it`);
  mainText = normalized;
}
if (!checkOnly) writeFileSync(mainPath, mainText);

const controlTestPath = join(source, 'crates/ui-egui/src/control.rs');
const deferredTestArm = '            Outcome::Screenshot { .. } => panic!("ui.render took a screenshot"),';
const deferredTestArmWithReply = `${deferredTestArm}\n            Outcome::Deferred => panic!("ui.render deferred a control reply"),`;
const controlTestText = readFileSync(controlTestPath, 'utf8').replace(/\r\n/g, '\n');
assert(controlTestText.includes(deferredTestArm) || controlTestText.includes(deferredTestArmWithReply), 'deferred script reply test-arm anchor drift in control.rs');
const normalizedControlTestText = controlTestText.replace(/(\n {12}Outcome::Deferred => panic!\("ui\.render deferred a control reply"\),){2,}/g, '\n            Outcome::Deferred => panic!("ui.render deferred a control reply"),');
if (checkOnly) {
  assert(normalizedControlTestText === controlTestText, 'duplicate deferred script reply test arms in control.rs; apply the Forge overlay to normalize them');
} else {
  const withDeferredReply = normalizedControlTestText.includes(deferredTestArmWithReply)
    ? normalizedControlTestText
    : normalizedControlTestText.replaceAll(deferredTestArm, deferredTestArmWithReply);
  if (withDeferredReply !== controlTestText) writeFileSync(controlTestPath, withDeferredReply);
}

const controlWaitPath = join(source, 'crates/ui-egui/src/lib.rs');
const waitVariants = [
  'let waits = self.file_load.busy() || self.file_picker.is_some() || self.control_job.is_some() || self.agent.busy();',
  'let waits = self.file_load.busy()\n                || self.file_picker.is_some()\n                || self.control_job.is_some()\n                || self.agent.busy();',
  'let waits = self.file_load.busy()\n                || self.file_picker.is_some()\n                || self.control_job.is_some()\n                || self.agent.busy()\n                || self.forge_scripts.run.is_some();',
  'let waits = self.file_load.busy() || self.file_picker.is_some() || self.control_job.is_some() || self.agent.busy() || self.forge_scripts.run.is_some();',
];
const waitText = readFileSync(controlWaitPath, 'utf8').replace(/\r\n/g, '\n');
assert(waitVariants.some((variant) => waitText.includes(variant)), 'Script runner control-serialization anchor drift in crates/ui-egui/src/lib.rs');
if (!checkOnly && ![waitVariants[2], waitVariants[3]].some((variant) => waitText.includes(variant))) {
  const before = waitVariants.slice(0, 2).find((variant) => waitText.includes(variant));
  const after = before.includes(' || ')
    ? before.replace(' || self.agent.busy();', ' || self.agent.busy() || self.forge_scripts.run.is_some();')
    : before.replace('                || self.agent.busy();', '                || self.agent.busy()\n                || self.forge_scripts.run.is_some();');
  writeFileSync(controlWaitPath, waitText.replace(before, after));
}

for (const [editIndex, [relative, before, after]] of uxEdits.entries()) {
  const path = join(source, relative);
  const text = readFileSync(path, 'utf8').replace(/\r\n/g, '\n');
  const hasAfter = text.includes(after);
  const hasBefore = text.includes(before);
  assert(hasBefore || hasAfter, `UX overlay anchor ${editIndex + 1} drift in ${relative}`);
  if (!checkOnly && hasBefore && before !== after) {
    const updated = replaceNextUnpatched(text, before, after);
    if (updated !== text) writeFileSync(path, updated);
  }
}

for (const [editIndex, [relative, before, after]] of scenarioEdits.entries()) {
  const path = join(source, relative);
  const text = readFileSync(path, 'utf8').replace(/\r\n/g, '\n');
  const hasAfter = text.includes(after);
  const hasBefore = text.includes(before);
  assert(hasBefore || hasAfter, `Scenario overlay anchor ${editIndex + 1} drift in ${relative}`);
  if (!checkOnly && hasBefore && before !== after) {
    let updated = text;
    while (true) {
      const next = replaceNextUnpatched(updated, before, after);
      if (next === updated) break;
      updated = next;
    }
    if (updated !== text) writeFileSync(path, updated);
  }
}

const interactionTestPatch = join(here, 'patches/sketch-live-input-ui-tests.patch');
const interactionTests = join(source, 'crates/ui-egui/src/sketch_dims_tests.rs');
const interactionTestMarker = 'mouse_drag_rectangle_accepts_exact_live_dimensions_and_undoes_as_one_shape';
const hasInteractionTests = readFileSync(interactionTests, 'utf8').includes(interactionTestMarker);
if (checkOnly) {
  if (!hasInteractionTests) execFileSync('git', ['-C', source, 'apply', '--check', interactionTestPatch]);
} else if (!hasInteractionTests) {
  execFileSync('git', ['-C', source, 'apply', interactionTestPatch]);
}

const sketchDimsTests = join(source, 'crates/ui-egui/src/sketch_dims_tests.rs');
const dimensionVisibilityMarker = 'the typed width remains a driving sketch dimension';
const dimensionVisibilityBefore = '    assert!((profiles[0].area - 288.0).abs() < 1e-6, "typed width × height must determine the profile area");\n    assert_eq!(h.app.session.undo.len(), undo + 1, "the mouse gesture and dimensions form one undo step");';
const dimensionVisibilityAfter = '    assert!((profiles[0].area - 288.0).abs() < 1e-6, "typed width × height must determine the profile area");\n    let driving_values: Vec<_> = sketch.constraints.iter().filter(|constraint| constraint.param.is_some()).filter_map(|constraint| constraint.kind.value()).collect();\n    assert!(driving_values.iter().any(|value| (value - 24.0).abs() < 1e-6), "the typed width remains a driving sketch dimension: {driving_values:?}");\n    assert!(driving_values.iter().any(|value| (value - 12.0).abs() < 1e-6), "the typed height remains a driving sketch dimension: {driving_values:?}");\n    h.frames(2);\n    assert_eq!(crate::dim_view::drawn().len(), 2, "width and height labels remain visible after confirming the rectangle");\n    assert_eq!(h.app.session.undo.len(), undo + 1, "the mouse gesture and dimensions form one undo step");';
const sketchDimsText = readFileSync(sketchDimsTests, 'utf8').replace(/\r\n/g, '\n');
assert(checkOnly || sketchDimsText.includes(dimensionVisibilityBefore) || sketchDimsText.includes(dimensionVisibilityMarker), 'rectangle dimension visibility test anchor drifted');
if (!checkOnly && !sketchDimsText.includes(dimensionVisibilityMarker)) writeFileSync(sketchDimsTests, sketchDimsText.replace(dimensionVisibilityBefore, dimensionVisibilityAfter));

const lineDragPatch = join(here, 'patches/sketch-line-drag.patch');
const viewport = join(source, 'crates/ui-egui/src/viewport.rs');
const lineDragMarker = '|| t.cmd == "sketch.line") && t.pts.is_empty()';
const hasLineDrag = readFileSync(viewport, 'utf8').includes(lineDragMarker);
if (checkOnly) {
  if (!hasLineDrag) execFileSync('git', ['-C', source, 'apply', '--check', lineDragPatch]);
} else if (!hasLineDrag) {
  execFileSync('git', ['-C', source, 'apply', lineDragPatch]);
}

const planeSelectionPatch = join(here, 'patches/sketch-plane-selection.patch');
const dialogs = join(source, 'crates/ui-egui/src/dialogs.rs');
const planeSelectionMarker = 'dialog:origin-plane:dropdown';
const hasPlaneSelection = readFileSync(dialogs, 'utf8').includes(planeSelectionMarker);
if (checkOnly) {
  if (!hasPlaneSelection) execFileSync('git', ['-C', source, 'apply', '--check', planeSelectionPatch]);
} else if (!hasPlaneSelection) {
  execFileSync('git', ['-C', source, 'apply', planeSelectionPatch]);
}

const releaseConfirmPatch = join(here, 'patches/sketch-release-to-confirm.patch');
const releaseConfirmMarker = 'A real drag leaves the second point as a live';
const hasReleaseConfirm = readFileSync(viewport, 'utf8').includes(releaseConfirmMarker);
if (checkOnly) {
  if (!hasReleaseConfirm) execFileSync('git', ['-C', source, 'apply', '--check', releaseConfirmPatch]);
} else if (!hasReleaseConfirm) {
  execFileSync('git', ['-C', source, 'apply', releaseConfirmPatch]);
}

if (!checkOnly) {
  const themes = join(source, 'assets/styles/ui/themes');
  cpSync(join(here, 'branding/demonx-forge-dark.json'), join(themes, 'demonx-forge-dark.json'));
  cpSync(join(here, 'branding/demonx-forge-light.json'), join(themes, 'demonx-forge-light.json'));
  cpSync(join(here, '..', 'assets/DemonX_Emblem.png'), join(source, 'assets/icons/app/shared/source/demonx-forge-icon.png'));
  cpSync(join(here, 'branding/demonx-forge-wordmark.png'), join(source, 'assets/icons/app/shared/source/demonx-forge-wordmark.png'));
  cpSync(join(here, 'scripts/forge_scripts.rs'), join(source, 'crates/ui-egui/src/forge_scripts.rs'));
}

process.stdout.write(`${checkOnly ? 'Overlay anchors verified' : 'DemonX Forge overlay applied'} at ${head}\n`);
