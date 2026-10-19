import { describe, expect, it } from 'vitest';
import { chainOrder } from './chain';

const line = (id: string, a: [number, number], b: [number, number]) => ({ id, start: a, end: b });

describe('chainOrder', () => {
  it('puts lines end to end, whichever way they are drawn or listed', () => {
    const got = chainOrder([line('l3', [20, 10], [10, 10]), line('l1', [0, 0], [10, 0]), line('l2', [10, 10], [10, 0])]);
    expect(['l1,l2,l3', 'l3,l2,l1']).toContain(got.join(',')); // a valid chain from either free end; l2 is always in the middle
  });
  it('keeps the given order when the curves do not form one chain', () => {
    expect(chainOrder([line('a', [0, 0], [1, 0]), line('b', [5, 5], [6, 5])])).toEqual(['a', 'b']);
  });
  it('leaves one curve, or curves without ends (a circle), alone', () => {
    expect(chainOrder([line('a', [0, 0], [1, 0])])).toEqual(['a']);
    expect(chainOrder([{ id: 'c1' }, line('a', [0, 0], [1, 0])])).toEqual(['c1', 'a']);
  });
});
