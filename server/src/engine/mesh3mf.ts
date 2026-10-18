// Reads the engine's "3MF with face tags" export: an ordinary 3MF whose triangles carry the B-rep face they lie on
// (attribute `face` in the engine's own namespace). Pure function, no files.
import { unzipSync } from 'fflate';
import { EngineError } from './Engine';

export interface RawMesh {
  name: string;
  positions: number[];
  indices: number[];
  faceIds: number[];
}

export function parse3mf(zip: Uint8Array): RawMesh[] {
  let files: Record<string, Uint8Array>;
  try { files = unzipSync(zip); } catch { throw new EngineError('The engine wrote a 3MF file that is not a zip'); }
  const name = Object.keys(files).find((n) => /3dmodel\.model$/i.test(n));
  const model = name && files[name];
  if (!model) throw new EngineError('The 3MF file has no 3dmodel.model');
  return parseModelXml(new TextDecoder().decode(model));
}

export function parseModelXml(xml: string): RawMesh[] {
  const out: RawMesh[] = [];
  for (const o of xml.matchAll(/<object\b([^>]*)>([\s\S]*?)<\/object>/g)) {
    const attrs = o[1] ?? '', body = o[2] ?? '';
    if (!/<mesh\b/.test(body)) continue;
    const name = /\bname="([^"]*)"/.exec(attrs)?.[1] ?? `Body${out.length + 1}`;
    const positions: number[] = [];
    for (const v of body.matchAll(/<vertex\b[^>]*?\bx="([^"]+)"[^>]*?\by="([^"]+)"[^>]*?\bz="([^"]+)"/g)) positions.push(+v[1]!, +v[2]!, +v[3]!);
    const indices: number[] = [], faceIds: number[] = [];
    for (const t of body.matchAll(/<triangle\b([^>]*)\/?>/g)) {
      const a = t[1] ?? '';
      const v1 = /\bv1="(\d+)"/.exec(a)?.[1], v2 = /\bv2="(\d+)"/.exec(a)?.[1], v3 = /\bv3="(\d+)"/.exec(a)?.[1];
      if (v1 === undefined || v2 === undefined || v3 === undefined) throw new EngineError('A 3MF triangle is missing a vertex');
      indices.push(+v1, +v2, +v3);
      faceIds.push(+(/\b(?:[a-z0-9]+:)?face="(\d+)"/.exec(a)?.[1] ?? 0));
    }
    if (indices.some((i) => i * 3 + 2 >= positions.length)) throw new EngineError(`3MF object ${name} points past its vertex list`);
    out.push({ name: name.replace(/&quot;/g, '"').replace(/&amp;/g, '&'), positions, indices, faceIds });
  }
  return out;
}
