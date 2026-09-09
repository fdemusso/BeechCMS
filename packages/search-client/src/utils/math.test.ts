import { describe, it, expect } from 'vitest';
import { dotProduct, cosineSimilarity } from './math.js';

describe('math utilities', () => {
  it('computes correct dot product', () => {
    const a = new Float32Array([1, 2, 3]);
    const b = new Float32Array([4, 5, 6]);
    expect(dotProduct(a, b)).toBe(32); // 4 + 10 + 18
  });

  it('computes correct cosine similarity', () => {
    const a = new Float32Array([1, 0]);
    const b = new Float32Array([1, 0]);
    const c = new Float32Array([0, 1]);
    expect(cosineSimilarity(a, b)).toBeCloseTo(1);
    expect(cosineSimilarity(a, c)).toBeCloseTo(0);
  });
});

