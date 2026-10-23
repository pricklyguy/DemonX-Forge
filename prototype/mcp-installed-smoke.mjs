import { spawn } from 'node:child_process';
import { resolve } from 'node:path';

const launcher = resolve(process.argv[2] ?? 'C:/DemonX-Forge-Native/forge-mcp.exe');
const child = spawn(launcher, [], { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
child.stdout.setEncoding('utf8');
let buffer = '';
let stderr = '';
let nextId = 0;
const pending = new Map();

child.stdout.on('data', (chunk) => {
  buffer += chunk;
  for (;;) {
    const end = buffer.indexOf('\n');
    if (end < 0) break;
    const line = buffer.slice(0, end);
    buffer = buffer.slice(end + 1);
    let response;
    try { response = JSON.parse(line); } catch (error) {
      for (const waiter of pending.values()) waiter.reject(new Error(`Invalid MCP JSON: ${line}; ${error}`));
      pending.clear();
      continue;
    }
    const waiter = pending.get(response.id);
    if (waiter) { pending.delete(response.id); waiter.resolve(response); }
  }
});
child.stderr.setEncoding('utf8').on('data', (chunk) => { stderr += chunk; });
child.once('exit', (code) => {
  for (const waiter of pending.values()) waiter.reject(new Error(`MCP launcher exited (${code}): ${stderr.slice(-2000)}`));
  pending.clear();
});

function request(method, params = {}) {
  const id = ++nextId;
  return new Promise((resolvePromise, reject) => {
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`MCP ${method} timed out: ${stderr.slice(-1000)}`)); }, 30000);
    pending.set(id, {
      resolve: (value) => { clearTimeout(timer); resolvePromise(value); },
      reject: (error) => { clearTimeout(timer); reject(error); },
    });
    child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`);
  });
}

try {
  const listed = await request('tools/list');
  if (listed.error) throw new Error(`tools/list failed: ${listed.error.message}`);
  const names = listed.result?.tools?.map((tool) => tool.name) ?? [];
  if (names.length !== 9) throw new Error(`Expected nine Forge MCP tools, received ${names.length}: ${names.join(', ')}`);
  const design = await request('tools/call', { name: 'forge_get_design', arguments: {} });
  if (design.error || design.result?.isError) throw new Error(`forge_get_design failed: ${JSON.stringify(design.error ?? design.result)}`);
  process.stdout.write(`${JSON.stringify({ status: 'passed', launcher, tools: names, activeDesignReadable: true })}\n`);
} finally {
  child.stdin.end();
  await Promise.race([new Promise((resolvePromise) => child.once('exit', resolvePromise)), new Promise((resolvePromise) => setTimeout(resolvePromise, 5000))]);
  if (child.exitCode === null) child.kill();
}
