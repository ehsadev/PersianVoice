import { describe, expect, it } from 'vitest';
import { DownloadTracker } from './download-progress';

describe('interleaved model download progress', () => {
  it('keeps each file independent and never resets its loaded bytes', () => {
    const tracker = new DownloadTracker();
    tracker.update({ file: 'encoder.onnx', status: 'progress', loaded: 200, total: 500 });
    tracker.update({ file: 'decoder.onnx', status: 'progress', loaded: 20, total: 900 });
    const rows = tracker.update({ file: 'encoder.onnx', status: 'progress', loaded: 180, total: 500 });
    expect(rows).toEqual([
      { id: '/encoder.onnx', file: 'encoder.onnx', status: 'progress', loaded: 200, total: 500 },
      { id: '/decoder.onnx', file: 'decoder.onnx', status: 'progress', loaded: 20, total: 900 },
    ]);
  });
  it('distinguishes a cached file from a completed download', () => {
    const tracker = new DownloadTracker();
    const rows = tracker.update({ file: 'shenava.onnx', status: 'cached', loaded: 17, total: 17 });
    expect(rows[0].status).toBe('cached');
    expect(rows[0].loaded).toBe(17);
  });
});
