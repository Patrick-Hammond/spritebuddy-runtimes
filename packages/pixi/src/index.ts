import { FORMAT, parseFile, Player, type FrameDef, type SpriteBuddyFile } from '@spritebuddy/core';
import type { PixiNamespace, PixiTexture } from './pixi-types.js';

export type { PixiNamespace } from './pixi-types.js';

export interface SheetOptions {
  /** Nearest-neighbour sampling, so pixel art stays crisp when scaled. Defaults to true. */
  readonly pixelArt?: boolean;
}

export interface SpriteOptions {
  /** Starts playing at once. Defaults to true. */
  readonly autoPlay?: boolean;
  /** Moves on with PixiJS's shared ticker. Defaults to true; turn off to call `update` yourself. */
  readonly autoUpdate?: boolean;
  /** Playback rate: 1 is normal. */
  readonly speed?: number;
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
  readonly playing: boolean;
  speed: number;
  /** Called with the frame index each time the frame changes. */
  onFrame: ((index: number) => void) | null;
  /** Called when a `once` animation ends. */
  onComplete: (() => void) | null;
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

  function makeSheet(
    raw: unknown,
    image: PixiTexture,
    options: SheetOptions = {},
  ): SpriteBuddySheet {
    const file = isFile(raw) ? raw : parseFile(raw);
    if (options.pixelArt !== false) setNearest(image);
    const base = baseOf(image);
    const textures = file.frames.map((f) => frameTexture(base, f));
    const sheet: SpriteBuddySheet = {
      file,
      textures,
      animations: file.animations.map((a) => a.name),
      texture: (name) => textures[file.frames.findIndex((f) => f.name === name)],
      sprite: (animation, spriteOptions) => new SpriteClass(sheet, animation, spriteOptions),
      destroy() {
        for (const t of textures) t.destroy(false);
        image.destroy(true);
      },
    };
    return sheet;
  }

  const Container = PIXI.Container as new () => {
    addChild(child: unknown): unknown;
    destroy(options?: unknown): void;
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
    #pool: PixiSprite[] = [];
    #auto = false;
    #tick = () => this.update(PIXI.Ticker.shared.deltaMS);

    constructor(sheet: SpriteBuddySheet, animation?: string, options: SpriteOptions = {}) {
      super();
      this.sheet = sheet;
      this.player = new Player(sheet.file, {
        onFrame: (i) => this.onFrame?.(i),
        onComplete: () => this.onComplete?.(),
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

    /** Puts one child sprite per part where the part's full frame belongs. */
    #draw(): void {
      const parts = this.player.parts;
      while (this.#pool.length < parts.length) {
        const s = new PIXI.Sprite(PIXI.Texture.EMPTY) as PixiSprite;
        this.#pool.push(s);
        this.addChild(s);
      }
      this.#pool.forEach((s, i) => {
        const part = parts[i];
        s.visible = !!part;
        if (!part) return;
        s.texture = this.sheet.textures[part.index]!;
        s.alpha = part.opacity;
        s.scale.x = part.flipX ? -1 : 1;
        s.scale.y = part.flipY ? -1 : 1;
        s.x = part.x + (part.flipX ? part.frame.width : 0);
        s.y = part.y + (part.flipY ? part.frame.height : 0);
      });
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
    async load(url, options) {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`Couldn't load ${url}: ${response.status}`);
      const file = parseFile(await response.json());
      return makeSheet(file, await loadImage(siblingUrl(url, file.image)), options);
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
        const image = await loader.load(siblingUrl(resolved?.src ?? '', file.image));
        return makeSheet(file, image);
      },
      async unload(sheet: SpriteBuddySheet) {
        sheet.destroy();
      },
    },
  };
}
