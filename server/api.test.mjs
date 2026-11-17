import { describe, expect, it, vi } from 'vitest';
import { Readable } from 'node:stream';
import { handleApi } from './api.mjs';

const schema = { type: 'object', additionalProperties: false, properties: { count: { type: 'number' } }, required: ['count'] };
const payload = { text: 'دو قلم', schema, model: 'nvidia/nemotron-3.5-super-vl:free' };

async function request({ body = payload, origin = 'http://127.0.0.1:5173', method = 'POST', path = '/api/extract', apiKey = 'test-secret', fetcher = fetch, ...config } = {}) {
  const req = Readable.from(body ? [JSON.stringify(body)] : []);
  req.url = path;
  req.method = method;
  req.headers = { host: '127.0.0.1:5173', origin, 'content-type': 'application/json' };
  const res = { status: 0, headers: {}, body: '', writeHead(status, headers) { this.status = status; this.headers = headers; }, end(value) { this.body = value; } };
  await handleApi(req, res, { apiKey, fetcher, ...config });
  return { status: res.status, headers: res.headers, body: JSON.parse(res.body) };
}

describe('local OpenRouter API', () => {
  it('discovers and extracts models from the configured base URL', async () => {
    const fetcher = vi.fn(async url => url.endsWith('/models')
      ? new Response(JSON.stringify({ data: [{ id: 'provider/model' }] }))
      : new Response(JSON.stringify({ choices: [{ message: { content: '{"count":2}' } }] })));
    const config = { baseUrl: 'https://provider.example/custom/v1/', fetcher };
    const catalog = await request({ ...config, path: '/api/models', method: 'GET', body: null });
    expect(catalog.body.data.map(model => model.id)).toEqual(['provider/model']);
    expect(fetcher.mock.calls[0][0]).toBe('https://provider.example/custom/v1/models');
    const result = await request({ ...config, body: { ...payload, model: 'provider/model' } });
    expect(result.status).toBe(200);
    expect(fetcher.mock.calls[1][0]).toBe('https://provider.example/custom/v1/chat/completions');
    expect(JSON.parse(fetcher.mock.calls[1][1].body)).not.toHaveProperty('provider');
    const unknown = await request({ ...config, body: payload });
    expect(unknown.status).toBe(400);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it('uses the configured provider and model without OpenRouter-only parameters', async () => {
    const upstream = vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { content: '{"count":2}' } }] })));
    const config = { baseUrl: 'https://example.com/v1/', customModel: 'custom-model' };
    const result = await request({ ...config, body: { ...payload, model: 'custom-model', baseUrl: 'https://untrusted.example/v1' }, fetcher: upstream });
    expect(result.status).toBe(200);
    const [url, options] = upstream.mock.calls[0];
    expect(url).toBe('https://example.com/v1/chat/completions');
    expect(JSON.parse(options.body)).toMatchObject({ model: 'custom-model', response_format: { type: 'json_schema' } });
    expect(JSON.parse(options.body)).not.toHaveProperty('provider');
    upstream.mockClear();
    expect((await request({ ...config, fetcher: upstream })).status).toBe(400);
    expect(upstream).not.toHaveBeenCalled();
    expect((await request({ ...config, path: '/api/status', method: 'GET', body: null })).body).toEqual({ configured: true, model: 'custom-model' });
  });
  it('redacts custom-provider keys in upstream errors', async () => {
    const result = await request({ apiKey: 'other-provider-secret', fetcher: async () => { throw new Error('failed other-provider-secret'); } });
    expect(result.status).toBe(502);
    expect(result.body.error).not.toContain('other-provider-secret');
    expect(result.body.error).toContain('[redacted]');
  });
  it('keeps the key server-side and validates an upstream result', async () => {
    const upstream = vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { content: '{"count":2}' } }], usage: { prompt_tokens: 48, completion_tokens: 12, total_tokens: 60, prompt_tokens_details: { cached_tokens: 8 }, completion_tokens_details: { reasoning_tokens: 3 } } }), { status: 200 }));
    const result = await request({ fetcher: upstream });
    expect(result.status).toBe(200);
    expect(result.body).toEqual({ data: { count: 2 }, usage: { promptTokens: 48, completionTokens: 12, totalTokens: 60, cachedTokens: 8, reasoningTokens: 3 } });
    expect(JSON.stringify(result)).not.toContain('test-secret');
    const [url, options] = upstream.mock.calls[0];
    expect(url).toBe('https://openrouter.ai/api/v1/chat/completions');
    expect(options.headers.Authorization).toBe('Bearer test-secret');
    const sent = JSON.parse(options.body);
    expect(sent.provider.require_parameters).toBe(true);
    expect(sent.response_format).toEqual({ type: 'json_schema', json_schema: { name: 'ava_extraction', strict: true, schema } });
  });
  it('rejects cross-origin requests and never sends unknown models for extraction', async () => {
    const upstream = vi.fn(async () => new Response(JSON.stringify({ data: [{ id: 'valid/model', name: 'Valid' }] })));
    expect((await request({ origin: 'https://example.com', fetcher: upstream })).status).toBe(403);
    expect(upstream).not.toHaveBeenCalled();
    expect((await request({ body: { ...payload, model: 'unknown' }, fetcher: upstream })).status).toBe(400);
    expect(upstream).toHaveBeenCalledTimes(1);
    expect(upstream.mock.calls[0][0]).toBe('https://openrouter.ai/api/v1/models');
  });
  it('lists and extracts with a model from the remote catalog', async () => {
    const upstream = vi.fn(async url => url.endsWith('/models')
      ? new Response(JSON.stringify({ data: [{ id: 'new/model', name: 'New Model', supported_parameters: ['structured_outputs'] }] }))
      : new Response(JSON.stringify({ choices: [{ message: { content: '{"count":2}' } }] })));
    const listed = await request({ path: '/api/models', method: 'GET', body: null, apiKey: '', fetcher: upstream });
    expect(listed.status).toBe(200);
    expect(listed.body.data.slice(0, 4).map(model => model.pinned)).toEqual([true, true, true, true]);
    expect(listed.body.data[4].id).toBe('new/model');
    const extracted = await request({ body: { ...payload, model: 'new/model' }, fetcher: upstream });
    expect(extracted.status).toBe(200);
    expect(upstream).toHaveBeenCalledTimes(2);
    expect(JSON.parse(upstream.mock.calls[1][1].body).model).toBe('new/model');
    expect(upstream.mock.calls[0][1].headers).toEqual({ Accept: 'application/json' });
  });
  it('retries a failed catalog immediately when refresh is requested', async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response('Forbidden', { status: 403 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: [{ id: 'retry/model' }] })));
    const failed = await request({ path: '/api/models', method: 'GET', body: null, fetcher });
    expect(failed.body.error).toContain('HTTP 403');
    const retried = await request({ path: '/api/models?refresh=1', method: 'GET', body: null, fetcher });
    expect(retried.body.fallback).toBe(false);
    expect(retried.body.data.some(model => model.id === 'retry/model')).toBe(true);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it('returns only the configured model for a custom provider without calling OpenRouter', async () => {
    const upstream = vi.fn();
    const result = await request({ path: '/api/models', method: 'GET', body: null, baseUrl: 'https://example.com/v1', customModel: 'private/model', fetcher: upstream });
    expect(result.body.data.map(model => model.id)).toEqual(['private/model']);
    expect(upstream).not.toHaveBeenCalled();
  });
  it('keeps the pinned models available when the catalog is unavailable', async () => {
    const result = await request({ path: '/api/models', method: 'GET', body: null, fetcher: async () => { throw new Error('offline'); } });
    expect(result.status).toBe(200);
    expect(result.body.fallback).toBe(true);
    expect(result.body.data).toHaveLength(4);
  });
  it('reports key configuration without revealing the key', async () => {
    const result = await request({ path: '/api/status', method: 'GET', body: null });
    expect(result.body).toEqual({ configured: true });
    expect(result.headers['Cache-Control']).toBe('no-store');
  });
  it('rejects schema-invalid upstream content', async () => {
    const result = await request({ fetcher: async () => new Response(JSON.stringify({ choices: [{ message: { content: '{"count":"two"}' } }] }), { status: 200 }) });
    expect(result.status).toBe(502);
    expect(result.body.error).toContain('Schema');
  });
  it('handles an upstream response without usage', async () => {
    const result = await request({ fetcher: async () => new Response(JSON.stringify({ choices: [{ message: { content: '{"count":2}' } }] }), { status: 200 }) });
    expect(result.body.usage).toBeNull();
  });
  it('rejects an invalid schema before contacting OpenRouter', async () => {
    const upstream = vi.fn();
    const result = await request({ body: { ...payload, schema: { type: 'unknown-type' } }, fetcher: upstream });
    expect(result.status).toBe(400);
    expect(result.body.error).toContain('Schema');
    expect(upstream).not.toHaveBeenCalled();
  });
  it('reports a non-JSON upstream 403 without exposing its response body', async () => {
    const result = await request({ fetcher: async () => new Response('<html>private proxy details</html>', { status: 403, headers: { 'Content-Type': 'text/html' } }) });
    expect(result.status).toBe(502);
    expect(result.body.error).toContain('OpenRouter HTTP 403');
    expect(result.body.error).toContain('جزئیات JSON برنگرداند');
    expect(result.body.error).not.toContain('private proxy details');
  });
});
