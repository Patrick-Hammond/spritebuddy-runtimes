import {
  FORMAT,
  parseFile,
  Player,
  type FrameDef,
  type LightDef,
  type SpriteBuddyFile,
} from '@spritebuddy/core';
import {
  createLight,
  createLitPart,
  lightInternals,
  type LightSettings,
  type LitPart,
  type SpriteBuddyLight,
} from './lit.js';
import type { PixiNamespace, PixiTexture } from './pixi-types.js';

export type { PixiNamespace } from './pixi-types.js';
export { DEFAULT_LIGHT, lightDirection, type LightSettings, type SpriteBuddyLight } from './lit.js';

export interface SheetOptions {
  /** Nearest-neighbour sampling, so pixel art stays crisp when scaled. Defaults to true. */
  readonly pixelArt?: boolean;
  /**
   * The normal map, for `sheet()`: an already loaded texture of the file's `normals` image. `load()`
   * and the Assets parser load it for you.
   */
  readonly normalMap?: PixiTexture;
  /** `load()` and the Assets parser: load the file's normal map when it has one. Defaults to true. */
  readonly normals?: boolean;
}

export interface SpriteOptions {
  /** Starts playing at once. Defaults to true. */
  readonly autoPlay?: boolean;
  /** Moves on with PixiJS's shared ticker. Defaults to true; turn off to call `update` yourself. */
  readonly autoUpdate?: boolean;
  /** Playback rate: 1 is normal. */
  readonly speed?: number;
  /**
   * PixiJS 8 with the WebGL renderer: lights the sprite in real time with its normal map, made
   * by `sb.light()`. The sheet needs its normal map loaded.
   */
  readonly light?: SpriteBuddyLight;
}

/** A loaded runtime file: one PixiJS texture per frame, ready to make sprites from. */
export interface SpriteBuddySheet {
  readonly file: SpriteBuddyFile;
  /** One texture per frame, in file order. */
  readonly textures: readonly PixiTexture[];
  /** Animation names, in file order. */
  readonly animations: readonly string[];
  /** The texture of the frame called `name`. */
  texture(name: string): PixiTexture | undefined;
  /**
   * One normal-map texture per frame, cut exactly like {@link textures}, or null when the file
   * has no normal map (or it wasn't loaded). Hand them to your lighting shader or filter.
   */
  readonly normalTextures: readonly PixiTexture[] | null;
  /** The normal-map texture of the frame called `name`. */
  normalTexture(name: string): PixiTexture | undefined;
  /**
   * The light SpriteBuddy Pro lit `animation` with (default: the first one), or null. Pass it to
   * `sb.light()` to light the game the way the editor's preview did.
   */
  editorLight(animation?: string): LightDef | null;
  /** A new animated sprite, playing `animation` (default: the first one). */
  sprite(animation?: string, options?: SpriteOptions): SpriteBuddySprite;
  /** Destroys the frame textures and the sheet image. */
  destroy(): void;
}

/**
 * An animated sprite: a container whose origin is where the character stands (the frame pivot).
 * It draws the current frame and its layers as child sprites.
 */
export interface SpriteBuddySprite {
  readonly sheet: SpriteBuddySheet;
  readonly player: Player;
  /** The animation playing (or last played). */
  readonly animation: string | null;
  /** The light the sprite is lit by, or null when it isn't lit. */
  readonly light: SpriteBuddyLight | null;
  readonly playing: boolean;
  speed: number;
  /** Called with the frame index each time the frame changes. */
  onFrame: ((index: number) => void) | null;
  /** Called when a `once` animation ends. */
  onComplete: (() => void) | null;
  /**
   * Called for each frame event (such as `"hit"`) as its frame starts showing, with the frame's
   * index in the animation. The sprite also emits `"event"` (name, index) and `"event:<name>"`
   * (index), so `sprite.on('event:hit', ...)` works too.
   */
  onEvent: ((name: string, index: number) => void) | null;
  play(animation: string, time?: number): this;
  stop(): this;
  /** Jumps to `ms` into the animation. */
  seek(ms: number): this;
  /** Moves time on by `ms` and redraws (called for you while `autoUpdate` is on). */
  update(ms: number): this;
  autoUpdate: boolean;
  destroy(options?: unknown): void;
  // Container members used by games, typed loosely so any PixiJS version fits.
  x: number;
  y: number;
  readonly children: readonly unknown[];
  /** PixiJS's event emitter, typed loosely so any PixiJS version fits. */
  on(event: string, listener: (...args: any[]) => void, context?: unknown): this;
  off(event: string, listener?: (...args: any[]) => void, context?: unknown): this;
}

/** What `spriteBuddy(PIXI)` returns. */
export interface SpriteBuddyPixi {
  /** Loads a runtime file and its image. Works in every supported PixiJS version. */
  load(url: string, options?: SheetOptions): Promise<SpriteBuddySheet>;
  /** Makes a sheet from a parsed (or raw) runtime file and its already loaded image. */
  sheet(
    file: SpriteBuddyFile | unknown,
    image: PixiTexture,
    options?: SheetOptions,
  ): SpriteBuddySheet;
  /**
   * PixiJS 7 and 8: an Assets loader extension, so `Assets.load('hero.anims.json')` resolves to
   * a {@link SpriteBuddySheet}. Add it once with `extensions.add(sb.assetsParser)`.
   */
  readonly assetsParser: object;
  /**
   * PixiJS 8: a directional light for `sheet.sprite(name, { light })`. Unset settings are
   * SpriteBuddy Pro's defaults; `sb.light(sheet.editorLight('walk'))` uses the editor's.
   */
  light(settings?: LightSettings | LightDef | null): SpriteBuddyLight;
  /** Major PixiJS version detected: 5 or 6 (one code path), 7 or 8. */
  readonly version: number;
}

const isFile = (v: unknown): v is SpriteBuddyFile =>
  typeof v === 'object' && v !== null && 'animations' in v && 'width' in v && !('format' in v);

/** The image's URL next to the runtime file's. */
export function siblingUrl(fileUrl: string, image: string): string {
  if (/^([a-z][a-z0-9+.-]*:|\/)/i.test(image)) return image;
  return fileUrl.replace(/[?#].*$/, '').replace(/[^/]*$/, '') + image;
}

/**
 * Binds SpriteBuddy to your PixiJS: `const sb = spriteBuddy(PIXI)`. Passing the namespace in
 * (rather than importing `pixi.js` here) lets one package serve PixiJS 5 through 8.
 */
export function spriteBuddy(PIXI: PixiNamespace): SpriteBuddyPixi {
  const v8 = typeof PIXI.TextureSource === 'function';
  const version = v8 ? 8 : typeof PIXI.Assets === 'object' ? 7 : 6;

  const baseOf = (texture: PixiTexture) => (v8 ? texture.source : texture.baseTexture);

  function setNearest(texture: PixiTexture): void {
    const base = baseOf(texture) as { scaleMode: unknown } | undefined;
    if (!base) return;
    base.scaleMode = v8 ? 'nearest' : (PIXI.SCALE_MODES?.NEAREST ?? 0);
  }

  function frameTexture(base: unknown, f: FrameDef): PixiTexture {
    const R = PIXI.Rectangle;
    const { x, y, w, h } = f.rect;
    const frame = f.rotated ? new R(x, y, h, w) : new R(x, y, w, h);
    const orig = new R(0, 0, f.width, f.height);
    const trim = f.trim ? new R(f.trim.x, f.trim.y, w, h) : undefined;
    // TexturePacker's "rotated" (90° clockwise on the sheet) is PixiJS's groupD8 rotation 2.
    const rotate = f.rotated ? 2 : 0;
    return v8
      ? new PIXI.Texture({ source: base, frame, orig, trim, rotate, label: f.name })
      : new PIXI.Texture(base, frame, orig, trim, rotate);
  }

  /** Each sheet's images, for lit sprites (looked up by its texture list). */
  const images = new WeakMap<object, { image: PixiTexture; normalMap?: PixiTexture }>();

  function makeSheet(
    raw: unknown,
    image: PixiTexture,
    options: SheetOptions = {},
  ): SpriteBuddySheet {
    const file = isFile(raw) ? raw : parseFile(raw);
    if (options.pixelArt !== false) setNearest(image);
    const base = baseOf(image);
    const textures = file.frames.map((f) => frameTexture(base, f));
    const normalMap = options.normalMap;
    if (normalMap && options.pixelArt !== false) setNearest(normalMap);
    const normalBase = normalMap && baseOf(normalMap);
    const normalTextures = normalMap ? file.frames.map((f) => frameTexture(normalBase, f)) : null;
    const indexOf = (name: string) => file.frames.findIndex((f) => f.name === name);
    images.set(textures, { image, normalMap });
    const sheet: SpriteBuddySheet = {
      file,
      textures,
      normalTextures,
      animations: file.animations.map((a) => a.name),
      texture: (name) => textures[indexOf(name)],
      normalTexture: (name) => normalTextures?.[indexOf(name)],
      editorLight: (animation) =>
        (animation === undefined
          ? file.animations[0]
          : file.animations.find((a) => a.name === animation)
        )?.light ?? null,
      sprite: (animation, spriteOptions) => new SpriteClass(sheet, animation, spriteOptions),
      destroy() {
        for (const t of textures) t.destroy(false);
        for (const t of normalTextures ?? []) t.destroy(false);
        image.destroy(true);
        normalMap?.destroy(true);
      },
    };
    return sheet;
  }

  const Container = PIXI.Container as new () => {
    addChild(child: unknown): unknown;
    destroy(options?: unknown): void;
    emit?(event: string, ...args: unknown[]): boolean;
    on(event: string, listener: (...args: any[]) => void, context?: unknown): any;
    off(event: string, listener?: (...args: any[]) => void, context?: unknown): any;
    x: number;
    y: number;
    readonly children: unknown[];
  };

  interface PixiSprite {
    texture: PixiTexture;
    x: number;
    y: number;
    alpha: number;
    visible: boolean;
    scale: { x: number; y: number };
  }

  class SpriteClass extends Container {
    readonly sheet: SpriteBuddySheet;
    readonly player: Player;
    onFrame: ((index: number) => void) | null = null;
    onComplete: (() => void) | null = null;
    onEvent: ((name: string, index: number) => void) | null = null;
    readonly light: SpriteBuddyLight | null;
    #pool: PixiSprite[] = [];
    #lit: LitPart[] = [];
    #auto = false;
    #tick = () => this.update(PIXI.Ticker.shared.deltaMS);

    constructor(sheet: SpriteBuddySheet, animation?: string, options: SpriteOptions = {}) {
      super();
      this.sheet = sheet;
      this.light = options.light ?? null;
      if (this.light) checkLit(sheet, this.light);
      this.player = new Player(sheet.file, {
        onFrame: (i) => this.onFrame?.(i),
        onComplete: () => this.onComplete?.(),
        onEvent: (name, index) => {
          this.onEvent?.(name, index);
          this.emit?.('event', name, index);
          this.emit?.(`event:${name}`, index);
        },
      });
      if (options.speed !== undefined) this.player.speed = options.speed;
      const first = animation ?? sheet.animations[0];
      if (first !== undefined) {
        this.player.play(first);
        if (options.autoPlay === false) this.player.stop();
        this.#draw();
      }
      this.autoUpdate = options.autoUpdate !== false;
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

    get autoUpdate(): boolean {
      return this.#auto;
    }
    set autoUpdate(on: boolean) {
      if (on === this.#auto) return;
      this.#auto = on;
      if (on) PIXI.Ticker.shared.add(this.#tick);
      else PIXI.Ticker.shared.remove(this.#tick);
    }

    play(animation: string, time = 0): this {
      this.player.play(animation, time);
      this.#draw();
      return this;
    }
    stop(): this {
      this.player.stop();
      return this;
    }
    seek(ms: number): this {
      this.player.seek(ms);
      this.#draw();
      return this;
    }
    update(ms: number): this {
      if (!this.player.playing) return this;
      this.player.update(ms);
      this.#draw();
      return this;
    }

    override destroy(options?: unknown): void {
      this.autoUpdate = false;
      super.destroy(options);
    }

    /** Puts one child sprite (or lit mesh) per part where the part's full frame belongs. */
    #draw(): void {
      const parts = this.player.parts;
      while (this.#pool.length < parts.length) {
        let s: PixiSprite;
        if (this.light) {
          const { image, normalMap } = images.get(this.sheet.textures)!;
          const lit = createLitPart(PIXI, image, normalMap!, lightInternals(this.light)!);
          this.#lit.push(lit);
          s = lit.mesh;
        } else {
          s = new PIXI.Sprite(PIXI.Texture.EMPTY) as PixiSprite;
        }
        this.#pool.push(s);
        this.addChild(s);
      }
      this.#pool.forEach((s, i) => {
        const part = parts[i];
        s.visible = !!part;
        if (!part) return;
        const texture = this.sheet.textures[part.index]!;
        if (this.light) {
          this.#lit[i]!.setFrame(texture, this.sheet.file.frames[part.index]!.rotated);
        } else {
          s.texture = texture;
        }
        s.alpha = part.opacity;
        s.scale.x = part.flipX ? -1 : 1;
        s.scale.y = part.flipY ? -1 : 1;
        s.x = part.x + (part.flipX ? part.frame.width : 0);
        s.y = part.y + (part.flipY ? part.frame.height : 0);
      });
    }
  }

  function checkLit(sheet: SpriteBuddySheet, light: SpriteBuddyLight): void {
    if (!v8) throw new Error('Lit sprites need PixiJS 8');
    if (!lightInternals(light)) throw new Error('Make the light with sb.light()');
    if (!images.get(sheet.textures)?.normalMap) {
      throw new Error(
        sheet.file.normals
          ? "The sheet's normal map isn't loaded (load it without { normals: false })"
          : 'This file has no normal map: export it from SpriteBuddy Pro with normal maps on',
      );
    }
  }

  async function loadImage(url: string): Promise<PixiTexture> {
    if (PIXI.Assets) return PIXI.Assets.load(url);
    return PIXI.Texture.fromURL!(url);
  }

  const LOAD_PARSER = PIXI.ExtensionType?.LoadParser ?? 'load-parser';

  return {
    version,
    sheet: makeSheet,
    light(settings) {
      if (!v8) throw new Error('Lights need PixiJS 8');
      return createLight(PIXI, settings);
    },
    async load(url, options) {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`Couldn't load ${url}: ${response.status}`);
      const file = parseFile(await response.json());
      const [image, normalMap] = await Promise.all([
        loadImage(siblingUrl(url, file.image)),
        file.normals && options?.normals !== false
          ? loadImage(siblingUrl(url, file.normals))
          : undefined,
      ]);
      return makeSheet(file, image, { ...options, normalMap });
    },
    assetsParser: {
      name: 'spritebuddy',
      // Before PixiJS's own spritesheet parser, which would take any JSON with `frames`.
      extension: { type: LOAD_PARSER, priority: 2, name: 'spritebuddy' },
      async testParse(asset: unknown) {
        return (
          typeof asset === 'object' &&
          asset !== null &&
          (asset as { format?: unknown }).format === FORMAT
        );
      },
      async parse(
        asset: unknown,
        resolved: { src?: string } | undefined,
        loader: { load(url: string): Promise<PixiTexture> },
      ) {
        const file = parseFile(asset);
        const src = resolved?.src ?? '';
        const [image, normalMap] = await Promise.all([
          loader.load(siblingUrl(src, file.image)),
          file.normals ? loader.load(siblingUrl(src, file.normals)) : undefined,
        ]);
        return makeSheet(file, image, { normalMap });
      },
      async unload(sheet: SpriteBuddySheet) {
        sheet.destroy();
      },
    },
  };
}
