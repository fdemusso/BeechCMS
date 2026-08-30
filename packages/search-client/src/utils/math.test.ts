import { describe, it, expect } from 'vitest';
import { dotProduct } from './math.js';

describe('math utilities', () => {
  it('computes correct dot product', () => {
    const a = new Float32Array([1, 2, 3]);
    const b = new Float32Array([4, 5, 6]);
    expect(dotProduct(a, b)).toBe(32); // 4 + 10 + 18
  });
});
