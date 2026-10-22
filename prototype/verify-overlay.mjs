import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const root = resolve(process.argv[2] ?? join(import.meta.dirname, 'solidcraft'));
const read = (path) => readFileSync(join(root, path), 'utf8');
const main = read('apps/solidcraft/src/main.rs');
const prefs = read('crates/ui-egui/src/prefs.rs');
const io = read('crates/io/src/legacy_dir.rs');
const lock = read('Cargo.lock');
const themeSource = read('crates/ui-egui/src/theme_files.rs');
const toolbar = read('crates/ui-egui/src/toolbar.rs');
const sketchDimensionTests = read('crates/ui-egui/src/sketch_dims_tests.rs');
const viewport = read('crates/ui-egui/src/viewport.rs');
const keys = new Set([...themeSource.matchAll(/\b(?:one|many): \[([\s\S]*?)\]/g)].flatMap(([, block]) => [...block.matchAll(/\b[a-z][a-z0-9_]*\b/g)].map(([name]) => name)));

function requireMatch(value, pattern, label) {
  if (!pattern.test(value)) throw new Error(`Missing DemonX overlay item: ${label}`);
}

requireMatch(main, /\.with_title\("DemonX Forge"\)/, 'window title');
requireMatch(main, /demonx-forge-icon\.png/, 'Forge-owned window icon');
requireMatch(main, /fn forge_icon\(\)/, 'Forge icon loader');
requireMatch(toolbar, /demonx-forge-wordmark/, 'Forge-owned horizontal app bar wordmark');
requireMatch(toolbar, /else \{ 172\.0 \}/, 'app bar spacing for full Forge wordmark');
requireMatch(sketchDimensionTests, /mouse_drag_rectangle_accepts_exact_live_dimensions_and_undoes_as_one_shape/, 'mouse gesture/live dimension regression test');
requireMatch(sketchDimensionTests, /mouse_drag_circle_accepts_an_exact_diameter_without_a_dimension_tool/, 'mouse circle diameter regression test');
requireMatch(sketchDimensionTests, /mouse_drag_line_accepts_length_and_angle_and_escape_cancels_a_following_draw/, 'mouse line angle and cancellation regression test');
requireMatch(viewport, /\|\| t\.cmd == "sketch\.line"\) && t\.pts\.is_empty\(\)/, 'line press/drag/release gesture');
requireMatch(prefs, /theme: String = "demonx-forge-dark"/, 'DemonX dark default');
requireMatch(prefs, /Axes,\s*#\[default\]\s*Cube,/, 'clickable view cube as new-profile default');
requireMatch(prefs, /Prefs::default\(\)\.navigator_style, NavigatorStyle::Cube/, 'view cube default regression assertion');
requireMatch(themeSource, /\("demonx-forge-dark", include_str!/, 'DemonX dark theme registration');
requireMatch(themeSource, /\("demonx-forge-light", include_str!/, 'DemonX light theme registration');
requireMatch(io, /APP_ID: &str = "com\.pricklyguy\.demonxforge"/, 'isolated app data identity');
requireMatch(lock, /\[\[package\]\]\nname = "solidcraft"[\s\S]*?\n "image",/, 'lockfile image dependency');

for (const name of ['demonx-forge-dark', 'demonx-forge-light']) {
  const theme = JSON.parse(readFileSync(new URL(`./branding/${name}.json`, import.meta.url), 'utf8'));
  if (theme.format !== 'solidcraft-theme/1') throw new Error(`${name}: unexpected theme format`);
  for (const key of Object.keys(theme.colors)) if (!keys.has(key)) throw new Error(`${name}: SolidCraft has no theme token named ${key}`);
}

process.stdout.write('DemonX branding, theme tokens, app identity, and locked icon dependency verified.\n');
