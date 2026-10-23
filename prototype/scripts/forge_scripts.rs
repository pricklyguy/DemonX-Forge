//! Forge's native, JSON-based script library and transactional runner.
//!
//! Scripts deliberately use the SolidCraft command registry. This layer adds Forge-specific
//! permissions, validation, progress and transaction behavior; it is not a second modeling engine.

use egui::{Color32, Id, RichText, TextEdit};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use solidcraft_engine::{Session, Snapshot, cmd};
use std::path::{Path, PathBuf};

const MAX_SCRIPT_BYTES: usize = 1_048_576;
const MAX_SCRIPT_COMMANDS: usize = 10_000;

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ForgeScript {
    pub schema_version: u32,
    pub name: String,
    #[serde(default)]
    pub description: String,
    pub commands: Vec<ScriptCommand>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ScriptCommand {
    pub command: String,
    #[serde(default = "empty_object")]
    pub params: Value,
}

fn empty_object() -> Value { json!({}) }

#[derive(Default)]
pub struct Manager {
    pub open: bool,
    pub editor: String,
    pub selected: Option<String>,
    pub status: Option<(String, bool)>,
    pub run: Option<RunState>,
    pub library: Vec<String>,
}

pub struct RunState {
    script: ForgeScript,
    checkpoint: u64,
    next: usize,
    base_undo: usize,
    before_doc: std::sync::Arc<solidcraft_engine::doc::Document>,
    before_active_sketch: Option<u64>,
    before_pending_moves: std::collections::BTreeMap<u64, solidcraft_engine::doc::Mat>,
    before_selection: Vec<solidcraft_engine::Sel>,
    warnings: Vec<String>,
    external_reply: Option<std::sync::mpsc::Sender<crate::ControlResponse>>,
    pub started: std::time::Instant,
}

#[derive(Debug)]
pub struct ValidationSummary {
    pub script: ForgeScript,
    pub mutations: usize,
    pub description: String,
}

/// Parse, size-check, permission-check and type-check a Forge script before it can execute.
pub fn validate(text: &str) -> Result<ValidationSummary, String> {
    if text.len() > MAX_SCRIPT_BYTES {
        return Err(format!("Script is {} bytes; the limit is {MAX_SCRIPT_BYTES} bytes", text.len()));
    }
    let script: ForgeScript = serde_json::from_str(text).map_err(|e| format!("Invalid JSON script: {e}"))?;
    if script.schema_version != 1 {
        return Err(format!("Unsupported script schema_version {}; Forge supports version 1", script.schema_version));
    }
    if script.name.trim().is_empty() || script.name.len() > 120 {
        return Err("Script name must contain 1 to 120 characters".into());
    }
    if script.commands.is_empty() || script.commands.len() > MAX_SCRIPT_COMMANDS {
        return Err(format!("A script must contain 1 to {MAX_SCRIPT_COMMANDS} commands"));
    }
    let mut mutations = 0;
    let mut ids = Vec::with_capacity(script.commands.len());
    for (index, step) in script.commands.iter().enumerate() {
        if !script_command_allowed(&step.command) {
            return Err(format!("Command {} ({}) is outside Forge script permissions", index + 1, step.command));
        }
        let Some(spec) = cmd::find_command(&step.command) else {
            return Err(format!("Command {} is not available in the native command registry", step.command));
        };
        if spec.planned.is_some() {
            return Err(format!("Command {} is registered but not implemented", step.command));
        }
        if !spec.undoable && !matches!(step.command.as_str(), "select.set" | "select.clear" | "document.inspect" | "sketch.inspect" | "model.edges" | "model.faces" | "model.threads" | "timeline.inspect" | "timeline.dependents" | "inspect.measure" | "parameters.list") {
            return Err(format!("Command {} changes state outside the Forge script transaction", step.command));
        }
        if !step.params.is_object() && !step.params.is_null() {
            return Err(format!("Command {} parameters must be a JSON object", step.command));
        }
        if let Some(contract) = spec.contract {
            let issues = contract.check(&step.params);
            if !issues.is_empty() {
                let details = issues.into_iter().map(|issue| {
                    if issue.path.is_empty() { issue.message } else { format!("{}: {}", issue.path, issue.message) }
                }).collect::<Vec<_>>().join("; ");
                return Err(format!("Command {} has invalid parameters: {details}", step.command));
            }
        }
        if spec.undoable { mutations += 1; }
        ids.push(step.command.as_str());
    }
    let description = format!("{} command{} · {} changes · {}", script.commands.len(), if script.commands.len() == 1 { "" } else { "s" }, mutations, ids.join(" → "));
    Ok(ValidationSummary { script, mutations, description })
}

/// Script commands can read and change a document, but cannot open/save/import/export files,
/// control the UI, change views, alter application preferences, or manage transaction internals.
fn script_command_allowed(id: &str) -> bool {
    let segments: Vec<_> = id.split('.').collect();
    let root = segments.first().copied().unwrap_or_default();
    let read_only = matches!(id, "document.inspect" | "sketch.inspect" | "model.edges" | "model.faces" | "model.threads" | "timeline.inspect" | "timeline.dependents" | "inspect.measure" | "parameters.list");
    if read_only { return true; }
    if !matches!(root, "sketch" | "solid" | "mesh" | "parameters" | "timeline" | "body" | "component" | "assembly" | "joint" | "select") {
        return false;
    }
    let blocked = ["file", "path", "open", "save", "import", "export", "load", "write", "read", "checkpoint", "undo", "redo", "script"];
    if segments.iter().any(|part| blocked.iter().any(|word| *part == *word || part.starts_with(&format!("{word}_")) || part.ends_with(&format!("_{word}"))))
        || matches!(id, "component.insert_design" | "component.update_links" | "component.relink" | "component.links")
    {
        return false;
    }
    root != "select" || matches!(id, "select.set" | "select.clear")
}

impl Manager {
    fn set_message(&mut self, text: impl Into<String>, error: bool) { self.status = Some((text.into(), error)); }

    pub fn open(&mut self) {
        self.open = true;
        self.refresh_library();
        if self.editor.trim().is_empty() {
            self.editor = example_script();
        }
    }

    fn refresh_library(&mut self) {
        self.library = std::fs::read_dir(library_dir()).ok().into_iter().flatten()
            .filter_map(Result::ok)
            .filter(|e| e.path().extension().is_some_and(|x| x.eq_ignore_ascii_case("json")))
            .filter_map(|e| e.file_name().to_str().map(str::to_owned))
            .collect();
        self.library.sort_by_key(|name| name.to_lowercase());
    }

    pub fn import_selected(&mut self, path: Option<String>) {
        let Some(path) = path else { return };
        match read_script_file(Path::new(&path)) {
            Ok(text) => match validate(&text) {
                Ok(_) => { self.editor = text; self.selected = None; self.set_message("Script imported. Review it, then save it to your Forge library.", false); }
                Err(e) => self.set_message(e, true),
            },
            Err(e) => self.set_message(format!("Could not read selected script: {e}"), true),
        }
    }

    pub fn save_to_library(&mut self) {
        let summary = match validate(&self.editor) {
            Ok(summary) => summary,
            Err(e) => { self.set_message(e, true); return; }
        };
        let dir = library_dir();
        let result = (|| {
            std::fs::create_dir_all(&dir).map_err(|e| format!("Could not create script library: {e}"))?;
            let filename = format!("{}.json", safe_filename(&summary.script.name));
            let target = dir.join(&filename);
            let temp = dir.join(format!(".{filename}.{}.tmp", std::process::id()));
            std::fs::write(&temp, serde_json::to_vec_pretty(&summary.script).map_err(|e| e.to_string())?)
                .map_err(|e| format!("Could not write script: {e}"))?;
            std::fs::rename(&temp, &target).map_err(|e| { let _ = std::fs::remove_file(&temp); format!("Could not finish saving script: {e}") })?;
            Ok::<_, String>(filename)
        })();
        match result {
            Ok(filename) => { self.selected = Some(filename); self.refresh_library(); self.set_message("Script saved in the Forge user scripts library.", false); }
            Err(e) => self.set_message(e, true),
        }
    }

    pub fn load_library_entry(&mut self, filename: &str) {
        if !valid_library_filename(filename) { self.set_message("Invalid library item name", true); return; }
        let path = library_dir().join(filename);
        match read_script_file(&path) {
            Ok(text) => match validate(&text) {
                Ok(_) => { self.editor = text; self.selected = Some(filename.to_string()); self.set_message(format!("Loaded {filename}"), false); }
                Err(e) => self.set_message(format!("Library script is invalid: {e}"), true),
            },
            Err(e) => self.set_message(format!("Could not load script: {e}"), true),
        }
    }

    pub fn start(&mut self, session: &mut Session) -> Result<String, String> {
        if self.run.is_some() { return Err("A script is already running".into()); }
        let summary = validate(&self.editor)?;
        self.begin(session, summary, None)
    }

    /// Start a validated script submitted through Forge's existing authenticated control channel.
    /// The sender receives the final transaction result when the UI-thread runner finishes.
    pub fn start_external(
        &mut self,
        session: &mut Session,
        text: &str,
        reply: std::sync::mpsc::Sender<crate::ControlResponse>,
    ) -> Result<(), String> {
        if self.run.is_some() { return Err("A script is already running".into()); }
        let summary = validate(text)?;
        self.editor = serde_json::to_string_pretty(&summary.script).map_err(|error| error.to_string())?;
        self.selected = None;
        self.begin(session, summary, Some(reply)).map(|_| ())
    }

    fn begin(
        &mut self,
        session: &mut Session,
        summary: ValidationSummary,
        external_reply: Option<std::sync::mpsc::Sender<crate::ControlResponse>>,
    ) -> Result<String, String> {
        if session.active_sketch.is_some() {
            return Err("Finish or cancel the active sketch before running a script".into());
        }
        let checkpoint = session.checkpoint();
        let base_undo = session.undo.len();
        let before_doc = session.doc.clone();
        let before_active_sketch = session.active_sketch;
        let before_pending_moves = session.pending_moves.clone();
        let before_selection = session.selection.clone();
        let name = summary.script.name.clone();
        self.run = Some(RunState {
            script: summary.script,
            checkpoint,
            next: 0,
            base_undo,
            before_doc,
            before_active_sketch,
            before_pending_moves,
            before_selection,
            warnings: Vec::new(),
            external_reply,
            started: std::time::Instant::now(),
        });
        self.open = true;
        self.set_message(format!("Validated {} commands. Running {name}…", self.run.as_ref().map_or(0, |r| r.script.commands.len())), false);
        Ok("Script validation passed".into())
    }

    /// Advance exactly one command per frame so the UI can paint progress and input remains
    /// serialized on the owner thread. The modal runner prevents interactive mutations meanwhile.
    pub fn tick(&mut self, session: &mut Session) {
        let Some(run) = self.run.as_mut() else { return };
        if run.next >= run.script.commands.len() {
            let Some(run) = self.run.take() else { return };
            session.undo.truncate(run.base_undo);
            let changed = !std::sync::Arc::ptr_eq(&session.doc, &run.before_doc)
                || session.active_sketch != run.before_active_sketch
                || session.pending_moves != run.before_pending_moves;
            if changed {
                session.undo.push(Snapshot {
                    label: format!("Script: {}", run.script.name),
                    doc: run.before_doc,
                    active_sketch: run.before_active_sketch,
                    pending_moves: run.before_pending_moves,
                });
                if session.undo.len() > 200 { session.undo.remove(0); }
                session.redo.clear();
            }
            session.drop_checkpoint(run.checkpoint);
            let history = if changed { "One undo step was recorded." } else { "No model changes were made." };
            let message = if run.warnings.is_empty() {
                format!("{} completed in {:.2}s. {history}", run.script.name, run.started.elapsed().as_secs_f64())
            } else {
                format!("{} completed in {:.2}s with {} warning(s). {history} {}", run.script.name, run.started.elapsed().as_secs_f64(), run.warnings.len(), run.warnings.join("; "))
            };
            self.set_message(message, false);
            if let Some(reply) = run.external_reply {
                let _ = reply.send(json!({"ok":true,"result":{"name":run.script.name,"commands":run.script.commands.len(),"undo_steps":if changed {1} else {0},"warnings":run.warnings}}));
            }
            return;
        }
        let i = run.next;
        let command = run.script.commands[i].command.clone();
        let params = run.script.commands[i].params.clone();
        match session.execute(&command, &params) {
            Ok(value) => {
                if let Some(warnings) = value.get("warnings").and_then(Value::as_array) {
                    for warning in warnings.iter().filter_map(Value::as_str) {
                        run.warnings.push(format!("{}: {warning}", command));
                    }
                }
                if let Some(warning) = value.get("warning").and_then(Value::as_str) {
                    run.warnings.push(format!("{}: {warning}", command));
                }
                run.next += 1;
                if run.next == run.script.commands.len() {
                    // Finish on the next frame, after the final command's geometry has rendered.
                }
            }
            Err(error) => {
                let name = run.script.name.clone();
                let checkpoint = run.checkpoint;
                let selection = run.before_selection.clone();
                let external_reply = run.external_reply.clone();
                self.run = None;
                let rollback = session.restore_checkpoint(checkpoint).is_ok();
                session.selection = selection;
                let message = if rollback {
                    format!("{name} stopped at command {} ({}). All changes were rolled back: {error}", i + 1, command)
                } else {
                    format!("{name} failed at command {} ({}): {error}. Automatic rollback also failed; inspect the document immediately.", i + 1, command)
                };
                self.set_message(message.clone(), true);
                if let Some(reply) = external_reply {
                    let _ = reply.send(json!({"ok":false,"error":message}));
                }
            }
        }
    }

    pub fn stop(&mut self, session: &mut Session) {
        let Some(run) = self.run.take() else { return };
        let restored = session.restore_checkpoint(run.checkpoint).is_ok();
        session.selection = run.before_selection;
        let message = if restored { format!("{} stopped. Changes were rolled back.", run.script.name) } else { "Stop requested, but rollback failed. Inspect the document immediately.".into() };
        self.set_message(message.clone(), !restored);
        if let Some(reply) = run.external_reply {
            let _ = reply.send(json!({"ok":false,"error":message}));
        }
    }
}

pub fn show(app: &mut crate::SolveApp, ctx: &egui::Context) {
    if !app.forge_scripts.open && app.forge_scripts.run.is_none() { return; }
    if app.forge_scripts.run.is_some() {
        app.forge_scripts.tick(&mut app.session);
        ctx.request_repaint();
    }
    let mut open = app.forge_scripts.open;
    let modal = egui::Modal::new(Id::new("forge_scripts_modal"));
    let response = modal.show(ctx, |ui| {
        ui.set_min_width(680.0);
        ui.set_max_width(860.0);
        ui.heading(RichText::new("Scripts & Add-Ins").color(Color32::from_rgb(35, 190, 202)));
        ui.label("Forge scripts use the native modeling command registry and run as one transaction.");
        ui.separator();
        ui.horizontal(|ui| {
            ui.vertical(|ui| {
                ui.set_width(190.0);
                ui.label(RichText::new("Script Library").strong());
                egui::ScrollArea::vertical().max_height(330.0).show(ui, |ui| {
                    let entries = app.forge_scripts.library.clone();
                    for name in entries {
                        if ui.selectable_label(app.forge_scripts.selected.as_deref() == Some(&name), &name).clicked() {
                            app.forge_scripts.load_library_entry(&name);
                        }
                    }
                });
                if ui.button("New Script").clicked() {
                    app.forge_scripts.editor = example_script();
                    app.forge_scripts.selected = None;
                }
                if ui.button("Import JSON…").clicked() {
                    app.pick_open_for(&["json"], |app, path| app.forge_scripts.import_selected(path));
                }
            });
            ui.separator();
            ui.vertical(|ui| {
                ui.label(RichText::new("JSON Editor").strong());
                ui.add_sized([620.0, 330.0], TextEdit::multiline(&mut app.forge_scripts.editor).font(egui::TextStyle::Monospace).code_editor());
                if let Ok(summary) = validate(&app.forge_scripts.editor) {
                    ui.label(RichText::new(summary.description).small().color(Color32::LIGHT_GRAY));
                } else if let Err(error) = validate(&app.forge_scripts.editor) {
                    ui.label(RichText::new(error).small().color(Color32::LIGHT_RED));
                }
            });
        });
        ui.separator();
        ui.horizontal(|ui| {
            if app.forge_scripts.run.is_some() {
                let Some(run) = app.forge_scripts.run.as_ref() else { return };
                ui.label(format!("Running {}: {} / {}", run.script.name, run.next, run.script.commands.len()));
                ui.add(egui::ProgressBar::new(run.next as f32 / run.script.commands.len() as f32).show_percentage());
                if ui.button("Stop and Roll Back").clicked() { app.forge_scripts.stop(&mut app.session); }
            } else {
                let can_run = validate(&app.forge_scripts.editor).is_ok();
                if ui.add_enabled(can_run, egui::Button::new("Run")).clicked() {
                    let ready = !app.file_load.busy() && !app.file_picker_busy() && app.applying.is_none() && app.deferred.is_none() && app.tool.is_none() && app.dialog.is_none();
                    let result = if ready { app.forge_scripts.start(&mut app.session) } else { Err("Finish or close the active command or file operation first".into()) };
                    match result {
                        Ok(_) => app.set_status("Script validated; execution started", false),
                        Err(error) => app.forge_scripts.set_message(error, true),
                    }
                }
            }
            if ui.button("Save to Library").clicked() { app.forge_scripts.save_to_library(); }
            if app.forge_scripts.run.is_none() && ui.button("Close").clicked() { open = false; }
        });
        if let Some((message, is_error)) = &app.forge_scripts.status {
            ui.label(RichText::new(message).color(if *is_error { Color32::LIGHT_RED } else { Color32::LIGHT_GREEN }));
        }
        ui.separator();
        ui.label(RichText::new("Add-Ins").strong());
        ui.label("Future feature. Add-ins are not loaded or executed by this release.");
    });
    app.forge_scripts.open = open || app.forge_scripts.run.is_some();
    if response.should_close() && app.forge_scripts.run.is_none() { app.forge_scripts.open = false; }
}

fn library_dir() -> PathBuf {
    if cfg!(target_os = "windows") {
        std::env::var_os("LOCALAPPDATA").map(PathBuf::from).unwrap_or_else(|| std::env::var_os("USERPROFILE").map(PathBuf::from).unwrap_or_default())
            .join("DemonX Forge").join("Scripts")
    } else if cfg!(target_os = "macos") {
        std::env::var_os("HOME").map(PathBuf::from).unwrap_or_default().join("Library/Application Support/DemonX Forge/Scripts")
    } else {
        std::env::var_os("XDG_DATA_HOME").map(PathBuf::from).or_else(|| std::env::var_os("HOME").map(|home| PathBuf::from(home).join(".local/share")))
            .unwrap_or_default().join("demonx-forge/scripts")
    }
}

fn safe_filename(name: &str) -> String {
    let cleaned: String = name.trim().chars().map(|c| if c.is_ascii_alphanumeric() || matches!(c, '-' | '_' | ' ') { c } else { '_' }).collect();
    let cleaned: String = cleaned.split_whitespace().collect::<Vec<_>>().join("_").trim_matches('_').chars().take(100).collect();
    if cleaned.is_empty() { "script".into() } else { cleaned }
}

fn read_script_file(path: &Path) -> Result<String, String> {
    let metadata = std::fs::metadata(path).map_err(|e| format!("Could not inspect script file: {e}"))?;
    if metadata.len() > MAX_SCRIPT_BYTES as u64 {
        return Err(format!("Selected script is {} bytes; the limit is {MAX_SCRIPT_BYTES} bytes", metadata.len()));
    }
    std::fs::read_to_string(path).map_err(|e| format!("Could not read script: {e}"))
}

fn valid_library_filename(name: &str) -> bool {
    Path::new(name).file_name().and_then(|x| x.to_str()) == Some(name) && name.ends_with(".json") && !name.starts_with('.')
}

fn example_script() -> String {
        serde_json::to_string_pretty(&ForgeScript {
        schema_version: 1,
        name: "New Forge Script".into(),
        description: "A reusable native modeling workflow".into(),
        commands: vec![ScriptCommand { command: "solid.box".into(), params: json!({"length":40,"width":30,"height":10,"body_name":"Scripted Plate"}) }],
    }).unwrap_or_else(|_| "{\n  \"schema_version\": 1,\n  \"name\": \"New Forge Script\",\n  \"commands\": []\n}".into())
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn script(commands: Value) -> String {
        json!({"schema_version":1,"name":"transaction test","commands":commands}).to_string()
    }

    #[test]
    fn validates_version_registry_permissions_and_typed_arguments() {
        let valid = validate(&script(json!([{"command":"solid.box","params":{"length":10,"width":10,"height":10}}])));
        assert!(valid.is_ok(), "{:?}", valid.err());
        assert!(validation_error(&script(json!([{"command":"file.open","params":{"path":"C:/secret"}}]))).contains("permissions"));
        assert!(validation_error(&script(json!([{"command":"solid.not_a_tool","params":{}}]))).contains("registry"));
        assert!(validation_error(&script(json!([{"command":"inspect.file","params":{}}]))).contains("permissions"));
        assert!(validation_error(&script(json!([{"command":"solid.box","params":{"width":"ten"}}]))).contains("invalid parameters"));
        assert!(validation_error(&json!({"schema_version":2,"name":"bad","commands":[{"command":"solid.box"}]}).to_string()).contains("schema_version"));
    }

    #[test]
    fn successful_script_is_one_undo_step_and_failed_command_rolls_back_all() {
        let mut session = Session::default();
        let before = session.doc.clone();
        let mut manager = Manager { editor: script(json!([
            {"command":"solid.box","params":{"length":10,"width":10,"height":10}},
            {"command":"solid.box","params":{"length":6,"width":6,"height":6}}
        ])), ..Default::default() };
        assert!(manager.start(&mut session).is_ok());
        while manager.run.is_some() { manager.tick(&mut session); }
        assert_eq!(session.undo.len(), 1, "the whole script is one undo step");
        assert!(session.execute("edit.undo", &json!({})).is_ok());
        assert_eq!(session.doc.features.len(), before.features.len());
        assert_eq!(session.undo.len(), 0);
        assert!(session.execute("edit.redo", &json!({})).is_ok());
        assert_eq!(session.doc.features.len(), before.features.len() + 2, "redo restores the complete script as one operation");

        let path = std::env::temp_dir().join(format!("forge-script-regression-{}.solidcraft", std::process::id()));
        let path_text = path.to_string_lossy().to_string();
        assert!(session.execute("file.save_as", &json!({"path":path_text})).is_ok(), "native project save succeeds");
        assert!(session.execute("doc.open", &json!({"path":path_text})).is_ok(), "native project reopens");
        assert_eq!(session.doc.features.len(), before.features.len() + 2, "reopen retains the script-created parametric history");
        assert!(std::fs::remove_file(&path).is_ok(), "test removes only its own temporary project");

        let before = session.doc.clone();
        let mut manager = Manager { editor: script(json!([
            {"command":"solid.box","params":{"length":10,"width":10,"height":10}},
            {"command":"solid.fillet","params":{"edges":[[999,999,999]],"radius":1}}
        ])), ..Default::default() };
        assert!(manager.start(&mut session).is_ok());
        while manager.run.is_some() { manager.tick(&mut session); }
        assert_eq!(session.doc.features.len(), before.features.len(), "failed script restores the initial model");
        assert_eq!(session.undo.len(), 0, "failed script restores the initial undo history");
        assert!(manager.status.as_ref().is_some_and(|status| status.0.contains("command 2 (solid.fillet)") && status.0.contains("All changes were rolled back")));
    }

    #[test]
    fn stop_after_a_completed_step_restores_the_pre_run_model_and_history() {
        let mut session = Session::default();
        let original_features = session.doc.features.len();
        let mut manager = Manager { editor: script(json!([
            {"command":"solid.box","params":{"length":10,"width":10,"height":10}},
            {"command":"solid.box","params":{"length":8,"width":8,"height":8}}
        ])), ..Default::default() };
        assert!(manager.start(&mut session).is_ok());
        manager.tick(&mut session);
        assert_eq!(session.doc.features.len(), original_features + 1, "one step has run before Stop");
        manager.stop(&mut session);
        assert_eq!(session.doc.features.len(), original_features, "Stop returns the model to the starting document");
        assert!(session.undo.is_empty(), "Stop restores the starting undo history");
        assert!(manager.run.is_none());
    }

    fn validation_error(text: &str) -> String {
        match validate(text) { Ok(_) => String::new(), Err(error) => error }
    }

    #[test]
    fn native_help_entry_opens_library_and_runs_through_the_gui() {
        let mut h = crate::scenario::Harness::new();
        assert!(h.step(&json!({"click":{"handle":"appbar:help"}})).is_ok());
        assert!(h.app.help.menu);
        assert!(h.step(&json!({"widget":"Scripts & Add-Ins…"})).is_ok());
        assert!(h.app.forge_scripts.open);
        assert!(h.step(&json!({"widget":"Run"})).is_ok());
        h.frames(4);
        assert_eq!(h.app.session.model.state().bodies.len(), 1, "the GUI runner creates the example plate");
        assert_eq!(h.app.session.undo.len(), 1, "GUI execution records one atomic undo step");
    }
}
