import { describe, expect, it, vi } from 'vitest';
import { extractWithOpenRouter, OPENROUTER_MODEL } from './openrouter';

const schema = { type: 'object', properties: { count: { type: 'number' } }, required: ['count'] };
describe('browser extraction client', () => {
  it('sends only text, schema, and model to the same-origin endpoint', async () => {
    const usage = { promptTokens: 48, completionTokens: 12, totalTokens: 60, cachedTokens: null, reasoningTokens: 3 };
    const mock = vi.fn(async () => new Response(JSON.stringify({ data: { count: 2 }, usage }), { status: 200 })) as unknown as typeof fetch;
    expect(await extractWithOpenRouter('دو قلم', schema, undefined, mock)).toEqual({ data: { count: 2 }, usage });
    const [url, options] = (mock as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toBe('/api/extract');
    expect(options.headers).not.toHaveProperty('Authorization');
    expect(options.credentials).toBe('same-origin');
    const request = JSON.parse(options.body);
    expect(request.model).toBe(OPENROUTER_MODEL);
    expect(request.schema.additionalProperties).toBe(false);
    expect(request).not.toHaveProperty('apiKey');
  });
  it('rejects schema-invalid content returned by the server', async () => {
    const mock = vi.fn(async () => new Response(JSON.stringify({ data: { count: 'two' } }), { status: 200 })) as unknown as typeof fetch;
    await expect(extractWithOpenRouter('دو', schema, undefined, mock)).rejects.toThrow('Schema');
  });
  it('surfaces a missing server key without exposing it', async () => {
    const mock = vi.fn(async () => new Response(JSON.stringify({ error: 'کلید OpenRouter در سرور تنظیم نشده است.' }), { status: 503 })) as unknown as typeof fetch;
    await expect(extractWithOpenRouter('دو', schema, undefined, mock)).rejects.toThrow('تنظیم نشده');
  });
});
