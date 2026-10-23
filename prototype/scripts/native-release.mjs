#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';

const ASSET = 'solidcraft-windows-x64-portable.zip';
const MANIFEST = 'DemonX-Forge-release.json';
const SUMS = 'SHA256SUMS.txt';
const digest = (file) => createHash('sha256').update(readFileSync(file)).digest('hex');
const args = process.argv.slice(2);
const command = args.shift();
const values = Object.fromEntries(args.map((value) => {
  const match = value.match(/^--([^=]+)=(.*)$/);
  if (!match) throw new Error(`Expected --name=value, got ${value}`);
  return [match[1], match[2]];
}));

if (command !== 'create' || !values.version || !values.tag || !values.archive || !values.out) {
  throw new Error(`Usage: node native-release.mjs create --version=0.20.0-preview.1 --tag=native-v0.20.0-preview.1 --archive=path.zip --out=directory`);
}
if (!/^\d+\.\d+\.\d+-preview\.\d+$/.test(values.version)) throw new Error('Only numeric native preview versions are allowed.');
if (values.tag !== `native-v${values.version}`) throw new Error('Release tag must be native-v<version>.');
if (basename(values.archive) !== ASSET) throw new Error(`Archive must be named ${ASSET}.`);

const out = resolve(values.out);
const archive = resolve(values.archive);
const manifest = {
  schema_version: 1,
  product: 'DemonX Forge',
  channel: 'native-preview',
  version: values.version,
  tag: values.tag,
  platforms: [{
    id: 'windows-x64',
    asset: ASSET,
    sha256: digest(archive),
  }],
};
const manifestPath = resolve(out, MANIFEST);
writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, { flag: 'wx' });
const entries = [
  [ASSET, digest(archive)],
  [MANIFEST, digest(manifestPath)],
].sort(([a], [b]) => a.localeCompare(b, 'en'));
writeFileSync(resolve(out, SUMS), `${entries.map(([name, hash]) => `${hash}  ${name}`).join('\n')}\n`, { flag: 'wx' });
process.stdout.write(`Wrote ${MANIFEST} and ${SUMS} for ${values.tag}\n`);
