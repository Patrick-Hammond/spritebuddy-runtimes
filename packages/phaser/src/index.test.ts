import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { parseFile } from '@spritebuddy/core';
import {
  DEFAULT_LIGHT,
  lightDirection,
  placePart,
  siblingUrl,
  spriteBuddy,
  SUN_DISTANCE,
  type PhaserNamespace,
} from './index';
import { colorNumber, grey } from './light';
import { mirroredNormalMap, mirrorNormals } from './normals';

/* eslint-disable @typescript-eslint/no-explicit-any */
const fixture = (name: string) =>
  JSON.parse(readFileSync(join(__dirname, '../../../fixtures', `${name}.anims.json`), 'utf8'));

/** Just enough Phaser for the adapter's logic; real rendering is tested in Chromium. */
function fakePhaser(version: string) {
  class Emitter {
    handlers = new Map<string, ((...a: any[]) => void)[]>();
    on(event: string, fn: (...a: any[]) => void) {
      this.handlers.set(event, [...(this.handlers.get(event) ?? []), fn]);
      return this;
    }
    once(event: string, fn: (...a: any[]) => void) {
      const wrapped = (...a: any[]) => {
        this.off(event, wrapped);
        fn(...a);
      };
      return this.on(event, wrapped);
    }
    off(event: string, fn?: (...a: any[]) => void) {
      this.handlers.set(
        event,
        (this.handlers.get(event) ?? []).filter((h) => fn && h !== fn),
      );
      return this;
    }
    emit(event: string, ...args: any[]) {
      for (const h of this.handlers.get(event) ?? []) h(...args);
      return true;
    }
  }
  class Texture {
    frames = new Map<string, number[]>();
    filter: number | null = null;
    source: any[];
    dataSource: any[];
    constructor(
      public key: string,
      image: unknown,
      normals?: unknown,
    ) {
      this.source = [{ image }];
      this.dataSource = normals ? [{ image: normals }] : [];
    }
    has(name: string) {
      return this.frames.has(name);
    }
    remove(name: string) {
      this.frames.delete(name);
    }
    add(name: string, source: number, x: number, y: number, w: number, h: number) {
      this.frames.set(name, [source, x, y, w, h]);
    }
    setFilter(mode: number) {
      this.filter = mode;
    }
  }
  class TextureManager {
    list = new Map<string, Texture>();
    exists(key: string) {
      return this.list.has(key);
    }
    get(key: string) {
      return this.list.get(key);
    }
    addImage(key: string, image: unknown, normals?: unknown) {
      const t = new Texture(key, image, normals);
      this.list.set(key, t);
      return t;
    }
  }
  class Image {
    calls: string[] = [];
    texture = '';
    frame = '';
    visible = true;
    alpha = 1;
    flip = [false, false];
    angle = 0;
    x = 0;
    y = 0;
    lighting = false;
    pipeline = '';
    constructor(
      public scene: unknown,
      x: number,
      y: number,
      key: string,
    ) {
      this.texture = key;
    }
    setOrigin() {}
    setLighting(on: boolean) {
      this.lighting = on;
    }
    setPipeline(name: string) {
      this.pipeline = name;
    }
    setVisible(v: boolean) {
      this.visible = v;
    }
    setTexture(key: string, frame: string) {
      this.texture = key;
      this.frame = frame;
    }
    setAlpha(a: number) {
      this.alpha = a;
    }
    setFlip(x: boolean, y: boolean) {
      this.flip = [x, y];
    }
    setAngle(a: number) {
      this.angle = a;
    }
    setPosition(x: number, y: number) {
      this.x = x;
      this.y = y;
    }
  }
  class Container extends Emitter {
    list: any[] = [];
    onUpdateList = false;
    destroyed = false;
    constructor(
      public scene: any,
      public x: number,
      public y: number,
    ) {
      super();
    }
    add(child: unknown) {
      this.list.push(child);
    }
    addToUpdateList() {
      this.onUpdateList = true;
    }
    removeFromUpdateList() {
      this.onUpdateList = false;
    }
    destroy() {
      this.destroyed = true;
    }
  }
  class LoaderPlugin extends Emitter {
    path = '';
    queued: [string, string, unknown][] = [];
    json(key: string, url: string) {
      this.queued.push(['json', key, this.path + url]);
    }
    image(key: string, url: unknown) {
      const add = (u: string) => this.path + u;
      this.queued.push(['image', key, Array.isArray(url) ? url.map(add) : add(url as string)]);
    }
  }
  const factories: Record<string, (...a: any[]) => any> = {};
  const Phaser = {
    VERSION: version,
    GameObjects: {
      Container,
      Image,
      GameObjectFactory: {
        register: (name: string, fn: (...a: any[]) => any) => (factories[name] = fn),
      },
    },
    Loader: { LoaderPlugin },
    Textures: { FilterMode: { LINEAR: 0, NEAREST: 1 } },
  };
  return { Phaser: Phaser as unknown as PhaserNamespace, LoaderPlugin, Texture, factories };
}

function fakeLights() {
  const made: any[] = [];
  return {
    active: false,
    ambient: -1,
    made,
    enable() {
      this.active = true;
    },
    setAmbientColor(c: number) {
      this.ambient = c;
    },
    addLight(x: number, y: number, radius: number, color: number, intensity: number) {
      const light = {
        x,
        y,
        radius,
        color,
        intensity,
        z: 0,
        setColor(c: number) {
          this.color = c;
        },
      };
      made.push(light);
      return light;
    },
    removeLight(light: unknown) {
      made.splice(made.indexOf(light), 1);
    },
  };
}

function fakeScene(Phaser: ReturnType<typeof fakePhaser>) {
  const json = new Map<string, unknown>();
  const events = new (class {
    handlers = new Map<string, ((...a: any[]) => void)[]>();
    on(e: string, fn: () => void) {
      this.handlers.set(e, [...(this.handlers.get(e) ?? []), fn]);
    }
    off(e: string, fn: () => void) {
      this.handlers.set(
        e,
        (this.handlers.get(e) ?? []).filter((h) => h !== fn),
      );
    }
    emit(e: string) {
      for (const h of this.handlers.get(e) ?? []) h();
    }
  })();
  const displayed: unknown[] = [];
  const textures = new (class {
    list = new Map<string, any>();
    exists(key: string) {
      return this.list.has(key);
    }
    get(key: string) {
      return this.list.get(key);
    }
    addImage(key: string, image: unknown, normals?: unknown) {
      const t = new Phaser.Texture(key, image, normals);
      this.list.set(key, t);
      return t;
    }
  })();
  return {
    sys: { displayList: { add: (o: unknown) => displayed.push(o) } },
    textures,
    cache: { json: { get: (k: string) => json.get(k), exists: (k: string) => json.has(k) } },
    lights: fakeLights(),
    cameras: { main: { midPoint: { x: 100, y: 50 } } },
    events,
    load: new Phaser.LoaderPlugin(),
    add: {},
    json,
    displayed,
  };
}

/** A scene with the layers fixture loaded under "knight". */
function setUp(version = '3.90.0', { normals = false, file = 'layers' } = {}) {
  const fake = fakePhaser(version);
  const sb = spriteBuddy(fake.Phaser);
  const scene = fakeScene(fake);
  scene.textures.addImage('knight', { width: 64, height: 32 }, normals ? { n: 1 } : undefined);
  scene.json.set('knight', fixture(file));
  return { fake, sb, scene };
}

afterEach(() => vi.unstubAllGlobals());

describe('spriteBuddy(Phaser)', () => {
  it('tells Phaser 3 and 4 apart', () => {
    expect(spriteBuddy(fakePhaser('3.60.0').Phaser).version).toBe(3);
    expect(spriteBuddy(fakePhaser('4.2.1').Phaser).version).toBe(4);
  });

  it('adds this.load.spritebuddy and this.add.spritebuddy', () => {
    const { fake, sb, scene } = setUp();
    const loader = new fake.LoaderPlugin() as any;
    expect(loader.spritebuddy('hero', 'hero.anims.json')).toBe(loader);
    expect(loader.queued).toEqual([['json', 'hero', 'hero.anims.json']]);
    const sprite = fake.factories.spritebuddy!.call({ scene }, 5, 6, 'knight', 'slash');
    expect(sprite.animation).toBe('slash');
    expect([sprite.x, sprite.y]).toEqual([5, 6]);
    expect(scene.displayed).toEqual([sprite]);
    expect(sb.add(scene, 0, 0, 'knight').sheet).toBe(sprite.sheet);
  });
});

describe('loading', () => {
  it('queues the JSON, then the sheet and its normal map beside it', () => {
    const { sb, scene } = setUp();
    scene.load.path = 'assets/';
    sb.load(scene, 'knight', 'chars/knight.anims.json?v=2');
    scene.load.path = 'other/'; // changed later in preload: images still go with the JSON
    scene.load.emit('filecomplete-json-knight', 'knight', 'json', fixture('normals'));
    expect(scene.load.path).toBe('other/');
    expect(scene.load.queued).toEqual([
      ['json', 'knight', 'assets/chars/knight.anims.json?v=2'],
      ['image', 'knight', ['assets/chars/knight.png', 'assets/chars/knight_n.png']],
    ]);
  });

  it('skips the normal map when asked, or when there is none', () => {
    const { sb, scene } = setUp();
    sb.load(scene, 'a', 'a.anims.json', { normals: false });
    scene.load.emit('filecomplete-json-a', 'a', 'json', fixture('normals'));
    sb.load(scene, 'b', 'b.anims.json');
    scene.load.emit('filecomplete-json-b', 'b', 'json', fixture('layers'));
    expect(scene.load.queued.filter((q) => q[0] === 'image')).toEqual([
      ['image', 'a', 'knight.png'],
      ['image', 'b', 'layers.png'],
    ]);
  });

  it('finds images next to the runtime file', () => {
    expect(siblingUrl('a/b/hero.anims.json', 'hero.png')).toBe('a/b/hero.png');
    expect(siblingUrl('hero.anims.json#x', 'hero.png')).toBe('hero.png');
    expect(siblingUrl('a/hero.anims.json', '/img/hero.png')).toBe('/img/hero.png');
    expect(siblingUrl('a/hero.anims.json', 'https://cdn/x.png')).toBe('https://cdn/x.png');
  });
});

describe('sheets', () => {
  it("adds the file's frames to the texture, rotated ones as stored", () => {
    const { sb, scene } = setUp('3.90.0', { file: 'normals' });
    const sheet = sb.sheet(scene, 'knight');
    expect(sheet.animations).toEqual(['idle', 'turn']);
    expect(sheet.key).toBe('knight');
    expect(sheet.hasNormals).toBe(false);
    expect(sheet.texture.frames.get('idle_0')).toEqual([0, 0, 0, 16, 32]);
    // Upright 32 × 16, stored turned: 16 columns and 32 rows.
    expect(sheet.texture.frames.get('idle_2')).toEqual([0, 32, 0, 16, 32]);
    expect(sheet.texture.filter).toBe(1);
    expect(sb.sheet(scene, 'knight')).toBe(sheet);
  });

  it('replaces frames already named like the file', () => {
    const { sb, scene } = setUp();
    scene.textures.get('knight').add('sword', 0, 9, 9, 9, 9);
    expect(sb.sheet(scene, 'knight').texture.frames.get('sword')).toEqual([0, 48, 0, 8, 20]);
  });

  it('takes the file directly, and can keep smooth sampling', () => {
    const { sb, scene } = setUp();
    scene.textures.addImage('other', {});
    const raw = fixture('packed');
    const sheet = sb.sheet(scene, 'other', { file: raw, pixelArt: false });
    expect(sheet.animations).toEqual(['idle']);
    expect(sheet.texture.filter).toBeNull();
    scene.textures.addImage('parsed', {});
    expect(sb.sheet(scene, 'parsed', { file: parseFile(raw) }).file.frames).toHaveLength(3);
  });

  it('says what is missing', () => {
    const { sb, scene } = setUp();
    expect(() => sb.sheet(scene, 'nope')).toThrow(/No texture "nope"/);
    scene.textures.addImage('bare', {});
    expect(() => sb.sheet(scene, 'bare')).toThrow(/No runtime file "bare"/);
  });

  it("gives each animation's editor light", () => {
    const { sb, scene } = setUp('3.90.0', { file: 'normals' });
    const sheet = sb.sheet(scene, 'knight');
    expect(sheet.editorLight()).toEqual(sheet.file.animations[0]!.light);
    expect(sheet.editorLight('turn')).toBeNull();
    expect(sheet.editorLight('nope')).toBeNull();
  });
});

describe('sprites', () => {
  it('draws each part as an Image where the format puts it', () => {
    const { sb, scene } = setUp();
    const sheet = sb.sheet(scene, 'knight');
    const sprite = sheet.sprite(scene, 0, 0, 'slash', { autoUpdate: false }) as any;
    const parts = sprite.player.parts;
    expect(sprite.list).toHaveLength(parts.length);
    parts.forEach((part: any, i: number) => {
      const image = sprite.list[i];
      const at = placePart(part);
      expect([image.x, image.y, image.angle, image.frame]).toEqual([
        at.x,
        at.y,
        at.angle,
        part.frame.name,
      ]);
      expect(image.alpha).toBe(part.opacity);
    });
    // Fewer parts later: the spare Images hide.
    sprite.seek(1e9);
    const shown = sprite.list.filter((i: any) => i.visible).length;
    expect(shown).toBe(sprite.player.parts.length);
  });

  it('plays, stops, seeks and moves on', () => {
    const { sb, scene } = setUp();
    const sprite = sb.sheet(scene, 'knight').sprite(scene, 0, 0, undefined, { speed: 2 });
    expect(sprite.animation).toBe('slash');
    expect(sprite.speed).toBe(2);
    sprite.speed = 1;
    expect(sprite.playing).toBe(true);
    const frames: number[] = [];
    sprite.on('frame', (i: number) => frames.push(i));
    sprite.onFrame = (i) => frames.push(i * 10);
    (sprite as any).preUpdate(0, 130); // the first frame lasts 120 ms
    expect(frames).toEqual([10, 1]);
    expect(sprite.stop().playing).toBe(false);
    sprite.advance(1000);
    expect(sprite.player.state.time).toBe(130);
    expect(sprite.seek(0).player.state.index).toBe(0);
    expect(sprite.play('slash', 50).player.state.time).toBe(50);
  });

  it('reports the end of a once animation', () => {
    const { sb, scene } = setUp('3.90.0', { file: 'loops' });
    const sheet = sb.sheet(scene, 'knight');
    const once = sheet.file.animations.find((a) => a.loop === 'once')!.name;
    const sprite = sheet.sprite(scene, 0, 0, once, { autoUpdate: false });
    const heard: string[] = [];
    sprite.onComplete = () => heard.push('onComplete');
    sprite.on('complete', () => heard.push('complete'));
    sprite.advance(1e6);
    expect(heard).toEqual(['onComplete', 'complete']);
  });

  it('emits frame events three ways', () => {
    const { sb, scene } = setUp('3.90.0', { file: 'events' });
    const sprite = sb.sheet(scene, 'knight').sprite(scene, 0, 0, 'walk', { autoUpdate: false });
    const heard: string[] = [];
    sprite.onEvent = (name, i) => heard.push(`onEvent ${name} ${i}`);
    sprite.on('event', (name: string, i: number) => heard.push(`event ${name} ${i}`));
    sprite.on('event:step', (i: number) => heard.push(`step ${i}`));
    sprite.advance(160);
    expect(heard).toEqual(['onEvent step 2', 'event step 2', 'step 2']);
  });

  it("starts stopped, or on the scene's update list, and leaves it when destroyed", () => {
    const { sb, scene } = setUp();
    const sheet = sb.sheet(scene, 'knight');
    const still = sheet.sprite(scene, 0, 0, 'slash', { autoPlay: false }) as any;
    expect(still.playing).toBe(false);
    expect(still.onUpdateList).toBe(true);
    still.autoUpdate = true;
    still.autoUpdate = false;
    expect(still.onUpdateList).toBe(false);
    still.autoUpdate = true;
    still.destroy();
    expect([still.onUpdateList, still.destroyed, still.autoUpdate]).toEqual([false, true, false]);
  });

  it('copes with a file without animations', () => {
    const { sb, scene } = setUp();
    scene.textures.addImage('empty', {});
    const file = { ...fixture('layers'), animations: [] };
    const sprite = sb.sheet(scene, 'empty', { file }).sprite(scene, 0, 0);
    expect([sprite.animation, sprite.list.length]).toEqual([null, 0]);
  });

  it('mirrors about its origin with flipX and flipY', () => {
    const { sb, scene } = setUp();
    const sprite = sb.sheet(scene, 'knight').sprite(scene, 0, 0, 'slash', { autoUpdate: false });
    const before = sprite.list.map((i: any) => i.x);
    expect(sprite.setFlipX(true).flipX).toBe(true);
    sprite.list.forEach((image: any, i: number) => {
      const part = sprite.player.parts[i]!;
      expect(image.x).toBe(-(before[i] + part.frame.rect.w));
      expect(image.flip[0]).toBe(!part.flipX);
    });
    expect(sprite.setFlipY(true).flipY).toBe(true);
    expect(sprite.list[0].flip[1]).toBe(true);
  });
});

describe('placing parts', () => {
  const file = parseFile(fixture('packed'));
  const at = (frame: number, extra: object = {}, fx = false, fy = false) =>
    placePart(
      { frame: file.frames[frame]!, x: -8, y: -16, flipX: false, flipY: false, ...extra },
      fx,
      fy,
    );

  it('puts a trimmed frame where its pixels are', () => {
    const f = file.frames.find((f) => f.trim && !f.rotated)!;
    const i = file.frames.indexOf(f);
    expect(at(i)).toEqual({
      x: -8 + f.trim!.x,
      y: -16 + f.trim!.y,
      angle: 0,
      flipX: false,
      flipY: false,
    });
    // Flipped within its own full frame.
    expect(at(i, { flipX: true, flipY: true })).toMatchObject({
      x: -8 + f.width - f.trim!.x - f.rect.w,
      y: -16 + f.height - f.trim!.y - f.rect.h,
      flipX: true,
      flipY: true,
    });
  });

  it('turns a rotated frame back about its top-left, swapping the flips', () => {
    const f = file.frames.find((f) => f.rotated)!;
    const i = file.frames.indexOf(f);
    const tx = f.trim?.x ?? 0;
    const ty = f.trim?.y ?? 0;
    expect(at(i)).toEqual({
      x: -8 + tx,
      y: -16 + ty + f.rect.h,
      angle: -90,
      flipX: false,
      flipY: false,
    });
    expect(at(i, { flipX: true })).toMatchObject({ flipX: false, flipY: true });
    expect(at(i, {}, false, true)).toMatchObject({ flipX: true, flipY: false });
  });

  it("mirrors about the sprite's origin for the sprite's own flips", () => {
    const f = file.frames[0]!;
    const plain = at(0);
    expect(at(0, {}, true, true)).toMatchObject({
      x: -(plain.x + f.rect.w),
      y: -(plain.y + f.rect.h),
      flipX: true,
      flipY: true,
    });
    // A part's flip and the sprite's cancel out.
    expect(at(0, { flipX: true }, true)).toMatchObject({ flipX: false });
  });
});

describe('lit sprites', () => {
  /** A canvas whose pixels are `[r, g, b, a]` per pixel, for mirroring normal maps. */
  function stubCanvas() {
    const drawn: unknown[] = [];
    vi.stubGlobal('document', {
      createElement: () => {
        const data = new Uint8ClampedArray([10, 20, 30, 255]);
        return {
          width: 0,
          height: 0,
          getContext: () => ({
            drawImage: (image: unknown) => drawn.push(image),
            getImageData: () => ({ data }),
            putImageData: () => {},
          }),
          data,
        };
      },
    });
    return drawn;
  }

  it('use Phaser 3 Light2D or Phaser 4 lighting, and a mirrored normal map when flipped', () => {
    for (const version of ['3.90.0', '4.2.1']) {
      const drawn = stubCanvas();
      const { sb, scene } = setUp(version, { normals: true });
      const sheet = sb.sheet(scene, 'knight');
      expect(sheet.hasNormals).toBe(true);
      const sprite = sheet.sprite(scene, 0, 0, 'slash', { lit: true, autoUpdate: false });
      expect(sprite.lit).toBe(true);
      const image = sprite.list[0];
      expect(version === '3.90.0' ? image.pipeline : image.lighting).toBe(
        version === '3.90.0' ? 'Light2D' : true,
      );
      expect(image.texture).toBe('knight');
      sprite.flipX = true;
      expect(image.texture).toBe('knight#spritebuddy-x');
      const copy = scene.textures.get('knight#spritebuddy-x');
      expect(copy.source[0].image).toBe(scene.textures.get('knight').source[0].image);
      expect(copy.dataSource[0].image.data).toEqual(new Uint8ClampedArray([245, 20, 30, 255]));
      expect(copy.frames.size).toBe(sheet.file.frames.length);
      expect(copy.filter).toBe(1);
      sprite.flipY = true;
      expect(image.texture).toBe('knight#spritebuddy-xy');
      sprite.flipX = false;
      expect(image.texture).toBe('knight#spritebuddy-y');
      sprite.flipX = true; // each copy is made once
      expect(drawn).toHaveLength(3);
    }
  });

  it('keep smooth sampling on mirrored copies of a smooth sheet', () => {
    stubCanvas();
    const { sb, scene } = setUp('4.2.1', { normals: true });
    const sprite = sb.sheet(scene, 'knight', { pixelArt: false }).sprite(scene, 0, 0, 'slash', {
      lit: true,
    });
    sprite.flipY = true;
    expect(scene.textures.get('knight#spritebuddy-y').filter).toBeNull();
  });

  it('need the normal map', () => {
    const { sb, scene } = setUp('4.2.1', { file: 'normals' });
    expect(() => sb.sheet(scene, 'knight').sprite(scene, 0, 0, 'idle', { lit: true })).toThrow(
      /normal map isn't loaded/,
    );
    const other = setUp('4.2.1');
    expect(() =>
      other.sb.sheet(other.scene, 'knight').sprite(other.scene, 0, 0, 'slash', { lit: true }),
    ).toThrow(/no normal map/);
  });
});

describe('normal maps', () => {
  it('mirror by inverting red for x and green for y', () => {
    const data = new Uint8ClampedArray([10, 20, 30, 255, 0, 255, 128, 0]);
    mirrorNormals(data, true, false);
    expect([...data]).toEqual([245, 20, 30, 255, 255, 255, 128, 0]);
    mirrorNormals(data, false, true);
    expect([...data]).toEqual([245, 235, 30, 255, 255, 0, 128, 0]);
  });

  it('are copied onto a canvas of the same size', () => {
    const data = new Uint8ClampedArray([1, 2, 3, 4]);
    const put: unknown[] = [];
    vi.stubGlobal('document', {
      createElement: () => ({
        getContext: () => ({
          drawImage: () => {},
          getImageData: () => ({ data }),
          putImageData: (p: unknown) => put.push(p),
        }),
      }),
    });
    const canvas = mirroredNormalMap({ width: 3, height: 2 } as any, false, true);
    expect([canvas.width, canvas.height]).toEqual([3, 2]);
    expect([...data]).toEqual([1, 253, 3, 4]);
    expect(put).toEqual([{ data }]);
  });
});

describe('lights', () => {
  it('make a Phaser point light and turn the lights on', () => {
    const { sb, scene } = setUp();
    const light = sb.light(scene, {
      radius: 300,
      x: 10,
      y: 20,
      z: 24,
      color: '#ffb466',
      brightness: 2,
      ambient: 0.5,
    });
    const p = light.phaserLight;
    expect(scene.lights.active).toBe(true);
    expect([p.x, p.y, p.z, p.radius, p.color, p.intensity]).toEqual([10, 20, 24, 300, 0xffb466, 2]);
    expect(scene.lights.ambient).toBe(0x808080);
    light.x = 50;
    light.brightness = 3;
    expect([p.x, p.intensity]).toEqual([50, 3]);
    expect(light.set({ color: 0x123456, nope: 1 } as any).color).toBe(0x123456);
    light.set(null);
    light.destroy();
    expect(scene.lights.made).toEqual([]);
  });

  it("start as SpriteBuddy Pro's default light", () => {
    const { sb, scene } = setUp();
    const light = sb.light(scene);
    for (const [key, value] of Object.entries(DEFAULT_LIGHT)) {
      expect((light as any)[key], key).toBe(value);
    }
  });

  it('make a directional light from a far-off point light that follows the camera', () => {
    const { sb, scene } = setUp();
    const light = sb.light(scene, { angle: 90, height: 0 });
    const p = light.phaserLight;
    expect(p.x).toBeCloseTo(100 + SUN_DISTANCE);
    expect(p.y).toBeCloseTo(50);
    expect(p.z).toBeCloseTo(0);
    expect(p.radius).toBe(SUN_DISTANCE * 10);
    scene.cameras.main.midPoint = { x: 0, y: 0 };
    scene.events.emit('prerender');
    expect(p.x).toBeCloseTo(SUN_DISTANCE);
    // A point light stays where it is put.
    light.set({ radius: 10, x: 1, y: 2 });
    scene.events.emit('prerender');
    expect([p.x, p.y]).toEqual([1, 2]);
    light.destroy();
    expect(scene.events.handlers.get('prerender')).toEqual([]);
  });

  it('work without a main camera', () => {
    const { sb, scene } = setUp();
    (scene as any).cameras = {};
    const p = sb.light(scene, { angle: 180, height: 0 }).phaserLight;
    expect([Math.round(p.x), Math.round(p.y)]).toEqual([0, SUN_DISTANCE]);
  });

  it('read colours and point the way SpriteBuddy does', () => {
    expect(colorNumber('#FF8800')).toBe(0xff8800);
    expect(colorNumber('00ff00')).toBe(0x00ff00);
    expect(colorNumber(0x1ffffff)).toBe(0xffffff);
    expect(() => colorNumber('red')).toThrow(/#rrggbb/);
    expect(grey(2)).toBe(0xffffff);
    expect(grey(-1)).toBe(0);
    const [x, y, z] = lightDirection(90, 0);
    expect([x, Math.abs(y), z].map((v) => Math.round(v * 1000) / 1000)).toEqual([1, 0, 0]);
  });
});
