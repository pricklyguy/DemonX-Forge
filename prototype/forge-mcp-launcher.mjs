// Stable MCP entry point installed beside `current.txt`; this keeps client config independent of
// versioned release folder names while preserving the bundled bridge and its nine-tool contract.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
let release;
try { release = readFileSync(join(root, 'current.txt'), 'utf8').trim(); }
catch { throw new Error('DemonX Forge has no current release pointer. Run install-windows.ps1 again.'); }
if (!/^[A-Za-z0-9._-]{1,120}$/.test(release)) {
  throw new Error('DemonX Forge has no valid current release pointer. Run install-windows.ps1 again.');
}
const bridge = join(root, 'versions', release, 'forge-mcp-native.mjs');
await import(pathToFileURL(bridge).href);
