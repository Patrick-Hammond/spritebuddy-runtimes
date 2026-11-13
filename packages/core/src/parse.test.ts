import { describe, expect, it } from 'vitest';
import { FormatError, parseFile } from './parse';

const base = () => ({
  format: 'spritebuddy-animations',
  version: 3,
  image: 'hero.png',
  size: [64, 32],
  frames: [
    { name: 'a', rect: [0, 0, 16, 32] },
    { name: 'b', rect: [16, 0, 16, 32], pivot: [4, 30], trim: [2, 1, 20, 40] },
  ],
  animations: [] as unknown[],
});

const fails = (json: unknown, message: RegExp) => {
  expect(() => parseFile(json)).toThrow(FormatError);
  expect(() => parseFile(json)).toThrow(message);
};

describe('parseFile', () => {
  it('fills in defaults', () => {
    const file = parseFile({
      ...base(),
      animations: [
        { name: 'walk', frames: [0, { frame: 1 }] },
        {
          name: 'hit',
          loop: 'once',
          duration: 40,
          frames: [{ frame: 1, duration: 70, offset: [1, -2], layers: [{ frame: 0 }] }, 0],
        },
      ],
    });
    expect(file.scale).toBe(1);
    expect(file.frames[0]).toEqual({
      name: 'a',
      rect: { x: 0, y: 0, w: 16, h: 32 },
      pivot: { x: 8, y: 32 },
      rotated: false,
      trim: null,
      width: 16,
      height: 32,
    });
    expect(file.frames[1]).toMatchObject({
      trim: { x: 2, y: 1 },
      width: 20,
      height: 40,
      pivot: { x: 4, y: 30 },
    });
    expect(file.animations[0]).toEqual({
      name: 'walk',
      loop: 'loop',
      frames: [
        { frame: 0, duration: 100, offset: { x: 0, y: 0 }, layers: [], events: [] },
        { frame: 1, duration: 100, offset: { x: 0, y: 0 }, layers: [], events: [] },
      ],
    });
    expect(file.animations[1]!.frames).toEqual([
      {
        frame: 1,
        duration: 70,
        offset: { x: 1, y: -2 },
        layers: [{ frame: 0, x: 0, y: 0, z: 1, opacity: 1, flipX: false, flipY: false }],
        events: [],
      },
      { frame: 0, duration: 40, offset: { x: 0, y: 0 }, layers: [], events: [] },
    ]);
  });

  it('reads files with no animations and ignores unknown fields', () => {
    const { animations: _a, ...rest } = base();
    const file = parseFile({ ...rest, scale: 2, extra: { future: true } });
    expect(file.animations).toEqual([]);
    expect(file.scale).toBe(2);
  });

  it('takes a rotated frame as covering h columns and w rows', () => {
    const json = base();
    json.frames[0] = { name: 'a', rect: [0, 0, 30, 60], rotated: true } as never;
    expect(parseFile(json).frames[0]!.rotated).toBe(true);
    json.frames[0] = { name: 'a', rect: [0, 0, 60, 30], rotated: true } as never;
    fails(json, /frames\[0\]\.rect: lies outside the sheet/);
  });

  it('says where a file is wrong', () => {
    fails(null, /expected an object/);
    fails({ ...base(), format: 'other' }, /^format: not a SpriteBuddy/);
    fails({ ...base(), version: 2 }, /version 2 files need the sheet's own JSON/);
    fails({ ...base(), version: 4 }, /version 4 is newer than this runtime reads \(3\)/);
    fails({ ...base(), version: 3.5 }, /version: expected a whole number ≥ 1/);
    fails({ ...base(), image: '' }, /image: expected a non-empty string/);
    fails({ ...base(), size: [64] }, /size: expected 2 numbers/);
    fails({ ...base(), size: 'big' }, /size: expected a list/);
    fails({ ...base(), scale: 0 }, /scale: expected a number/);
    fails({ ...base(), frames: [{ name: 'a', rect: [0, 0, 0, 4] }] }, /frames\[0\]\.rect\[2\]/);
    fails({ ...base(), frames: [{ name: 'a', rect: [60, 0, 16, 4] }] }, /outside the sheet/);
    fails(
      { ...base(), frames: [{ name: 'a', rect: [0, 0, 16, 4], rotated: 1 }] },
      /rotated: expected true or false/,
    );
    fails(
      { ...base(), frames: [{ name: 'a', rect: [0, 0, 16, 4], trim: [2, 0, 16, 4] }] },
      /trim: the trimmed pixels lie outside/,
    );
    fails(
      { ...base(), frames: [{ name: 'a', rect: [0, 0, 16, 4], pivot: [1] }] },
      /pivot: expected 2 numbers/,
    );
    fails(
      { ...base(), frames: [{ name: 'a', rect: [0, 0, 16, 4], pivot: [1, 'x'] }] },
      /pivot\[1\]/,
    );
    fails({ ...base(), frames: [{ rect: [0, 0, 16, 4] }] }, /frames\[0\]\.name/);
    const anim = (a: unknown) => ({ ...base(), animations: [a] });
    fails(
      anim({ name: 'w', frames: [2] }),
      /animations\[0\]\.frames\[0\]: no frame 2; the file has 2/,
    );
    fails(anim({ name: 'w', frames: [-1] }), /expected a whole number ≥ 0/);
    fails(
      anim({ name: 'w', loop: 'bounce', frames: [] }),
      /loop: expected "loop", "pingpong" or "once"/,
    );
    fails(anim({ name: 'w', duration: 0, frames: [] }), /duration: expected a whole number ≥ 1/);
    fails(anim({ name: 'w', frames: [{ frame: 0, duration: 0 }] }), /frames\[0\]\.duration/);
    fails(
      anim({ name: 'w', frames: [{ frame: 0, offset: [1.5, 0] }] }),
      /offset\[0\]: expected a whole number$/,
    );
    fails(anim({ name: 'w', frames: [{ frame: 0, layers: {} }] }), /layers: expected a list/);
    fails(
      anim({ name: 'w', frames: [{ frame: 0, layers: [{ frame: 0, opacity: 2 }] }] }),
      /opacity/,
    );
    fails(
      anim({ name: 'w', frames: [{ frame: 0, layers: [{ frame: 0, flipY: 'no' }] }] }),
      /flipY/,
    );
    fails(anim({ name: 'w', frames: [{ frame: 0, layers: [{ frame: 0, z: 0.5 }] }] }), /\.z:/);
    fails(anim({ name: 'w', frames: [{ frame: 0, layers: [{ frame: 0, x: 'l' }] }] }), /\.x:/);
    fails(anim({ name: 'w', frames: [{ frame: 0, layers: [{ frame: 0, y: null }] }] }), /\.y:/);
    fails(anim({ name: 'w', frames: [{ frame: 0, layers: [{ frame: 0, flipX: 0 }] }] }), /flipX/);
    fails(anim({ name: 'w', frames: [{ frame: 0, events: 'hit' }] }), /events: expected a list/);
    fails(
      anim({ name: 'w', frames: [{ frame: 0, events: ['hit', ''] }] }),
      /frames\[0\]\.events\[1\]: expected a non-empty string/,
    );
    fails(anim({ name: '', frames: [] }), /animations\[0\]\.name/);
    fails(anim({ name: 'w' }), /animations\[0\]\.frames: expected a list/);
    fails(anim([]), /animations\[0\]: expected an object/);
    fails(
      {
        ...base(),
        animations: [
          { name: 'w', frames: [] },
          { name: 'w', frames: [] },
        ],
      },
      /animations\[1\]\.name: duplicate animation "w"/,
    );
  });

  it('reads the normal map, which is optional', () => {
    expect(parseFile(base()).normals).toBeNull();
    expect(parseFile({ ...base(), normals: 'hero_n.png' }).normals).toBe('hero_n.png');
    fails({ ...base(), normals: '' }, /normals: expected a non-empty string/);
    fails({ ...base(), normals: 7 }, /normals: expected a non-empty string/);
  });

  it('ignores the editor lighting settings on an animation', () => {
    const file = parseFile({
      ...base(),
      animations: [{ name: 'walk', frames: [0], lighting: { light: { angle: 315 } } }],
    });
    expect(file.animations[0]).toEqual({
      name: 'walk',
      loop: 'loop',
      frames: [{ frame: 0, duration: 100, offset: { x: 0, y: 0 }, layers: [], events: [] }],
    });
  });

  it('keeps the path on the error', () => {
    try {
      parseFile({ ...base(), image: 3 });
    } catch (err) {
      expect((err as FormatError).path).toBe('image');
      expect((err as FormatError).name).toBe('FormatError');
    }
    expect.assertions(2);
  });
});
