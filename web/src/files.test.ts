import { describe, expect, it } from 'vitest';
import { extOf, stripExt } from './files';

describe('file names', () => {
  it('strips and reads extensions', () => {
    expect(stripExt('Bracket v2.forge')).toBe('Bracket v2');
    expect(stripExt('plain')).toBe('plain');
    expect(stripExt('a.b.step')).toBe('a.b');
    expect(extOf('Bracket.FORGE')).toBe('forge');
    expect(extOf('noext')).toBe('');
  });
});
