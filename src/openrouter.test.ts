import { describe, expect, it, vi } from 'vitest';
import { extractWithOpenRouter, OPENROUTER_ENDPOINT, OPENROUTER_MODEL } from './openrouter';

const schema = { type: 'object', properties: { count: { type: 'number' } }, required: ['count'] };
describe('OpenRouter extraction', () => {
  it('sends text and a strict schema and validates the reply', async () => {
    const mock = vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { content: '{"count":2}' } }] }), { status: 200 })) as unknown as typeof fetch;
    expect(await extractWithOpenRouter('دو قلم', schema, 'test-key', undefined, mock)).toEqual({ count: 2 });
    const [url, options] = (mock as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toBe(OPENROUTER_ENDPOINT);
    expect(options.headers.Authorization).toBe('Bearer test-key');
    const request = JSON.parse(options.body);
    expect(request.model).toBe(OPENROUTER_MODEL);
    expect(request.messages[1].content).toBe('دو قلم');
    expect(request.response_format.json_schema.strict).toBe(true);
    expect(request.response_format.json_schema.schema.additionalProperties).toBe(false);
    expect(request.provider.require_parameters).toBe(true);
  });
  it('rejects schema-invalid content', async () => {
    const mock = vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { content: '{"count":"two"}' } }] }), { status: 200 })) as unknown as typeof fetch;
    await expect(extractWithOpenRouter('دو', schema, 'test-key', undefined, mock)).rejects.toThrow('Schema');
  });
  it('does not send a request without a key', async () => {
    const mock = vi.fn() as unknown as typeof fetch;
    await expect(extractWithOpenRouter('دو', schema, '', undefined, mock)).rejects.toThrow('کلید API');
    expect(mock).not.toHaveBeenCalled();
  });
  it('uses the selected free model', async () => {
    const mock = vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { content: '{"count":2}' } }] }), { status: 200 })) as unknown as typeof fetch;
    await extractWithOpenRouter('دو', schema, 'test-key', undefined, mock, 'liquid/lfm-3-1.7b:free');
    expect(JSON.parse((mock as unknown as ReturnType<typeof vi.fn>).mock.calls[0][1].body).model).toBe('liquid/lfm-3-1.7b:free');
  });
});
