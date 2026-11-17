export const ASR_MODELS = {
  tiny: { label: 'Whisper Tiny چندزبانه', repo: 'onnx-community/whisper-tiny', revision: 'ff41770', files: 'encoder_model.onnx 32.9 MB + decoder_model_merged_q4.onnx 86.7 MB', downloadMB: 124, runtime: 'WebGPU / WASM' },
  small: { label: 'Whisper Small چندزبانه', repo: 'onnx-community/whisper-small', revision: '461d552a09349d5d0d0779b40dd79800eaa3e35a', files: 'encoder_model_fp16.onnx 176.5 MB + decoder_model_merged_q4.onnx 233 MB', downloadMB: 414, runtime: 'WebGPU / WASM' },
  shenava: { label: 'Shenava Rizeh-Pizeh v1.0', repo: 'Reza2kn/Shenava-Rizeh-Pizeh-v1.0-ONNX-fp16', revision: '788f262', modelFile: 'rizeh-69m-v6_ctc_fixed2005_len_att70_13_fp16_full_io_embedded.onnx', modelBytes: 17098975, files: 'ONNX FP16 تک‌فایلی 17.1 MB + sidecars 0.11 MB', downloadMB: 17.3, runtime: 'WebGPU / WASM' },
  shenavaRizeh: { label: 'Shenava Rizeh v1.0', repo: 'Reza2kn/Shenava-Rizeh-v1.0-ONNX-fp16', revision: 'd393dce', modelFile: 'shenava-32m-v5_ctc_fixed2005_len_att70_13_fp16_full_io_embedded.onnx', modelBytes: 58982673, files: 'ONNX FP16 تک‌فایلی 59.0 MB + sidecars 0.11 MB', downloadMB: 59.1, runtime: 'WebGPU / WASM (در صورت سازگاری دستگاه)' },
  shenavaKoochik: { label: 'Shenava Koochik v1.0', repo: 'Reza2kn/Shenava-Koochik-v1.0-ONNX-fp16', revision: '9c0d635', modelFile: 'shenava_koochik_1_0_ctc_fixed2005_len_att70_13_fp16_full_io_embedded.onnx', modelBytes: 230075609, files: 'ONNX FP16 تک‌فایلی 230.1 MB + sidecars 0.11 MB', downloadMB: 230.2, runtime: 'WebGPU / WASM (در صورت سازگاری دستگاه)' },
} as const;
export type AsrEngine = keyof typeof ASR_MODELS;
export interface AsrMetrics { loadMs: number; prepMs: number; inferMs: number; totalMs: number; audioSeconds: number; rtf: number; device: 'webgpu' | 'wasm' }
export interface AsrResult { engine: AsrEngine; raw: string; metrics: AsrMetrics; error?: string; edited?: string; wer?: number; cer?: number }
