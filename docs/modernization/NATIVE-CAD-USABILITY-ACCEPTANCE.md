# Native CAD usability acceptance

This checkpoint follows the Windows CI diagnosis in `WINDOWS-CI-ROBUSTNESS-DIAGNOSIS.md`. It does
not qualify an installer or authorize an update.

## Implemented behavior and focused regression coverage

- Sketch endpoint inference recognizes analytic intersections inside two curves and persists
  `PointOnCurve` constraints on both. Existing midpoint inference has a viewport regression checking
  the resulting `Midpoint` constraint.
- Mouse-drawn lines use entered live length and angle values as driving constraints. A combined
  midpoint-plus-dimensions regression exercises the exact inferred start plus typed dimensions.
- Move/Copy triad drags build preview geometry while leaving the document and undo history unchanged.
- Selecting a model edge exposes its exact kernel length in millimetres in the viewport.
- The authenticated UI control protocol has a frame-spanning pointer down/up operation so GUI
  acceptance can deliver a realistic press, move, release sequence. It also supports separately
  framed key down/up events while retaining the original combined press/release behavior.
- Live dimension fields capture Enter before the text editor validates it, and use egui's owned
  focus ID to identify the active field inside a floating area.

These checks and control-protocol changes are carried as overlay patches against pinned SolidCraft
commit `75261cd79733fe47cf898b54f865e6bfaffa1129`; the overlay verifier requires their implementation
and regression markers.

## Focused results

The focused Windows test commands passed on the disposable pinned-source checkout:

- midpoint and curve-intersection inference: 2 passed;
- selected-edge length rendering: 1 passed;
- Move/Copy preview/no-mutation: 1 passed;
- line live-dimension entry: 1 passed;
- combined midpoint snap plus length and angle commit: 1 passed;
- pointer edges delivered in distinct frames: 1 passed;
- key edges delivered in distinct frames: 1 passed;
- dimension focus/Enter handling: 1 passed;
- midpoint plus numeric length/angle draw: 1 passed;
- line length/angle and Escape cancellation: 1 passed.

The first packaged GPU GUI run failed at line commit. The displayed length and angle values were
correct, but the model retained only its three reference curves. Comparing the scratch source that
had passed earlier with the packaged overlay showed the numeric Enter/focus fix and the separate
key-edge control support were missing from the reproducible overlay. These were a product overlay
defect and a harness event-sequencing gap. Both are now anchored in `apply-overlay.mjs`, covered by
Rust regressions, and checked by `verify-overlay.mjs`.

The corrected isolated Windows package `0.1.0-preview.9002-forge-d41bff995026` then passed the
actual GPU GUI acceptance with a private temporary profile. Measured document state confirmed:

- Midpoint snapping persisted a `Midpoint` constraint; the entered 8 mm length and 30° angle
  produced a segment measuring 8 mm at 30° and left both driving dimensions in the sketch.
- Intersection snapping persisted two `PointOnCurve` constraints on the crossing source curves.
- A selected straight body edge measured 20 mm and displayed `Length 20 mm`.
- The selected cylinder arc measured 15.6954075603955 mm and displayed `Length 15.695 mm`.
  The kernel represents this picked circular edge as a half-circumference arc (the analytic
  expectation is 5π mm, within 0.02 mm).
- Move/Copy preview showed the geometry following the manipulator while model bodies, timeline,
  parameters, and bounds stayed unchanged. Cancel left the document model unchanged.
- Accepting the copy added one body and history entry. The source bounds remained
  `[[0,20],[0,12],[0,8]]`; the copy bounds were `[[20,40],[0,12],[0,8]]`. GUI undo returned to two
  bodies and redo restored three.

The package, runtime logs, and screenshots are under `.diagnostics/packaged-windows-fixed/` and
`.diagnostics/demonx-forge-cad-acceptance-OLQ3V0/`. The package had no public updater key and was
used only for interaction, packaging, and MCP bridge acceptance. It was not installed. The current
Forge installation and active projects remain untouched.

The manual native CAD usability script is retained as a diagnostic harness. It is not wired into the
Windows package workflow until its real GUI acceptance path passes. Do not install an update based
on these focused tests.

## Next checkpoint

The CAD interaction checkpoint passed on an isolated packaged Windows app. The remaining release
blockers are the four known Windows upstream golden failures, the actual GitHub Actions shard run,
dirty-document updater acceptance, signed-release end-to-end validation, and full release rollback
and MCP reconnection acceptance. Keep package acceptance downstream of the complete test matrix and
the current installed release available for rollback until an acceptance-tested replacement is
approved.
