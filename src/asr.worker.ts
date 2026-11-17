import { ASR_MODELS, type AsrEngine, type AsrMetrics } from './models';
import { chunks, joinTranscripts } from './audio';
import { prepareShenava, decodeShenava } from './shenava';
import ortWasmUrl from '../node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.jsep.wasm?url';
import ortMjsUrl from '../node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.jsep.mjs?url';

type Device = 'webgpu' | 'wasm';
type Request = { engine: AsrEngine; audio: Float32Array; device: Device; allowFallback: boolean };
function send(event: string, detail: unknown): void { self.postMessage({ event, detail }); }
async function fetchCached(base: string, file: string, expectedBytes?: number): Promise<Uint8Array> {
  const url = base + file;
  const cache = await caches.open('ava-models-v2');
  const hit = await cache.match(url);
  if (hit) {
    const bytes = new Uint8Array(await hit.arrayBuffer());
    if (!expectedBytes || bytes.length === expectedBytes) { send('download', { file, status: 'cached', loaded: bytes.length, total: bytes.length }); return bytes; }
    await cache.delete(url);
  }
  const response = await fetch(url);
  if (!response.ok) throw new Error(`دریافت ${file} شکست خورد: HTTP ${response.status}`);
  const total = Number(response.headers.get('content-length') || 0);
  const reader = response.body?.getReader();
  if (!reader) throw new Error(`پاسخ دانلود ${file} جریان داده ندارد.`);
  const allocated = expectedBytes || total;
  let bytes = allocated ? new Uint8Array(allocated) : new Uint8Array(0);
  let loaded = 0;
  while (true) {
    const { done, value } = await reader.read(); if (done) break;
    if (loaded + value.length > bytes.length) {
      if (expectedBytes) throw new Error(`اندازهٔ ${file} از مقدار ثبت‌شده در manifest بیشتر است.`);
      const larger = new Uint8Array(Math.max(loaded + value.length, bytes.length * 2, 65536)); larger.set(bytes); bytes = larger;
    }
    bytes.set(value, loaded); loaded += value.length;
    send('download', { file, status: 'progress', loaded, total: expectedBytes || total || undefined });
  }
  if (expectedBytes && loaded !== expectedBytes) throw new Error(`اندازهٔ ${file} ناقص یا ناسازگار است: ${loaded} به‌جای ${expectedBytes} بایت.`);
  bytes = bytes.subarray(0, loaded);
  await cache.put(url, new Response(bytes, { headers: { 'content-length': String(loaded) } }));
  send('download', { file, status: 'done', loaded, total: total || loaded });
  return bytes;
}

async function whisper(engine: 'tiny' | 'small', audio: Float32Array, device: Device, allowFallback: boolean): Promise<AsrMetrics & { raw: string }> {
  const { pipeline, env } = await import('@huggingface/transformers');
  env.useBrowserCache = true;
  const spec = ASR_MODELS[engine];
  send('status', `بارگذاری ${spec.label}`);
  const loadStart = performance.now();
  const create = (provider: Device) => pipeline('automatic-speech-recognition', spec.repo, {
    device: provider, revision: spec.revision,
    dtype: engine === 'tiny' ? { encoder_model: 'fp32', decoder_model_merged: 'q4' } : { encoder_model: 'fp16', decoder_model_merged: 'q4' },
    progress_callback: (value: Record<string, unknown>) => { if (['progress', 'initiate', 'done'].includes(String(value.status))) send('download', value); },
  });
  let actualDevice = device;
  let pipe: Awaited<ReturnType<typeof create>>;
  try { pipe = await create(device); }
  catch (error) {
    if (device !== 'webgpu' || !allowFallback) throw error;
    send('status', `${spec.label}: WebGPU بارگذاری نشد (${error instanceof Error ? error.message : String(error)}). تلاش با WASM…`);
    try { pipe = await create('wasm'); actualDevice = 'wasm'; }
    catch (wasmError) { throw new Error(`WebGPU: ${error instanceof Error ? error.message : String(error)}؛ WASM: ${wasmError instanceof Error ? wasmError.message : String(wasmError)}`); }
  }
  const loadMs = performance.now() - loadStart;
  try {
    const prepStart = performance.now();
    const segments = chunks(audio);
    const prepMs = performance.now() - prepStart;
    const inferStart = performance.now();
    const texts: string[] = [];
    for (let i = 0; i < segments.length; i++) {
      send('status', `${spec.label}: بخش ${i + 1} از ${segments.length}`);
      const output = await (pipe as any)(segments[i], { language: 'persian', task: 'transcribe', return_timestamps: false });
      texts.push(String(output.text ?? ''));
    }
    const inferMs = performance.now() - inferStart;
    const totalMs = prepMs + inferMs, audioSeconds = audio.length / 16000;
    return { raw: joinTranscripts(texts), loadMs, prepMs, inferMs, totalMs, audioSeconds, rtf: totalMs / 1000 / audioSeconds, device: actualDevice };
  } finally { await pipe.dispose(); }
}

async function runShenava(engine: 'shenava' | 'shenavaRizeh' | 'shenavaKoochik', audio: Float32Array, device: Device, allowFallback: boolean): Promise<AsrMetrics & { raw: string }> {
  const shenava = ASR_MODELS[engine];
  const base = `https://huggingface.co/${shenava.repo}/resolve/${shenava.revision}/`;
  send('status', `بارگذاری ${shenava.label}`);
  const loadStart = performance.now();
  const [model, filterBytes, tokenBytes, configBytes] = await Promise.all([fetchCached(base, shenava.modelFile, shenava.modelBytes), fetchCached(base, 'mel_filters_slaney_80x257.json'), fetchCached(base, 'tokens.json'), fetchCached(base, 'preprocessor.json')]);
  const filters = JSON.parse(new TextDecoder().decode(filterBytes));
  const tokenFile = JSON.parse(new TextDecoder().decode(tokenBytes)) as { tokens: string[]; blank_id: number };
  const config = JSON.parse(new TextDecoder().decode(configBytes)) as Record<string, unknown>;
  const contract: Record<string, unknown> = { schema: 'visualears-preprocessor-v2-nemo-fbank', sample_rate: 16000, n_fft: 512, win_length: 400, hop_length: 160, n_mels: 80, window: 'hann_periodic_false', center: true, center_pad: 256, pad_mode: 'reflect', preemphasis: 0.97, mel_filters_file: 'mel_filters_slaney_80x257.json', spectrum: 'magnitude_power_2_no_fft_normalization', log: 'natural', log_zero_guard_type: 'add', log_zero_guard_value: 5.960464477539063e-8, normalize: 'NA', fixed_frames: 2005, pad_value: 0, blank_id: 1024 };
  for (const [key, value] of Object.entries(contract)) if (config[key] !== value) throw new Error(`قرارداد پیش‌پردازش شنوا ناسازگار است: ${key}`);
  if (tokenFile.tokens.length !== 1025 || tokenFile.blank_id !== 1024) throw new Error('واژگان شنوا با مدل CTC سازگار نیست.');
  const ort = await import('onnxruntime-web/webgpu');
  ort.env.wasm.numThreads = 1;
  ort.env.wasm.wasmPaths = { wasm: new URL(ortWasmUrl, self.location.origin).href, mjs: new URL(ortMjsUrl, self.location.origin).href };
  let session: any;
  let actualDevice = device;
  try { session = await ort.InferenceSession.create(model, { executionProviders: [device], graphOptimizationLevel: 'all' }); }
  catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    if (device !== 'webgpu' || !allowFallback) throw new Error(`شنوا روی ${device.toUpperCase()} بارگذاری نشد: ${detail}`);
    send('status', `شنوا: WebGPU بارگذاری نشد (${detail}). تلاش با WASM…`);
    try { session = await ort.InferenceSession.create(model, { executionProviders: ['wasm'], graphOptimizationLevel: 'all' }); actualDevice = 'wasm'; }
    catch (wasmError) { throw new Error(`شنوا روی WebGPU بارگذاری نشد: ${detail}؛ WASM نیز شکست خورد: ${wasmError instanceof Error ? wasmError.message : String(wasmError)}`); }
  }
  const loadMs = performance.now() - loadStart;
  try {
    // Fixed graph has 2005 frames (~20 seconds). Use 19-second windows and 2-second overlap.
    const step = 17 * 16000, size = 19 * 16000;
    const segments: Float32Array[] = [];
    for (let start = 0; start < audio.length; start += step) { segments.push(audio.slice(start, Math.min(start + size, audio.length))); if (start + size >= audio.length) break; }
    let prepMs = 0, inferMs = 0; const texts: string[] = [];
    for (let i = 0; i < segments.length; i++) {
      send('status', `شنوا: بخش ${i + 1} از ${segments.length}`);
      const p = performance.now(); const features = prepareShenava(segments[i], filters); prepMs += performance.now() - p;
      const inputs = { processed_signal: new ort.Tensor('float16', features.data, [1, 80, 2005]), processed_signal_length: new ort.Tensor('int64', BigInt64Array.of(BigInt(features.frames)), [1]) };
      const t = performance.now(); const outputs = await session.run(inputs); inferMs += performance.now() - t;
      const logits = outputs.logits;
      const len = Number((outputs.encoded_lengths.data as BigInt64Array)[0]);
      texts.push(decodeShenava(logits.data as Float32Array | Uint16Array, logits.dims, len, tokenFile.tokens, tokenFile.blank_id));
    }
    const totalMs = prepMs + inferMs, audioSeconds = audio.length / 16000;
    return { raw: joinTranscripts(texts), loadMs, prepMs, inferMs, totalMs, audioSeconds, rtf: totalMs / 1000 / audioSeconds, device: actualDevice };
  } finally { await session.release(); }
}

self.onmessage = async (message: MessageEvent<Request>) => {
  const { engine, audio, device, allowFallback } = message.data;
  try {
    if (!audio?.length) throw new Error('صوتی برای تبدیل موجود نیست.');
    const result = engine === 'tiny' || engine === 'small' ? await whisper(engine, audio, device, allowFallback) : await runShenava(engine, audio, device, allowFallback);
    send('result', result);
  } catch (error) { send('error', error instanceof Error ? error.message : String(error)); }
};
