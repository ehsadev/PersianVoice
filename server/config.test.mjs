import { describe, expect, it } from 'vitest';
import { DEFAULT_BASE_URL, extractionConfig } from './config.mjs';

describe('extraction configuration', () => {
  it('preserves OpenRouter defaults and legacy keys', () => {
    expect(extractionConfig({ OPENROUTER_APIKEY: 'legacy' })).toEqual({ apiKey: 'legacy', baseUrl: DEFAULT_BASE_URL, customModel: '', isOpenRouter: true });
  });
  it('accepts custom providers and prefers their key', () => {
    expect(extractionConfig({ OPENAI_BASE_URL: 'http://localhost:1234/v1/', OPENAI_MODEL: 'local-model', OPENAI_API_KEY: 'custom', OPENROUTER_API_KEY: 'old' })).toEqual({ apiKey: 'custom', baseUrl: 'http://localhost:1234/v1', customModel: 'local-model', isOpenRouter: false });
  });
  it('allows model discovery for other providers and rejects malformed base URLs', () => {
    expect(extractionConfig({ OPENAI_BASE_URL: 'https://example.com/v1' })).toMatchObject({ customModel: '', isOpenRouter: false });
    for (const url of ['file:///tmp/api', 'https://user:secret@example.com/v1', 'https://example.com/v1?key=secret', 'https://example.com/v1#fragment']) {
      expect(() => extractionConfig({ OPENAI_BASE_URL: url, OPENAI_MODEL: 'model' })).toThrow('OPENAI_BASE_URL');
    }
  });
});
