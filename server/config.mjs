export const DEFAULT_BASE_URL = 'https://openrouter.ai/api/v1';

export function extractionConfig(env = process.env) {
  const url = new URL((env.OPENAI_BASE_URL?.trim() || DEFAULT_BASE_URL).replace(/\/+$/, ''));
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
    throw new Error('OPENAI_BASE_URL must be an HTTP(S) API base URL without credentials, query or fragment.');
  }
  const model = env.OPENAI_MODEL?.trim() || '';
  const isOpenRouter = url.origin === 'https://openrouter.ai';
  return {
    apiKey: env.OPENAI_API_KEY || env.OPENROUTER_API_KEY || env.OPENROUTER_APIKEY || '',
    baseUrl: url.href.replace(/\/+$/, ''),
    customModel: model,
    isOpenRouter,
  };
}
