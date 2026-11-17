import { describe, expect, it, vi } from 'vitest';
import { modelCatalog, normalizeModels, PINNED_MODELS } from './catalog.mjs';

describe('OpenRouter model catalog', () => {
  it('uses the configured base URL and isolates cached catalogs and credentials', async () => {
    const fetcher = vi.fn(async url => new Response(JSON.stringify({ data: [{ id: url.includes('first') ? 'first-model' : 'second-model' }] })));
    const first = { baseUrl: 'https://first.example/api/v1/', apiKey: 'first-key' };
    const second = { baseUrl: 'https://second.example/v1', apiKey: 'second-key' };
    const a = await modelCatalog(fetcher, first);
    const b = await modelCatalog(fetcher, second);
    expect(a.data.map(model => model.id)).toEqual(['first-model']);
    expect(b.data.map(model => model.id)).toEqual(['second-model']);
    expect(fetcher.mock.calls[0][0]).toBe('https://first.example/api/v1/models');
    expect(fetcher.mock.calls[0][1].headers.Authorization).toBe('Bearer first-key');
    expect(fetcher.mock.calls[1][0]).toBe('https://second.example/v1/models');
    expect(fetcher.mock.calls[1][1].headers.Authorization).toBe('Bearer second-key');
    await modelCatalog(fetcher, first);
    expect(fetcher).toHaveBeenCalledTimes(2);
    await modelCatalog(fetcher, { ...first, apiKey: 'another-key' });
    expect(fetcher).toHaveBeenCalledTimes(3);
  });
  it('does not fall back to OpenRouter models for another provider', async () => {
    const result = await modelCatalog(async () => { throw new Error('offline'); }, { baseUrl: 'https://other.example/v1' });
    expect(result).toMatchObject({ data: [], fallback: true });
    expect(result.error).toBeTruthy();
  });
  it('reports HTTP failures safely and allows immediate retry after a failed cached request', async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: 'private upstream details and secret-key' }), { status: 403 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: [{ id: 'recovered/model' }], total_count: 1, links: { next: null } })));
    const failed = await modelCatalog(fetcher);
    expect(failed.fallback).toBe(true);
    expect(failed.error).toContain('HTTP 403');
    expect(JSON.stringify(failed)).not.toContain('secret-key');
    await modelCatalog(fetcher);
    expect(fetcher).toHaveBeenCalledTimes(1);
    const recovered = await modelCatalog(fetcher, { refresh: true });
    expect(recovered.fallback).toBe(false);
    expect(recovered.data.some(model => model.id === 'recovered/model')).toBe(true);
    expect(recovered).not.toHaveProperty('error');
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it.each([
    ['ENOTFOUND', 'DNS'], ['ECONNREFUSED', 'پراکسی'], ['UND_ERR_CONNECT_TIMEOUT', 'مهلت'],
  ])('explains %s failures without exposing network credentials', async (code, expected) => {
    const result = await modelCatalog(async () => { throw new TypeError('https://user:secret@private-host', { cause: { code } }); });
    expect(result.fallback).toBe(true);
    expect(result.error).toContain(expected);
    expect(JSON.stringify(result)).not.toContain('secret');
  });
  it('explains non-JSON responses and invalid catalog shapes', async () => {
    for (const body of ['<html>private proxy response</html>', '{"data":{}}']) {
      const result = await modelCatalog(async () => new Response(body));
      expect(result.fallback).toBe(true);
      expect(result.error).toContain('آرایهٔ data');
      expect(JSON.stringify(result)).not.toContain('private proxy');
    }
  });
  it('pins our four models, deduplicates IDs, sorts others and preserves capability and cost labels', () => {
    const models = normalizeModels([
      { id: 'z/model', name: 'Z model', supported_parameters: ['response_format'], pricing: { prompt: '0.01', completion: '0.02' } },
      { id: PINNED_MODELS[0].id, name: 'Remote pinned name' },
      { id: 'a/model', name: 'A model', supported_parameters: ['structured_outputs'], pricing: { prompt: '0', completion: '0' } },
      { id: 'a/model', name: 'A model', supported_parameters: ['structured_outputs'], pricing: { prompt: '0', completion: '0' } },
      null, {}, { id: '' },
    ]);
    expect(models.map(model => model.id)).toEqual([...PINNED_MODELS.map(model => model.id), 'a/model', 'z/model']);
    expect(models[4]).toMatchObject({ free: true, structured: true });
    expect(models[5]).toMatchObject({ free: false, structured: false });
    expect(() => normalizeModels([])).toThrow();
  });
  it('coalesces simultaneous loads and caches the public catalog', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ data: [{ id: 'new/model' }] })));
    const [first, second] = await Promise.all([modelCatalog(fetcher), modelCatalog(fetcher)]);
    expect(first).toEqual(second);
    await modelCatalog(fetcher);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
