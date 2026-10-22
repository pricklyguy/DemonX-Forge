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
    '/// Panels shown on each tab (in order). Commands come from the registry by (tab, panel).',
    '/// Load the Forge-owned application mark once for this egui context.\nfn demonx_forge_mark(ctx: &egui::Context) -> egui::TextureHandle {\n    let key = egui::Id::new("demonx-forge-brand-mark");\n    if let Some(texture) = ctx.data(|data| data.get_temp::<egui::TextureHandle>(key)) {\n        return texture;\n    }\n    let raster = image::load_from_memory(include_bytes!("../../../assets/icons/app/shared/source/demonx-forge-icon.png"))\n        .expect("Forge brand mark is a valid image")\n        .to_rgba8();\n    let size = [raster.width() as usize, raster.height() as usize];\n    let image = egui::ColorImage::from_rgba_unmultiplied(size, raster.as_raw());\n    let texture = ctx.load_texture("demonx-forge-brand-mark", image, egui::TextureOptions::LINEAR);\n    ctx.data_mut(|data| data.insert_temp(key, texture.clone()));\n    texture\n}\n\n/// Panels shown on each tab (in order). Commands come from the registry by (tab, panel).'],
  ['crates/ui-egui/src/toolbar.rs',
    '// Brand mark: the SolidCraft logo, drawn in code from the SVG\'s own coordinates\n        // (viewBox 357 x 412). Same 20 px height and centre as the old block.\n        {\n            let c = pos2(left + 20.0, r.center().y);\n            crate::icons::glyphs::brand_mark(ui.painter(), c);\n        }',
    '// Forge-owned mark and wordmark, sized and aligned with the upstream app bar.\n        {\n            let centre = pos2(left + 20.0, r.center().y);\n            let rect = Rect::from_center_size(centre, vec2(20.0, 20.0));\n            let texture = demonx_forge_mark(ui.ctx());\n            ui.painter().image(texture.id(), rect, Rect::from_min_max(pos2(0.0, 0.0), pos2(1.0, 1.0)), Color32::WHITE);\n        }'],
  ['crates/ui-egui/src/toolbar.rs', '                "SolidCraft",', '                "DemonX Forge",'],
  ['crates/ui-egui/src/toolbar.rs',
    '        let mut x = left + if compact_actions { 56.0 } else { 128.0 };',
    '        let mut x = left + if compact_actions { 56.0 } else { 144.0 };'],
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

if (!checkOnly) {
  const themes = join(source, 'assets/styles/ui/themes');
  cpSync(join(here, 'branding/demonx-forge-dark.json'), join(themes, 'demonx-forge-dark.json'));
  cpSync(join(here, 'branding/demonx-forge-light.json'), join(themes, 'demonx-forge-light.json'));
  cpSync(join(here, '..', 'assets/DemonX_Emblem.png'), join(source, 'assets/icons/app/shared/source/demonx-forge-icon.png'));
}

process.stdout.write(`${checkOnly ? 'Overlay anchors verified' : 'DemonX Forge overlay applied'} at ${head}\n`);
