import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { parseFile } from '@spritebuddy/core';
import {
  DEFAULT_LIGHT,
  lightDirection,
  siblingUrl,
  spriteBuddy,
  type PixiNamespace,
} from './index';
import { colorNumber, LIT_FRAGMENT, LIT_VERTEX } from './lit';

/** Just enough PixiJS for the adapter's logic; real rendering is tested in Chromium. */
function fakePixi(version: 6 | 7 | 8) {
  class Rectangle {
    constructor(
      public x: number,
      public y: number,
      public width: number,
      public height: number,
    ) {}
  }
  class Texture {
    static EMPTY = { empty: true };
    static fromURL = vi.fn(async (url: string) => new Texture({ source: { url }, url }));
    args: unknown[];
    baseTexture?: unknown;
    source?: unknown;
    destroyed: boolean | null = null;
    orig?: Rectangle;
    trim?: Rectangle;
    uvs?: Record<string, number>;
    constructor(...args: unknown[]) {
      this.args = args;
      const first = args[0] as { source?: unknown };
      if (version === 8) {
        const o = first as {
          source?: unknown;
          frame?: Rectangle;
          orig?: Rectangle;
          trim?: Rectangle;
        };
        this.source = o.source;
        this.orig = o.orig;
        this.trim = o.trim;
        const f = o.frame ?? new Rectangle(0, 0, 0, 0);
        this.uvs = {
          x0: f.x,
          y0: f.y,
          x1: f.x + 1,
          y1: f.y,
          x2: f.x + 1,
          y2: f.y + 1,
          x3: f.x,
          y3: f.y + 1,
        };
      } else this.baseTexture = first.source ?? first;
    }
    destroy(base: boolean) {
      this.destroyed = base;
    }
  }
  class Container {
    children: unknown[] = [];
    x = 0;
    y = 0;
    destroyed = false;
    emitted: unknown[][] = [];
    addChild(c: unknown) {
      this.children.push(c);
    }
    emit(...args: unknown[]) {
      this.emitted.push(args);
      return true;
    }
    destroy() {
      this.destroyed = true;
    }
  }
  class Sprite {
    x = 0;
    y = 0;
    alpha = 1;
    visible = true;
    scale = { x: 1, y: 1 };
    constructor(public texture: unknown) {}
  }
  class UniformGroup {
    uniforms: Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
    constructor(spec: Record<string, { value: unknown }>) {
      this.uniforms = Object.fromEntries(Object.entries(spec).map(([k, v]) => [k, v.value]));
    }
  }
  class GlProgram {
    static from = vi.fn((o: unknown) => Object.assign(new GlProgram(), o));
  }
  class Shader {
    constructor(public options: { glProgram: unknown; resources: Record<string, unknown> }) {}
  }
  class MeshGeometry {
    constructor(public options: { positions: Float32Array; uvs: Float32Array; indices: unknown }) {
      this.positions = options.positions;
      this.uvs = options.uvs;
    }
    positions: Float32Array;
    uvs: Float32Array;
  }
  class Mesh extends Sprite {
    geometry: MeshGeometry;
    shader: Shader;
    constructor(o: { geometry: MeshGeometry; shader: Shader; texture: unknown }) {
      super(o.texture);
      this.geometry = o.geometry;
      this.shader = o.shader;
    }
  }
  const listeners = new Set<() => void>();
  const Ticker = {
    shared: {
      deltaMS: 16,
      add: (fn: () => void) => listeners.add(fn),
      remove: (fn: () => void) => listeners.delete(fn),
    },
  };
  const loads: string[] = [];
  const namespace = {
    Rectangle,
    Texture,
    Container,
    Sprite,
    Ticker,
    SCALE_MODES: version < 8 ? { NEAREST: 0 } : undefined,
    TextureSource: version === 8 ? class {} : undefined,
    ...(version === 8 ? { UniformGroup, GlProgram, Shader, MeshGeometry, Mesh } : {}),
    Assets:
      version >= 7
        ? { load: async (url: string) => (loads.push(url), new Texture({ source: { url } })) }
        : undefined,
    ExtensionType: version >= 7 ? { LoadParser: 'load-parser' } : undefined,
  };
  return { PIXI: namespace as unknown as PixiNamespace, listeners, loads, Texture, GlProgram };
}

const json = JSON.parse(
  readFileSync(join(__dirname, '../../../fixtures/layers.anims.json'), 'utf8'),
) as Record<string, unknown>;
const packed = JSON.parse(
  readFileSync(join(__dirname, '../../../fixtures/packed.anims.json'), 'utf8'),
) as Record<string, unknown>;

afterEach(() => vi.unstubAllGlobals());

describe('spriteBuddy', () => {
  it('tells versions apart', () => {
    expect(spriteBuddy(fakePixi(6).PIXI).version).toBe(6);
    expect(spriteBuddy(fakePixi(7).PIXI).version).toBe(7);
    expect(spriteBuddy(fakePixi(8).PIXI).version).toBe(8);
  });

  it('builds textures the way each version takes them', () => {
    for (const version of [6, 8] as const) {
      const { PIXI, Texture } = fakePixi(version);
      const image = new Texture({ source: { id: 'img' } });
      const sheet = spriteBuddy(PIXI).sheet(packed, image as never);
      const [trimmed, rotated, both] = sheet.textures as unknown as InstanceType<typeof Texture>[];
      if (version === 8) {
        expect(trimmed!.args[0]).toMatchObject({
          frame: { x: 0, y: 0, width: 10, height: 20 },
          orig: { width: 16, height: 24 },
          trim: { x: 3, y: 4, width: 10, height: 20 },
          rotate: 0,
          label: 'idle_0',
        });
        expect(rotated!.args[0]).toMatchObject({
          frame: { width: 20, height: 10 },
          trim: undefined,
          rotate: 2,
        });
        expect((image.source as { scaleMode: string }).scaleMode).toBe('nearest');
      } else {
        expect(both!.args.slice(1)).toEqual([
          { x: 0, y: 20, width: 18, height: 12 },
          { x: 0, y: 0, width: 16, height: 24 },
          { x: 2, y: 6, width: 12, height: 18 },
          2,
        ]);
        expect((image.baseTexture as { scaleMode: number }).scaleMode).toBe(0);
      }
      expect(sheet.texture('idle_1')).toBe(rotated);
      expect(sheet.texture('nope')).toBeUndefined();
      sheet.destroy();
      expect(trimmed!.destroyed).toBe(false);
      expect(image.destroyed).toBe(true);
    }
  });

  it('can leave smoothing on, and takes an already parsed file', () => {
    const { PIXI, Texture } = fakePixi(7);
    const image = new Texture({ source: {} });
    spriteBuddy(PIXI).sheet(parseFile(json), image as never, { pixelArt: false });
    expect(image.baseTexture).toEqual({});
    // A texture with no base is left alone.
    const { PIXI: p8 } = fakePixi(8);
    const bare = { destroy() {} };
    expect(() => spriteBuddy(p8).sheet(json, bare as never)).not.toThrow();
  });

  it('draws parts as child sprites, flipped and faded, and plays on the shared ticker', () => {
    const { PIXI, Texture, listeners } = fakePixi(8);
    const sheet = spriteBuddy(PIXI).sheet(json, new Texture({ source: {} }) as never);
    const sprite = sheet.sprite();
    expect(sprite.animation).toBe('slash');
    expect(listeners.size).toBe(1);
    const kids = () =>
      (
        sprite.children as {
          texture: unknown;
          x: number;
          y: number;
          alpha: number;
          visible: boolean;
          scale: { x: number; y: number };
        }[]
      ).map((c) => ({
        x: c.x,
        y: c.y,
        alpha: c.alpha,
        visible: c.visible,
        sx: c.scale.x,
        sy: c.scale.y,
      }));
    expect(kids()).toEqual([
      { x: -8, y: -4, alpha: 0.5, visible: true, sx: 1, sy: 1 },
      { x: -12, y: -32, alpha: 1, visible: true, sx: 1, sy: 1 },
      { x: 6, y: -28, alpha: 1, visible: true, sx: 1, sy: 1 },
    ]);
    const frames: number[] = [];
    sprite.onFrame = (i) => frames.push(i);
    for (let i = 0; i < 8; i++) [...listeners].forEach((fn) => fn()); // 128 ms
    expect(frames).toEqual([1]);
    expect(kids()).toEqual([
      { x: -5, y: 2, alpha: 0.5, visible: true, sx: 1, sy: -1 },
      { x: -9, y: -32, alpha: 1, visible: true, sx: 1, sy: 1 },
      { x: -7, y: -30, alpha: 1, visible: true, sx: -1, sy: 1 },
      { x: 11, y: -32, alpha: 1, visible: true, sx: 1, sy: 1 },
    ]);
    sprite.seek(220);
    expect(kids().map((k) => k.visible)).toEqual([true, false, false, false]);
    sprite.speed = 0.5;
    expect(sprite.speed).toBe(0.5);
    expect(sprite.stop().playing).toBe(false);
    sprite.update(1000);
    expect(sprite.player.state.time).toBe(220);
    sprite.autoUpdate = false;
    sprite.autoUpdate = false;
    expect(listeners.size).toBe(0);
    sprite.autoUpdate = true;
    sprite.destroy();
    expect(listeners.size).toBe(0);
  });

  it('honours sprite options and reports completion', () => {
    const { PIXI, Texture, listeners } = fakePixi(6);
    const file = { ...packed, animations: [{ name: 'hit', loop: 'once', frames: [0, 1] }] };
    const sheet = spriteBuddy(PIXI).sheet(file, new Texture({ source: {} }) as never);
    const sprite = sheet.sprite('hit', { autoPlay: false, autoUpdate: false, speed: 2 });
    expect([sprite.playing, sprite.speed, listeners.size]).toEqual([false, 2, 0]);
    const done = vi.fn();
    sprite.onComplete = done;
    sprite.play('hit').update(100);
    expect(done).toHaveBeenCalledOnce();
    // A file with no animations makes an empty sprite.
    const empty = spriteBuddy(PIXI).sheet(
      { ...packed, animations: [] },
      new Texture({ source: {} }) as never,
    );
    const still = empty.sprite(undefined, { autoUpdate: false });
    expect([still.animation, still.children.length]).toEqual([null, 0]);
  });

  it('loads a file and its image with fetch, through Assets or Texture.fromURL', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) =>
        url.includes('missing')
          ? { ok: false, status: 404 }
          : { ok: true, json: async () => packed },
      ),
    );
    const v7 = fakePixi(7);
    const sheet = await spriteBuddy(v7.PIXI).load('/art/packed.anims.json');
    expect(v7.loads).toEqual(['/art/packed.png']);
    expect(sheet.animations).toEqual(['idle']);
    const v6 = fakePixi(6);
    await spriteBuddy(v6.PIXI).load('art/packed.anims.json?v=2');
    expect(v6.Texture.fromURL).toHaveBeenCalledWith('art/packed.png');
    await expect(spriteBuddy(v6.PIXI).load('missing.anims.json')).rejects.toThrow(
      "Couldn't load missing.anims.json: 404",
    );
  });

  it('offers an Assets parser that runs before PixiJS’s spritesheet parser', async () => {
    const { PIXI, Texture } = fakePixi(8);
    const parser = spriteBuddy(PIXI).assetsParser as {
      extension: { type: string; priority: number };
      testParse(a: unknown): Promise<boolean>;
      parse(
        a: unknown,
        r: { src?: string } | undefined,
        l: { load(u: string): Promise<unknown> },
      ): Promise<{ animations: string[]; destroy(): void }>;
      unload(s: { destroy(): void }): Promise<void>;
    };
    expect(parser.extension).toMatchObject({ type: 'load-parser', priority: 2 });
    expect(await parser.testParse(packed)).toBe(true);
    expect(await parser.testParse({ frames: {} })).toBe(false);
    expect(await parser.testParse(null)).toBe(false);
    const load = vi.fn(async (url: string) => new Texture({ source: { url } }));
    const sheet = await parser.parse(packed, { src: 'sprites/packed.anims.json' }, { load });
    expect(load).toHaveBeenCalledWith('sprites/packed.png');
    expect(sheet.animations).toEqual(['idle']);
    await parser.parse(packed, undefined, { load });
    expect(load).toHaveBeenLastCalledWith('packed.png');
    const destroy = vi.fn();
    await parser.unload({ destroy });
    expect(destroy).toHaveBeenCalled();
    expect((spriteBuddy(fakePixi(6).PIXI).assetsParser as typeof parser).extension.type).toBe(
      'load-parser',
    );
  });
});

describe('normal maps', () => {
  const lit = JSON.parse(
    readFileSync(join(__dirname, '../../../fixtures/normals.anims.json'), 'utf8'),
  ) as Record<string, unknown>;

  it('cuts normal textures exactly like the frames, and destroys them with the sheet', () => {
    for (const version of [6, 8] as const) {
      const { PIXI, Texture } = fakePixi(version);
      const image = new Texture({ source: { id: 'img' } });
      const normalMap = new Texture({ source: { id: 'n' } });
      const sheet = spriteBuddy(PIXI).sheet(lit, image as never, { normalMap: normalMap as never });
      const normals = sheet.normalTextures as unknown as InstanceType<typeof Texture>[];
      const colours = sheet.textures as unknown as InstanceType<typeof Texture>[];
      expect(normals).toHaveLength(colours.length);
      normals.forEach((n, i) => {
        if (version === 8) {
          expect(n.args[0]).toMatchObject({
            ...(colours[i]!.args[0] as object),
            source: { id: 'n' },
          });
        } else {
          expect(n.args.slice(1)).toEqual(colours[i]!.args.slice(1));
          expect(n.baseTexture).toEqual(expect.objectContaining({ id: 'n' }));
        }
      });
      expect(sheet.normalTexture('idle_2')).toBe(normals[2]);
      expect(sheet.normalTexture('nope')).toBeUndefined();
      sheet.destroy();
      expect(normals[0]!.destroyed).toBe(false);
      expect(normalMap.destroyed).toBe(true);
    }
  });

  it('has none without a normal map', () => {
    const { PIXI, Texture } = fakePixi(8);
    const sheet = spriteBuddy(PIXI).sheet(lit, new Texture({ source: {} }) as never);
    expect(sheet.normalTextures).toBeNull();
    expect(sheet.normalTexture('idle_0')).toBeUndefined();
    expect(() => sheet.destroy()).not.toThrow();
  });

  it('loads the normal map beside the sheet unless asked not to', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true, json: async () => lit })),
    );
    const v7 = fakePixi(7);
    const sheet = await spriteBuddy(v7.PIXI).load('/art/knight.anims.json');
    expect(v7.loads).toEqual(['/art/knight.png', '/art/knight_n.png']);
    expect(sheet.normalTextures).toHaveLength(3);
    const v8 = fakePixi(8);
    const plain = await spriteBuddy(v8.PIXI).load('/art/knight.anims.json', { normals: false });
    expect(v8.loads).toEqual(['/art/knight.png']);
    expect(plain.normalTextures).toBeNull();
  });

  it('loads the normal map through the Assets parser', async () => {
    const { PIXI, Texture } = fakePixi(8);
    const parser = spriteBuddy(PIXI).assetsParser as {
      parse(
        a: unknown,
        r: { src?: string } | undefined,
        l: { load(u: string): Promise<unknown> },
      ): Promise<{ normalTextures: unknown[] | null }>;
    };
    const load = vi.fn(async (url: string) => new Texture({ source: { url } }));
    const sheet = await parser.parse(lit, { src: 'sprites/knight.anims.json' }, { load });
    expect(load.mock.calls.map((c) => c[0])).toEqual([
      'sprites/knight.png',
      'sprites/knight_n.png',
    ]);
    expect(sheet.normalTextures).toHaveLength(3);
  });
});

describe('frame events', () => {
  it('calls onEvent and emits "event" and "event:<name>" as frames start', () => {
    const { PIXI, Texture } = fakePixi(8);
    const file = {
      ...packed,
      animations: [
        {
          name: 'swing',
          loop: 'once',
          frames: [
            { frame: 0, events: ['windup'] },
            { frame: 1, events: ['hit'] },
          ],
        },
      ],
    };
    const sheet = spriteBuddy(PIXI).sheet(file, new Texture({ source: {} }) as never);
    const sprite = sheet.sprite('swing', { autoUpdate: false });
    const emitted = (sprite as unknown as { emitted: unknown[][] }).emitted;
    // The first frame's events fire while the sprite is being made, before onEvent can be set.
    expect(emitted).toEqual([
      ['event', 'windup', 0],
      ['event:windup', 0],
    ]);
    const seen: [string, number][] = [];
    sprite.onEvent = (name, index) => seen.push([name, index]);
    sprite.update(150);
    expect(seen).toEqual([['hit', 1]]);
    expect(emitted.slice(2)).toEqual([
      ['event', 'hit', 1],
      ['event:hit', 1],
    ]);
  });
});

describe('lit sprites', () => {
  const knight = JSON.parse(
    readFileSync(join(__dirname, '../../../fixtures/normals.anims.json'), 'utf8'),
  ) as Record<string, unknown>;
  type Uniforms = { uniforms: Record<string, any> }; // eslint-disable-line @typescript-eslint/no-explicit-any

  function litSheet(file: Record<string, unknown> = knight) {
    const pixi = fakePixi(8);
    const sb = spriteBuddy(pixi.PIXI);
    const image = new pixi.Texture({ source: { id: 'img' } });
    const normalMap = new pixi.Texture({ source: { id: 'n' } });
    const sheet = sb.sheet(file, image as never, { normalMap: normalMap as never });
    return { ...pixi, sb, sheet, image, normalMap };
  }

  it('makes lights only in PixiJS 8, with the editor defaults', () => {
    expect(() => spriteBuddy(fakePixi(7).PIXI).light()).toThrow('Lights need PixiJS 8');
    const light = spriteBuddy(fakePixi(8).PIXI).light();
    expect({ ...light, set: undefined }).toEqual({ ...DEFAULT_LIGHT, set: undefined });
  });

  it('writes its settings into shared uniforms', () => {
    const { sb, sheet } = litSheet();
    const light = sb.light({ angle: 90, height: 0, color: '#ff8000', bands: 3, nope: 1 } as never);
    const sprite = sheet.sprite('idle', { autoUpdate: false, light });
    const mesh = sprite.children[0] as { shader: { options: { resources: Record<string, any> } } }; // eslint-disable-line @typescript-eslint/no-explicit-any
    const u = (mesh.shader.options.resources.lightUniforms as Uniforms).uniforms;
    expect([...u.uLightDir].map((v: number) => +v.toFixed(5) || 0)).toEqual([1, 0, 0]);
    expect([...u.uLightColor].map((v: number) => +v.toFixed(5) || 0)).toEqual([
      1,
      +(128 / 255).toFixed(5),
      0,
    ]);
    expect([...u.uLightParams].map((v: number) => +v.toFixed(5) || 0)).toEqual([0.35, 1, 1, 0.3]);
    expect(u.uBands).toBe(3);
    light.ambient = 0.5;
    light.color = 0x00ff00;
    light.set({ size: 1, brightness: 2, opacity: 0.25, height: 90 }).set(null);
    expect([...u.uLightParams].map((v: number) => +v.toFixed(5) || 0)).toEqual([0.5, 2, 0.25, 0.6]);
    expect([...u.uLightColor]).toEqual([0, 1, 0]);
    expect(light.color).toBe(0x00ff00);
    expect(sprite.light).toBe(light);
    expect(sheet.sprite('idle', { autoUpdate: false }).light).toBeNull();
  });

  it('draws each part as a mesh over its full frame, with the sheet and its normals', () => {
    const { sb, sheet, image, normalMap, GlProgram } = litSheet({
      ...packed,
      normals: 'packed_n.png',
    });
    const sprite = sheet.sprite('idle', { autoUpdate: false, light: sb.light() });
    sheet.sprite('idle', { autoUpdate: false, light: sb.light() });
    expect(GlProgram.from).toHaveBeenCalledOnce();
    expect(GlProgram.from).toHaveBeenCalledWith({
      vertex: LIT_VERTEX,
      fragment: LIT_FRAGMENT,
      name: 'sb-lit',
    });
    type Mesh = {
      x: number;
      y: number;
      texture: unknown;
      geometry: { positions: Float32Array; uvs: Float32Array };
      shader: { options: { resources: Record<string, any> } }; // eslint-disable-line @typescript-eslint/no-explicit-any
    };
    const mesh = sprite.children[0] as Mesh;
    const res = mesh.shader.options.resources;
    expect([res.uTexture, res.uNormals]).toEqual([image.source, normalMap.source]);
    const frame = () => ({
      texture: mesh.texture,
      positions: [...mesh.geometry.positions],
      uvs: [...mesh.geometry.uvs],
      rotated: (res.partUniforms as Uniforms).uniforms.uRotated,
    });
    // idle_0 is trimmed: the quad sits at the trim offset inside its 16×24 frame.
    expect(frame()).toEqual({
      texture: sheet.textures[0],
      positions: [3, 4, 13, 4, 13, 24, 3, 24],
      uvs: [0, 0, 1, 0, 1, 1, 0, 1],
      rotated: 0,
    });
    const before = mesh.geometry.positions;
    sprite.seek(0);
    expect(mesh.geometry.positions).toBe(before); // the same frame isn't rebuilt
    sprite.seek(150);
    // idle_1 is rotated and untrimmed: the quad is the whole frame.
    expect(frame()).toMatchObject({
      texture: sheet.textures[1],
      positions: [0, 0, 10, 0, 10, 20, 0, 20],
      rotated: 1,
    });
  });

  it('says why a sprite can’t be lit', () => {
    const { sb, sheet } = litSheet();
    expect(() => sheet.sprite('idle', { light: { angle: 1 } as never })).toThrow(
      'Make the light with sb.light()',
    );
    const v6 = fakePixi(6);
    const old = spriteBuddy(v6.PIXI).sheet(knight, new v6.Texture({ source: {} }) as never);
    expect(() => old.sprite('idle', { light: sb.light() })).toThrow('Lit sprites need PixiJS 8');
    const { PIXI, Texture } = fakePixi(8);
    const unloaded = spriteBuddy(PIXI).sheet(knight, new Texture({ source: {} }) as never);
    expect(() => unloaded.sprite('idle', { light: sb.light() })).toThrow(
      "The sheet's normal map isn't loaded",
    );
    const plain = spriteBuddy(PIXI).sheet(packed, new Texture({ source: {} }) as never);
    expect(() => plain.sprite('idle', { light: sb.light() })).toThrow(
      'This file has no normal map',
    );
  });

  it("hands back the editor's light for an animation", () => {
    const { sb, sheet } = litSheet();
    expect(sheet.editorLight()).toEqual({ angle: 300, height: 30, bands: 3 });
    expect(sheet.editorLight('idle')).toBe(sheet.editorLight());
    expect(sheet.editorLight('turn')).toBeNull();
    expect(sheet.editorLight('nope')).toBeNull();
    expect(sb.light(sheet.editorLight())).toMatchObject({
      ...DEFAULT_LIGHT,
      angle: 300,
      height: 30,
      bands: 3,
    });
  });

  it('reads colours and points the light like SpriteBuddy', () => {
    expect(colorNumber(0x1ffffff)).toBe(0xffffff);
    expect(colorNumber('ABCDEF')).toBe(0xabcdef);
    expect(() => colorNumber('red')).toThrow('Light colour should be "#rrggbb", not "red"');
    const top = lightDirection(0, 0).map((v) => +v.toFixed(5) || 0);
    expect(top).toEqual([0, -1, 0]); // from the top of the screen, y down
    expect(lightDirection(0, 90)[2]).toBeCloseTo(1);
  });
});

describe('siblingUrl', () => {
  it('puts the image beside the file unless it has its own path', () => {
    expect(siblingUrl('https://x.io/a/b.anims.json?v=1#t', 'b.png')).toBe('https://x.io/a/b.png');
    expect(siblingUrl('b.anims.json', 'b.png')).toBe('b.png');
    expect(siblingUrl('a/b.anims.json', '/img/b.png')).toBe('/img/b.png');
    expect(siblingUrl('a/b.anims.json', 'https://cdn.io/b.png')).toBe('https://cdn.io/b.png');
  });
});
