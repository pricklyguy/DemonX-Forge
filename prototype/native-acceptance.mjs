import { mkdtempSync, mkdirSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFileSync, spawn } from 'node:child_process';
import { connect } from 'node:net';
import { inflateRawSync } from 'node:zlib';
import { buildNativeMcp } from './build-mcp-native.mjs';

const exe = resolve(process.argv[2] ?? 'prototype/solidcraft/target/release/solidcraft.exe');
const packagedMcpAdapter = process.argv[3] ? resolve(process.argv[3]) : null;
const root = mkdtempSync(join(tmpdir(), 'demonx-forge-native-acceptance-'));
const dataDir = join(root, 'data');
const appData = join(root, 'roaming');
const localAppData = join(root, 'local');
const controlDir = process.platform === 'win32'
  ? join(localAppData, 'DemonX Forge', 'control')
  : process.platform === 'darwin'
    ? join(root, 'Library', 'Application Support', 'DemonX Forge', 'control')
    : join(dataDir, 'demonx-forge', 'control');
let token = '';
mkdirSync(controlDir, { recursive: true });
mkdirSync(dataDir, { recursive: true });
mkdirSync(appData, { recursive: true });

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

let requestId = 0;
function call(port, method, params = {}, auth = token, allowPaths = []) {
  return new Promise((resolvePromise, reject) => {
    const socket = connect(port, '127.0.0.1');
    let buffer = '';
    const timeout = setTimeout(() => { socket.destroy(); reject(new Error(`${method} timed out`)); }, method === 'engine.batch' ? 360000 : 90000);
    socket.setEncoding('utf8');
    const scoped = allowPaths.length ? { ...params, allow_paths: allowPaths } : params;
    socket.once('connect', () => socket.write(`${JSON.stringify({ id: ++requestId, method, params: scoped, token: auth })}\n`));
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

function parse3mfObjects(path) {
  const zip = readFileSync(path);
  const end = zip.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  assert(end >= 0, 'multi-body export is not a ZIP-based 3MF file');
  const count = zip.readUInt16LE(end + 10);
  let offset = zip.readUInt32LE(end + 16);
  for (let i = 0; i < count; i++) {
    assert(zip.readUInt32LE(offset) === 0x02014b50, 'invalid 3MF central directory');
    const method = zip.readUInt16LE(offset + 10);
    const compressed = zip.readUInt32LE(offset + 20);
    const nameLength = zip.readUInt16LE(offset + 28);
    const extraLength = zip.readUInt16LE(offset + 30);
    const commentLength = zip.readUInt16LE(offset + 32);
    const localOffset = zip.readUInt32LE(offset + 42);
    const name = zip.toString('utf8', offset + 46, offset + 46 + nameLength);
    if (name.endsWith('.model')) {
      const localNameLength = zip.readUInt16LE(localOffset + 26);
      const localExtraLength = zip.readUInt16LE(localOffset + 28);
      const start = localOffset + 30 + localNameLength + localExtraLength;
      const packed = zip.subarray(start, start + compressed);
      const xml = (method === 8 ? inflateRawSync(packed) : packed).toString('utf8');
      return [...xml.matchAll(/<object\b/g)].length;
    }
    offset += 46 + nameLength + extraLength + commentLength;
  }
  throw new Error('3MF archive has no model XML');
}

let appProcess;
let mcpProcess;
let controlPort;
let mcpRequestId = 0;
let mcpBuffer = '';
const mcpPending = new Map();

async function startForgeMcp(localData) {
  const adapter = packagedMcpAdapter ?? join(root, 'forge-mcp-native.mjs');
  if (!packagedMcpAdapter) await buildNativeMcp(adapter);
  const env = { ...process.env, LOCALAPPDATA: localData };
  // Exercise the same secure token-file discovery used by the installed stable launcher.
  delete env.SOLIDCRAFT_CONTROL_PORT;
  delete env.FORGE_NATIVE_PORT;
  delete env.SOLIDCRAFT_CONTROL_DIR;
  delete env.SOLIDCRAFT_CONTROL_TOKEN;
  mcpProcess = spawn(process.execPath, [adapter], {
    env,
    stdio: ['pipe', 'pipe', 'pipe'],
    windowsHide: true,
  });
  let stderr = '';
  mcpProcess.stderr.setEncoding('utf8').on('data', (s) => { stderr += s; });
  mcpProcess.stdout.setEncoding('utf8').on('data', (chunk) => {
    mcpBuffer += chunk;
    for (;;) {
      const end = mcpBuffer.indexOf('\n');
      if (end < 0) break;
      const line = mcpBuffer.slice(0, end);
      mcpBuffer = mcpBuffer.slice(end + 1);
      try {
        const message = JSON.parse(line);
        const waiter = mcpPending.get(message.id);
        if (waiter) { mcpPending.delete(message.id); waiter.resolve(message); }
      } catch (error) {
        for (const waiter of mcpPending.values()) waiter.reject(new Error(`MCP bridge emitted invalid JSON: ${line}; ${error}`));
        mcpPending.clear();
      }
    }
  });
  mcpProcess.once('exit', (code) => {
    for (const waiter of mcpPending.values()) waiter.reject(new Error(`MCP bridge exited (${code}): ${stderr.slice(-2000)}`));
    mcpPending.clear();
  });
}

function mcpRequest(method, params = {}, timeoutMs = 90000) {
  const id = ++mcpRequestId;
  return new Promise((resolvePromise, reject) => {
    const timeout = setTimeout(() => { mcpPending.delete(id); reject(new Error(`MCP ${method} timed out`)); }, timeoutMs);
    mcpPending.set(id, {
      resolve: (reply) => { clearTimeout(timeout); resolvePromise(reply); },
      reject: (error) => { clearTimeout(timeout); reject(error); },
    });
    mcpProcess.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`);
  });
}

async function mcpTool(name, args = {}) {
  const reply = await mcpRequest('tools/call', { name, arguments: args }, name === 'forge_run_commands' ? 360000 : 90000);
  assert(!reply.error, `MCP ${name} returned a protocol error: ${reply.error?.message}`);
  return reply.result;
}

async function main() {
  const env = {
    ...process.env,
    APPDATA: appData,
    LOCALAPPDATA: localAppData,
    XDG_DATA_HOME: dataDir,
    SOLIDCRAFT_CRASH_DIR: join(root, 'crashes'),
    SOLIDCRAFT_SAFE_MODE: '1',
    WGPU_BACKEND: 'dx12',
    WGPU_DX12_COMPILER: 'fxc',
  };
  if (process.platform === 'win32') {
    const [domain, user] = execFileSync('whoami', { encoding: 'utf8' }).trim().split('\\');
    if (user) { env.USERDOMAIN = domain; env.USERNAME = user; }
  }
  delete env.SOLIDCRAFT_CONTROL_DIR;
  const app = appProcess = spawn(exe, ['--safe-mode', '--forge-mcp'], { env, stdio: ['ignore', 'ignore', 'pipe'], windowsHide: false });
  let stderr = '';
  app.stderr.setEncoding('utf8').on('data', (s) => { stderr += s; });
  let first;
  const deadline = Date.now() + 240000;
  while (!first && Date.now() < deadline && app.exitCode === null) {
    try {
      const files = readdirSync(controlDir).filter((name) => /^\d+\.token$/.test(name));
      const candidate = files.map((name) => ({ name, mtime: statSync(join(controlDir, name)).mtimeMs })).sort((a, b) => b.mtime - a.mtime)[0];
      if (candidate) {
        controlPort = Number(candidate.name.slice(0, -6));
        token = readFileSync(join(controlDir, candidate.name), 'utf8').trim();
        if (token.length >= 32) first = await call(controlPort, 'ui.inspect');
      }
    } catch { /* Wait for native window creation, port binding and private token write. */ }
    if (!first) await new Promise((r) => setTimeout(r, 500));
  }
  const port = controlPort;
  assert(first, `native app did not expose an auto-discovered authenticated control channel: ${stderr.slice(-2000)}`);
  assert(['gpu', 'cpu'].includes(first.renderer), `native viewport did not report a renderer (renderer=${first.renderer ?? 'unknown'})`);

  let denied = false;
  try { await call(port, 'engine.commands', {}, '00'.repeat(32)); } catch (error) { denied = /unauthorized/i.test(error.message); }
  assert(denied, 'control channel accepted a request with the wrong token');

  await startForgeMcp(localAppData);
  const listed = await mcpRequest('tools/list');
  const toolNames = listed.result.tools.map((tool) => tool.name);
  assert(toolNames.length === 9 && toolNames.includes('forge_run_commands') && toolNames.includes('forge_get_design'), 'native adapter changed the established Forge MCP tool contract');
  const firstBatch = await mcpTool('forge_run_commands', { steps: [
    { command: 'sketch.create', params: { plane: 'XY', name: 'Base Sketch' } },
    { command: 'sketch.rectangle.two_point', params: { p0: [0, 0], p1: [20, 15] } },
    { command: 'sketch.finish', params: {} },
    { command: 'solid.extrude', params: { distance: 8, operation: 'new', name: 'Base Extrude', body_name: 'Plate' } },
    { command: 'solid.box', params: { length: 8, width: 8, height: 6, corner: [25, 0, 0], operation: 'new_body', name: 'Part B feature', body_name: 'Part B seed' } },
    { command: 'solid.box', params: { length: 8, width: 8, height: 6, corner: [40, 0, 0], operation: 'new_body', name: 'Part C feature', body_name: 'Part C seed' } },
  ] });
  assert(!firstBatch.isError, `Forge MCP modeling batch failed: ${firstBatch.content?.[0]?.text}`);
  const firstDesign = JSON.parse(firstBatch.content[0].text);
  assert(['Plate', 'Part B seed', 'Part C seed'].every((name) => firstDesign.bodies.some((body) => body.name === name)), 'Forge MCP batch did not update the native design and browser model');
  assert((await call(port, 'ui.inspect')).home === false, 'the first MCP modeling command moves the native UI from Home to the live design');
  const addParameter = await mcpTool('forge_run_commands', { steps: [{ command: 'parameters.add', params: { name: 'McpSpan', expression: 5, unit: 'mm' } }] });
  assert(!addParameter.isError, `Forge MCP could not add a test parameter: ${addParameter.content?.[0]?.text}`);
  const changeParameter = await mcpTool('forge_set_parameter', { name: 'McpSpan', value: 7 });
  assert(!changeParameter.isError, `Forge MCP could not change a parameter: ${changeParameter.content?.[0]?.text}`);
  const parameterDesign = await mcpTool('forge_get_design');
  assert(JSON.parse(parameterDesign.content[0].text).parameters.some((parameter) => parameter.name === 'McpSpan' && parameter.value === 7), 'Forge MCP parameter change did not reach the native document');
  await mcpTool('forge_set_parameter', { name: 'McpSpan', value: 8 });
  await mcpTool('forge_undo');
  const parameterUndone = await mcpTool('forge_get_design');
  assert(JSON.parse(parameterUndone.content[0].text).parameters.some((parameter) => parameter.name === 'McpSpan' && parameter.value === 7), 'MCP undo did not restore the prior parameter value');
  await mcpTool('forge_redo');
  const parameterRedone = await mcpTool('forge_get_design');
  assert(JSON.parse(parameterRedone.content[0].text).parameters.some((parameter) => parameter.name === 'McpSpan' && parameter.value === 8), 'MCP redo did not restore the changed parameter value');
  await mcpTool('forge_set_parameter', { name: 'McpSpan', value: 7 });
  const listedCommands = await mcpTool('forge_list_commands', { filter: 'fillet' });
  assert(JSON.parse(listedCommands.content[0].text).some((command) => command.id === 'solid.fillet'), 'Forge MCP did not discover the native fillet command');
  const deniedFile = await mcpTool('forge_run_commands', { steps: [{ command: 'file.save', params: { path: join(root, 'must-not-be-written.solidcraft') } }] });
  assert(deniedFile.isError && /Command not allowed/.test(deniedFile.content[0].text), 'Forge MCP exposed native project file access');
  const badCommand = await mcpTool('forge_run_commands', { steps: [{ command: 'solid.not_a_real_feature', params: {} }] });
  assert(badCommand.isError && /unknown|not found|command/i.test(badCommand.content[0].text), 'Forge MCP did not report a native engine command error');

  const faceReply = await call(port, 'engine.execute', { command: 'model.faces', params: { body: 'Plate' } });
  const top = faceReply.faces.find((face) => face.plane_normal?.[2] > 0.9);
  assert(top?.point?.length === 3, 'Plate has no selectable top planar face');

  await call(port, 'ui.start', { command: 'sketch.create' });
  const originPlanePoint = await call(port, 'ui.at', { plane: 'YZ' });
  assert(Array.isArray(originPlanePoint) && originPlanePoint.length === 2, 'YZ origin plane is not available for viewport picking');
  await call(port, 'ui.click', { x: originPlanePoint[0], y: originPlanePoint[1] });
  let originSketch;
  const sketchDeadline = Date.now() + 5000;
  while (Date.now() < sketchDeadline) {
    originSketch = await call(port, 'engine.execute', { command: 'document.inspect' });
    if (originSketch.active_sketch != null) break;
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 100));
  }
  if (originSketch?.active_sketch == null) {
    const selection = await call(port, 'ui.selection');
    const screenshot = join(root, 'origin-plane-debug.png');
    await call(port, 'ui.screenshot', { path: screenshot }, token, [root]);
    throw new Error(`clicking the viewport YZ origin plane did not start a sketch; screen point=${JSON.stringify(originPlanePoint)}, selection=${JSON.stringify(selection)}, screenshot=${screenshot}`);
  }
  await call(port, 'engine.execute', { command: 'sketch.rectangle.two_point', params: { p0: [0, 0], p1: [4, 4] } });
  await call(port, 'engine.execute', { command: 'sketch.finish' });

  await call(port, 'ui.view', { view: 'top' });
  const faceSketchSetupStarted = performance.now();
  await call(port, 'ui.start', { command: 'sketch.create' });
  const sketchFacePoint = await call(port, 'ui.at', { world: top.point });
  await call(port, 'ui.click', { x: sketchFacePoint[0], y: sketchFacePoint[1] });
  let faceSketch;
  const faceSketchDeadline = Date.now() + 5000;
  while (Date.now() < faceSketchDeadline) {
    faceSketch = await call(port, 'engine.execute', { command: 'document.inspect' });
    if (faceSketch.active_sketch != null) break;
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 100));
  }
  if (faceSketch?.active_sketch == null) {
    const selection = await call(port, 'ui.selection');
    const screenshot = join(root, 'face-picker-debug.png');
    await call(port, 'ui.screenshot', { path: screenshot }, token, [root]);
    throw new Error(`viewport face picking did not start a sketch on Plate; face point=${JSON.stringify(sketchFacePoint)}, selection=${JSON.stringify(selection)}, screenshot=${screenshot}`);
  }
  const faceSketchSetupMs = performance.now() - faceSketchSetupStarted;
  await call(port, 'engine.execute', { command: 'sketch.rectangle.two_point', params: { p0: [-2, -2], p1: [2, 2] } });
  await call(port, 'engine.execute', { command: 'sketch.finish' });
  const faceSketchDocument = await call(port, 'engine.execute', { command: 'document.inspect' });
  const faceSketchName = faceSketchDocument.sketches.find((sketch) => sketch.id === faceSketch.active_sketch)?.name;
  assert(faceSketchName, 'the face-attached sketch was not preserved in the document');
  await call(port, 'engine.execute', { command: 'solid.extrude', params: { sketch: faceSketchName, distance: 2, operation: 'join', targets: ['Plate'], name: 'Face Boss' } });
  await call(port, 'engine.execute', { command: 'timeline.redefine', params: { feature: 'Face Boss', command: 'solid.extrude', params: { sketch: faceSketchName, distance: 3, operation: 'join', targets: ['Plate'], name: 'Face Boss' } } });

  const edgeReply = await call(port, 'engine.execute', { command: 'model.edges', params: { body: 'Plate' } });
  const edge = [...edgeReply.edges].sort((a, b) => b.length - a.length)[0];
  assert(edge?.mid?.length === 3, 'Plate has no selectable edges');
  await call(port, 'engine.execute', { command: 'solid.fillet', params: { body: 'Plate', edges: [edge.mid], radius: 0.5, name: 'Edge Round' } });
  await mcpTool('forge_undo');
  const undoneFillet = await call(port, 'engine.execute', { command: 'document.inspect' });
  assert(!undoneFillet.timeline.some((feature) => feature.name === 'Edge Round'), 'MCP undo did not remove the last fillet feature');
  await mcpTool('forge_redo');
  const redoneFillet = await call(port, 'engine.execute', { command: 'document.inspect' });
  assert(redoneFillet.timeline.some((feature) => feature.name === 'Edge Round'), 'MCP redo did not restore the fillet feature');

  await call(port, 'ui.view', { view: 'fit' });

  async function browserRow(name) {
    const handles = await call(port, 'ui.handles', { prefix: `row:${name}` });
    return handles.find((h) => h.name === `row:${name}`);
  }
  async function bodyMenu(name) {
    const item = await browserRow(name);
    assert(item, `native UI did not publish a selectable ${name} browser row`);
    await call(port, 'ui.menu', { x: item.x, y: item.y, target: { type: 'body', name } });
    let menu = await call(port, 'ui.menu');
    const deadline = Date.now() + 3000;
    while (!menu.items?.length && Date.now() < deadline) {
      await new Promise((resolvePromise) => setTimeout(resolvePromise, 100));
      menu = await call(port, 'ui.menu');
    }
    return menu;
  }

  const handles = await call(port, 'ui.handles', { prefix: 'row:Plate' });
  const plateRow = handles.find((h) => h.name === 'row:Plate');
  if (plateRow) {
    await call(port, 'ui.click', { x: plateRow.x, y: plateRow.y });
    let selection = await call(port, 'ui.selection');
    const selectionDeadline = Date.now() + 3000;
    while (!JSON.stringify(selection).includes('Plate') && Date.now() < selectionDeadline) {
      await new Promise((resolvePromise) => setTimeout(resolvePromise, 100));
      selection = await call(port, 'ui.selection');
    }
    assert(JSON.stringify(selection).includes('Plate'), `clicking the browser row did not select Plate: ${JSON.stringify(selection)}`);
  } else {
    throw new Error('native UI did not publish a selectable Plate browser row');
  }

  for (const [from, to] of [['Part B seed', 'Part B'], ['Part C seed', 'Part C']]) {
    const menu = await bodyMenu(from);
    const rename = menu.items?.find((item) => item.id === 'ui.rename' || item.label === 'Rename');
    assert(rename, `context menu for ${from} did not offer Rename`);
    await call(port, 'ui.menuPick', { item: rename.id ?? rename.label });
    await call(port, 'ui.rename', { text: to, commit: true });
    assert(await browserRow(to), `renaming ${from} in the browser did not create row ${to}`);
  }

  const partBRow = await browserRow('Part B');
  await call(port, 'ui.click', { x: partBRow.x, y: partBRow.y });
  let partBSelection = await call(port, 'ui.selection');
  const partBSelectionDeadline = Date.now() + 3000;
  while (!JSON.stringify(partBSelection).includes('Part B') && Date.now() < partBSelectionDeadline) {
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 100));
    partBSelection = await call(port, 'ui.selection');
  }
  assert(JSON.stringify(partBSelection).includes('Part B'), `clicking Part B did not select it independently: ${JSON.stringify(partBSelection)}`);

  let menu = await bodyMenu('Part B');
  const hide = menu.items?.find((item) => item.id === 'ui.hide' || item.label === 'Show/Hide');
  assert(hide, 'body context menu did not offer Hide');
  await call(port, 'ui.menuPick', { item: hide.id });
  let visibility = (await call(port, 'ui.inspect')).visibility;
  assert(visibility.hidden_bodies.includes('Part B'), 'context-menu Hide did not hide Part B');
  menu = await bodyMenu('Part B');
  const show = menu.items?.find((item) => item.id === 'ui.show' || item.label === 'Show/Hide');
  assert(show, 'hidden body context menu did not offer Show');
  await call(port, 'ui.menuPick', { item: show.id });
  visibility = (await call(port, 'ui.inspect')).visibility;
  assert(!visibility.hidden_bodies.includes('Part B'), 'context-menu Show did not restore Part B');
  menu = await bodyMenu('Part B');
  const isolate = menu.items?.find((item) => item.id === 'ui.isolate' || item.label === 'Isolate');
  assert(isolate, 'body context menu did not offer Isolate');
  await call(port, 'ui.menuPick', { item: isolate.id });
  const isolated = await call(port, 'ui.inspect');
  assert(['Plate', 'Part C'].every((name) => isolated.visibility.hidden_bodies.includes(name)), 'Isolate did not hide the other bodies');
  await call(port, 'ui.menu', { close: true });
  await call(port, 'engine.execute', { command: 'browser.visibility', params: { items: ['Plate', 'Part B', 'Part C'], visible: true } });
  // Use an unsketched body for this independent face-picking check; Plate's sketch profile can
  // legitimately take priority over a face where their screen-space regions overlap.
  const selectableFaces = await call(port, 'engine.execute', { command: 'model.faces', params: { body: 'Part B' } });
  const selectableFace = selectableFaces.faces.find((face) => face.plane_normal?.[2] > 0.9);
  assert(selectableFace?.point?.length === 3, 'Part B has no selectable top face');
  await call(port, 'ui.view', { view: 'top' });
  const facePoint = await call(port, 'ui.at', { world: selectableFace.point });
  await call(port, 'ui.click', { x: facePoint[0], y: facePoint[1] });
  let selectedFace = await call(port, 'ui.selection');
  const faceSelectionDeadline = Date.now() + 3000;
  while (!JSON.stringify(selectedFace).toLowerCase().includes('face') && Date.now() < faceSelectionDeadline) {
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 100));
    selectedFace = await call(port, 'ui.selection');
  }
  assert(JSON.stringify(selectedFace).toLowerCase().includes('face'), `viewport click did not select a face at ${JSON.stringify(facePoint)}: ${JSON.stringify(selectedFace)}`);

  const inspection = await call(port, 'engine.execute', { command: 'document.inspect', params: { measure: true } });
  assert(['Plate', 'Part B', 'Part C'].every((name) => inspection.bodies.some((body) => body.name === name)), 'three named bodies are not present in the live document');
  assert(inspection.bodies.find((body) => body.name === 'Plate')?.volume_mm3 > 0, 'Plate has no positive volume');
  assert(inspection.timeline.some((feature) => feature.name === 'Face Boss') && inspection.timeline.some((feature) => feature.name === 'Edge Round'), 'edited sketch/extrude/fillet features are missing from history');

  const measurement = await mcpTool('forge_measure', { body: 'Plate' });
  assert(!measurement.isError && JSON.parse(measurement.content[0].text).bodies.some((body) => body.name === 'Plate'), 'Forge MCP could not measure the native body');
  const featureQuery = await mcpTool('forge_query', { command: 'timeline.inspect', params: { feature: 'Face Boss' } });
  assert(!featureQuery.isError && featureQuery.content[0].text.includes('Face Boss'), 'Forge MCP could not inspect a native history feature');
  const mcpScreenshot = await mcpTool('forge_screenshot', { view: 'fit', width: 600, height: 400 });
  assert(mcpScreenshot.content[0]?.type === 'image' && mcpScreenshot.content[0]?.mimeType === 'image/png', 'Forge MCP screenshot did not return a PNG image');

  const saved = join(root, 'three-body.solidcraft');
  await call(port, 'engine.execute', { command: 'file.save', params: { path: saved } }, token, [root]);
  await call(port, 'engine.execute', { command: 'doc.open', params: { path: saved } }, token, [root]);
  const reopened = await call(port, 'engine.execute', { command: 'document.inspect', params: { measure: true } });
  assert(['Plate', 'Part B', 'Part C'].every((name) => reopened.bodies.some((body) => body.name === name)), 'save/reopen lost a body name');
  assert(reopened.timeline.some((feature) => feature.name === 'Face Boss'), 'save/reopen lost feature history');

  const stl = join(root, 'plate-only.stl');
  const allStl = join(root, 'all-bodies.stl');
  const threeMf = join(root, 'three-bodies.3mf');
  await call(port, 'engine.execute', { command: 'file.save_mesh', params: { path: stl, format: 'stl', bodies: ['Plate'] } }, token, [root]);
  await call(port, 'engine.execute', { command: 'file.save_mesh', params: { path: allStl, format: 'stl', bodies: ['Plate', 'Part B', 'Part C'] } }, token, [root]);
  await call(port, 'engine.execute', { command: 'file.save_mesh', params: { path: threeMf, format: '3mf', bodies: ['Plate', 'Part B', 'Part C'] } }, token, [root]);
  assert(statSync(stl).size > 84, 'single-body STL export is empty');
  assert(statSync(allStl).size > statSync(stl).size, 'body-scoped STL export did not exclude the other bodies');
  assert(parse3mfObjects(threeMf) === 3, 'multi-body 3MF did not preserve three separate mesh objects');

  // Capture the clean three-body state before the intentional out-of-scope save refusal adds a
  // security toast to the application window.
  const screenshot = join(root, 'demonx-forge-three-body.png');
  const shot = await call(port, 'ui.screenshot', { path: screenshot }, token, [root]);
  assert(!shot.hidden && statSync(screenshot).size > 1000, 'native application screenshot was not captured');

  let escaped = false;
  try {
    await call(port, 'engine.execute', { command: 'file.save', params: { path: join(tmpdir(), 'demonx-forge-outside.solidcraft') } }, token, [root]);
  } catch (error) {
    escaped = /allow_paths|outside|scope/i.test(error.message);
  }
  assert(escaped, 'control channel wrote a design outside its explicit allow_paths scope');

  let pythonSdkVerified = false;
  let pythonSdkSingleUndo;
  if (process.env.FORGE_TEST_PYTHON_SDK === '1') {
    const sdkRoot = resolve('prototype/python-sdk');
    const sdkProbe = String.raw`
import json, sys
from demonx_forge import ForgeScript, ScriptError, submit
launcher, node = sys.argv[1], sys.argv[2]
failed = ForgeScript("Python SDK rollback probe")
failed.add("solid.box", length=5, width=5, height=5, corner=[60, 0, 0], operation="new_body", body_name="SDK Rollback Probe")
failed.add("solid.fillet", edges=[[999, 999, 999]], radius=1)
try:
    submit(failed, launcher=launcher, node=node, timeout=120)
except ScriptError as error:
    print(json.dumps({"rollback_error": str(error)}))
else:
    raise SystemExit("the invalid fillet unexpectedly succeeded")
success = ForgeScript("Python SDK success")
success.add("solid.box", length=5, width=5, height=5, corner=[70, 0, 0], operation="new_body", body_name="Python SDK Body")
success.add("solid.box", length=5, width=5, height=5, corner=[80, 0, 0], operation="new_body", body_name="Python SDK Body 2")
result = submit(success, launcher=launcher, node=node, timeout=120)
print(json.dumps({"success": result.get("isError") is not True, "result": result}))
`;
    const python = process.env.FORGE_PYTHON ?? (process.platform === 'win32' ? 'python' : 'python3');
    const sdkEnv = { ...process.env, LOCALAPPDATA: localAppData, PYTHONPATH: [sdkRoot, process.env.PYTHONPATH].filter(Boolean).join(process.platform === 'win32' ? ';' : ':') };
    const sdkOutput = execFileSync(python, ['-c', sdkProbe, packagedMcpAdapter ?? '', process.execPath], { env: sdkEnv, encoding: 'utf8', timeout: 360000 });
    const sdkLines = sdkOutput.trim().split(/\r?\n/).map((line) => JSON.parse(line));
    assert(sdkLines.some((row) => row.rollback_error?.includes('solid.fillet')), `Python SDK failure did not report the failing feature: ${sdkOutput}`);
    const sdkSuccess = sdkLines.find((row) => row.success === true);
    assert(sdkSuccess, `Python SDK did not submit a successful native command batch: ${sdkOutput}`);
    const sdkDesign = await mcpTool('forge_get_design');
    const sdkBodies = JSON.parse(sdkDesign.content[0].text).bodies;
    assert(sdkBodies.some((body) => body.name === 'Python SDK Body'), 'successful Python SDK command did not update the native document');
    assert(sdkBodies.some((body) => body.name === 'Python SDK Body 2'), 'second successful Python SDK command did not update the native document');
    assert(!sdkBodies.some((body) => body.name === 'SDK Rollback Probe'), 'failed Python SDK batch left partial geometry in the document');
    await mcpTool('forge_undo');
    const sdkUndoDesign = JSON.parse((await mcpTool('forge_get_design')).content[0].text).bodies;
    pythonSdkSingleUndo = !sdkUndoDesign.some((body) => ['Python SDK Body', 'Python SDK Body 2'].includes(body.name));
    assert(pythonSdkSingleUndo, 'one Forge undo must remove every body created by the Python SDK script');
    await mcpTool('forge_redo');
    const sdkRedoDesign = JSON.parse((await mcpTool('forge_get_design')).content[0].text).bodies;
    assert(['Python SDK Body', 'Python SDK Body 2'].every((name) => sdkRedoDesign.some((body) => body.name === name)), 'Python SDK redo did not restore the complete submitted batch');
    // External scripts leave their progress/result window open for the user. Dismiss
    // that native modal as a real user would before exercising the large-model browser.
    await call(port, 'ui.key', { key: 'Escape' });
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 150));
    pythonSdkVerified = true;
  }

  let largeModelResults;
  if (process.env.FORGE_TEST_LARGE_MODEL === '1') {
    const largeNames = Array.from({ length: 50 }, (_, index) => `Large Part ${String(index + 1).padStart(3, '0')}`);
    const steps = largeNames.map((body_name, index) => ({
      command: 'solid.box',
      params: {
        length: 18 + (index % 3), width: 14 + (index % 5), height: 8 + (index % 4),
        corner: [(index % 10) * 24, Math.floor(index / 10) * 24, 0], operation: 'new_body',
        body_name, name: `${body_name} Seed`,
      },
    }));
    const generationStarted = performance.now();
    for (let offset = 0; offset < steps.length; offset += 10) {
      let generated;
      try { generated = await mcpTool('forge_run_commands', { steps: steps.slice(offset, offset + 10) }); }
      catch (error) { throw new Error(`50-body fixture batch ${Math.floor(offset / 10) + 1} transport error: ${error}; native_exit=${appProcess?.exitCode}; native_stderr=${stderr.slice(-3000)}`); }
      assert(!generated.isError, `50-body fixture batch ${Math.floor(offset / 10) + 1} failed: ${generated.content?.[0]?.text}; native_exit=${appProcess?.exitCode}; native_stderr=${stderr.slice(-3000)}`);
    }
    const generationMs = performance.now() - generationStarted;
    const inspectStarted = performance.now();
    const largeDesignReply = await mcpTool('forge_get_design');
    const largeDesign = JSON.parse(largeDesignReply.content[0].text);
    const inspectionMs = performance.now() - inspectStarted;
    assert(largeNames.every((name) => largeDesign.bodies.some((body) => body.name === name)), '50 independently named bodies are not present');
    assert(largeDesign.timeline.length >= 50, 'large-model fixture does not contain substantial feature history');

    const largeBeforeEdit = await call(port, 'engine.execute', { command: 'document.inspect', params: { measure: true } });
    const volumeBeforeEdit = largeBeforeEdit.bodies.find((body) => body.name === largeNames[0])?.volume_mm3;
    const parameterEditStarted = performance.now();
    const editedFeature = await mcpTool('forge_run_commands', { steps: [{
      command: 'timeline.redefine',
      params: {
        feature: `${largeNames[0]} Seed`, command: 'solid.box',
        params: { length: 20, width: 14, height: 8, corner: [0, 0, 0], operation: 'new_body', name: `${largeNames[0]} Seed`, body_name: largeNames[0] },
      },
    }] });
    assert(!editedFeature.isError, `MCP could not edit a feature in the populated large model: ${editedFeature.content?.[0]?.text}`);
    const largeAfterEdit = await call(port, 'engine.execute', { command: 'document.inspect', params: { measure: true } });
    const volumeAfterEdit = largeAfterEdit.bodies.find((body) => body.name === largeNames[0])?.volume_mm3;
    const parameterEditMs = performance.now() - parameterEditStarted;
    assert(typeof volumeBeforeEdit === 'number' && typeof volumeAfterEdit === 'number' && volumeAfterEdit > volumeBeforeEdit, 'MCP timeline edit did not rebuild the first large-model body');

    const scrollStarted = performance.now();
    let targetRow;
    for (let attempt = 0; attempt < 12 && !targetRow; attempt++) {
      await call(port, 'ui.scroll', { x: 110, y: 420, delta: -900 });
      await new Promise((resolvePromise) => setTimeout(resolvePromise, 50));
      targetRow = (await browserRow(largeNames.at(-1)));
    }
    if (!targetRow) {
      const debugScreenshot = join(root, 'large-browser-scroll-debug.png');
      const debugUi = await call(port, 'ui.inspect');
      await call(port, 'ui.screenshot', { path: debugScreenshot }, token, [root]);
      throw new Error(`the browser did not reveal the last named body after scrolling; viewport=${JSON.stringify(debugUi.viewport)}, screenshot=${debugScreenshot}`);
    }
    const browserScrollMs = performance.now() - scrollStarted;
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 120));
    const liveRowPoint = await call(port, 'ui.at', { browser: largeNames.at(-1) });
    targetRow.x = liveRowPoint[0];
    targetRow.y = liveRowPoint[1];
    const selectionStarted = performance.now();
    await call(port, 'ui.move', { x: targetRow.x, y: targetRow.y });
    await call(port, 'ui.click', { x: targetRow.x, y: targetRow.y });
    let selected = await call(port, 'ui.selection');
    const selectionDeadline = Date.now() + 3000;
    while (!JSON.stringify(selected).includes(largeNames.at(-1)) && Date.now() < selectionDeadline) {
      await new Promise((resolvePromise) => setTimeout(resolvePromise, 20));
      selected = await call(port, 'ui.selection');
    }
    const rowSelectionMs = performance.now() - selectionStarted;
    if (!JSON.stringify(selected).includes(largeNames.at(-1))) {
      const screenshot = join(root, 'large-browser-selection-debug.png');
      await call(port, 'ui.screenshot', { path: screenshot }, token, [root]);
      throw new Error(`scrolled browser row selection failed: row=${JSON.stringify(targetRow)}, state=${JSON.stringify(selected)}, screenshot=${screenshot}`);
    }

    let menu = await bodyMenu(largeNames.at(-1));
    let action = menu.items?.find((item) => item.id === 'ui.rename' || item.label === 'Rename');
    assert(action, 'large-model body context menu did not offer Rename');
    const renameStarted = performance.now();
    await call(port, 'ui.menuPick', { item: action.id ?? action.label });
    await call(port, 'ui.rename', { text: 'Large Part 050 Renamed', commit: true });
    assert(await browserRow('Large Part 050 Renamed'), 'large-model browser rename did not update the body row');
    const renameMs = performance.now() - renameStarted;
    const visibilityStarted = performance.now();
    menu = await bodyMenu('Large Part 050 Renamed');
    action = menu.items?.find((item) => item.id === 'ui.hide' || item.label === 'Show/Hide');
    await call(port, 'ui.menuPick', { item: action?.id ?? action?.label });
    let visibleState = (await call(port, 'ui.inspect')).visibility;
    assert(visibleState.hidden_bodies.includes('Large Part 050 Renamed'), 'large-model body Hide failed');
    menu = await bodyMenu('Large Part 050 Renamed');
    action = menu.items?.find((item) => item.id === 'ui.show' || item.label === 'Show/Hide');
    await call(port, 'ui.menuPick', { item: action?.id ?? action?.label });
    visibleState = (await call(port, 'ui.inspect')).visibility;
    assert(!visibleState.hidden_bodies.includes('Large Part 050 Renamed'), 'large-model body Show failed');
    const hideShowMs = performance.now() - visibilityStarted;
    const isolateStarted = performance.now();
    menu = await bodyMenu('Large Part 050 Renamed');
    action = menu.items?.find((item) => item.id === 'ui.isolate' || item.label === 'Isolate');
    assert(action, 'large-model body context menu did not offer Isolate');
    await call(port, 'ui.menuPick', { item: action.id });
    const isolateState = (await call(port, 'ui.inspect')).visibility;
    assert(isolateState.hidden_bodies.filter((name) => name.startsWith('Large Part ')).length === 49, 'large-model Isolate did not hide the other 49 fixture bodies');
    const isolateMs = performance.now() - isolateStarted;
    await call(port, 'ui.menu', { close: true });
    const renamedLargeNames = [...largeNames.slice(0, 49), 'Large Part 050 Renamed'];
    await call(port, 'engine.execute', { command: 'browser.visibility', params: { items: renamedLargeNames, visible: true } });

    const largeFaceReply = await call(port, 'engine.execute', { command: 'model.faces', params: { body: 'Large Part 050 Renamed' } });
    const largeFace = largeFaceReply.faces.find((face) => face.plane_normal?.[2] > 0.9);
    assert(largeFace?.point?.length === 3, 'last body in the large fixture has no selectable top face');
    await call(port, 'engine.execute', { command: 'select.clear' });
    await call(port, 'ui.view', { view: 'fit' });
    await call(port, 'ui.view', { view: 'top' });
    const largeFacePoint = await call(port, 'ui.at', { world: largeFace.point });
    const facePickStarted = performance.now();
    await call(port, 'ui.click', { x: largeFacePoint[0], y: largeFacePoint[1] });
    let facePicked = await call(port, 'ui.selection');
    const faceDeadline = Date.now() + 3000;
    while (!JSON.stringify(facePicked).toLowerCase().includes('face') && Date.now() < faceDeadline) {
      await new Promise((resolvePromise) => setTimeout(resolvePromise, 20));
      facePicked = await call(port, 'ui.selection');
    }
    const faceSelectionMs = performance.now() - facePickStarted;
    if (!JSON.stringify(facePicked).toLowerCase().includes('face')) {
      const screenshot = join(root, 'large-face-selection-debug.png');
      await call(port, 'ui.screenshot', { path: screenshot }, token, [root]);
      throw new Error(`face selection failed on dense fixture: face=${JSON.stringify(largeFace)}, point=${JSON.stringify(largeFacePoint)}, state=${JSON.stringify(facePicked)}, screenshot=${screenshot}`);
    }

    const largeEdgeReply = await call(port, 'engine.execute', { command: 'model.edges', params: { body: 'Large Part 050 Renamed' } });
    const largeEdge = [...largeEdgeReply.edges].sort((a, b) => b.length - a.length)[0];
    assert(largeEdge?.mid?.length === 3, 'last body in the large fixture has no selectable edge');
    await call(port, 'engine.execute', { command: 'select.clear' });
    const largeEdgePoint = await call(port, 'ui.at', { world: largeEdge.mid });
    const edgePickStarted = performance.now();
    await call(port, 'ui.click', { x: largeEdgePoint[0], y: largeEdgePoint[1] });
    let edgePicked = await call(port, 'ui.selection');
    const edgeDeadline = Date.now() + 3000;
    while (!JSON.stringify(edgePicked).toLowerCase().includes('edge') && Date.now() < edgeDeadline) {
      await new Promise((resolvePromise) => setTimeout(resolvePromise, 20));
      edgePicked = await call(port, 'ui.selection');
    }
    const edgeSelectionMs = performance.now() - edgePickStarted;
    assert(JSON.stringify(edgePicked).toLowerCase().includes('edge'), `edge selection failed on dense fixture at ${JSON.stringify(largeEdgePoint)}: ${JSON.stringify(edgePicked)}`);

    const largeSave = join(root, 'large-model.solidcraft');
    const saveStarted = performance.now();
    await call(port, 'engine.execute', { command: 'file.save_as', params: { path: largeSave } }, token, [root]);
    await call(port, 'engine.execute', { command: 'doc.open', params: { path: largeSave } }, token, [root]);
    const reopenedLarge = await call(port, 'engine.execute', { command: 'document.inspect', params: { measure: true } });
    const saveReopenMs = performance.now() - saveStarted;
    assert(largeNames.slice(0, 49).every((name) => reopenedLarge.bodies.some((body) => body.name === name)), 'large-model save/reopen lost body structure');
    assert(reopenedLarge.bodies.some((body) => body.name === 'Large Part 050 Renamed') && reopenedLarge.timeline.length >= 50, 'large-model save/reopen lost rename or parametric history');
    assert(reopenedLarge.bodies.find((body) => body.name === largeNames[0])?.volume_mm3 === volumeAfterEdit, 'large-model save/reopen lost the parametric body edit');

    const largeStl = join(root, 'large-part-050.stl');
    const individualExportStarted = performance.now();
    await call(port, 'engine.execute', { command: 'file.save_mesh', params: { path: largeStl, format: 'stl', bodies: ['Large Part 050 Renamed'] } }, token, [root]);
    const individualStlExportMs = performance.now() - individualExportStarted;
    assert(statSync(largeStl).size > 84, 'individual STL export from the large fixture is empty');
    const large3mf = join(root, 'large-model.3mf');
    const multiExportStarted = performance.now();
    await call(port, 'engine.execute', { command: 'file.save_mesh', params: { path: large3mf, format: '3mf', bodies: renamedLargeNames } }, token, [root]);
    const multiBodyExportMs = performance.now() - multiExportStarted;
    const objectCount = parse3mfObjects(large3mf);
    assert(objectCount === 50, `large-model 3MF export preserved ${objectCount} objects; expected 50`);
    const viewportBeforePan = await call(port, 'ui.inspect');
    const navigationStarted = performance.now();
    await call(port, 'ui.view', { view: 'front' });
    const viewportAfterPan = await call(port, 'ui.inspect');
    const cameraNavigationMs = performance.now() - navigationStarted;
    assert(JSON.stringify(viewportBeforePan.camera) !== JSON.stringify(viewportAfterPan.camera), 'standard front-view navigation did not update the camera');
    largeModelResults = {
      bodies: largeNames.length,
      featureHistory: reopenedLarge.timeline.length,
      generationBatchMs: Math.round(generationMs),
      mcpInspectionMs: Math.round(inspectionMs),
      browserScrollMs: Math.round(browserScrollMs),
      browserSelectionMs: Math.round(rowSelectionMs),
      browserRenameMs: Math.round(renameMs),
      browserHideShowMs: Math.round(hideShowMs),
      browserIsolateMs: Math.round(isolateMs),
      faceSelectionMs: Math.round(faceSelectionMs),
      edgeSelectionMs: Math.round(edgeSelectionMs),
      faceSketchSetupMs: Math.round(faceSketchSetupMs),
      parameterEditMs: Math.round(parameterEditMs),
      cameraNavigationMs: Math.round(cameraNavigationMs),
      viewportFrameMs: Math.round(viewportAfterPan.frame_ms),
      viewportBuildMs: Math.round(viewportAfterPan.build_ms),
      saveReopenMs: Math.round(saveReopenMs),
      individualStlExportMs: Math.round(individualStlExportMs),
      multiBodyExportMs: Math.round(multiBodyExportMs),
      exported3mfObjects: objectCount,
      documentInspectBytes: Buffer.byteLength(largeDesignReply.content[0].text),
    };
    const largeScreenshot = join(root, 'demonx-forge-50-body.png');
    await call(port, 'ui.screenshot', { path: largeScreenshot }, token, [root]);
    largeModelResults.screenshot = largeScreenshot;
  }

  await call(port, 'ui.window', { action: 'close' });
  process.stdout.write(`${JSON.stringify({ status: 'passed', root, screenshot, bodies: reopened.bodies.map((b) => b.name), historyFeatures: reopened.timeline.length, threeMfObjects: 3, stlBytes: statSync(stl).size, allBodiesStlBytes: statSync(allStl).size, forgeMcpTools: toolNames.length, pythonSdkVerified, pythonSdkSingleUndo, largeModel: largeModelResults, mcpScreenshot: true })}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error.stack ?? error}\n`);
  process.exitCode = 1;
}).finally(async () => {
  if (mcpProcess && mcpProcess.exitCode === null) {
    mcpProcess.stdin.end();
    await Promise.race([
      new Promise((resolvePromise) => mcpProcess.once('exit', resolvePromise)),
      new Promise((resolvePromise) => setTimeout(resolvePromise, 3000)),
    ]);
    if (mcpProcess.exitCode === null) mcpProcess.kill();
  }
  if (appProcess && appProcess.exitCode === null) {
    try { await call(controlPort, 'ui.window', { action: 'close' }); } catch {}
    await Promise.race([
      new Promise((resolvePromise) => appProcess.once('exit', resolvePromise)),
      new Promise((resolvePromise) => setTimeout(resolvePromise, 8000)),
    ]);
    if (appProcess.exitCode === null) appProcess.kill();
  }
  // The app runs only from this harness and uses its isolated temp profile; never touch the user's
  // SolidCraft or Forge data folders. On a failed assertion, end the test-owned process.
});
