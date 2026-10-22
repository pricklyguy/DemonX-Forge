import { mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { build } from 'esbuild';

export async function buildNativeMcp(output = 'prototype/dist/mcp-native.mjs') {
  const outfile = resolve(output);
  mkdirSync(dirname(outfile), { recursive: true });
  await build({
    entryPoints: [resolve('prototype/mcp-native.ts')],
    bundle: true,
    platform: 'node',
    format: 'esm',
    outfile,
    // Keep the imported Forge MCP module's direct-execution guard from starting another stdio server.
    define: { 'import.meta.url': JSON.stringify(pathToFileURL(resolve(tmpdir(), 'demonx-forge-embedded.mjs')).href) },
  });
  return outfile;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const outfile = await buildNativeMcp(process.argv[2]);
  process.stdout.write(`Built native Forge MCP adapter: ${outfile}\n`);
}
