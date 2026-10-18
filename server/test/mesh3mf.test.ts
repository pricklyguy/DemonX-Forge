import { describe, expect, it } from 'vitest';
import { zipSync, strToU8 } from 'fflate';
import { parse3mf, parseModelXml } from '../src/engine/mesh3mf';

const model = `<?xml version="1.0"?><model unit="millimeter" xmlns:ft="https://example.invalid/ft"><resources>
<object id="2" type="model" name="Plate &amp; &quot;one&quot;" ft:faces="2"><mesh><vertices>
<vertex x="0" y="0" z="0"/><vertex x="1" y="0" z="0"/><vertex x="0" y="1" z="0"/><vertex x="0" y="0" z="1"/>
</vertices><triangles>
<triangle v1="0" v2="1" v3="2" ft:face="0"/><triangle v1="0" v2="2" v3="3" ft:face="1"/>
</triangles></mesh></object></resources></model>`;

describe('parseModelXml', () => {
  it('reads vertices, triangles and face tags', () => {
    const [m] = parseModelXml(model);
    expect(m!.name).toBe('Plate & "one"');
    expect(m!.positions).toEqual([0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1]);
    expect(m!.indices).toEqual([0, 1, 2, 0, 2, 3]);
    expect(m!.faceIds).toEqual([0, 1]);
  });
  it('treats an untagged mesh as one face', () => {
    const [m] = parseModelXml(model.replace(/ ft:face="\d"/g, ''));
    expect(m!.faceIds).toEqual([0, 0]);
  });
  it('refuses a triangle that points past the vertices', () => {
    expect(() => parseModelXml(model.replace('v3="3"', 'v3="9"'))).toThrow(/past its vertex list/);
  });
  it('reads a zipped 3MF and refuses junk', () => {
    const zip = zipSync({ '3D/3dmodel.model': strToU8(model) });
    expect(parse3mf(zip)).toHaveLength(1);
    expect(() => parse3mf(new Uint8Array([1, 2, 3]))).toThrow();
    expect(() => parse3mf(zipSync({ 'x.txt': strToU8('hi') }))).toThrow(/no 3dmodel/);
  });
});
