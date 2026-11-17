import { describe, expect, it } from 'vitest';
import { decodeShenava, float16, fromFloat16, prepareShenava } from './shenava';

describe('Shenava contract', () => {
  it('converts fp16 input and creates fixed 80×2005 features', () => {
    expect(fromFloat16(float16(1.5))).toBe(1.5);
    const filters = Array.from({ length: 80 }, () => Array.from({ length: 257 }, () => 1 / 257));
    const prepared = prepareShenava(new Float32Array(1600), { filters });
    expect(prepared.frames).toBe(11);
    expect(prepared.data.length).toBe(80 * 2005);
    expect(Number.isFinite(fromFloat16(prepared.data[0]))).toBe(true);
  });
  it('greedy-decodes SentencePiece CTC with blank reset', () => {
    const tokens = ['▁شن', 'ا', '<blk>'];
    const logits = new Float32Array([9, 0, 0, 9, 0, 0, 0, 0, 9, 0, 9, 0]);
    expect(decodeShenava(logits, [1, 4, 3], 4, tokens, 2)).toBe('شنا');
  });
});
