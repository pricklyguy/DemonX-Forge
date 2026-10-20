import { describe, expect, it } from 'vitest';
import type { Body, BodyEdge, Face } from '../src/engine/Engine';
import { buildEdgeGeometry, nearestEdge, pointToSegment } from '../src/engine/meshEdges';

const face = (index: number, name: string): Face => ({ index, name, area: 1, point: [0, 0, 0], centroid: [0, 0, 0] });
const edge = (index: number, name: string, a: [number, number, number], b: [number, number, number]): BodyEdge => ({ index, name, start: a, end: b, mid: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2], length: Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]) });

// A unit cube: 8 corners, 6 faces of 2 triangles each (the diagonal inside a face is not an edge).
const V: number[][] = [[0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0], [0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]];
const QUADS: [string, number[]][] = [['bottom', [0, 3, 2, 1]], ['top', [4, 5, 6, 7]], ['front', [0, 1, 5, 4]], ['right', [1, 2, 6, 5]], ['back', [2, 3, 7, 6]], ['left', [3, 0, 4, 7]]];
const cube = (): Body => {
  const indices: number[] = [], faceIds: number[] = [];
  QUADS.forEach(([, q], f) => { indices.push(q[0]!, q[1]!, q[2]!, q[0]!, q[2]!, q[3]!); faceIds.push(f, f); });
  const pairs: [string, string, number, number][] = [['bottom', 'front', 0, 1], ['bottom', 'right', 1, 2], ['bottom', 'back', 2, 3], ['bottom', 'left', 3, 0], ['top', 'front', 4, 5], ['top', 'right', 5, 6], ['top', 'back', 6, 7], ['top', 'left', 7, 4], ['front', 'left', 0, 4], ['front', 'right', 1, 5], ['back', 'right', 2, 6], ['back', 'left', 3, 7]];
  return {
    name: 'Cube', mesh: false, positions: V.flat(), indices, faceIds, faces: QUADS.map(([n], i) => face(i, n)),
    edges: pairs.map(([a, b, i, j], k) => edge(k, `${a}|${b}`, V[i]! as [number, number, number], V[j]! as [number, number, number])),
  };
};

describe('buildEdgeGeometry', () => {
  it('finds one segment for each edge of a cube, between the right corners', () => {
    const body = cube();
    const geo = buildEdgeGeometry(body);
    expect(geo).toHaveLength(12);
    for (const g of geo) {
      expect(g.segments).toHaveLength(6); // one segment, two ends
      const e = body.edges[g.index]!;
      const ends = [[g.segments[0]!, g.segments[1]!, g.segments[2]!], [g.segments[3]!, g.segments[4]!, g.segments[5]!]];
      const near = (p: number[], q: number[]) => Math.hypot(p[0]! - q[0]!, p[1]! - q[1]!, p[2]! - q[2]!) < 1e-9;
      expect((near(ends[0]!, e.start) && near(ends[1]!, e.end)) || (near(ends[0]!, e.end) && near(ends[1]!, e.start))).toBe(true);
    }
  });
  it('does not mistake the diagonal inside a face for an edge', () => {
    const body = cube();
    const all = buildEdgeGeometry(body).flatMap((g) => g.segments);
    expect(all).toHaveLength(12 * 6);
  });
  it('gives each of two edges between the same pair of faces its own piece, using the midpoint to tell them apart', () => {
    // two faces touching along two separate edges: f0 and f1 are two strips; here we only need the pairing logic
    const positions = [0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0, 5, 0, 0, 6, 0, 0, 6, 1, 0, 5, 1, 0, 0, 0, 1, 1, 0, 1, 5, 0, 1, 6, 0, 1];
    // face 0: triangle (0,1,2) and (4,5,6); face 1: triangles (0,1,8) shares 0-1, and (4,5,10) shares 4-5
    const indices = [0, 1, 2, 4, 5, 6, 0, 1, 8, 4, 5, 10];
    const faceIds = [0, 0, 1, 1];
    const body: Body = { name: 'B', mesh: false, positions, indices, faceIds, faces: [face(0, 'A'), face(1, 'B')], edges: [edge(0, 'A|B~1', [0, 0, 0], [1, 0, 0]), edge(1, 'A|B~2', [5, 0, 0], [6, 0, 0])] };
    const geo = buildEdgeGeometry(body);
    expect(geo[0]!.segments.slice(0, 3)).toEqual([0, 0, 0]);
    expect(geo[1]!.segments.slice(0, 3)).toEqual([5, 0, 0]);
    // swapped order in the engine's list still pairs by position, not by order
    body.edges = [body.edges[1]!, body.edges[0]!];
    const swapped = buildEdgeGeometry(body);
    expect(swapped[0]!.index).toBe(1); expect(swapped[0]!.segments.slice(0, 3)).toEqual([5, 0, 0]);
    expect(swapped[1]!.segments.slice(0, 3)).toEqual([0, 0, 0]);
  });
  it('keeps an edge with no two-face boundary selectable as a straight line between its ends', () => {
    const body = cube();
    body.edges = [edge(0, 'seam|seam', [0, 0, 0], [0, 0, 1])];
    const geo = buildEdgeGeometry(body);
    expect(geo[0]!.segments).toEqual([0, 0, 0, 0, 0, 1]);
  });
  it('finds the nearest edge to a point', () => {
    const geo = buildEdgeGeometry(cube());
    const hit = nearestEdge(geo, [0.5, 0.02, 1.01])!; // just off the top-front edge
    expect(hit.edge.name).toBe('top|front');
    expect(hit.distance).toBeLessThan(0.03);
    expect(pointToSegment([0, 1, 0], [0, 0, 0], [2, 0, 0])).toBeCloseTo(1);
  });
});
