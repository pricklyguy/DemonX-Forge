#!/usr/bin/env node
// Builds the Windows package: the same as `node scripts/build-package.mjs --platform windows ...` (see that file).
process.argv.push('--platform', 'windows');
await import('./build-package.mjs');
