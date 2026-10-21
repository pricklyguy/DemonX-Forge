import { describe, it, expect } from 'vitest';
import { inwardBisector } from './edgeDir';
import type { Body } from '../../server/src/engine/Engine';

// two faces meeting along the X axis at the top-front edge of a block: top (normal +Z) and front (normal -Y)
const body = {
  name: 'B', mesh: false, faces: [], edges: [],
  positions: [0, 0, 10, 10, 0, 10, 10, 20, 10, 0, 20, 10, /* top */ 0, 0, 0, 10, 0, 0, 10, 0, 10, 0, 0, 10 /* front */],
  indices: [0, 1, 2, 0, 2, 3, 4, 5, 6, 4, 6, 7],
  faceIds: [1, 1, 2, 2],
} as unknown as Body;

describe('inwardBisector', () => {
  it('points down and back from the top front edge', () => {
    const d = inwardBisector(body, [1, 2], [5, 0, 10])!;
    expect(d[0]).toBeCloseTo(0); expect(d[1]).toBeCloseTo(Math.SQRT1_2); expect(d[2]).toBeCloseTo(-Math.SQRT1_2);
  });
  it('gives null for an unknown face', () => { expect(inwardBisector(body, [1, 9], [5, 0, 10])).toBeNull(); });
});
