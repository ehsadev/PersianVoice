// NeMo fbank contract from the model's preprocessor.json and the author's fbank.rs.
const FFT = 512, WIN = 400, HOP = 160, PAD = 256, MELS = 80, FIXED = 2005;
const GUARD = 5.960464477539063e-8;

export function float16(value: number): number {
  const f = new Float32Array(1); const bits = new Uint32Array(f.buffer); f[0] = value;
  const x = bits[0], sign = (x >>> 16) & 0x8000, exponent = (x >>> 23) & 0xff, mant = x & 0x7fffff;
  if (exponent === 255) return sign | 0x7c00 | (mant ? 0x200 : 0);
  let halfExp = exponent - 127 + 15;
  if (halfExp <= 0) {
    if (halfExp < -10) return sign;
    const full = mant | 0x800000, shift = 14 - halfExp;
    const rounded = (full + (1 << (shift - 1)) - 1 + ((full >>> shift) & 1)) >>> shift;
    return sign | rounded;
  }
  if (halfExp >= 31) return sign | 0x7c00;
  const rounded = mant + 0xfff + ((mant >>> 13) & 1);
  if (rounded >= 0x800000) { halfExp++; return sign | (halfExp >= 31 ? 0x7c00 : halfExp << 10); }
  return sign | (halfExp << 10) | (rounded >>> 13);
}
export function fromFloat16(value: number): number {
  const sign = value & 0x8000 ? -1 : 1, exp = (value >>> 10) & 31, mant = value & 1023;
  if (exp === 0) return sign * 2 ** -14 * (mant / 1024);
  if (exp === 31) return mant ? NaN : sign * Infinity;
  return sign * 2 ** (exp - 15) * (1 + mant / 1024);
}

function reflect(index: number, length: number): number {
  if (length === 1) return 0;
  const period = 2 * (length - 1);
  const folded = ((index % period) + period) % period;
  return folded < length ? folded : period - folded;
}

function fftPower(frame: Float32Array): Float32Array {
  const real = new Float32Array(FFT), imag = new Float32Array(FFT);
  for (let i = 0, j = 0; i < FFT; i++) {
    real[j] = frame[i];
    let bit = FFT >> 1;
    while (j & bit) { j ^= bit; bit >>= 1; }
    j ^= bit;
  }
  for (let size = 2; size <= FFT; size <<= 1) {
    const half = size >> 1;
    for (let base = 0; base < FFT; base += size) for (let k = 0; k < half; k++) {
      const angle = -2 * Math.PI * k / size, c = Math.cos(angle), s = Math.sin(angle);
      const a = base + k, b = a + half, tr = c * real[b] - s * imag[b], ti = s * real[b] + c * imag[b];
      real[b] = real[a] - tr; imag[b] = imag[a] - ti; real[a] += tr; imag[a] += ti;
    }
  }
  const power = new Float32Array(257);
  for (let i = 0; i < power.length; i++) power[i] = real[i] * real[i] + imag[i] * imag[i];
  return power;
}

export function prepareShenava(samples: Float32Array, filtersInput: unknown): { data: Uint16Array; frames: number } {
  if (!samples.length) throw new Error('صوت خالی است.');
  if (samples.length > 20 * 16000) throw new Error('بخش شنوا بیش از ۲۰ ثانیه است.');
  const filters = (filtersInput as { filters?: number[][] }).filters ?? filtersInput;
  if (!Array.isArray(filters) || filters.length !== MELS || !filters.every(row => Array.isArray(row) && row.length === 257)) throw new Error('فیلتر Mel شنوا با قرارداد ۸۰×۲۵۷ سازگار نیست.');
  const pre = new Float32Array(samples.length);
  pre[0] = samples[0]; for (let i = 1; i < samples.length; i++) pre[i] = samples[i] - 0.97 * samples[i - 1];
  const frames = Math.min(FIXED, 1 + Math.floor(samples.length / HOP));
  const data = new Uint16Array(MELS * FIXED);
  const frame = new Float32Array(FFT);
  const window = new Float32Array(FFT);
  for (let i = 0; i < WIN; i++) window[56 + i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / (WIN - 1));
  for (let t = 0; t < frames; t++) {
    for (let i = 0; i < FFT; i++) frame[i] = pre[reflect(t * HOP + i - PAD, pre.length)] * window[i];
    const power = fftPower(frame);
    for (let m = 0; m < MELS; m++) {
      let sum = 0;
      const row = filters[m] as number[];
      for (let k = 0; k < 257; k++) sum += power[k] * row[k];
      data[m * FIXED + t] = float16(Math.log(sum + GUARD));
    }
  }
  return { data, frames };
}

export function decodeShenava(logits: Float32Array | Uint16Array, shape: readonly number[], encodedLength: number, tokens: string[], blank = 1024): string {
  if (shape.length !== 3 || shape[0] !== 1 || shape[2] !== tokens.length) throw new Error('شکل خروجی logits شنوا ناسازگار است.');
  const steps = Math.min(shape[1], encodedLength);
  let previous = -1, text = '';
  for (let t = 0; t < steps; t++) {
    let best = 0, score = -Infinity;
    for (let k = 0; k < shape[2]; k++) {
      const raw = logits[t * shape[2] + k];
      const value = logits instanceof Uint16Array ? fromFloat16(raw) : raw;
      if (value > score) { score = value; best = k; }
    }
    if (best === blank) { previous = -1; continue; }
    if (best === previous) continue;
    const token = tokens[best];
    if (token && !(token.startsWith('<') && token.endsWith('>'))) {
      if (token.startsWith('▁') && text) text += ' ';
      text += token.replace(/^▁+|▁+$/g, '');
    }
    previous = best;
  }
  return text.trim();
}
