import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const source = process.argv[2];
const checkOnly = process.argv.includes('--check');
const path = join(source, 'crates/ui-egui/src/toolbar.rs');
let text = readFileSync(path, 'utf8').replace(/\r\n/g, '\n');

const marker = '        // Reserve measured space for the product version and the two Forge-owned controls.';
const start = text.indexOf('        let report_text = crate::i18n::tr("ui.report_a_bug");');
const endMarker = '        if app.custom_titlebar {\n            crate::titlebar::caption_buttons(app, ui, r);\n        }';
const end = start < 0 ? -1 : text.indexOf(endMarker, start);
const replacement = `        // Reserve measured space for the product version and the two Forge-owned controls.
        let full_version = format!("v{}", crate::update::current_version());
        let version_text = if r.width() < 760.0 {
            format!("v{}", crate::update::current_version().split('.').take(2).collect::<Vec<_>>().join("."))
        } else {
            full_version
        };
        let version_font = FontId::proportional(t.font_small);
        let version_galley = ui.painter().layout_no_wrap(version_text.clone(), version_font.clone(), t.app_bar_text);
        let version_visible = r.width() >= 490.0;
        let right = r.right() - captions - 8.0;
        let version_rect = version_visible.then(|| Rect::from_min_size(
            pos2(right - version_galley.size().x, r.center().y - 12.0),
            vec2(version_galley.size().x, 24.0),
        ));
        if let Some(rect) = version_rect {
            ui.painter().text(rect.right_top() + vec2(0.0, 12.0), Align2::RIGHT_CENTER, version_text, version_font, t.app_bar_text);
            crate::scenario::publish_rect("titlebar:version", rect);
        }
        let controls_right = version_rect.map_or(right, |rect| rect.left() - 8.0);
        let control_size = if tiny_actions { 24.0 } else { 32.0 };
        let help_rect = Rect::from_center_size(pos2(controls_right - control_size / 2.0, r.center().y), vec2(control_size, control_size));
        let gear = Rect::from_center_size(pos2(help_rect.left() - 8.0 - control_size / 2.0, r.center().y), vec2(control_size, control_size));
        let cluster_left = gear.left();
        let span = Rect::from_min_max(pos2(x, r.top()), pos2(cluster_left - 8.0, r.bottom()));
        let update = crate::update::button(app, ui, span, true);
        let tabs_end = update.map_or(cluster_left - 8.0, |u| u.left()) - 8.0;
        let tabs_rect = Rect::from_min_max(pos2(tabs_start.min(tabs_end), r.top()), pos2(tabs_end.max(tabs_start), r.bottom()));
        let mut tabs_ui = ui.new_child(egui::UiBuilder::new().max_rect(tabs_rect));
        tabs_ui.set_clip_rect(tabs_rect.intersect(ui.clip_rect()));
        crate::documents::tabs(app, &mut tabs_ui, r, tabs_start, tabs_end.max(tabs_start));

        let gresp = ui.interact(gear, ui.id().with("sc_prefs_button"), Sense::click());
        gresp.widget_info(|| egui::WidgetInfo::labeled(egui::WidgetType::Button, true, app.tr("ui.preferences")));
        if gresp.hovered() || gresp.has_focus() {
            ui.painter().rect_filled(gear.shrink(3.0), t.radius_sm, t.app_bar_hover_button);
        }
        icons::paint_app_bar(ui.painter(), gear.shrink(7.0), "settings", 1.0);
        crate::scenario::publish_rect("titlebar:preferences", gear);
        crate::scenario::publish_handle("titlebar:preferences", gear.center());
        let prefs_tip = if cfg!(target_os = "macos") { format!("{} (Cmd+,)", app.tr("ui.preferences")) } else { format!("{} (Ctrl+,)", app.tr("ui.preferences")) };
        if gresp.on_hover_text(prefs_tip).clicked() { crate::prefs::open_at(app, 0); }

        let help_at = help_rect.center().x;
        if click(ui, help_at, "help", "Forge Help", true) {
            app.help.menu = !app.help.menu;
            ui.ctx().data_mut(|d| {
                d.insert_temp(egui::Id::new("sc_help_opened"), true);
                d.insert_temp(egui::Id::new("sc_help_anchor"), help_rect.left());
            });
        }
        crate::scenario::publish_rect("titlebar:forge_help", help_rect);
        crate::scenario::publish_rect("appbar:help", help_rect);
        crate::scenario::publish_target("titlebar:forge_help", help_rect);
        if app.custom_titlebar {
            crate::titlebar::caption_buttons(app, ui, r);
        }`;

const cleanReplacement = replacement;
if (text.includes(marker)) {
  if (!checkOnly) {
    const bodyStart = text.indexOf(marker);
    if (start >= 0 && end >= 0) text = text.slice(0, start) + cleanReplacement + text.slice(end + endMarker.length);
  }
} else {
  if (start < 0 || end < 0) throw new Error('Forge header replacement anchor drift in toolbar.rs');
  if (!checkOnly) text = text.slice(0, start) + cleanReplacement + text.slice(end + endMarker.length);
}

const testsMarker = 'fn title_bar_keeps_forge_branding_help_settings_and_version_separate()';
const newHeaderTest = `    #[test]
    fn title_bar_keeps_forge_branding_help_settings_and_version_separate() {
        let mut h = crate::scenario::Harness::new();
        h.app.home.open = false;
        h.app.custom_titlebar = true;
        h.app.run("solid.box", json!({"length":10,"width":10,"height":10})).unwrap();
        h.call("ui.resize", json!({"width":1400,"height":720}));
        h.frames(3);
        let rect = |name: &str| crate::scenario::rect_of(name).unwrap_or_else(|| panic!("{name}"));
        assert_eq!(APP_BAR_HEIGHT, 50.0);
        let emblem = rect("titlebar:forge_emblem");
        let wordmark = rect("titlebar:forge_wordmark");
        let version = rect("titlebar:version");
        let gear = rect("titlebar:preferences");
        let help = rect("titlebar:forge_help");
        assert!(emblem.right() < wordmark.left() + 1.0, "DX emblem and wordmark use the approved lockup");
        assert!(wordmark.width() >= 190.0, "the Forge wordmark is suite-sized: {wordmark:?}");
        assert!(gear.right() < help.left() && help.right() < version.left(), "right-side controls and version do not overlap");
        assert!(crate::scenario::rect_of("titlebar:assistant").is_none(), "the inherited assistant control is removed");
        assert!(crate::scenario::rect_of("titlebar:report").is_none(), "the inherited report control is removed from the header");
        assert!(h.widget("Forge Help").is_some(), "the replacement Help control is accessible");
        h.step(&json!({"click":{"handle":"appbar:help"}})).unwrap();
        assert!(h.app.help.menu, "Forge Help opens the Forge menu");
        h.step(&json!({"widget":"About DemonX Forge"})).unwrap();
        assert!(h.app.help.about, "About DemonX Forge opens from Forge Help");
        assert!(crate::help::diagnostics(&h.app).contains(&format!("DemonX Forge {}", crate::help::VERSION)));
        h.step(&json!({"widget":"Close"})).unwrap();
        let dark = h.app.ui.dark;
        h.call("ui.prefs", json!({"theme": if dark { "demonx-forge-light" } else { "demonx-forge-dark" }}));
        h.frames(2);
        assert_ne!(h.app.ui.dark, dark, "both Forge themes keep the app-bar controls active");
    }

`;
if (!text.includes(testsMarker)) {
  const testStart = text.indexOf('    #[test]\n    fn title_bar_keeps_tabs_left_and_help_right()');
  const testEnd = text.indexOf('    #[test]\n    fn header_report_button_widens_for_a_longer_translation()', testStart);
  if (testStart < 0 || testEnd < 0) throw new Error('Forge header layout test migration anchor drift');
  if (!checkOnly) text = text.slice(0, testStart) + newHeaderTest + text.slice(testEnd);
}

// The header no longer owns report capture. Exercise the same useful feature through Forge Help.
text = text.replaceAll('h.widget("Report a bug").expect("compact and full buttons retain an accessible name")', 'h.widget("Forge Help").expect("Forge Help remains accessible at every width")');
text = text.replace('h.step(&json!({"click":point})).unwrap();\n            assert!(h.app.issue_report.draft.is_some()', 'h.step(&json!({"click":point})).unwrap();\n            h.step(&json!({"widget":"Report an Issue…"})).unwrap();\n            assert!(h.app.issue_report.draft.is_some()');
text = text.replaceAll('h.step(&json!({"widget":"Report a bug"})).unwrap();', 'h.step(&json!({"widget":"Forge Help"})).unwrap();\n        h.step(&json!({"widget":"Report an Issue…"})).unwrap();');
text = text.replace('h.step(&json!({"widget":"Forge Help"})).unwrap();\n        h.step(&json!({"widget":"Report an Issue…"})).unwrap();\n        h.frames(3);', 'let help = h.widget("Forge Help").expect("Forge Help stays clickable while a dimension is being edited");\n        h.step(&json!({"click":help})).unwrap();\n        assert!(h.app.help.menu);\n        let report = h.widget("Report an Issue…").expect("the Forge report action remains in its Help menu");\n        h.step(&json!({"click":report})).unwrap();\n        h.frames(3);');

// Migrate the compact/wide UI regression into measured-control layout coverage.
const oldTranslationStart = text.indexOf('    #[test]\n    fn header_report_button_widens_for_a_longer_translation()');
const oldInteractionStart = text.indexOf('    #[test]\n    fn header_report_actual_click_opens_capture_without_changing_healthy_design()', oldTranslationStart);
if (!text.includes('fn forge_header_controls_fit_at_supported_widths()')) {
  if (oldTranslationStart < 0 || oldInteractionStart < 0) throw new Error('Forge width test migration anchor drift');
  const widthTest = `    #[test]
    fn forge_header_controls_fit_at_supported_widths() {
        for width in [450.0, 500.0, 700.0, 900.0, 1400.0] {
            let mut h = crate::scenario::Harness::new();
            h.app.home.open = false;
            h.app.custom_titlebar = true;
            h.call("ui.resize", json!({"width":width,"height":720}));
            h.frames(3);
            let rect = |name: &str| crate::scenario::rect_of(name);
            let help = rect("titlebar:forge_help").unwrap();
            let gear = rect("titlebar:preferences").unwrap();
            assert!(gear.right() <= help.left(), "width {width}: settings and Help do not overlap");
            if let Some(version) = rect("titlebar:version") {
                assert!(help.right() < version.left() && version.right() <= width - crate::titlebar::WIDTH, "width {width}: product version stays inside its reserved region");
            }
            assert!(rect("titlebar:assistant").is_none() && rect("titlebar:report").is_none(), "width {width}: no inherited upstream controls are exposed");
        }
    }

`;
  text = text.slice(0, oldTranslationStart) + widthTest + text.slice(oldInteractionStart);
}

// Keep the tab-strip geometry regression but assert against the Forge Help cluster.
text = text.replace('                // The title bar keeps document tabs before Assistant, Preferences, Help and Report.\n                let report = crate::scenario::rect_of("titlebar:report").unwrap();\n                let tabs_end = crate::scenario::handles("tab:design:").iter().map(|(_, p)| p.x).fold(0.0, f32::max);\n                assert!(tabs_end < report.left(), "{at}: the document tabs run into Report a bug");\n                let assistant = crate::scenario::rect_of("titlebar:assistant").unwrap();\n                let help = crate::scenario::rect_of("appbar:help").unwrap();\n                let prefs = crate::scenario::rect_of("titlebar:preferences").unwrap();\n                assert!(tabs_end < assistant.left(), "{at}: the document tabs run into Assistant");\n                assert!(\n                    assistant.right() <= prefs.left() && prefs.right() <= help.left() && help.right() <= report.left(),\n                    "{at}: the title bar\'s right-hand controls overlap"\n                );', '                // The Forge Help and Preferences controls remain outside the clipped tab strip.\n                let help = crate::scenario::rect_of("titlebar:forge_help").unwrap();\n                let prefs = crate::scenario::rect_of("titlebar:preferences").unwrap();\n                let tabs_end = crate::scenario::handles("tab:design:").iter().map(|(_, p)| p.x).fold(0.0, f32::max);\n                assert!(tabs_end < prefs.left(), "{at}: the document tabs run into Preferences");\n                assert!(prefs.right() <= help.left(), "{at}: the Forge header controls overlap");');

const preserveStart = (() => {
  const old = text.indexOf('    #[test]\n    fn header_report_preserves_new_dimension_draft_and_single_commit()');
  if (old >= 0) return old;
  const current = text.indexOf('    #[test]\n    fn forge_help_report_preserves_an_active_dimension_edit()');
  if (current >= 0) return current;
  const prior = text.indexOf('    #[test]\n    fn forge_help_does_not_discard_an_active_dimension_edit()');
  return prior >= 0 ? prior : text.indexOf('    #[test]\n    fn forge_preferences_button_opens_settings_without_mutating_design()');
})();
const preserveEnd = text.indexOf('\n}\n\n#[cfg(test)]\nmod home_tests', preserveStart);
if (preserveStart < 0 || preserveEnd < 0) throw new Error('dimension-edit/help interaction test migration anchor drift');
const preserveTest = `    #[test]
    fn forge_preferences_button_opens_settings_without_mutating_design() {
        let mut h = crate::scenario::Harness::new();
        h.app.home.open = false;
        h.app.run("solid.box", json!({"length":20,"width":12,"height":4})).unwrap();
        let before = (h.app.session.doc.to_json(), h.app.session.undo.len(), h.app.session.revision);
        h.step(&json!({"click":{"handle":"titlebar:preferences"}})).unwrap();
        assert!(h.app.prefs_window.open, "the Settings control opens native Forge preferences");
        assert_eq!(before, (h.app.session.doc.to_json(), h.app.session.undo.len(), h.app.session.revision));
    }
`;
text = text.slice(0, preserveStart) + preserveTest + text.slice(preserveEnd);

// The upstream hover regression enumerates title-bar buttons by their automation handles.
// Migrate that assertion along with the removed Assistant and report buttons so the native
// title-bar behavior remains covered without preserving dead controls in the test fixture.
const titlebarPath = join(source, 'crates/ui-egui/src/titlebar.rs');
let titlebar = readFileSync(titlebarPath, 'utf8').replace(/\r\n/g, '\n');
const oldHoverControls = `                "tab:close:0",
                "titlebar:assistant",
                "titlebar:preferences",
                "appbar:help",
                "titlebar:report",`;
const forgeHoverControls = `                "tab:close:0",
                "titlebar:preferences",
                "titlebar:forge_help",`;
if (titlebar.includes(oldHoverControls)) {
  if (!checkOnly) titlebar = titlebar.replace(oldHoverControls, forgeHoverControls);
} else if (!titlebar.includes(forgeHoverControls)) {
  throw new Error('Forge titlebar hover-control test anchor drift');
}

if (!checkOnly) writeFileSync(path, text);
if (!checkOnly) writeFileSync(titlebarPath, titlebar);
if (!checkOnly && (!text.includes(marker) || !text.includes(testsMarker) || !text.includes('fn forge_header_controls_fit_at_supported_widths()'))) {
  throw new Error('DemonX Forge header overlay verification failed');
}
