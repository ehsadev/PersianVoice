import { forceClosedObjects, validateOutput, type JsonSchema } from './schema';

export const OPENROUTER_MODEL = 'nvidia/nemotron-3.5-super-vl:free';
export const OPENROUTER_MODELS = {
  'nvidia/nemotron-3.5-super-vl:free': { label: 'Nemotron 3.5 Super VL', provider: 'NVIDIA' },
  'baidu/ernie-5.5-flash-preview:free': { label: 'ERNIE 5.5 Flash Preview', provider: 'Baidu' },
  'inclusionai/ling-3.2-flash:free': { label: 'Ling 3.2 Flash', provider: 'Ant Digital' },
  'liquid/lfm-3-1.7b:free': { label: 'LFM3 1.7B', provider: 'Liquid AI' },
} as const;
export type OpenRouterModel = string;
export type TokenUsage = { promptTokens: number | null; completionTokens: number | null; totalTokens: number | null; cachedTokens: number | null; reasoningTokens: number | null };
export type ExtractionResult = { data: unknown; usage: TokenUsage | null };

export async function extractWithOpenRouter(text: string, schema: JsonSchema, signal?: AbortSignal, fetcher: typeof fetch = fetch, model: OpenRouterModel = OPENROUTER_MODEL): Promise<ExtractionResult> {
  if (!text.trim()) throw new Error('متن برای استخراج خالی است.');
  if (!model.trim()) throw new Error('مدل استخراج انتخاب نشده است.');
  let response: Response;
  try {
    response = await fetcher('/api/extract', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, schema: forceClosedObjects(schema), model }),
      signal,
      cache: 'no-store',
      credentials: 'same-origin',
    });
  } catch (error) {
    if (signal?.aborted) throw new Error('پردازش لغو شد.');
    throw new Error(`ارتباط با سرویس محلی برقرار نشد: ${error instanceof Error ? error.message : String(error)}`);
  }
  const body: unknown = await response.json().catch(() => null);
  if (signal?.aborted) throw new Error('پردازش لغو شد.');
  if (!response.ok) {
    const detail = body && typeof body === 'object' && 'error' in body ? (body as { error?: unknown }).error : undefined;
    throw new Error(typeof detail === 'string' ? detail : `خطای سرویس استخراج (${response.status})`);
  }
  if (!body || typeof body !== 'object' || !('data' in body)) throw new Error('پاسخ سرویس استخراج ناقص است.');
  const data = (body as { data: unknown }).data;
  const errors = validateOutput(forceClosedObjects(schema), data);
  if (errors.length) throw new Error('خروجی با Schema سازگار نیست: ' + errors.join('؛ '));
  const rawUsage = (body as { usage?: unknown }).usage;
  const usage = rawUsage && typeof rawUsage === 'object' && ['promptTokens', 'completionTokens', 'totalTokens', 'cachedTokens', 'reasoningTokens'].every(key => {
    const value = (rawUsage as Record<string, unknown>)[key];
    return value === null || (Number.isSafeInteger(value) && Number(value) >= 0);
  }) ? rawUsage as TokenUsage : null;
  return { data, usage };
}
