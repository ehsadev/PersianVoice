import { describe, expect, it } from 'vitest';
import { parseSchema, schemaFromExample, validateOutput, forceClosedObjects } from './schema';

describe('Draft-07 validation', () => {
  const schema = parseSchema(JSON.stringify({ type: 'object', properties: { items: { type: 'array', items: { type: 'object', properties: { qty: { type: 'number' } }, required: ['qty'] } } }, required: ['items'] }));
  it('rejects malformed schema and external references', () => {
    expect(() => parseSchema('{')).toThrow();
    expect(() => parseSchema('{"$ref":"https://example.com/x"}')).toThrow();
  });
  it('rejects extra keys and missing required facts, including nested arrays', () => {
    const closed = forceClosedObjects(schema);
    expect(validateOutput(closed, { items: [{ qty: 2 }] })).toEqual([]);
    expect(validateOutput(closed, { items: [{ qty: 2, other: 1 }] }).length).toBe(1);
    expect(validateOutput(closed, { items: [{ }] }).length).toBe(1);
    expect(validateOutput(closed, { items: [{ qty: 'two' }] }).length).toBe(1);
  });
  it('creates a nested schema from an example and flags unknown types', () => {
    const generated = schemaFromExample({ customer: 'جعفری', items: [{ name: 'لباس', quantity: 1 }] });
    expect(generated.ambiguous).toEqual([]);
    expect(validateOutput(generated.schema, { customer: 'جعفری', items: [{ name: 'لباس', quantity: 1 }] })).toEqual([]);
    const ambiguous = schemaFromExample({ x: null, items: [] });
    expect(ambiguous.ambiguous).toEqual(['/x', '/items']);
    expect(() => parseSchema(JSON.stringify(ambiguous.schema))).toThrow();
  });
});
