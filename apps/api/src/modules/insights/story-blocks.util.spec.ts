import { STORY_RESPONSE_SCHEMA, stripNulls } from './story-blocks.util';

describe('stripNulls', () => {
  it('removes null keys recursively and keeps array items', () => {
    expect(
      stripNulls({
        a: null,
        b: 1,
        c: { d: null, e: 'x', metrics: [{ label: 'l', value: 'v', change: null }] },
      }),
    ).toEqual({ b: 1, c: { e: 'x', metrics: [{ label: 'l', value: 'v' }] } });
  });
});

describe('STORY_RESPONSE_SCHEMA', () => {
  // OpenAI strict mode: every property listed in `required`, additionalProperties false.
  const check = (node: any, path: string) => {
    if (!node || typeof node !== 'object') return;
    if (node.properties) {
      expect(node.additionalProperties).toBe(false);
      expect([...node.required].sort()).toEqual(Object.keys(node.properties).sort());
      for (const [k, v] of Object.entries(node.properties)) check(v, `${path}.${k}`);
    }
    if (node.items) check(node.items, `${path}[]`);
  };
  it('satisfies strict-mode rules at every level', () => {
    check(STORY_RESPONSE_SCHEMA, 'root');
  });
});
