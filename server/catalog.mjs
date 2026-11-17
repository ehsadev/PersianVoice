import { DEFAULT_BASE_URL } from './config.mjs';

export const PINNED_MODELS = [
  { id: 'nvidia/nemotron-3.5-super-vl:free', name: 'Nemotron 3.5 Super VL' },
  { id: 'baidu/ernie-5.5-flash-preview:free', name: 'ERNIE 5.5 Flash Preview' },
  { id: 'inclusionai/ling-3.2-flash:free', name: 'Ling 3.2 Flash' },
  { id: 'liquid/lfm-3-1.7b:free', name: 'LFM3 1.7B' },
].map(model => ({ ...model, pinned: true, free: true, structured: true }));

const cache = new WeakMap();
const ttl = 5 * 60_000;

function catalogError(error) {
  if (error.status) return `دریافت فهرست مدل‌ها: HTTP ${error.status}. ${error.status === 401 || error.status === 403 ? 'کلید API، دسترسی سرویس و تنظیمات پراکسی را بررسی کنید.' : 'سرویس پاسخ موفق نداد؛ دوباره تلاش کنید.'}`;
  const code = error.cause?.code || error.code;
  if (code === 'ENOTFOUND' || code === 'EAI_AGAIN') return 'نشانی سرویس پیدا نشد (DNS). اتصال شبکه و HTTPS_PROXY را بررسی کنید.';
  if (code === 'ECONNREFUSED') return 'اتصال به سرویس یا پراکسی رد شد. فعال‌بودن پراکسی و آدرس آن را بررسی کنید.';
  if (error.name === 'TimeoutError' || error.name === 'AbortError' || code === 'ETIMEDOUT' || code === 'UND_ERR_CONNECT_TIMEOUT') return 'مهلت دریافت فهرست مدل‌ها تمام شد. اتصال شبکه و پراکسی را بررسی و دوباره تلاش کنید.';
  if (error instanceof SyntaxError || error.code === 'INVALID_CATALOG') return 'پاسخ فهرست مدل‌ها معتبر نیست؛ سرویس باید JSON با آرایهٔ data برگرداند.';
  return 'دریافت فهرست مدل‌ها ممکن نشد. آدرس پایه، اتصال شبکه و تنظیمات پراکسی را بررسی کنید.';
}

export function normalizeModels(data, pinDefaults = true) {
  if (!Array.isArray(data)) throw Object.assign(new Error('Invalid model catalog'), { code: 'INVALID_CATALOG' });
  const models = new Map();
  for (const model of data) {
    if (!model || typeof model.id !== 'string' || !model.id.trim() || model.id.length > 256) continue;
    models.set(model.id, {
      id: model.id,
      name: typeof model.name === 'string' ? model.name : model.id,
      pinned: false,
      free: model.pricing?.prompt != null && model.pricing?.completion != null && Number(model.pricing.prompt) === 0 && Number(model.pricing.completion) === 0,
      structured: Array.isArray(model.supported_parameters) && model.supported_parameters.includes('structured_outputs'),
    });
  }
  if (!models.size) throw Object.assign(new Error('Empty model catalog'), { code: 'INVALID_CATALOG' });
  const pinnedModels = pinDefaults ? PINNED_MODELS : [];
  for (const pinned of pinnedModels) models.set(pinned.id, { ...models.get(pinned.id), ...pinned });
  return [...pinnedModels.map(model => models.get(model.id)), ...[...models.values()].filter(model => !model.pinned).sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id))];
}

export async function modelCatalog(fetcher = fetch, { baseUrl = DEFAULT_BASE_URL, apiKey = '', isOpenRouter = new URL(baseUrl).origin === 'https://openrouter.ai', refresh = false } = {}) {
  const endpoint = `${baseUrl.replace(/\/+$/, '')}/models`;
  let catalogs = cache.get(fetcher);
  if (!catalogs) { catalogs = new Map(); cache.set(fetcher, catalogs); }
  const cacheKey = JSON.stringify([endpoint, isOpenRouter ? '' : apiKey, isOpenRouter]);
  const previous = catalogs.get(cacheKey);
  if (!refresh && previous && previous.expires > Date.now()) return previous.result;
  if (previous?.pending) return previous.pending;
  const pending = Promise.resolve().then(async () => {
    try {
      const response = await fetcher(endpoint, {
        signal: AbortSignal.timeout(30_000), cache: 'no-store',
        headers: { Accept: 'application/json', ...(!isOpenRouter && apiKey.trim() ? { Authorization: `Bearer ${apiKey.trim()}` } : {}) },
      });
      if (!response.ok) throw Object.assign(new Error('Model catalog unavailable'), { status: response.status });
      const data = normalizeModels((await response.json())?.data, isOpenRouter);
      const result = { data, fallback: false };
      catalogs.set(cacheKey, { result, expires: Date.now() + ttl });
      return result;
    } catch (error) {
      const result = { data: previous?.result?.data || (isOpenRouter ? PINNED_MODELS : []), fallback: true, error: catalogError(error) };
      catalogs.set(cacheKey, { result, expires: Date.now() + 30_000 });
      return result;
    }
  });
  catalogs.set(cacheKey, { ...previous, pending, expires: 0 });
  return pending;
}

