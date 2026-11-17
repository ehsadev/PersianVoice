import { describe, expect, it } from 'vitest';
import { join } from 'node:path';
import { staticHeaders } from './static.mjs';

describe('runtime asset responses', () => {
  it('serves ONNX runtime modules with an importable JavaScript MIME type', () => {
    expect(staticHeaders('/assets/ort-wasm-simd-threaded.jsep-abc.mjs', join('app', 'dist', 'assets', 'ort-wasm-simd-threaded.jsep-abc.mjs'))['Content-Type']).toBe('text/javascript; charset=utf-8');
  });
  it('does not allow a stale service worker or HTML response', () => {
    expect(staticHeaders('/sw.js', join('app', 'dist', 'sw.js'))['Cache-Control']).toBe('no-store');
    expect(staticHeaders('/', join('app', 'dist', 'index.html'))['Cache-Control']).toBe('no-store');
  });
});
