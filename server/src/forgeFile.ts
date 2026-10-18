// The DemonX Forge file (.forge): a zip with `forge.json` (what it is and which version wrote it) and `design.solidcraft` (the engine's own design
// container). Reading is strict: a damaged, foreign or newer file is refused with the reason and nothing is changed.
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';

export const FORGE_FORMAT = 'demonx-forge';
export const FORGE_VERSION = 1;
/** The design inside is at most this big once unpacked (a guard against zip bombs; real designs are far smaller). */
export const MAX_DESIGN_BYTES = 512 * 1024 * 1024;

export class FileError extends Error {}

export interface ForgeMeta { format: typeof FORGE_FORMAT; version: number; app: string; engine: string; savedAt: string }

export function packForge(design: Uint8Array, app: string, now = new Date()): Uint8Array {
  const meta: ForgeMeta = { format: FORGE_FORMAT, version: FORGE_VERSION, app, engine: 'solidcraft', savedAt: now.toISOString() };
  return zipSync({ 'forge.json': strToU8(JSON.stringify(meta, null, 2)), 'design.solidcraft': [design, { level: 0 }] }, { level: 0 });
}

export function unpackForge(bytes: Uint8Array): { meta: ForgeMeta; design: Uint8Array } {
  let files: Record<string, Uint8Array>;
  try { files = unzipSync(bytes, { filter: (f) => f.originalSize <= MAX_DESIGN_BYTES }); } catch { throw new FileError('This is not a DemonX Forge file (it is not a valid archive).'); }
  const raw = files['forge.json'];
  if (!raw) throw new FileError('This is not a DemonX Forge file (no forge.json inside).');
  let meta: Partial<ForgeMeta>;
  try { meta = JSON.parse(strFromU8(raw)); } catch { throw new FileError('This Forge file is damaged (its forge.json cannot be read).'); }
  if (meta.format !== FORGE_FORMAT) throw new FileError('This is not a DemonX Forge file.');
  if (typeof meta.version !== 'number' || !Number.isInteger(meta.version) || meta.version < 1) throw new FileError('This Forge file is damaged (no valid version).');
  if (meta.version > FORGE_VERSION) throw new FileError(`This file was saved by a newer DemonX Forge (file version ${meta.version}; this one reads up to ${FORGE_VERSION}). Update Forge to open it.`);
  const design = files['design.solidcraft'];
  if (!design || !design.length) throw new FileError('This Forge file is damaged (the design is missing).');
  return { meta: meta as ForgeMeta, design };
}

/** A file name from whatever was typed or picked: no folders, no extension, no odd characters, never empty. */
export function safeName(input: unknown, fallback = 'Untitled'): string {
  if (typeof input !== 'string') return fallback;
  const base = input.split(/[\\/]/).pop() ?? '';
  const cleaned = base.replace(/\.(forge|step|stp|stl|3mf|obj|dxf)$/i, '').replace(/[^\p{L}\p{N} ._()+-]/gu, '').replace(/^[. ]+|[. ]+$/g, '').slice(0, 80);
  return cleaned || fallback;
}
