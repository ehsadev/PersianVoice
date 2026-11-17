import { describe, expect, it } from 'vitest';
import { errorRates, normalizePersian } from './metrics';

describe('Persian ASR comparison metrics', () => {
  it('normalizes Persian and Arabic forms identically', () => {
    expect(normalizePersian('آقای كیانی، ٢ عدد!')).toBe(normalizePersian('اقای کیانی ۲ عدد'));
  });
  it('computes WER and CER only with a reference', () => {
    expect(errorRates('', 'متن')).toBeNull();
    expect(errorRates('یک لباس', 'یک شلوار')?.wer).toBe(0.5);
    expect(errorRates('سلام', 'سلام')).toEqual({ wer: 0, cer: 0 });
  });
});
