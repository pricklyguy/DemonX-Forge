import { describe, expect, it } from 'vitest';
import { segmentsTouchBox } from './box';

describe('segmentsTouchBox', () => {
  it('finds a line that crosses the box with both ends outside', () => {
    expect(segmentsTouchBox([[-5, 5], [15, 5]], 0, 0, 10, 10)).toBe(true);
  });
  it('misses a line that passes by', () => {
    expect(segmentsTouchBox([[-5, 12], [15, 12]], 0, 0, 10, 10)).toBe(false);
    expect(segmentsTouchBox([[11, -5], [11, 15]], 0, 0, 10, 10)).toBe(false);
  });
  it('finds a polyline that only crosses on its second leg', () => {
    expect(segmentsTouchBox([[-5, -5], [-5, 20], [20, 20], [20, 5]], 0, 0, 10, 10)).toBe(false);
    expect(segmentsTouchBox([[-5, -5], [-5, 5], [20, 5]], 0, 0, 10, 10)).toBe(true);
  });
});
