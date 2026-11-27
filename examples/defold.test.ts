import Ajv2020 from 'ajv/dist/2020.js';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseFile } from '@spritebuddy/core';

/**
 * The Defold example project plays a copy of the example slime, since Defold only loads files
 * inside its own project. Its runtime file adds frame events (a "squelch" on each step of the
 * walk and a "land" on the jump) for the frame events example; everything else must match.
 * The Defold runtime itself is tested in the engine: see defold/README.md.
 */
const ROOT = join(__dirname, '..');
const read = (path: string) => readFileSync(join(ROOT, path));
const json = (path: string) => JSON.parse(read(path).toString('utf8'));

describe('the Defold example art', () => {
  const copy = json('defold/examples/art/slime.anims.json');

  it('has the same sheet and normal map as the examples', () => {
    for (const name of ['slime.png', 'slime_n.png']) {
      expect(
        read(`defold/examples/art/${name}`).equals(read(`examples/assets/${name}`)),
        name,
      ).toBe(true);
    }
  });

  it('is a valid runtime file with the events the example listens for', () => {
    const schema = json('schema/spritebuddy-animations.v3.schema.json');
    const validate = new Ajv2020({ strict: true, allErrors: true }).compile(schema);
    expect(validate(copy) ? null : validate.errors).toBeNull();
    const file = parseFile(copy);
    const events = (name: string) =>
      file.animations
        .find((a) => a.name === name)!
        .frames.flatMap((f, i) => f.events.map((e) => `${e}@${i}`));
    expect(events('walk')).toEqual(['squelch@0']);
    expect(events('jump')).toEqual(['land@7']);
  });

  it('matches the examples apart from those events', () => {
    const original = json('examples/assets/slime.anims.json');
    delete original.sheet; // the TexturePacker-style sheet isn't copied
    const stripped = JSON.parse(JSON.stringify(copy), (key, value) => {
      if (value && typeof value === 'object' && !Array.isArray(value) && 'events' in value) {
        const { events: _events, ...rest } = value;
        return Object.keys(rest).length === 1 ? rest.frame : rest;
      }
      return value;
    });
    expect(stripped).toEqual(original);
  });
});
