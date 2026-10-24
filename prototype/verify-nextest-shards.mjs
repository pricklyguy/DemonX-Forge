#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';

const [, , archivePath, countText] = process.argv;
const archive = resolve(archivePath ?? 'native-tests.tar.zst');
const count = Number(countText ?? '4');
if (!Number.isInteger(count) || count < 2 || count > 16) throw new Error('Shard count must be an integer from 2 to 16.');

function list(partition) {
  const args = ['nextest', 'list', '--archive-file', archive, '--message-format', 'json'];
  if (partition) args.push('--partition', partition);
  const output = execFileSync('cargo', args, { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
  const data = JSON.parse(output);
  const tests = new Set();
  for (const suite of Object.values(data['rust-suites'] ?? {})) {
    const binary = suite['binary-id'];
    for (const [name, test] of Object.entries(suite.testcases ?? {})) {
      if (!test.ignored && test['filter-match']?.status === 'matches') tests.add(`${binary}::${name}`);
    }
  }
  if (tests.size === 0) throw new Error(`Nextest returned no runnable tests${partition ? ` for ${partition}` : ''}.`);
  return tests;
}

const all = list(undefined);
const seen = new Map();
const totals = [];
for (let index = 1; index <= count; index++) {
  const partition = `slice:${index}/${count}`;
  const tests = list(partition);
  totals.push(tests.size);
  for (const test of tests) {
    const previous = seen.get(test);
    if (previous) throw new Error(`Test is assigned to multiple shards: ${test} (shards ${previous} and ${index}).`);
    seen.set(test, index);
  }
}

const missing = [...all].filter((test) => !seen.has(test));
const unexpected = [...seen.keys()].filter((test) => !all.has(test));
if (missing.length || unexpected.length || seen.size !== all.size) {
  throw new Error(`Shard union mismatch: all=${all.size}, union=${seen.size}, missing=${missing.slice(0, 10).join(', ')}, unexpected=${unexpected.slice(0, 10).join(', ')}`);
}

process.stdout.write(`${JSON.stringify({ status: 'complete', nextest: 'slice', shards: count, runnableTests: all.size, perShard: totals, overlap: 0, missing: 0 })}\n`);
