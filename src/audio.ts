export const MAX_SECONDS = 120;
export const MAX_BYTES = 25 * 1024 * 1024;

export async function decodeAudio(file: Blob): Promise<Float32Array> {
  if (file.size > MAX_BYTES) throw new Error('حجم صوت بیش از ۲۵ مگابایت است.');
  const bytes = await file.arrayBuffer();
  const context = new AudioContext();
  try {
    const decoded = await context.decodeAudioData(bytes);
    if (decoded.duration > MAX_SECONDS) throw new Error('مدت صوت بیش از ۲ دقیقه است.');
    if (!decoded.length) throw new Error('فایل صوتی خالی است.');
    const length = Math.ceil(decoded.duration * 16000);
    const offline = new OfflineAudioContext(1, length, 16000);
    const mono = offline.createBuffer(1, decoded.length, decoded.sampleRate);
    const target = mono.getChannelData(0);
    for (let c = 0; c < decoded.numberOfChannels; c++) {
      const channel = decoded.getChannelData(c);
      for (let i = 0; i < channel.length; i++) target[i] += channel[i] / decoded.numberOfChannels;
    }
    const source = offline.createBufferSource();
    source.buffer = mono;
    source.connect(offline.destination);
    source.start();
    return new Float32Array((await offline.startRendering()).getChannelData(0));
  } finally { await context.close(); }
}

export function chunks(samples: Float32Array): Float32Array[] {
  const size = 28 * 16000;
  const overlap = 2 * 16000;
  const result: Float32Array[] = [];
  for (let start = 0; start < samples.length; start += size - overlap) {
    result.push(samples.slice(start, Math.min(start + size, samples.length)));
    if (start + size >= samples.length) break;
  }
  return result;
}

export function joinTranscripts(parts: string[]): string {
  let joined = '';
  for (const part of parts) {
    const words = part.trim().split(/\s+/);
    if (!joined) { joined = part.trim(); continue; }
    const prior = joined.split(/\s+/);
    let match = 0;
    for (let n = 1; n <= Math.min(12, prior.length, words.length); n++) {
      if (prior.slice(-n).join(' ') === words.slice(0, n).join(' ')) match = n;
    }
    joined += ' ' + words.slice(match).join(' ');
  }
  return joined.trim();
}
