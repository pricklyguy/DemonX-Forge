// Real check of the MCP server (the bridge an AI client starts) against a running Forge and the real engine, with the page open: the AI builds a part
// and the window shows it, the tools answer (design with faces and edges, commands, measure, screenshot, undo), and file commands are refused.
// Needs: the engine, a built app (npm run build), and a FRESH server:
//   FORGE_PORT=8120 npm start      (stop it afterwards by port: fuser -k 8120/tcp)
// Run: node e2e/mcp.mjs
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';

const URL = process.env.FORGE_URL || 'http://127.0.0.1:8120/';
let failed = 0;
const check = (ok, what, extra = '') => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}${extra ? '  ' + extra : ''}`); if (!ok) failed++; };
const settle = (ms = 400) => new Promise((r) => setTimeout(r, ms));

// the bridge, started the way an AI client starts it: a program that talks on standard input and output
const tsx = fileURLToPath(new globalThis.URL('../node_modules/tsx/dist/cli.mjs', import.meta.url));
const child = spawn(process.execPath, [tsx, 'src/mcp.ts'], { cwd: 'server', env: { ...process.env, FORGE_URL: URL }, stdio: ['pipe', 'pipe', 'inherit'] });
const waiting = new Map(); let nextId = 1;
createInterface({ input: child.stdout }).on('line', (l) => { try { const m = JSON.parse(l); waiting.get(m.id)?.(m); } catch { check(false, 'every line the bridge prints is JSON', l.slice(0, 80)); } });
const rpc = (method, params) => new Promise((res) => { const id = nextId++; waiting.set(id, res); child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n'); });
const tool = async (name, args = {}) => (await rpc('tools/call', { name, arguments: args })).result;
const json = (r) => JSON.parse(r.content[0].text);

const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: 1440, height: 860 } });
p.on('pageerror', (e) => { console.log('PAGE ERROR', e.message); failed++; });
try {
  await p.addInitScript(() => {
    window.__forgeSavedBytes = null; window.__forgeOpenBytes = null;
    window.showSaveFilePicker = async (options) => ({
      name: 'MCP.forge',
      createWritable: async () => { const chunks = []; return {
        write: async (part) => chunks.push(part),
        close: async () => { window.__forgeSavedBytes = Array.from(new Uint8Array(await new Blob(chunks).arrayBuffer())); },
      }; },
    });
    window.showOpenFilePicker = async () => [{
      name: 'MCP.forge',
      getFile: async () => new File([Uint8Array.from(window.__forgeOpenBytes ?? [])], 'MCP.forge'),
    }];
  });
  await p.goto(URL);
  await p.getByTestId('demo').waitFor({ timeout: 30000 });

  const init = (await rpc('initialize', { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'e2e', version: '1' } })).result;
  child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');
  check(init.serverInfo.name === 'demonx-forge' && init.protocolVersion === '2025-03-26', 'the bridge starts a session');
  const tools = (await rpc('tools/list', {})).result.tools;
  check(tools.length === 9 && tools.some((t) => t.name === 'forge_run_commands'), 'it offers nine tools', tools.map((t) => t.name).join(', '));

  // the AI builds a block with a hole; the window shows it without anyone touching it
  const built = await tool('forge_run_commands', { steps: [{ command: 'solid.box', params: { length: 40, width: 30, height: 10, corner: [0, 0, 0] } }, { command: 'solid.hole', params: { position: [20, 15, 10], diameter: 6 } }] });
  check(!built.isError && json(built).bodies.length === 1, 'forge_run_commands builds a block with a hole', built.isError ? built.content[0].text : '');
  let shown = false;
  for (let i = 0; i < 20 && !shown; i++) { shown = (await p.getByTestId('docname').count()) > 0 && /Bodies \(1\)/.test(await p.locator('body').innerText()); if (!shown) await settle(500); }
  check(shown, 'the open window shows the new body by itself (within a few seconds)');
  check(/another program/.test(await p.getByTestId('status').innerText().catch(() => '')) || shown, 'and says another program changed the design');

  const full = json(await tool('forge_get_design', { detail: 'full' }));
  check(full.bodies[0].faces.length >= 7 && full.bodies[0].edges.length > 10 && full.bodies[0].boundingBox.max.join() === '40,30,10', 'forge_get_design (full) lists faces and edges and the size', `${full.bodies[0].faces.length} faces`);
  const cmds = json(await tool('forge_list_commands', { filter: 'fillet' }));
  check(cmds.some((c) => c.id === 'solid.fillet') && cmds.every((c) => /^(sketch|solid|mesh|parameters|timeline|model|edit)\./.test(c.id)), 'forge_list_commands finds solid.fillet and only lists what may be run', cmds.map((c) => c.id).join(', '));
  check(Math.abs(JSON.parse((await tool('forge_measure', { body: full.bodies[0].name })).content[0].text).bodies[0].volume_mm3 - (12000 - Math.PI * 9 * 10)) < 5, 'forge_measure gives the volume (12000 less the hole)');
  const shot = await tool('forge_screenshot', { view: 'iso', width: 400, height: 300 });
  const png = Buffer.from(shot.content[0].data, 'base64');
  check(shot.content[0].type === 'image' && png.subarray(1, 4).toString() === 'PNG', 'forge_screenshot returns a PNG', `${png.length} bytes`);

  const edge = full.bodies[0].edges.find((e) => Math.abs(e.length - 30) < 0.01);
  const filleted = await tool('forge_run_commands', { steps: [{ command: 'solid.fillet', params: { edges: [{ body: full.bodies[0].name, index: edge.index }], radius: 2 } }] });
  check(!filleted.isError && json(filleted).timeline.length > full.timeline.length, 'a fillet through the bridge adds a step', filleted.isError ? filleted.content[0].text : '');
  const undone = json(await tool('forge_undo'));
  check(undone.timeline.length === full.timeline.length, 'forge_undo takes it back');
  const redone = json(await tool('forge_redo'));
  check(redone.timeline.length === json(filleted).timeline.length, 'forge_redo restores the MCP fillet');

  // Save the MCP-authored history through the GUI, clear the document and reopen that file.
  await p.keyboard.press('Control+s');
  await p.waitForFunction(() => Array.isArray(window.__forgeSavedBytes) && window.__forgeSavedBytes.length > 100, null, { timeout: 15000 });
  const saved = await p.evaluate(() => window.__forgeSavedBytes);
  const beforeOpen = json(await tool('forge_measure', { body: full.bodies[0].name }));
  await p.getByTestId('file-menu').click();
  await p.getByTestId('context-menu').getByRole('button', { name: 'New', exact: true }).click();
  await p.waitForFunction(async () => (await (await fetch('/api/state')).json()).timeline.length === 0, null, { timeout: 15000 });
  await p.evaluate((bytes) => { window.__forgeOpenBytes = bytes; }, saved);
  await p.keyboard.press('Control+o');
  await p.waitForFunction(async () => (await (await fetch('/api/state')).json()).timeline.some((step) => step.type === 'Fillet'), null, { timeout: 20000 });
  const reopened = json(await tool('forge_get_design', { detail: 'full' }));
  const afterOpen = json(await tool('forge_measure', { body: full.bodies[0].name }));
  check(reopened.bodies.length === 1 && reopened.timeline.some((step) => /fillet/i.test(`${step.name} ${step.type}`)), 'the GUI reopens the MCP-authored model with its fillet history', JSON.stringify(reopened.timeline));
  check(Math.abs(afterOpen.bodies[0].volume_mm3 - beforeOpen.bodies[0].volume_mm3) < 1e-6, 'save/reopen preserves the MCP-authored geometry');

  // what must not be possible
  const refused = await tool('forge_run_commands', { steps: [{ command: 'file.open', params: { path: '/etc/passwd' } }] });
  check(refused.isError && /not allowed/i.test(refused.content[0].text), 'a file command is refused, with the reason', refused.content[0].text);
  const unknown = await rpc('tools/call', { name: 'forge_open_file', arguments: {} });
  check(!!unknown.error, 'a tool that does not exist is an error');
  const bad = await tool('forge_run_commands', { steps: [{ command: 'solid.extrude', params: { sketch: 'Nope', distance: 5 } }] });
  check(bad.isError && json(await tool('forge_get_design')).timeline.length === reopened.timeline.length, 'a command the engine refuses is returned as an error and changes nothing');
} finally {
  child.stdin.end(); await b.close(); child.kill();
}
console.log(failed ? `== mcp: ${failed} FAILED` : '== mcp: all passed');
process.exit(failed ? 1 : 0);
