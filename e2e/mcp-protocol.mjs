// Packaged MCP regression run against a live Forge server and its real engine.
// Required environment: FORGE_MCP, FORGE_NODE, FORGE_URL.
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';

const mcp = process.env.FORGE_MCP;
const node = process.env.FORGE_NODE || process.execPath;
const url = process.env.FORGE_URL || 'http://127.0.0.1:8120';
if (!mcp) throw new Error('Set FORGE_MCP to the packaged mcp.mjs path');

const child = spawn(node, [mcp], { env: { ...process.env, FORGE_URL: url }, stdio: ['pipe', 'pipe', 'inherit'] });
const pending = new Map();
let nextId = 1;
let failed = 0;
const check = (ok, what, extra = '') => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}${extra ? `  ${extra}` : ''}`);
  if (!ok) failed++;
};
createInterface({ input: child.stdout }).on('line', (line) => {
  let message;
  try { message = JSON.parse(line); }
  catch { check(false, 'MCP stdout contains only JSON-RPC messages', line.slice(0, 80)); return; }
  pending.get(message.id)?.(message);
});
child.on('error', (error) => check(false, 'MCP process starts', error.message));
const rpc = (method, params = {}) => new Promise((resolve, reject) => {
  const id = nextId++;
  const timer = setTimeout(() => { pending.delete(id); reject(new Error(`${method} timed out`)); }, 15_000);
  pending.set(id, (message) => { clearTimeout(timer); pending.delete(id); resolve(message); });
  child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`);
});
const tool = async (name, args = {}) => {
  const response = await rpc('tools/call', { name, arguments: args });
  if (response.error) throw new Error(response.error.message);
  return response.result;
};
const contentJson = (result) => JSON.parse(result.content.find((part) => part.type === 'text').text);

try {
  const init = await rpc('initialize', { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'forge-ci', version: '1' } });
  check(init.result?.serverInfo?.name === 'demonx-forge' && init.result.protocolVersion === '2025-03-26', 'initialize negotiates the established Forge identity and protocol');
  child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' })}\n`);

  const listed = await rpc('tools/list');
  const names = listed.result?.tools?.map((entry) => entry.name) ?? [];
  check(names.join(',') === 'forge_get_design,forge_list_commands,forge_run_commands,forge_query,forge_measure,forge_screenshot,forge_set_parameter,forge_undo,forge_redo', 'tools/list preserves the nine established tool names');

  const initial = contentJson(await tool('forge_get_design'));
  check(initial.bodies.length === 0, 'the integration run begins with an empty design');
  const builtResult = await tool('forge_run_commands', { steps: [
    { command: 'solid.box', params: { length: 40, width: 30, height: 10, corner: [0, 0, 0] } },
    { command: 'solid.hole', params: { position: [20, 15, 10], diameter: 6 } },
  ] });
  const built = contentJson(builtResult);
  check(!builtResult.isError && built.bodies.length === 1, 'forge_run_commands creates a real drilled plate', builtResult.isError ? builtResult.content[0].text : '');

  const measure = contentJson(await tool('forge_measure', { body: built.bodies[0].name }));
  const volume = measure.bodies?.[0]?.volume_mm3;
  check(Number.isFinite(volume) && Math.abs(volume - (12000 - Math.PI * 9 * 10)) < 5, 'forge_measure reports the analytic plate volume', `volume=${volume}`);

  const full = contentJson(await tool('forge_get_design', { detail: 'full' }));
  check(full.bodies[0].faces.length >= 7 && full.bodies[0].edges.length > 10, 'full design inspection returns selectable faces and edges');
  const commands = contentJson(await tool('forge_list_commands', { filter: 'fillet' }));
  check(commands.some((entry) => entry.id === 'solid.fillet'), 'command discovery returns a usable modeling command');

  const parameterAdd = await tool('forge_run_commands', { steps: [{ command: 'parameters.add', params: { name: 'McpCheck', expression: '2' } }] });
  check(!parameterAdd.isError, 'a user parameter can be created through MCP', parameterAdd.isError ? parameterAdd.content[0].text : '');
  const changed = contentJson(await tool('forge_set_parameter', { name: 'McpCheck', value: 3 }));
  check(changed.parameters?.some((parameter) => parameter.name === 'McpCheck' && parameter.value === 3), 'forge_set_parameter changes and reports a real parameter');

  const screenshot = await tool('forge_screenshot', { view: 'iso', width: 400, height: 300 });
  const image = screenshot.content.find((part) => part.type === 'image');
  const png = image ? Buffer.from(image.data, 'base64') : Buffer.alloc(0);
  check(image?.mimeType === 'image/png' && png.subarray(1, 4).toString() === 'PNG', 'forge_screenshot returns PNG image data');

  const undo = contentJson(await tool('forge_undo'));
  const redo = contentJson(await tool('forge_redo'));
  check(undo.timeline.length <= changed.timeline.length && redo.bodies.length === 1, 'undo and redo return the design to valid history states');

  const unsafe = [
    ['file.open', { path: '/etc/passwd' }], ['sketch.insert_dxf', { path: '/etc/passwd' }],
    ['sketch.text', { font: '/etc/passwd' }], ['parameters.import', { path: '/etc/passwd' }],
    ['parameters.export', { path: '/tmp/forge-parameters.json' }], ['timeline.export_script', { path: '/tmp/forge-script.json' }],
  ];
  for (const [command, params] of unsafe) {
    const refused = await tool('forge_run_commands', { steps: [{ command, params }] });
    check(refused.isError === true && /not allowed/i.test(refused.content?.[0]?.text ?? ''), `path-capable command is refused: ${command}`);
  }

  const after = contentJson(await tool('forge_measure', { body: built.bodies[0].name }));
  check(Math.abs(after.bodies?.[0]?.volume_mm3 - volume) < 1e-6, 'refused file commands leave model geometry unchanged');
  const unknown = await rpc('tools/call', { name: 'forge_open_file', arguments: {} });
  check(unknown.error?.code === -32602, 'unknown file tools are rejected');
} catch (error) {
  check(false, 'real MCP integration flow completes', error instanceof Error ? error.message : String(error));
} finally {
  child.stdin.end();
  child.kill();
}

console.log(failed ? `== MCP protocol: ${failed} FAILED` : '== MCP protocol: all passed');
process.exit(failed ? 1 : 0);
