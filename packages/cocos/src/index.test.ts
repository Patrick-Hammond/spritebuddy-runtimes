import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { parseFile, partsOf, type FrameDef, type Part } from '@spritebuddy/core';
import {
  colorNumber,
  DEFAULT_LIGHT,
  EFFECT_PATH,
  lightDirection,
  lightUniforms,
  normalBasis,
  placePart,
  siblingPath,
  spriteBuddy,
  type CocosNamespace,
  type Placement,
} from './index';

/* eslint-disable @typescript-eslint/no-explicit-any */
const fixture = (name: string) =>
  JSON.parse(readFileSync(join(__dirname, '../../../fixtures', `${name}.anims.json`), 'utf8'));

/** Just enough Cocos Creator for the adapter's logic. */
function fakeCocos(make: (C: any) => Record<string, unknown> = () => ({})) {
  let assets: Record<string, unknown> = {};
  class Component {
    node: any;
  }
  class Node {
    layer = 1;
    active = true;
    angle = 0;
    parent: Node | null = null;
    children: Node[] = [];
    components: any[] = [];
    position = [0, 0, 0];
    scale = [1, 1, 1];
    emitted: any[][] = [];
    handlers = new Map<string, ((...a: any[]) => void)[]>();
    constructor(public name = '') {}
    addChild(child: Node) {
      child.parent = this;
      this.children.push(child);
    }
    addComponent(type: any) {
      const c = new type();
      c.node = this;
      this.components.push(c);
      return c;
    }
    getComponent(type: any) {
      return this.components.find((c) => c instanceof type) ?? null;
    }
    setPosition(x: number, y: number, z = 0) {
      this.position = [x, y, z];
    }
    setScale(x: number, y: number, z = 1) {
      this.scale = [x, y, z];
    }
    on(type: string, fn: (...a: any[]) => void) {
      this.handlers.set(type, [...(this.handlers.get(type) ?? []), fn]);
    }
    off() {}
    emit(type: string, ...args: any[]) {
      this.emitted.push([type, ...args]);
      for (const h of this.handlers.get(type) ?? []) h(...args);
    }
    destroy() {
      return true;
    }
  }
  class Sprite {
    static SizeMode = { CUSTOM: 0, TRIMMED: 1, RAW: 2 };
    sizeMode = 1;
    trim = false;
    spriteFrame: any = null;
    color: any = null;
    customMaterial: any = null;
  }
  class UITransform {
    size = [100, 100];
    setContentSize(w: number, h: number) {
      this.size = [w, h];
    }
  }
  class Texture2D {
    static Filter = { NONE: 0, LINEAR: 1, NEAREST: 2 };
    image: any = null;
    filters: number[] = [];
    setFilters(min: number, mag: number) {
      this.filters = [min, mag];
    }
  }
  class ImageAsset {
    constructor(public name = '') {}
  }
  class JsonAsset {
    constructor(public json: unknown) {}
  }
  class EffectAsset {}
  class SpriteFrame {
    texture: any = null;
    rect: any = null;
    packable = true;
  }
  class Material {
    effect: any = null;
    props = new Map<string, any>();
    sets = 0;
    initialize(info: { effectAsset: unknown }) {
      this.effect = info.effectAsset;
    }
    setProperty(name: string, value: unknown) {
      this.props.set(name, value);
      this.sets++;
    }
  }
  class Rect {
    constructor(
      public x: number,
      public y: number,
      public width: number,
      public height: number,
    ) {}
  }
  class Color {
    constructor(
      public r: number,
      public g: number,
      public b: number,
      public a: number,
    ) {}
  }
  class Vec4 {
    constructor(
      public x: number,
      public y: number,
      public z: number,
      public w: number,
    ) {}
  }
  const loaded: string[] = [];
  const bundle = {
    load(path: string, type: any, done: (e: Error | null, a: any) => void) {
      loaded.push(path);
      queueMicrotask(() => {
        const asset = assets[path];
        if (asset instanceof type) done(null, asset);
        else done(new Error(`no ${type.name} at ${path}`), null);
      });
    },
  };
  const registered: string[] = [];
  const cc = {
    Node,
    Component,
    Sprite,
    SpriteFrame,
    UITransform,
    Texture2D,
    ImageAsset,
    JsonAsset,
    EffectAsset,
    Material,
    Rect,
    Color,
    Vec4,
    resources: bundle,
    _decorator: {
      ccclass: (name: string) => (ctor: any) => {
        registered.push(name);
        return ctor;
      },
    },
  };
  assets = make(cc);
  return { cc: cc as unknown as CocosNamespace, raw: cc, loaded, registered, bundle };
}

/** A fake cc with the slime-like `normals` fixture in resources. */
function withAssets(file = fixture('normals')) {
  return fakeCocos((C) => {
    const assets: Record<string, unknown> = {
      'art/hero.anims': new C.JsonAsset(file),
      [`art/${file.image.replace(/\.png$/, '')}`]: new C.ImageAsset('sheet'),
    };
    if (file.normals) assets[`art/${file.normals.replace(/\.png$/, '')}`] = new C.ImageAsset('n');
    return assets;
  });
}

// --- Placement --------------------------------------------------------------------------------

/** Where a placed part's node puts a stored sheet pixel (its centre), on screen (y down). */
function screenPixel(at: Placement, frame: FrameDef, column: number, row: number): number[] {
  const lx = column - frame.rect.x + 0.5 - at.width / 2;
  const ly = -(row - frame.rect.y + 0.5 - at.height / 2);
  const sx = lx * at.scaleX;
  const sy = ly * at.scaleY;
  const r = (at.angle * Math.PI) / 180;
  const px = Math.cos(r) * sx - Math.sin(r) * sy + at.x;
  const py = Math.sin(r) * sx + Math.cos(r) * sy + at.y;
  return [Math.floor(px + 1e-9), Math.floor(-py + 1e-9)];
}

/** The format's rule: which screen pixel each stored pixel of a part belongs on. */
function expectedPixels(part: Part, flipX: boolean, flipY: boolean): Map<string, number[]> {
  const f = part.frame;
  const { x: rx, y: ry, w, h } = f.rect;
  const out = new Map<string, number[]>();
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      const stored = f.rotated ? [rx + (h - 1 - j), ry + i] : [rx + i, ry + j];
      const fx = (f.trim?.x ?? 0) + i;
      const fy = (f.trim?.y ?? 0) + j;
      let X = part.x + (part.flipX ? f.width - 1 - fx : fx);
      let Y = part.y + (part.flipY ? f.height - 1 - fy : fy);
      if (flipX) X = -1 - X;
      if (flipY) Y = -1 - Y;
      out.set(stored.join(','), [X, Y]);
    }
  }
  return out;
}

function allParts(): Part[] {
  const parts: Part[] = [];
  for (const name of ['basic', 'layers', 'packed', 'normals']) {
    const file = parseFile(fixture(name));
    for (const anim of file.animations) {
      for (const entry of anim.frames) {
        for (const p of partsOf(file, entry)) {
          // Every frame flipped every way, rotated and trimmed ones included.
          for (const flipX of [false, true]) {
            for (const flipY of [false, true]) parts.push({ ...p, flipX, flipY });
          }
        }
      }
    }
  }
  return parts;
}

describe('placePart', () => {
  it('puts every stored pixel where the format says, for every flip and rotation', () => {
    const parts = allParts();
    expect(parts.some((p) => p.frame.rotated && p.frame.trim)).toBe(true);
    for (const part of parts) {
      for (const flipX of [false, true]) {
        for (const flipY of [false, true]) {
          const at = placePart(part, flipX, flipY);
          const want = expectedPixels(part, flipX, flipY);
          for (const [key, pixel] of want) {
            const [c, r] = key.split(',').map(Number);
            expect(screenPixel(at, part.frame, c!, r!), `${part.frame.name} ${key}`).toEqual(pixel);
          }
        }
      }
    }
  });

  it('uses the stored size: turned for a rotated frame', () => {
    const file = parseFile(fixture('packed'));
    const at = placePart({ frame: file.frames[1]!, x: 0, y: 0, flipX: false, flipY: false });
    expect([at.width, at.height, at.angle]).toEqual([20, 10, 90]);
  });
});

describe('normalBasis', () => {
  it("is where the stored sheet's axes face on screen (y up)", () => {
    for (const part of allParts()) {
      for (const flip of [false, true]) {
        const at = placePart(part, flip, !flip);
        const [m00, m10, m01, m11] = normalBasis(at);
        // Stored +x is one column right; stored +y (up) is one row up the stored image.
        const r = (at.angle * Math.PI) / 180;
        const turn = (x: number, y: number) => [
          Math.round(Math.cos(r) * x - Math.sin(r) * y) + 0,
          Math.round(Math.sin(r) * x + Math.cos(r) * y) + 0,
        ];
        expect([m00, m10]).toEqual(turn(at.scaleX, 0));
        expect([m01, m11]).toEqual(turn(0, at.scaleY));
      }
    }
  });

  it('is the identity for an upright, unflipped part and has no negative zeros', () => {
    expect(normalBasis({ scaleX: 1, scaleY: 1, angle: 0 })).toEqual([1, 0, 0, 1]);
    expect(normalBasis({ scaleX: -1, scaleY: 1, angle: 90 })).toEqual([0, -1, -1, 0]);
    expect(normalBasis({ scaleX: 1, scaleY: -1, angle: 0 }).some((v) => Object.is(v, -0))).toBe(
      false,
    );
  });
});

describe('siblingPath', () => {
  it('names the image beside the runtime file, without its extension', () => {
    expect(siblingPath('art/hero.anims', 'hero.png')).toBe('art/hero');
    expect(siblingPath('hero.anims', 'hero_n.png')).toBe('hero_n');
    expect(siblingPath('a/b/hero.anims', '../shared/./sheet.webp')).toBe('a/shared/sheet');
    expect(siblingPath('a/hero.anims', 'sheet')).toBe('a/sheet');
  });
});

// --- Lights -----------------------------------------------------------------------------------

describe('light settings', () => {
  it('reads colours', () => {
    expect(colorNumber('#ffb466')).toBe(0xffb466);
    expect(colorNumber('ffb466')).toBe(0xffb466);
    expect(colorNumber(0x1ffb466)).toBe(0xffb466);
    expect(() => colorNumber('orange')).toThrow(/#rrggbb/);
  });

  it("turns SpriteBuddy's settings into the effect's uniforms, in world space (y up)", () => {
    const u = lightUniforms({ ...DEFAULT_LIGHT, angle: 90, height: 0, color: 0xff8000, bands: 3 });
    expect(u.lightDir.map((v) => +v.toFixed(6))).toEqual([1, 0, 0, 3]);
    // From the top of the screen: +y in Cocos.
    expect(lightUniforms({ ...DEFAULT_LIGHT, angle: 0, height: 0 }).lightDir[1]).toBeCloseTo(1);
    expect(u.lightColor).toEqual([1, 128 / 255, 0, 1]);
    expect(u.lightParams).toEqual([0.35, 1, 1, 0.3]);
    expect(lightUniforms({ ...DEFAULT_LIGHT, radius: -5, x: 3, y: 4 }).lightPos).toEqual([
      3, 4, 32, 0,
    ]);
    expect(lightDirection(315, 45).map((v) => +v.toFixed(3))).toEqual([-0.5, -0.5, 0.707]);
  });
});

// --- The adapter ------------------------------------------------------------------------------

describe('spriteBuddy(cc)', () => {
  it('registers its component once per cc', () => {
    const fake = fakeCocos();
    const sb = spriteBuddy(fake.cc);
    expect(spriteBuddy(fake.cc)).toBe(sb);
    expect(fake.registered).toEqual(['SpriteBuddySprite']);
  });

  it('loads a runtime file with its sheet and normal map from beside it', async () => {
    const fake = withAssets();
    const sb = spriteBuddy(fake.cc);
    const sheet = await sb.load('art/hero.anims');
    expect(fake.loaded.sort()).toEqual(['art/hero.anims', 'art/knight', 'art/knight_n']);
    expect(sheet.texture).toBeInstanceOf(fake.raw.Texture2D);
    expect(sheet.texture.image.name).toBe('sheet');
    expect(sheet.normals.image.name).toBe('n');
    expect(sheet.texture.filters).toEqual([2, 2]);
    expect(sheet.animations).toEqual(sheet.file.animations.map((a) => a.name));
  });

  it('skips the normal map when asked, and keeps smooth sampling when asked', async () => {
    const fake = withAssets();
    const sheet = await spriteBuddy(fake.cc).load('art/hero.anims', {
      normals: false,
      pixelArt: false,
      bundle: fake.bundle,
    });
    expect(fake.loaded).not.toContain('art/knight_n');
    expect(sheet.normals).toBeNull();
    expect(sheet.texture.filters).toEqual([]);
  });

  it('says which file it could not load', async () => {
    const fake = fakeCocos();
    await expect(spriteBuddy(fake.cc).load('art/missing.anims')).rejects.toThrow(
      /couldn't load "art\/missing.anims"/,
    );
  });

  it('makes sheets from assets loaded by hand: a JsonAsset, its json or a parsed file', () => {
    const fake = fakeCocos();
    const C = fake.raw;
    const sb = spriteBuddy(fake.cc);
    const raw = fixture('packed');
    const texture = new C.Texture2D();
    const a = sb.sheet(new C.JsonAsset(raw), texture);
    expect(a.texture).toBe(texture);
    const b = sb.sheet(raw, new C.ImageAsset());
    const c = sb.sheet(parseFile(raw), new C.ImageAsset(), new C.ImageAsset());
    expect(b.normals).toBeNull();
    expect(c.normals).toBeInstanceOf(C.Texture2D);
    expect(() => sb.sheet(raw, null)).toThrow(/needs its image/);
    // One unpackable SpriteFrame per frame, at its stored rect.
    expect(a.frames.map((f) => [f.rect.x, f.rect.y, f.rect.width, f.rect.height])).toEqual([
      [0, 0, 10, 20],
      [10, 0, 20, 10],
      [0, 20, 18, 12],
    ]);
    expect(a.frames.every((f) => f.packable === false && f.texture === texture)).toBe(true);
  });

  it("gives the editor's light per animation", async () => {
    const fake = withAssets();
    const sheet = await spriteBuddy(fake.cc).load('art/hero.anims');
    const first = sheet.file.animations[0]!;
    expect(sheet.editorLight()).toEqual(first.light);
    expect(sheet.editorLight('nope')).toBeNull();
  });

  it('loads the lit effect', async () => {
    let effect: unknown;
    const withEffect = fakeCocos((C) => {
      effect = new C.EffectAsset();
      return { [EFFECT_PATH]: effect, 'my/lit': effect };
    });
    const sb = spriteBuddy(withEffect.cc);
    await expect(sb.loadEffect()).resolves.toBe(effect);
    await expect(sb.loadEffect('my/lit', withEffect.bundle)).resolves.toBe(effect);
    expect(() => sb.light(null)).toThrow(/needs the lit effect/);
  });
});

describe('a sprite', () => {
  function setup(name = 'layers', options = {}) {
    const fake = fakeCocos();
    const C = fake.raw;
    const sb = spriteBuddy(fake.cc);
    const sheet = sb.sheet(fixture(name), new C.ImageAsset(), new C.ImageAsset());
    const parent = new C.Node('Canvas');
    parent.layer = 1 << 25;
    const sprite = sheet.sprite(parent as any, undefined, options);
    return { fake, C, sb, sheet, parent, sprite, node: sprite.node as any };
  }

  it('is a node under the parent, on its layer, drawing each part as a child sprite', () => {
    const { parent, node, sprite, sheet } = setup();
    expect(parent.children).toEqual([node]);
    expect(node.name).toBe('slash');
    expect(node.layer).toBe(1 << 25);
    expect(sprite.animation).toBe('slash');
    expect(sprite.playing).toBe(true);
    const parts = sprite.player.parts;
    expect(sprite.parts.length).toBe(parts.length);
    sprite.parts.forEach((child: any, i) => {
      const at = placePart(parts[i]!);
      expect(child.layer).toBe(1 << 25);
      expect(child.position).toEqual([at.x, at.y, 0]);
      expect(child.scale).toEqual([at.scaleX, at.scaleY, 1]);
      expect(child.angle).toBe(at.angle);
      const s = child.components[1];
      expect(s.spriteFrame).toBe(sheet.frames[parts[i]!.index]);
      expect(s.sizeMode).toBe(0);
      expect(s.trim).toBe(true);
      expect(s.color.a).toBe(Math.round(parts[i]!.opacity * 255));
      expect(child.components[0].size).toEqual([at.width, at.height]);
      expect(s.customMaterial).toBeNull();
    });
  });

  it('plays on the component clock, and hides spare parts', () => {
    const { sprite, node } = setup();
    expect(node.children.filter((c: any) => c.active).length).toBe(3);
    sprite.update(0.12); // 120 ms: the second frame, three parts
    expect(sprite.player.state.index).toBe(1);
    expect(sprite.parts.length).toBe(4);
    sprite.update(0.1); // the third frame: just the body
    expect(sprite.parts.length).toBe(1);
    expect(node.children.length).toBe(4);
    sprite.autoUpdate = false;
    sprite.update(1);
    expect(sprite.player.state.index).toBe(2);
  });

  it('can start stopped, at another speed, without updating itself', () => {
    const { sprite } = setup('layers', { autoPlay: false, speed: 2, autoUpdate: false });
    expect(sprite.playing).toBe(false);
    expect(sprite.speed).toBe(2);
    expect(sprite.autoUpdate).toBe(false);
    sprite.advance(500);
    expect(sprite.player.state.index).toBe(0);
    sprite.speed = 1;
    sprite.play('slash').advance(120);
    expect(sprite.player.state.index).toBe(1);
    sprite.seek(0);
    expect(sprite.player.state.index).toBe(0);
    sprite.stop();
    expect(sprite.playing).toBe(false);
  });

  it('flips about its origin', () => {
    const { sprite } = setup();
    sprite.flipX = true;
    expect(sprite.flipX).toBe(true);
    const parts = sprite.player.parts;
    let at = placePart(parts[0]!, true, false);
    expect((sprite.parts[0] as any).position).toEqual([at.x, at.y, 0]);
    sprite.flipY = true;
    expect(sprite.flipY).toBe(true);
    at = placePart(parts[0]!, true, true);
    expect((sprite.parts[0] as any).scale).toEqual([at.scaleX, at.scaleY, 1]);
  });

  it('reports frames, events and the end of a once animation', () => {
    const { sprite, node } = setup('events', { name: 'Hero' });
    expect(node.name).toBe('Hero');
    const seen: string[] = [];
    sprite.onFrame = (i) => seen.push(`frame ${i}`);
    sprite.onEvent = (name, i) => seen.push(`${name} ${i}`);
    sprite.onComplete = () => seen.push('done');
    const hits = vi.fn();
    node.on('event:hit', hits);
    const once = sprite.sheet.file.animations.find((a) => a.loop === 'once')!;
    sprite.play(once.name);
    sprite.advance(60_000);
    expect(seen.at(-1)).toBe('done');
    expect(seen.some((s) => s.startsWith('frame'))).toBe(true);
    const names = node.emitted.map((e: any[]) => e[0]);
    expect(names).toContain('frame');
    expect(names).toContain('complete');
    const events = once.frames.flatMap((f) => f.events);
    if (events.length) {
      expect(names).toContain('event');
      expect(names).toContain(`event:${events[0]}`);
    }
    expect(hits.mock.calls.length).toBe(once.frames.filter((f) => f.events.includes('hit')).length);
  });

  it('shows nothing for a file without animations, and plays nothing', () => {
    const fake = fakeCocos();
    const raw = { ...fixture('basic'), animations: [] };
    const sheet = spriteBuddy(fake.cc).sheet(raw, new fake.raw.ImageAsset());
    const sprite = sheet.sprite(new fake.raw.Node() as any);
    expect(sprite.node.name).toBe('SpriteBuddySprite');
    expect(sprite.animation).toBeNull();
    expect(sprite.parts).toEqual([]);
    sprite.flipX = true;
    expect(sprite.parts).toEqual([]);
  });

  it("draws nothing before it's set up", () => {
    const fake = fakeCocos();
    const sb = spriteBuddy(fake.cc);
    const loose = new (sb.Sprite as any)();
    loose.draw();
    expect(loose._parts).toEqual([]);
  });
});

describe('a lit sprite', () => {
  function lit(normals = true) {
    const fake = fakeCocos();
    const C = fake.raw;
    const sb = spriteBuddy(fake.cc);
    const effect = new C.EffectAsset();
    const sheet = sb.sheet(
      fixture('packed'),
      new C.ImageAsset(),
      normals ? new C.ImageAsset() : undefined,
    );
    const light = sb.light(effect, { radius: 200, x: 10, y: 20, color: '#ff0000' });
    return { fake, C, sb, sheet, light, effect };
  }

  it('draws each part with a shared material per facing, holding the light', () => {
    const { C, sheet, light, effect } = lit();
    const a = sheet.sprite(new C.Node() as any, 'idle', { light });
    const b = sheet.sprite(new C.Node() as any, 'idle', { light });
    expect(a.light).toBe(light);
    const ma = (a.parts[0] as any).components[1].customMaterial;
    const mb = (b.parts[0] as any).components[1].customMaterial;
    expect(ma).toBe(mb);
    expect(ma.effect).toBe(effect);
    expect(ma.props.get('normalMap')).toBe(sheet.normals);
    expect(ma.props.get('orient')).toMatchObject({ x: 1, y: 0, z: 0, w: 1 });
    expect(ma.props.get('lightPos')).toMatchObject({ x: 10, y: 20, z: 32, w: 200 });
    expect(ma.props.get('lightColor')).toMatchObject({ x: 1, y: 0, z: 0 });
    // A flipped sprite draws with another material, whose normals face the other way.
    b.flipX = true;
    const flipped = (b.parts[0] as any).components[1].customMaterial;
    expect(flipped).not.toBe(ma);
    expect(flipped.props.get('orient')).toMatchObject({ x: -1, y: 0, z: 0, w: 1 });
    // So does a rotated frame.
    a.seek(150);
    const turned = (a.parts[0] as any).components[1].customMaterial;
    expect(turned.props.get('orient')).toMatchObject({ x: 0, y: 1, z: -1, w: 0 });
  });

  it('passes every change to every material it made', () => {
    const { C, sheet, light } = lit();
    const s = sheet.sprite(new C.Node() as any, 'idle', { light });
    s.flipX = true;
    const m = (s.parts[0] as any).components[1].customMaterial;
    light.x = 99;
    light.color = '#00ff00' as any;
    expect(light.color).toBe(0x00ff00);
    expect(m.props.get('lightPos').x).toBe(99);
    expect(m.props.get('lightColor')).toMatchObject({ x: 0, y: 1, z: 0 });
    light.set({ brightness: 2, ambient: 0.5, bogus: 1 } as any).set(null);
    expect(m.props.get('lightParams')).toMatchObject({ x: 0.5, y: 2 });
    expect(light.brightness).toBe(2);
    expect(Object.keys(light)).toEqual(expect.arrayContaining(Object.keys(DEFAULT_LIGHT)));
  });

  it('needs a normal map', () => {
    const { C, sheet, light } = lit(false);
    expect(() => sheet.sprite(new C.Node() as any, 'idle', { light })).toThrow(
      /no normal map: export it/,
    );
    const fake = fakeCocos();
    const sb = spriteBuddy(fake.cc);
    const named = sb.sheet(fixture('normals'), new fake.raw.ImageAsset());
    expect(() => named.sprite(new fake.raw.Node() as any, undefined, { light })).toThrow(
      /isn't loaded/,
    );
  });
});
