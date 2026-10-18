import { describe, expect, it } from 'vitest';
import { strToU8, zipSync } from 'fflate';
import { FORGE_VERSION, FileError, MAX_DESIGN_BYTES, packForge, safeName, unpackForge } from '../src/forgeFile';

const design = new Uint8Array([80, 75, 3, 4, 1, 2, 3, 4, 5]);
const zipOf = (files: Record<string, Uint8Array>) => zipSync(files);
const meta = (over: object = {}) => strToU8(JSON.stringify({ format: 'demonx-forge', version: 1, app: '0.5.0', engine: 'solidcraft', savedAt: 'x', ...over }));

describe('forge file', () => {
  it('round-trips the design bytes and says what wrote it', () => {
    const packed = packForge(design, '0.5.0', new Date('2026-10-18T12:00:00Z'));
    const { meta: m, design: d } = unpackForge(packed);
    expect(Array.from(d)).toEqual(Array.from(design));
    expect(m).toMatchObject({ format: 'demonx-forge', version: FORGE_VERSION, app: '0.5.0', engine: 'solidcraft', savedAt: '2026-10-18T12:00:00.000Z' });
  });
  it('refuses what is not a Forge file, with the reason', () => {
    expect(() => unpackForge(new Uint8Array([1, 2, 3]))).toThrow(FileError);
    expect(() => unpackForge(new Uint8Array([1, 2, 3]))).toThrow(/not a valid archive/);
    expect(() => unpackForge(zipOf({ 'readme.txt': strToU8('hi') }))).toThrow(/no forge.json/);
    expect(() => unpackForge(zipOf({ 'forge.json': strToU8('{nope') }))).toThrow(/damaged/);
    expect(() => unpackForge(zipOf({ 'forge.json': meta({ format: 'something-else' }), 'design.solidcraft': design }))).toThrow(/not a DemonX Forge file/);
    expect(() => unpackForge(zipOf({ 'forge.json': meta({ version: 'one' }), 'design.solidcraft': design }))).toThrow(/no valid version/);
    expect(() => unpackForge(zipOf({ 'forge.json': meta({ version: 0 }), 'design.solidcraft': design }))).toThrow(/no valid version/);
    expect(() => unpackForge(zipOf({ 'forge.json': meta() }))).toThrow(/design is missing/);
  });
  it('refuses a file from a newer Forge and says to update', () => {
    expect(() => unpackForge(zipOf({ 'forge.json': meta({ version: FORGE_VERSION + 1 }), 'design.solidcraft': design }))).toThrow(/newer DemonX Forge/);
  });
  it('has a size guard', () => { expect(MAX_DESIGN_BYTES).toBeGreaterThan(1024 * 1024); });
});

describe('safeName', () => {
  it('keeps a plain name and drops folders, extensions and odd characters', () => {
    expect(safeName('Bracket v2')).toBe('Bracket v2');
    expect(safeName('C:\\Users\\someone\\parts\\Bracket.forge')).toBe('Bracket');
    expect(safeName('../../etc/passwd')).toBe('passwd');
    expect(safeName('part<>:"|?*.step')).toBe('part');
    expect(safeName('  ..hidden.. ')).toBe('hidden');
    expect(safeName('Fräsplatte (2)')).toBe('Fräsplatte (2)');
  });
  it('never returns an empty name, and caps the length', () => {
    expect(safeName('')).toBe('Untitled'); expect(safeName(undefined)).toBe('Untitled'); expect(safeName('***')).toBe('Untitled'); expect(safeName('.forge')).toBe('Untitled');
    expect(safeName('x'.repeat(200))).toHaveLength(80);
  });
});
