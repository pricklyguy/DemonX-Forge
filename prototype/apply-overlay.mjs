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

const head = execFileSync('git', ['-C', source, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
assert(head === PIN, `SolidCraft source must be pinned at ${PIN}; found ${head}`);

const edits = [
  ['crates/ui-egui/src/toolbar.rs',
    '// Brand mark: the SolidCraft logo, drawn in code from the SVG\'s own coordinates\n        // (viewBox 357 x 412). Same 20 px height and centre as the old block.\n        {\n            let c = pos2(left + 20.0, r.center().y);\n            crate::icons::glyphs::brand_mark(ui.painter(), c);\n        }',
    '// Forge-owned horizontal wordmark, scaled for compact and full app bars.\n        {\n            let (width, height) = if compact_actions { (100.0, 15.0) } else { (132.0, 19.0) };\n            let centre = pos2(left + 8.0 + width / 2.0, r.center().y);\n            let rect = Rect::from_center_size(centre, vec2(width, height));\n            let texture = demonx_forge_wordmark(ui.ctx());\n            ui.painter().image(texture.id(), rect, Rect::from_min_max(pos2(0.0, 0.0), pos2(1.0, 1.0)), egui::Rgba::WHITE.into());\n        }'],
  ['crates/ui-egui/src/toolbar.rs',
    '        let mut x = left + if compact_actions { 56.0 } else { 128.0 };',
    '        let mut x = left + if compact_actions { 140.0 } else { 172.0 };'],
  ['apps/solidcraft/src/main.rs', '.with_title("SolidCraft")', '.with_title("DemonX Forge")'],
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
  ['Cargo.lock', ' "getrandom 0.3.4",\n "hidapi",', ' "getrandom 0.3.4",\n "hidapi",\n "image",'],
  ['crates/io/src/legacy_dir.rs', '"ai.storyteller.solidcraft"', '"com.pricklyguy.demonxforge"'],
  ['crates/io/src/legacy_dir.rs', '"ai.storyteller.solvecraft"', '"com.pricklyguy.demonxforge.legacy"'],
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
  assert(hasBefore || hasAfter, `Overlay anchor ${editIndex + 1} drift in ${relative}: expected a recorded before/after snippet`);
  if (!checkOnly && hasBefore && !hasAfter) writeFileSync(path, text.replace(before, after));
}

const uxEdits = [
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
];

for (const [editIndex, [relative, before, after]] of uxEdits.entries()) {
  const path = join(source, relative);
  const text = readFileSync(path, 'utf8').replace(/\r\n/g, '\n');
  const hasAfter = text.includes(after);
  const hasBefore = text.includes(before);
  assert(hasBefore || hasAfter, `UX overlay anchor ${editIndex + 1} drift in ${relative}`);
  if (!checkOnly && hasBefore && !hasAfter) writeFileSync(path, text.replace(before, after));
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

const lineDragPatch = join(here, 'patches/sketch-line-drag.patch');
const viewport = join(source, 'crates/ui-egui/src/viewport.rs');
const lineDragMarker = '|| t.cmd == "sketch.line") && t.pts.is_empty()';
const hasLineDrag = readFileSync(viewport, 'utf8').includes(lineDragMarker);
if (checkOnly) {
  if (!hasLineDrag) execFileSync('git', ['-C', source, 'apply', '--check', lineDragPatch]);
} else if (!hasLineDrag) {
  execFileSync('git', ['-C', source, 'apply', lineDragPatch]);
}

if (!checkOnly) {
  const themes = join(source, 'assets/styles/ui/themes');
  cpSync(join(here, 'branding/demonx-forge-dark.json'), join(themes, 'demonx-forge-dark.json'));
  cpSync(join(here, 'branding/demonx-forge-light.json'), join(themes, 'demonx-forge-light.json'));
  cpSync(join(here, '..', 'assets/DemonX_Emblem.png'), join(source, 'assets/icons/app/shared/source/demonx-forge-icon.png'));
  cpSync(join(here, 'branding/demonx-forge-wordmark.png'), join(source, 'assets/icons/app/shared/source/demonx-forge-wordmark.png'));
}

process.stdout.write(`${checkOnly ? 'Overlay anchors verified' : 'DemonX Forge overlay applied'} at ${head}\n`);
