import Ajv, { type ErrorObject } from 'ajv';

export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
export type JsonSchema = Record<string, unknown>;
const ajv = new Ajv({ strict: false, allErrors: true, validateSchema: true, removeAdditional: false });

export function parseSchema(source: string): JsonSchema {
  const schema: unknown = JSON.parse(source);
  if (!schema || typeof schema !== 'object' || Array.isArray(schema)) throw new Error('Schema باید یک شیء JSON باشد.');
  const s = schema as JsonSchema;
  if (s.$schema && s.$schema !== 'http://json-schema.org/draft-07/schema#') throw new Error('فقط JSON Schema Draft-07 پشتیبانی می‌شود.');
  scanRefs(s);
  const valid = ajv.validateSchema(s);
  if (!valid) throw new Error('Schema نامعتبر است: ' + describeErrors(ajv.errors));
  ajv.compile(s);
  return s;
}

function scanRefs(value: unknown): void {
  if (!value || typeof value !== 'object') return;
  if (Array.isArray(value)) return value.forEach(scanRefs);
  for (const [key, item] of Object.entries(value)) {
    if (key === '$ref' && (typeof item !== 'string' || !item.startsWith('#/'))) throw new Error('فقط $ref داخلی از نوع #/… مجاز است.');
    if (key === 'description' && typeof item === 'string' && item.includes('نوع این مقدار را تعیین کنید')) throw new Error('نوع مقدار null در Schema تولیدشده هنوز تعیین نشده است.');
    if (key === 'description' && typeof item === 'string' && item.includes('نوع items را تعیین کنید')) throw new Error('نوع عناصر آرایهٔ خالی هنوز تعیین نشده است.');
    scanRefs(item);
  }
}

export function validateOutput(schema: JsonSchema, data: unknown): string[] {
  const validate = ajv.compile(schema);
  const ok = validate(data);
  return ok ? [] : [describeErrors(validate.errors)];
}

export function describeErrors(errors: ErrorObject[] | null | undefined): string {
  return (errors ?? []).map(e => `${e.instancePath || '/'}: ${e.message ?? 'نامعتبر'}${e.params ? ' ' + JSON.stringify(e.params) : ''}`).join('؛ ');
}

export function schemaFromExample(value: Json): { schema: JsonSchema; ambiguous: string[] } {
  const ambiguous: string[] = [];
  function infer(v: Json, path: string): JsonSchema {
    if (v === null) { ambiguous.push(path); return { description: 'نوع این مقدار را تعیین کنید؛ مقدار نمونه null است.' }; }
    if (Array.isArray(v)) {
      if (!v.length) { ambiguous.push(path); return { type: 'array', items: {}, description: 'نوع items را تعیین کنید؛ آرایهٔ نمونه خالی است.' }; }
      return { type: 'array', items: infer(v[0], path + '/0') };
    }
    if (typeof v === 'object') {
      const properties = Object.fromEntries(Object.entries(v).map(([key, item]) => [key, infer(item, path + '/' + key)]));
      return { type: 'object', additionalProperties: false, properties, required: Object.keys(v) };
    }
    return { type: typeof v };
  }
  return { schema: { $schema: 'http://json-schema.org/draft-07/schema#', ...infer(value, '') }, ambiguous };
}

export function forceClosedObjects(schema: JsonSchema): JsonSchema {
  const clone = structuredClone(schema);
  function walk(v: unknown): void {
    if (!v || typeof v !== 'object') return;
    if (Array.isArray(v)) return v.forEach(walk);
    const obj = v as JsonSchema;
    if (obj.type === 'object' || obj.properties) obj.additionalProperties = false;
    Object.values(obj).forEach(walk);
  }
  walk(clone);
  return clone;
}
