import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
const { chromium } = createRequire(import.meta.url)('playwright');
const svg = readFileSync(process.argv[3] || 'dx-mark.svg', 'utf8');
const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1200, height: 520 } });
const cell = (bg, fg, acc, size, label) => `<div style="background:${bg};color:${fg};--dx-accent:${acc};padding:24px;display:flex;flex-direction:column;align-items:center;gap:8px;width:${size + 48}px"><div style="width:${size}px">${svg}</div><span style="font:12px sans-serif;opacity:.7">${label}</span></div>`;
await p.setContent(`<body style="margin:0;display:flex;gap:0;align-items:flex-end;background:#888">
${cell('#14130f', '#ece8d8', '#2bb5c9', 300, 'dark, teal arrow')}
${cell('#14130f', '#d98a52', '#2bb5c9', 300, 'dark, copper letters')}
${cell('#f4efe0', '#26230f', '#0e8ea3', 300, 'light')}
${cell('#14130f', '#ece8d8', '#2bb5c9', 64, '64 px')}${cell('#14130f', '#ece8d8', '#2bb5c9', 32, '32 px')}${cell('#14130f', '#ece8d8', '#2bb5c9', 16, '16 px')}</body>`);
await p.screenshot({ path: process.argv[2] || 'preview.png' });
await b.close();
