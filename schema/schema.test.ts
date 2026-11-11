import Ajv2020 from 'ajv/dist/2020.js';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const schema = JSON.parse(
  readFileSync(join(__dirname, 'spritebuddy-animations.v3.schema.json'), 'utf8'),
);
const validate = new Ajv2020({ strict: true, allErrors: true }).compile(schema);
const fixtures = join(__dirname, '../fixtures');

describe('JSON Schema', () => {
  it('accepts every fixture', () => {
    for (const name of readdirSync(fixtures).filter((f) => f.endsWith('.anims.json'))) {
      const ok = validate(JSON.parse(readFileSync(join(fixtures, name), 'utf8')));
      expect(ok ? null : validate.errors, name).toBeNull();
    }
  });

  it('rejects what the runtime rejects', () => {
    const good = JSON.parse(readFileSync(join(fixtures, 'basic.anims.json'), 'utf8'));
    for (const bad of [
      { ...good, version: 2 },
      { ...good, format: 'other' },
      { ...good, size: [0, 10] },
      { ...good, frames: [{ name: 'a', rect: [0, 0, 0, 1] }] },
      { ...good, animations: [{ name: 'w', loop: 'bounce', frames: [] }] },
      { ...good, animations: [{ name: 'w', frames: [{ frame: 0, offset: [0.5, 0] }] }] },
      {
        ...good,
        animations: [{ name: 'w', frames: [{ frame: 0, layers: [{ frame: 0, opacity: 2 }] }] }],
      },
    ]) {
      expect(validate(bad), JSON.stringify(bad).slice(0, 120)).toBe(false);
    }
  });
});
