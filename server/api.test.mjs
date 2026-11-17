import { describe, expect, it, vi } from 'vitest';
import { Readable } from 'node:stream';
import { handleApi } from './api.mjs';

const schema = { type: 'object', additionalProperties: false, properties: { count: { type: 'number' } }, required: ['count'] };
const payload = { text: 'دو قلم', schema, model: 'nvidia/nemotron-3.5-super-vl:free' };

async function request({ body = payload, origin = 'http://127.0.0.1:5173', method = 'POST', path = '/api/extract', apiKey = 'test-secret', fetcher = fetch } = {}) {
  const req = Readable.from(body ? [JSON.stringify(body)] : []);
  req.url = path;
  req.method = method;
  req.headers = { host: '127.0.0.1:5173', origin, 'content-type': 'application/json' };
  const res = { status: 0, headers: {}, body: '', writeHead(status, headers) { this.status = status; this.headers = headers; }, end(value) { this.body = value; } };
  await handleApi(req, res, { apiKey, fetcher });
  return { status: res.status, headers: res.headers, body: JSON.parse(res.body) };
}

describe('local OpenRouter API', () => {
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
  it('rejects cross-origin and unknown models without contacting OpenRouter', async () => {
    const upstream = vi.fn();
    expect((await request({ origin: 'https://example.com', fetcher: upstream })).status).toBe(403);
    expect((await request({ body: { ...payload, model: 'unknown' }, fetcher: upstream })).status).toBe(400);
    expect(upstream).not.toHaveBeenCalled();
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
