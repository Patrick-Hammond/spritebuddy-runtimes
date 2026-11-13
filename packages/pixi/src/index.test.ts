import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { parseFile } from '@spritebuddy/core';
import { siblingUrl, spriteBuddy, type PixiNamespace } from './index';

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
    constructor(...args: unknown[]) {
      this.args = args;
      const first = args[0] as { source?: unknown };
      if (version === 8) this.source = first.source;
      else this.baseTexture = first.source ?? first;
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
    Assets:
      version >= 7
        ? { load: async (url: string) => (loads.push(url), new Texture({ source: { url } })) }
        : undefined,
    ExtensionType: version >= 7 ? { LoadParser: 'load-parser' } : undefined,
  };
  return { PIXI: namespace as unknown as PixiNamespace, listeners, loads, Texture };
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

describe('siblingUrl', () => {
  it('puts the image beside the file unless it has its own path', () => {
    expect(siblingUrl('https://x.io/a/b.anims.json?v=1#t', 'b.png')).toBe('https://x.io/a/b.png');
    expect(siblingUrl('b.anims.json', 'b.png')).toBe('b.png');
    expect(siblingUrl('a/b.anims.json', '/img/b.png')).toBe('/img/b.png');
    expect(siblingUrl('a/b.anims.json', 'https://cdn.io/b.png')).toBe('https://cdn.io/b.png');
  });
});
