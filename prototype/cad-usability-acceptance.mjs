import { mkdtempSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { connect } from 'node:net';
import { randomBytes } from 'node:crypto';

const exe = resolve(process.argv[2] ?? 'prototype/solidcraft/target/release/solidcraft.exe');
const acceptanceScratch = process.env.DEMONX_FORGE_ACCEPTANCE_TMP ?? tmpdir();
mkdirSync(acceptanceScratch, { recursive: true });
const root = mkdtempSync(join(acceptanceScratch, 'demonx-forge-cad-acceptance-'));
const appData = join(root, 'roaming');
const localData = join(root, 'local');
const data = join(root, 'data');
const controlDir = join(localData, 'DemonX Forge', 'control');
for (const dir of [appData, localData, data, controlDir]) mkdirSync(dir, { recursive: true });

let app;
let port;
const token = randomBytes(32).toString('hex');
let requestId = 0;

function assert(ok, message) {
  if (!ok) throw new Error(message);
}

const nextUiFrame = () => new Promise((r) => setTimeout(r, 80));

function sameDocumentModel(left, right) {
  const canonical = ({ revision, selection, ...model }) => model;
  return JSON.stringify(canonical(left)) === JSON.stringify(canonical(right));
}

function call(method, params = {}, allowPaths = [], timeoutMs = method === 'ui.inspect' ? 15000 : method === 'ui.window' ? 3000 : 90000) {
  return new Promise((resolvePromise, reject) => {
    const socket = connect(port, '127.0.0.1');
    let buffer = '';
    const timeout = setTimeout(() => { socket.destroy(); reject(new Error(`${method} timed out`)); }, timeoutMs);
    socket.setEncoding('utf8');
    socket.once('connect', () => socket.write(`${JSON.stringify({ id: ++requestId, method, params: allowPaths.length ? { ...params, allow_paths: allowPaths } : params, token })}\n`));
    socket.on('data', (chunk) => {
      buffer += chunk;
      const end = buffer.indexOf('\n');
      if (end < 0) return;
      clearTimeout(timeout);
      socket.end();
      try {
        const reply = JSON.parse(buffer.slice(0, end));
        if (!reply.ok) reject(new Error(`${method}: ${reply.error ?? 'request refused'}`));
        else resolvePromise(reply.result);
      } catch (error) { reject(error); }
    });
    socket.once('error', (error) => { clearTimeout(timeout); reject(error); });
  });
}

async function waitFor(description, predicate, timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  let value;
  while (Date.now() < deadline) {
    value = await predicate();
    if (value) return value;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`Timed out waiting for ${description}; last state: ${JSON.stringify(value)}`);
}

async function engine(command, params = {}) {
  return call('engine.execute', { command, params });
}

async function pressKey(key, modifiers = {}) {
  await call('ui.key', { key, action: 'down', ...modifiers });
  await nextUiFrame();
  await call('ui.key', { key, action: 'up', ...modifiers });
  await nextUiFrame();
}

async function sketchScreen(point) {
  return call('ui.at', { sketch: point });
}

async function startSketchSegment(a, b) {
  const [x0, y0] = await sketchScreen(a);
  const [x1, y1] = await sketchScreen(b);
  await call('ui.pointer', { action: 'down', x: x0, y: y0 });
  await nextUiFrame();
  await call('ui.move', { x: x1, y: y1 });
  await nextUiFrame();
  await call('ui.pointer', { action: 'up', x: x1, y: y1 });
  await nextUiFrame();
}

async function screenshot(name) {
  const path = join(root, name);
  await call('ui.screenshot', { path }, [root]);
  return path;
}

async function main() {
  const env = {
    ...process.env,
    APPDATA: appData,
    LOCALAPPDATA: localData,
    XDG_DATA_HOME: data,
    SOLIDCRAFT_CRASH_DIR: join(root, 'crashes'),
    SOLIDCRAFT_SAFE_MODE: '1',
    SOLIDCRAFT_CONTROL_TOKEN: token,
    WGPU_BACKEND: 'dx12',
    WGPU_DX12_COMPILER: 'fxc',
  };
  delete env.SOLIDCRAFT_CONTROL_DIR;
  delete env.SOLIDCRAFT_CONTROL_PORT;
  delete env.FORGE_NATIVE_PORT;
  app = spawn(exe, ['--safe-mode', '--forge-mcp'], { env, stdio: ['ignore', 'ignore', 'pipe'], windowsHide: false });
  process.stderr.write(`Started isolated Forge PID ${app.pid}; waiting for control channel.\n`);
  let stderr = '';
  app.stderr.setEncoding('utf8').on('data', (part) => { stderr += part; });
  const deadline = Date.now() + 240000;
  while (port == null && Date.now() < deadline && app.exitCode === null) {
    try {
      const latest = readdirSync(controlDir)
        .filter((name) => /^\d+\.token$/.test(name))
        .map((name) => ({ name, mtime: statSync(join(controlDir, name)).mtimeMs }))
        .sort((a, b) => b.mtime - a.mtime)[0];
      if (latest) {
        port = Number(latest.name.slice(0, -6));
      }
    } catch { /* Wait for the app to create its protected port marker. */ }
    if (port == null) await new Promise((r) => setTimeout(r, 250));
  }
  assert(port != null, `isolated Forge GUI did not expose its authenticated control channel: ${stderr.slice(-1600)}`);
  process.stderr.write(`Authenticated control channel discovered on port ${port}.\n`);
  const initial = await call('ui.inspect');
  process.stderr.write(`Native UI ready (${initial.renderer}).\n`);
  assert(['gpu', 'cpu'].includes(initial.renderer), `the native GUI did not initialize a renderer: ${initial.renderer}`);

  // Start a real sketch from the viewport, then prepare reference geometry through the same
  // native command channel used by the UI and automation tools.
  await call('ui.home', { open: false });
  await call('ui.start', { command: 'sketch.create' });
  const plane = await call('ui.at', { plane: 'XY' });
  await call('ui.click', { x: plane[0], y: plane[1] });
  await waitFor('an active XY sketch', async () => {
    const state = await engine('document.inspect');
    return state.active_sketch != null && state;
  });
  process.stderr.write('Active XY sketch ready.\n');
  await engine('sketch.line', { points: [[0, 0], [20, 0]], ids: ['snap_base'] });
  await engine('sketch.line', { points: [[32, 0], [50, 18]], ids: ['snap_rise'] });
  await engine('sketch.line', { points: [[30, 22], [52, 0]], ids: ['snap_fall'] });

  // Draw in the running viewport from close to the line midpoint. On release, type a driving
  // length into the live dimension field and confirm it.
  await call('ui.start', { command: 'sketch.line' });
  const numericEnd = await startSketchSegment([10.1, 0.1], [10, 8]);
  await pressKey('A', { cmd: true });
  await call('ui.text', { text: '8' });
  await nextUiFrame();
  await pressKey('Tab');
  await call('ui.text', { text: '30 deg' });
  await nextUiFrame();
  await pressKey('Enter');
  try {
    await waitFor('the first viewport line to commit', async () => {
      const state = await engine('document.inspect');
      return state.sketches?.[0]?.curves >= 4 && state;
    });
  } catch (error) {
    const ui = await call('ui.inspect');
    const details = await engine('sketch.inspect');
    const debugShot = await screenshot('line-commit-debug.png');
    throw new Error(`${error.message}; ui=${JSON.stringify(ui)}; curves=${JSON.stringify(details.curves)} constraints=${JSON.stringify(details.constraints)} screenshot=${debugShot}; app_stderr=${stderr.slice(-4000)}`);
  }
  const sketch = await engine('sketch.inspect');
  const midpointConstraintPresent = sketch.constraints?.some((constraint) => constraint.name === 'MidPoint');
  const midShot = await screenshot('midpoint-and-numeric-line.png');
  assert(midpointConstraintPresent, `viewport line drawing near the midpoint did not create a persistent midpoint constraint; curves=${JSON.stringify(sketch.curves)} constraints=${JSON.stringify(sketch.constraints)} screenshot=${midShot}`);
  const drivingLengths = sketch.constraints
    .filter((constraint) => constraint.name === 'LinearDimension' && constraint.param)
    .map((constraint) => Number(String(constraint.expression ?? '').replace(/[^\d.eE+-]/g, '')))
    .filter(Number.isFinite);
  assert(drivingLengths.some((value) => Math.abs(value - 8) < 1e-6), `the live 8 mm entry was not retained as a driving dimension: ${JSON.stringify(drivingLengths)}`);
  const committedLine = sketch.curves?.find((curve) => curve.id === 'l1' && curve.type === 'line');
  assert(committedLine?.start_at && committedLine?.end_at, `the committed dimensioned line is absent: ${JSON.stringify(sketch.curves)}`);
  const dx = committedLine.end_at[0] - committedLine.start_at[0];
  const dy = committedLine.end_at[1] - committedLine.start_at[1];
  assert(Math.abs(Math.hypot(dx, dy) - 8) < 1e-6 && Math.abs(Math.atan2(dy, dx) - Math.PI / 6) < 1e-6, `the resulting line geometry does not measure 8 mm at 30 degrees: ${JSON.stringify(committedLine)}`);
  process.stderr.write('Midpoint and numeric line acceptance passed.\n');

  // Draw through an analytic crossing and require the endpoint to remain constrained to both
  // source curves after the UI gesture is committed.
  await call('ui.start', { command: 'sketch.line' });
  await startSketchSegment([42.1, 10.1], [55, 10]);
  await pressKey('Enter');
  await waitFor('the intersection line to commit', async () => {
    const state = await engine('document.inspect');
    return state.sketches?.[0]?.curves >= 5 && state;
  });
  const currentSketch = await engine('sketch.inspect');
  const onCurve = currentSketch?.constraints?.filter((constraint) => constraint.type === 'point_on_curve') ?? [];
  const paired = new Map();
  for (const constraint of onCurve) {
    const point = constraint.p;
    const curve = constraint.c;
    if (point == null || curve == null) continue;
    paired.set(point, [...(paired.get(point) ?? []), curve]);
  }
  assert([...paired.values()].some((curves) => new Set(curves).size >= 2), 'viewport line drawing at a curve intersection did not persist both curve constraints');
  const intersectionShot = await screenshot('intersection-snap.png');
  process.stderr.write('Intersection snap acceptance passed.\n');

  // Build a native test solid, select an edge in the running viewport, and record its length
  // label for visual GUI review.
  await engine('sketch.finish');
  await engine('solid.box', { length: 20, width: 12, height: 8, operation: 'new_body', body_name: 'Acceptance Body' });
  await call('ui.view', { view: 'fit' });
  const edges = await engine('model.edges', { body: 'Acceptance Body' });
  const edge = edges.edges.find((candidate) => Math.abs(candidate.length - 20) < 1e-6);
  assert(edge?.mid?.length === 3, 'acceptance body has no 20 mm edge');
  const edgeScreen = await call('ui.at', { world: edge.mid });
  await call('ui.click', { x: edgeScreen[0], y: edgeScreen[1] });
  const selectedEdge = await waitFor('edge selection in the native viewport', async () => {
    const result = await call('ui.selection');
    return JSON.stringify(result.selection).toLowerCase().includes('edge') && result;
  });
  process.stderr.write(`Selected edge state ${JSON.stringify(selectedEdge.selection)}; measured edge ${edge.length} mm.\n`);
  const edgeShot = await screenshot('selected-edge-length.png');
  process.stderr.write(`Selected straight edge ${edge.length} mm; screenshot=${edgeShot}.\n`);

  // Measure a circular half-edge on a separate cylinder; its expected arc length is exact.
  await engine('solid.cylinder', { base: [40, 0, 0], radius: 5, height: 10, operation: 'new', body_name: 'Curved Acceptance Body' });
  await call('ui.view', { view: 'fit' });
  const cylinderEdges = await engine('model.edges', { body: 'Curved Acceptance Body' });
  const curvedEdge = cylinderEdges.edges.find((candidate) => candidate.length > 10 && candidate.length < 20);
  assert(curvedEdge?.mid?.length === 3 && Math.abs(curvedEdge.length - 5 * Math.PI) < 0.02, `acceptance cylinder has no measured half-circumference edge: ${JSON.stringify(cylinderEdges.edges)}`);
  const curvedScreen = await call('ui.at', { world: curvedEdge.mid });
  await call('ui.move', { x: curvedScreen[0], y: curvedScreen[1] });
  const curvedHover = await waitFor('hover over the cylinder arc', async () => {
    const state = await call('ui.selection');
    const hover = String(state.hover ?? '').toLowerCase();
    return hover.includes('curved acceptance body') && hover.includes('edge') && state;
  });
  await call('ui.click', { x: curvedScreen[0], y: curvedScreen[1] });
  const selectedCurvedEdge = await waitFor('curved edge selection in the native viewport', async () => {
    const result = await call('ui.selection');
    const selection = JSON.stringify(result.selection).toLowerCase();
    return selection.includes('curved acceptance body') && selection.includes('edge') && result;
  });
  assert(JSON.stringify(selectedCurvedEdge.selection).includes('Curved Acceptance Body'), `the selected edge is not from the acceptance cylinder: ${JSON.stringify(selectedCurvedEdge.selection)}; candidate=${JSON.stringify(curvedEdge)} screen=${JSON.stringify(curvedScreen)} screenshot=${await screenshot('curved-edge-selection-debug.png')}`);
  const curvedShot = await screenshot('selected-curved-edge-length.png');
  process.stderr.write(`Selected curved edge ${curvedEdge.length} mm (expected ${5 * Math.PI} mm); screenshot=${curvedShot}.\n`);

  // Start the Move dialog for the selected body, switch on Create Copy, and drag its X handle.
  const bodyRow = (await call('ui.handles', { prefix: 'row:Acceptance Body' })).find((handle) => handle.name === 'row:Acceptance Body');
  assert(bodyRow, 'native browser did not publish the acceptance body row');
  await call('ui.click', { x: bodyRow.x, y: bodyRow.y });
  const beforeMove = await engine('document.inspect');
  const beforeMoveHistory = beforeMove.timeline?.length;
  await call('ui.start', { command: 'solid.move' });
  const copyToggle = await call('ui.at', { handle: 'dialog:Create Copy' });
  await call('ui.click', { x: copyToggle[0], y: copyToggle[1] });
  const dragStart = await call('ui.at', { gizmo: 'x' });
  const dragEnd = await call('ui.at', { gizmo: 'x', by: [20, 0, 0] });
  await call('ui.drag', { x0: dragStart[0], y0: dragStart[1], x1: dragEnd[0], y1: dragEnd[1], steps: 12 });
  await waitFor('a visible Move/Copy preview', async () => {
    const state = await call('ui.inspect');
    return state.preview.active && !state.preview.busy && state;
  }, 30000);
  const beforeAccept = await engine('document.inspect');
  assert(sameDocumentModel(beforeAccept, beforeMove), `Move/Copy preview mutated the document before acceptance: before=${JSON.stringify(beforeMove)} after=${JSON.stringify(beforeAccept)}`);
  const moveShot = await screenshot('move-copy-live-preview.png');
  process.stderr.write('Move/Copy preview acceptance passed.\n');
  const cancelButtons = await call('ui.handles', { prefix: 'dialog:' });
  const cancelButton = cancelButtons.find((handle) => /^(dialog:)?Cancel$/i.test(handle.name));
  assert(cancelButton, `Move/Copy cancel button was not exposed: ${JSON.stringify(cancelButtons)}`);
  await call('ui.click', { x: cancelButton.x, y: cancelButton.y });
  const afterCancel = await engine('document.inspect');
  assert(sameDocumentModel(afterCancel, beforeMove), `canceling Move/Copy changed the document: before=${JSON.stringify(beforeMove)} after=${JSON.stringify(afterCancel)}`);
  await waitFor('Move/Copy cancel to clear the live preview', async () => {
    const state = await call('ui.inspect');
    return !state.preview.active && !state.dialog && state;
  });

  // Reopen Move/Copy and accept via its actual dialog button so acceptance does not depend on
  // keyboard focus inside the numeric field.
  await call('ui.start', { command: 'solid.move' });
  const copyToggleAgain = await call('ui.at', { handle: 'dialog:Create Copy' });
  await call('ui.click', { x: copyToggleAgain[0], y: copyToggleAgain[1] });
  const dragStartAgain = await call('ui.at', { gizmo: 'x' });
  const dragEndAgain = await call('ui.at', { gizmo: 'x', by: [20, 0, 0] });
  await call('ui.drag', { x0: dragStartAgain[0], y0: dragStartAgain[1], x1: dragEndAgain[0], y1: dragEndAgain[1], steps: 12 });
  await waitFor('the second Move/Copy preview', async () => {
    const state = await call('ui.inspect');
    return state.preview.active && !state.preview.busy && state;
  }, 30000);
  const buttons = await call('ui.handles', { prefix: 'dialog:' });
  const acceptButton = buttons.find((handle) => /^(dialog:)?(OK|Accept|Apply)$/i.test(handle.name));
  assert(acceptButton, `Move/Copy acceptance button was not exposed: ${JSON.stringify(buttons)}`);
  await call('ui.click', { x: acceptButton.x, y: acceptButton.y });
  await waitFor('Move/Copy acceptance to close its dialog', async () => {
    const state = await call('ui.inspect');
    return !state.dialog && !state.preview.active && state.tool !== 'solid.move' && state;
  });
  const afterAccept = await engine('document.inspect');
  assert(afterAccept.bodies.length === 3, `accepting Move/Copy should create a third body; got ${JSON.stringify(afterAccept.bodies)}`);
  if (beforeMoveHistory != null && afterAccept.timeline) assert(afterAccept.timeline.length > beforeMoveHistory, 'committing Move/Copy did not extend document history');

  const sourceEdges = (await engine('model.edges', { body: 'Acceptance Body' })).edges;
  const copyEdges = (await engine('model.edges', { body: 'Acceptance Body (2)' })).edges;
  const bounds = (edges) => {
    const points = edges.flatMap((candidate) => [candidate.start, candidate.end]).filter((point) => point?.length === 3);
    return [0, 1, 2].map((axis) => [Math.min(...points.map((point) => point[axis])), Math.max(...points.map((point) => point[axis]))]);
  };
  const sourceBounds = bounds(sourceEdges);
  const copyBounds = bounds(copyEdges);
  assert(sourceEdges.length === copyEdges.length && sourceEdges.every((candidate, index) => Math.abs(candidate.length - copyEdges[index].length) < 1e-5), 'Move/Copy geometry does not preserve the source edge lengths');
  assert(Math.abs(copyBounds[0][0] - sourceBounds[0][0] - 20) < 1 && Math.abs(copyBounds[1][0] - sourceBounds[1][0]) < 1 && Math.abs(copyBounds[2][0] - sourceBounds[2][0]) < 1, `Move/Copy did not place the translated copy 20 mm along X: source=${JSON.stringify(sourceBounds)} copy=${JSON.stringify(copyBounds)}`);
  await pressKey('Z', { cmd: true });
  await waitFor('undo of the committed Move/Copy', async () => {
    const state = await engine('document.inspect');
    return state.bodies.length === 2 && state;
  });
  await pressKey('Y', { cmd: true });
  const redone = await waitFor('redo of the committed Move/Copy', async () => {
    const state = await engine('document.inspect');
    return state.bodies.length === 3 && state;
  });

  await call('ui.window', { action: 'close' });
  process.stdout.write(`${JSON.stringify({ status: 'passed', isolatedProfile: true, root, renderer: initial.renderer, midpointAndNumericLine: midShot, intersectionSnap: intersectionShot, selectedStraightEdge: edgeShot, selectedCurvedEdge: curvedShot, moveCopyPreview: moveShot, moveCopyBounds: { source: sourceBounds, copy: copyBounds }, acceptedCopyBodies: afterAccept.bodies.map((body) => body.name), undoRedoBodies: redone.bodies.map((body) => body.name) })}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error.stack ?? error}\n`);
  process.exitCode = 1;
}).finally(async () => {
  if (app && app.exitCode === null) {
    try { if (token) await call('ui.window', { action: 'close' }); } catch {}
    await Promise.race([
      new Promise((r) => app.once('exit', r)),
      new Promise((r) => setTimeout(r, 8000)),
    ]);
    if (app.exitCode === null) app.kill();
  }
});
