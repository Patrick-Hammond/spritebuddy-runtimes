import { parseFile, Player, type LightDef, type SpriteBuddyFile } from '@spritebuddy/core';
import type { CocosBundle, CocosNamespace, CocosNode } from './cocos-types.js';
import {
  colorNumber,
  DEFAULT_LIGHT,
  lightUniforms,
  type LightSettings,
  type LightState,
} from './light.js';
import { normalBasis, placePart } from './place.js';

export { boundsOf, Player, type Part, type SpriteBuddyFile } from '@spritebuddy/core';
export type { CocosBundle, CocosNamespace, CocosNode } from './cocos-types.js';
export {
  colorNumber,
  DEFAULT_LIGHT,
  lightDirection,
  lightUniforms,
  type LightSettings,
  type LightUniforms,
} from './light.js';
export { normalBasis, placePart, type Placement } from './place.js';

/* eslint-disable @typescript-eslint/no-explicit-any */

/** Where `sb.loadEffect()` looks for the lit effect when given no path. */
export const EFFECT_PATH = 'spritebuddy/spritebuddy-lit';

export interface LoadOptions {
  /** The bundle the files are in. Defaults to `cc.resources` (the `assets/resources` folder). */
  readonly bundle?: CocosBundle;
  /** Load the file's normal map too, when it has one. Defaults to true. */
  readonly normals?: boolean;
  /** Nearest-neighbour sampling, so pixel art stays crisp when scaled. Defaults to true. */
  readonly pixelArt?: boolean;
}

export interface SheetOptions {
  /** Nearest-neighbour sampling, so pixel art stays crisp when scaled. Defaults to true. */
  readonly pixelArt?: boolean;
}

export interface SpriteOptions {
  /** The new node's name. Defaults to the animation's. */
  readonly name?: string;
  /** Starts playing at once. Defaults to true. */
  readonly autoPlay?: boolean;
  /** Moves on in the component's `update`. Defaults to true; turn off to call `advance` yourself. */
  readonly autoUpdate?: boolean;
  /** Playback rate: 1 is normal. */
  readonly speed?: number;
  /** Lights the sprite with this light (from `sb.light()`) through the sheet's normal map. */
  readonly light?: SpriteBuddyLight | null;
}

/** A runtime file with its sheet's texture (and normal map) cut into Cocos SpriteFrames. */
export interface SpriteBuddySheet {
  readonly file: SpriteBuddyFile;
  /** The sheet's texture. */
  readonly texture: any;
  /** The normal map's texture, or null when there is none (or it wasn't loaded). */
  readonly normals: any;
  /** One SpriteFrame per file frame, in file order: the pixels as stored (rotated ones turned). */
  readonly frames: readonly any[];
  /** Animation names, in file order. */
  readonly animations: readonly string[];
  /**
   * The light SpriteBuddy Pro lit `animation` with (default: the first one), or null. Pass it to
   * `sb.light()` to light the game like the editor's preview did.
   */
  editorLight(animation?: string): LightDef | null;
  /**
   * A new node under `parent` with a {@link SpriteBuddySprite} playing `animation` (default: the
   * first one). The node's position is where the character stands (the frame pivot).
   */
  sprite(parent: CocosNode, animation?: string, options?: SpriteOptions): SpriteBuddySprite;
}

/**
 * The component that plays a sheet. Its node's origin is where the character stands; it draws
 * the current frame and its layers as child nodes with a `cc.Sprite` each.
 */
export interface SpriteBuddySprite {
  readonly node: CocosNode;
  readonly sheet: SpriteBuddySheet;
  readonly player: Player;
  /** The light the sprite is lit by, or null. */
  readonly light: SpriteBuddyLight | null;
  /** The animation playing (or last played). */
  readonly animation: string | null;
  readonly playing: boolean;
  speed: number;
  /**
   * Mirrors the sprite about its origin. Use these rather than a negative scale on lit sprites,
   * so the light still comes from the right side.
   */
  flipX: boolean;
  flipY: boolean;
  /** Called with the frame index each time the frame changes. The node also emits `"frame"`. */
  onFrame: ((index: number) => void) | null;
  /** Called when a `once` animation ends. The node also emits `"complete"`. */
  onComplete: (() => void) | null;
  /**
   * Called for each frame event (such as `"step"`) as its frame starts showing, with the frame's
   * index. The node also emits `"event"` (name, index) and `"event:<name>"` (index), so
   * `sprite.node.on('event:step', ...)` works too.
   */
  onEvent: ((name: string, index: number) => void) | null;
  /** Moves on in `update` while on (the default); turn off to call `advance` yourself. */
  autoUpdate: boolean;
  /** Cocos calls this every frame with the seconds since the last. */
  update(dt: number): void;
  play(animation: string, time?: number): this;
  stop(): this;
  /** Jumps to `ms` into the animation. */
  seek(ms: number): this;
  /** Moves time on by `ms` and redraws (called for you each frame while `autoUpdate` is on). */
  advance(ms: number): this;
  /** The child nodes drawing the current frame, bottom to top. */
  readonly parts: readonly CocosNode[];
}

/**
 * A light for lit sprites: directional, or a point light when its `radius` is above 0. Change
 * its fields at any time; every sprite it lights is lit the new way on the next frame.
 */
export interface SpriteBuddyLight {
  angle: number;
  height: number;
  size: number;
  /** `0xrrggbb`; setting a `"#rrggbb"` string works too. */
  color: number;
  brightness: number;
  ambient: number;
  opacity: number;
  bands: number;
  /** Above 0: a point light at (`x`, `y`, `z`) in world space that fades out this far away. */
  radius: number;
  x: number;
  y: number;
  z: number;
  /** The lit effect it draws with. */
  readonly effect: any;
  /** Changes several settings at once. */
  set(settings: LightSettings | LightDef | null | undefined): this;
  /** The shared material lit parts of `sheet` facing `basis` (see `normalBasis`) draw with. */
  material(sheet: SpriteBuddySheet, basis: readonly number[]): any;
}

/** What `spriteBuddy(cc)` returns. */
export interface SpriteBuddyCocos {
  /**
   * Loads a runtime file from a bundle (default `cc.resources`), with its sheet and normal map
   * from beside it: `await sb.load('characters/knight.anims')` for
   * `assets/resources/characters/knight.anims.json`.
   */
  load(path: string, options?: LoadOptions): Promise<SpriteBuddySheet>;
  /**
   * A sheet from a runtime file (a `JsonAsset`, its `.json`, or a parsed file) and its images
   * (`ImageAsset`s or `Texture2D`s), when you load them yourself.
   */
  sheet(file: unknown, image: any, normals?: any, options?: SheetOptions): SpriteBuddySheet;
  /** Loads the lit effect from a bundle (default: `spritebuddy/spritebuddy-lit` in resources). */
  loadEffect(path?: string, bundle?: CocosBundle): Promise<any>;
  /**
   * A light that takes SpriteBuddy's settings, drawn with the lit effect (`effect`, from
   * `loadEffect` or an `@property(EffectAsset)`). Unset settings are SpriteBuddy Pro's defaults.
   */
  light(effect: any, settings?: LightSettings | LightDef | null): SpriteBuddyLight;
  /** The component class, for `node.getComponent(sb.Sprite)`. */
  readonly Sprite: new () => SpriteBuddySprite;
}

const isFile = (v: unknown): v is SpriteBuddyFile =>
  typeof v === 'object' && v !== null && 'animations' in v && 'width' in v && !('format' in v);

/**
 * A bundle path for `image` (a file name relative to the runtime file at `path`), without its
 * extension, as Cocos names assets: `siblingPath('hero/knight.anims', 'knight.png')` is
 * `'hero/knight'`.
 */
export function siblingPath(path: string, image: string): string {
  const parts = path.split('/').slice(0, -1);
  for (const piece of image.replace(/\.[^./]*$/, '').split('/')) {
    if (piece === '..') parts.pop();
    else if (piece !== '.' && piece !== '') parts.push(piece);
  }
  return parts.join('/');
}

/** `bundle.load` as a promise. */
function loadAsset(bundle: CocosBundle, path: string, type: any): Promise<any> {
  return new Promise((resolve, reject) => {
    bundle.load(path, type, (error, asset) => {
      if (error) reject(new Error(`SpriteBuddy couldn't load "${path}": ${error.message}`));
      else resolve(asset);
    });
  });
}

const bound = new WeakMap<object, SpriteBuddyCocos>();

/**
 * Binds SpriteBuddy to your Cocos Creator: `const sb = spriteBuddy(cc)` after
 * `import * as cc from 'cc'`. Calling it again with the same `cc` gives the same object.
 */
export function spriteBuddy(cc: CocosNamespace): SpriteBuddyCocos {
  const known = bound.get(cc);
  if (known) return known;

  let sheets = 0;
  const sheetIds = new WeakMap<SpriteBuddySheet, number>();

  function texture(image: any, pixelArt: boolean): any {
    if (image === null || image === undefined) return null;
    let t = image;
    if (!(image instanceof cc.Texture2D)) {
      t = new cc.Texture2D();
      t.image = image;
    }
    if (pixelArt) t.setFilters(cc.Texture2D.Filter.NEAREST, cc.Texture2D.Filter.NEAREST);
    return t;
  }

  function sheet(raw: unknown, image: any, normals?: any, options: SheetOptions = {}) {
    if (raw instanceof cc.JsonAsset) raw = (raw as any).json;
    const file = isFile(raw) ? raw : parseFile(raw);
    const pixelArt = options.pixelArt !== false;
    const tex = texture(image, pixelArt);
    if (!tex) throw new Error('A SpriteBuddy sheet needs its image');
    const frames = file.frames.map((f) => {
      const frame = new cc.SpriteFrame();
      frame.texture = tex;
      const { x, y, w, h } = f.rect;
      frame.rect = f.rotated ? new cc.Rect(x, y, h, w) : new cc.Rect(x, y, w, h);
      // The normal map is read at the sheet's own UVs, so frames must stay where they are.
      frame.packable = false;
      return frame;
    });
    const made: SpriteBuddySheet = {
      file,
      texture: tex,
      normals: texture(normals, pixelArt),
      frames,
      animations: file.animations.map((a) => a.name),
      editorLight: (animation) =>
        (animation === undefined
          ? file.animations[0]
          : file.animations.find((a) => a.name === animation)
        )?.light ?? null,
      sprite: (parent, animation, spriteOptions = {}) => {
        const node: CocosNode = new cc.Node(
          spriteOptions.name ?? animation ?? made.animations[0] ?? 'SpriteBuddySprite',
        );
        node.layer = parent.layer;
        parent.addChild(node);
        const sprite = node.addComponent(SpriteClass) as SpriteClass;
        sprite.setup(made, animation, spriteOptions);
        return sprite;
      },
    };
    sheetIds.set(made, ++sheets);
    return made;
  }

  async function load(path: string, options: LoadOptions = {}): Promise<SpriteBuddySheet> {
    const bundle = options.bundle ?? cc.resources;
    const json = await loadAsset(bundle, path, cc.JsonAsset);
    const file = parseFile(json.json);
    const wantNormals = file.normals !== null && options.normals !== false;
    const [image, normals] = await Promise.all([
      loadAsset(bundle, siblingPath(path, file.image), cc.ImageAsset),
      wantNormals ? loadAsset(bundle, siblingPath(path, file.normals!), cc.ImageAsset) : null,
    ]);
    return sheet(file, image, normals, options);
  }

  function light(effect: any, settings?: LightSettings | LightDef | null): SpriteBuddyLight {
    if (!effect) throw new Error('sb.light needs the lit effect: see sb.loadEffect()');
    const state: LightState = { ...DEFAULT_LIGHT };
    const materials = new Map<string, any>();

    function apply(material: any): void {
      const u = lightUniforms(state);
      for (const [name, v] of Object.entries(u)) {
        material.setProperty(name, new cc.Vec4(v[0], v[1], v[2], v[3]));
      }
    }

    const made = {
      effect,
      material(s: SpriteBuddySheet, basis: readonly number[]) {
        const key = `${sheetIds.get(s)}|${basis.join(',')}`;
        let material = materials.get(key);
        if (!material) {
          material = new cc.Material();
          material.initialize({ effectAsset: effect });
          material.setProperty('normalMap', s.normals);
          material.setProperty('orient', new cc.Vec4(basis[0], basis[1], basis[2], basis[3]));
          apply(material);
          materials.set(key, material);
        }
        return material;
      },
    } as SpriteBuddyLight;
    for (const key of Object.keys(DEFAULT_LIGHT) as (keyof typeof DEFAULT_LIGHT)[]) {
      Object.defineProperty(made, key, {
        enumerable: true,
        get: () => state[key],
        set: (value: number | string) => {
          state[key] = key === 'color' ? colorNumber(value) : Number(value);
          for (const m of materials.values()) apply(m);
        },
      });
    }
    made.set = function (s) {
      for (const [key, value] of Object.entries(s ?? {})) {
        if (key in DEFAULT_LIGHT && value !== undefined) (made as any)[key] = value;
      }
      return made;
    };
    made.set(settings);
    return made;
  }

  class SpriteClass extends (cc.Component as new () => { node: CocosNode }) {
    sheet!: SpriteBuddySheet;
    player!: Player;
    light: SpriteBuddyLight | null = null;
    onFrame: ((index: number) => void) | null = null;
    onComplete: (() => void) | null = null;
    onEvent: ((name: string, index: number) => void) | null = null;
    autoUpdate = true;
    _parts: CocosNode[] = [];
    _flipX = false;
    _flipY = false;

    /** Called once by `sheet.sprite()`, right after the component is added. */
    setup(sheet: SpriteBuddySheet, animation?: string, options: SpriteOptions = {}): void {
      this.sheet = sheet;
      const light = options.light ?? null;
      if (light && !sheet.normals) {
        throw new Error(
          sheet.file.normals
            ? "The sheet's normal map isn't loaded (load it without { normals: false })"
            : 'This file has no normal map: export it from SpriteBuddy Pro with normal maps on',
        );
      }
      this.light = light;
      this.player = new Player(sheet.file, {
        onFrame: (i) => {
          this.onFrame?.(i);
          this.node.emit('frame', i);
        },
        onComplete: () => {
          this.onComplete?.();
          this.node.emit('complete');
        },
        onEvent: (name, index) => {
          this.onEvent?.(name, index);
          this.node.emit('event', name, index);
          this.node.emit(`event:${name}`, index);
        },
      });
      if (options.speed !== undefined) this.player.speed = options.speed;
      this.autoUpdate = options.autoUpdate !== false;
      const first = animation ?? sheet.animations[0];
      if (first !== undefined) {
        this.player.play(first);
        if (options.autoPlay === false) this.player.stop();
        this.draw();
      }
    }

    get animation(): string | null {
      return this.player.state.animation?.name ?? null;
    }
    get playing(): boolean {
      return this.player.playing;
    }
    get speed(): number {
      return this.player.speed;
    }
    set speed(value: number) {
      this.player.speed = value;
    }
    get flipX(): boolean {
      return this._flipX;
    }
    set flipX(value: boolean) {
      this._flipX = !!value;
      this.draw();
    }
    get flipY(): boolean {
      return this._flipY;
    }
    set flipY(value: boolean) {
      this._flipY = !!value;
      this.draw();
    }
    get parts(): readonly CocosNode[] {
      return this._parts.filter((p) => p.active);
    }

    /** Cocos calls this every frame with the seconds since the last. */
    update(dt: number): void {
      if (this.autoUpdate) this.advance(dt * 1000);
    }

    play(animation: string, time = 0): this {
      this.player.play(animation, time);
      this.draw();
      return this;
    }
    stop(): this {
      this.player.stop();
      return this;
    }
    seek(ms: number): this {
      this.player.seek(ms);
      this.draw();
      return this;
    }
    advance(ms: number): this {
      if (!this.player.playing) return this;
      this.player.update(ms);
      this.draw();
      return this;
    }

    /** Shows one child node per part, each at its place with its frame. */
    draw(): void {
      if (!this.player) return;
      const parts = this.player.parts;
      while (this._parts.length < parts.length) {
        const child: CocosNode = new cc.Node(`part${this._parts.length}`);
        child.layer = this.node.layer;
        child.addComponent(cc.UITransform);
        const sprite = child.addComponent(cc.Sprite);
        // CUSTOM keeps the size set below; trim makes the frame's rect fill it exactly (without it,
        // Cocos would draw the rect inside the whole texture's size).
        sprite.sizeMode = cc.Sprite.SizeMode.CUSTOM;
        sprite.trim = true;
        this.node.addChild(child);
        this._parts.push(child);
      }
      this._parts.forEach((child, i) => {
        const part = parts[i];
        child.active = !!part;
        if (!part) return;
        const at = placePart(part, this._flipX, this._flipY);
        const sprite = child.getComponent(cc.Sprite);
        sprite.spriteFrame = this.sheet.frames[part.index];
        sprite.color = new cc.Color(255, 255, 255, Math.round(part.opacity * 255));
        if (this.light) sprite.customMaterial = this.light.material(this.sheet, normalBasis(at));
        child.getComponent(cc.UITransform).setContentSize(at.width, at.height);
        child.setPosition(at.x, at.y, 0);
        child.setScale(at.scaleX, at.scaleY, 1);
        child.angle = at.angle;
      });
    }
  }
  cc._decorator.ccclass('SpriteBuddySprite')(SpriteClass);

  const made: SpriteBuddyCocos = {
    load,
    sheet,
    light,
    loadEffect: (path = EFFECT_PATH, bundle = cc.resources) =>
      loadAsset(bundle, path, cc.EffectAsset),
    Sprite: SpriteClass as unknown as new () => SpriteBuddySprite,
  };
  bound.set(cc, made);
  return made;
}
