import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  BatchAnalysisSchema,
  ExplainerDocumentSchema,
  ExplanationSchema,
  FlowGraphSchema,
  OverviewSchema,
  parseExplainerDocument,
} from '../src/schema';

const sample = () =>
  JSON.parse(
    readFileSync(new URL('../../../fixtures/sample-document.json', import.meta.url), 'utf8'),
  );

/** JSON Schema keywords that some structured-output providers reject. */
const UNPORTABLE_KEYWORDS = [
  'prefixItems',
  'minLength',
  'maxLength',
  'minimum',
  'maximum',
  'exclusiveMinimum',
  'exclusiveMaximum',
  'pattern',
  'format',
  'minItems',
  'maxItems',
];

function collectKeywords(node: unknown, found = new Set<string>()): Set<string> {
  if (Array.isArray(node)) node.forEach((child) => collectKeywords(child, found));
  else if (node && typeof node === 'object') {
    for (const [key, value] of Object.entries(node)) {
      found.add(key);
      // Property names under "properties" are field names, not keywords.
      if (key === 'properties' && value && typeof value === 'object') {
        Object.values(value).forEach((child) => collectKeywords(child, found));
      } else collectKeywords(value, found);
    }
  }
  return found;
}

describe('explainer document schema', () => {
  it('accepts the sample document', () => {
    expect(() => parseExplainerDocument(sample())).not.toThrow();
  });

  it('rejects an unknown severity', () => {
    const doc = sample();
    doc.risks[0].severity = 'critical';
    expect(ExplainerDocumentSchema.safeParse(doc).success).toBe(false);
  });

  it('rejects a non-http PR URL', () => {
    const doc = sample();
    doc.meta.pr_url = 'javascript:alert(1)';
    expect(ExplainerDocumentSchema.safeParse(doc).success).toBe(false);
  });

  it('rejects line ranges that are not two positive integers', () => {
    const doc = sample();
    doc.risks[0].lines = [0, 4];
    expect(ExplainerDocumentSchema.safeParse(doc).success).toBe(false);
    doc.risks[0].lines = [4];
    expect(ExplainerDocumentSchema.safeParse(doc).success).toBe(false);
  });

  it('rejects other schema versions', () => {
    const doc = sample();
    doc.schema_version = 2;
    expect(ExplainerDocumentSchema.safeParse(doc).success).toBe(false);
  });
});

describe('model output schemas', () => {
  const schemas = { ExplanationSchema, FlowGraphSchema, BatchAnalysisSchema, OverviewSchema };

  for (const [name, schema] of Object.entries(schemas)) {
    it(`${name} uses only portable JSON Schema features`, () => {
      const jsonSchema = z.toJSONSchema(schema);
      const keywords = collectKeywords(jsonSchema);
      for (const keyword of UNPORTABLE_KEYWORDS) expect(keywords.has(keyword), keyword).toBe(false);
    });

    it(`${name} marks every property as required`, () => {
      const visit = (node: unknown): void => {
        if (Array.isArray(node)) return node.forEach(visit);
        if (!node || typeof node !== 'object') return;
        const record = node as Record<string, unknown>;
        if (record.type === 'object' && record.properties) {
          expect(record.required).toEqual(Object.keys(record.properties as object));
        }
        Object.values(record).forEach(visit);
      };
      visit(z.toJSONSchema(schema));
    });
  }

  it('describes every field for the model', () => {
    const jsonSchema = z.toJSONSchema(ExplanationSchema) as {
      properties: Record<string, { description?: string }>;
    };
    for (const [field, value] of Object.entries(jsonSchema.properties)) {
      expect(value.description, field).toBeTruthy();
    }
  });
});
