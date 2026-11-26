import { parseFile, Player, type LightDef, type SpriteBuddyFile } from '@spritebuddy/core';
import { createLight, type LightSettings, type SpriteBuddyLight } from './light.js';
import { mirroredNormalMap } from './normals.js';
import type { PhaserNamespace, PhaserScene } from './phaser-types.js';

export type { PhaserNamespace, PhaserScene } from './phaser-types.js';
export {
  DEFAULT_LIGHT,
  lightDirection,
  SUN_DISTANCE,
  type LightSettings,
  type SpriteBuddyLight,
} from './light.js';

/* eslint-disable @typescript-eslint/no-explicit-any */

export interface LoadOptions {
  /** Load the file's normal map too, when it has one. Defaults to true. */
  readonly normals?: boolean;
}

export interface SheetOptions {
  /** Nearest-neighbour sampling, so pixel art stays crisp when scaled. Defaults to true. */
  readonly pixelArt?: boolean;
  /**
   * The runtime file (parsed or raw), when it isn't in the scene's JSON cache under the
   * texture's key (where `this.load.spritebuddy` puts it).
   */
  readonly file?: SpriteBuddyFile | unknown;
}

export interface SpriteOptions {
  /** Starts playing at once. Defaults to true. */
  readonly autoPlay?: boolean;
  /** Moves on with the scene's clock. Defaults to true; turn off to call `advance` yourself. */
  readonly autoUpdate?: boolean;
  /** Playback rate: 1 is normal. */
  readonly speed?: number;
  /**
   * Lights the sprite with the scene's lights through the sheet's normal map (Phaser's
   * `Light2D` pipeline in Phaser 3, `setLighting(true)` in Phaser 4). Turn the lights on with
   * `sb.light(scene, ...)` or `scene.lights.enable()`.
   */
  readonly lit?: boolean;
}

/** A runtime file whose frames have been added to its Phaser texture. */
export interface SpriteBuddySheet {
  readonly file: SpriteBuddyFile;
  /** The texture's key. */
  readonly key: string;
  /** The Phaser texture. Its frames are named as in the file (rotated frames are stored turned). */
  readonly texture: any;
  /** Animation names, in file order. */
  readonly animations: readonly string[];
  /** Whether the texture has its normal map, so sprites can be lit. */
  readonly hasNormals: boolean;
  /**
   * The light SpriteBuddy Pro lit `animation` with (default: the first one), or null. Pass it to
   * `sb.light()` to light the game like the editor's preview did.
   */
  editorLight(animation?: string): LightDef | null;
  /** A new animated sprite in `scene`, playing `animation` (default: the first one). */
  sprite(
    scene: PhaserScene,
    x: number,
    y: number,
    animation?: string,
    options?: SpriteOptions,
  ): SpriteBuddySprite;
}

/**
 * An animated sprite: a Phaser Container whose origin is where the character stands (the frame
 * pivot). It draws the current frame and its layers as child Images.
 */
export interface SpriteBuddySprite {
  readonly sheet: SpriteBuddySheet;
  readonly player: Player;
  /** The animation playing (or last played). */
  readonly animation: string | null;
  readonly playing: boolean;
  /** Whether the sprite is lit by the scene's lights. */
  readonly lit: boolean;
  speed: number;
  /**
   * Mirrors the sprite about its origin. Use these rather than a negative scale on lit sprites:
   * Phaser's lights don't see a negative scale, so the light would come from the wrong side.
   */
  flipX: boolean;
  flipY: boolean;
  setFlipX(value: boolean): this;
  setFlipY(value: boolean): this;
  /** Called with the frame index each time the frame changes. The sprite also emits `"frame"`. */
  onFrame: ((index: number) => void) | null;
  /** Called when a `once` animation ends. The sprite also emits `"complete"`. */
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
  /** Moves time on by `ms` and redraws (called for you each frame while `autoUpdate` is on). */
  advance(ms: number): this;
  autoUpdate: boolean;
  destroy(fromScene?: boolean): void;
  // Container members games use, typed loosely so any Phaser version fits.
  x: number;
  y: number;
  readonly list: readonly any[];
  setPosition(x: number, y?: number): this;
  setScale(x: number, y?: number): this;
  setDepth(depth: number): this;
  on(event: string, listener: (...args: any[]) => void, context?: unknown): this;
  off(event: string, listener?: (...args: any[]) => void, context?: unknown): this;
}

/** What `spriteBuddy(Phaser)` returns. */
export interface SpriteBuddyPhaser {
  /**
   * Queues a runtime file, its sheet and its normal map on a scene's loader: the same as
   * `this.load.spritebuddy(key, url)`. The texture and the JSON are both stored under `key`.
   */
  load(scene: PhaserScene, key: string, url: string, options?: LoadOptions): void;
  /** The sheet for a loaded texture, adding the file's frames to it the first time. */
  sheet(scene: PhaserScene, key: string, options?: SheetOptions): SpriteBuddySheet;
  /**
   * A new sprite in `scene`: the same as `this.add.spritebuddy(x, y, key, animation, options)`.
   * It is added to the scene's display list.
   */
  add(
    scene: PhaserScene,
    x: number,
    y: number,
    key: string,
    animation?: string,
    options?: SpriteOptions,
  ): SpriteBuddySprite;
  /**
   * A Phaser light that takes SpriteBuddy's settings (and turns the scene's lights on). Unset
   * settings are SpriteBuddy Pro's defaults; `sb.light(scene, sheet.editorLight('walk'))` uses the
   * editor's.
   */
  light(scene: PhaserScene, settings?: LightSettings | LightDef | null): SpriteBuddyLight;
  /** Major Phaser version: 3 or 4. */
  readonly version: number;
}

const isFile = (v: unknown): v is SpriteBuddyFile =>
  typeof v === 'object' && v !== null && 'animations' in v && 'width' in v && !('format' in v);

/** The image's URL next to the runtime file's. */
export function siblingUrl(fileUrl: string, image: string): string {
  if (/^([a-z][a-z0-9+.-]*:|\/)/i.test(image)) return image;
  return fileUrl.replace(/[?#].*$/, '').replace(/[^/]*$/, '') + image;
}

/** Where a part's image goes, and how Phaser should flip and turn it. */
export interface Placement {
  readonly x: number;
  readonly y: number;
  /** Degrees: -90 turns a rotated frame back upright. */
  readonly angle: number;
  /** Phaser's flips, in the image's own (stored) axes. */
  readonly flipX: boolean;
  readonly flipY: boolean;
}

/**
 * Places one part as a Phaser Image with origin (0, 0), inside a sprite whose origin is the
 * pivot. A rotated frame is stored turned 90° clockwise, so its image is turned back by -90°
 * about its top-left, and an upright flip in x is a flip of the stored image in y.
 */
export function placePart(
  part: {
    readonly frame: SpriteBuddyFile['frames'][number];
    readonly x: number;
    readonly y: number;
    readonly flipX: boolean;
    readonly flipY: boolean;
  },
  spriteFlipX = false,
  spriteFlipY = false,
): Placement {
  const f = part.frame;
  const tx = f.trim?.x ?? 0;
  const ty = f.trim?.y ?? 0;
  const { w, h } = f.rect;
  let left = part.x + (part.flipX ? f.width - tx - w : tx);
  let top = part.y + (part.flipY ? f.height - ty - h : ty);
  if (spriteFlipX) left = -(left + w);
  if (spriteFlipY) top = -(top + h);
  const flipX = part.flipX !== spriteFlipX;
  const flipY = part.flipY !== spriteFlipY;
  return f.rotated
    ? { x: left, y: top + h, angle: -90, flipX: flipY, flipY: flipX }
    : { x: left, y: top, angle: 0, flipX, flipY };
}

/**
 * Binds SpriteBuddy to your Phaser: `const sb = spriteBuddy(Phaser)`. It also adds
 * `this.load.spritebuddy(key, url)` to every scene's loader and `this.add.spritebuddy(x, y, key,
 * animation)` to every scene's game object factory.
 */
export function spriteBuddy(Phaser: PhaserNamespace): SpriteBuddyPhaser {
  const version = parseInt(Phaser.VERSION, 10) >= 4 ? 4 : 3;
  const NEAREST = Phaser.Textures.FilterMode.NEAREST;

  function load(scene: PhaserScene, key: string, url: string, options?: LoadOptions): void {
    queue(scene.load, key, url, options);
  }

  /** Queues the JSON, then the images it names once it has loaded. */
  function queue(loader: any, key: string, url: string, options: LoadOptions = {}): void {
    // Images are found next to the JSON as the loader saw it: same path prefix, same base URL.
    const path = loader.path;
    loader.once(`filecomplete-json-${key}`, (_key: string, _type: string, data: unknown) => {
      const file = parseFile(data);
      const image = siblingUrl(url, file.image);
      const normals =
        file.normals && options.normals !== false ? siblingUrl(url, file.normals) : null;
      const later = loader.path;
      loader.path = path;
      loader.image(key, normals ? [image, normals] : image);
      loader.path = later;
    });
    loader.json(key, url);
  }

  const sheets = new WeakMap<object, SpriteBuddySheet>();
  /** Sheets drawn with nearest-neighbour sampling. */
  const crisp = new WeakMap<SpriteBuddySheet, boolean>();

  function sheet(scene: PhaserScene, key: string, options: SheetOptions = {}): SpriteBuddySheet {
    if (!scene.textures.exists(key)) {
      throw new Error(`No texture "${key}": load it with this.load.spritebuddy('${key}', url)`);
    }
    const texture = scene.textures.get(key);
    const known = sheets.get(texture);
    if (known) return known;
    let raw = options.file;
    if (raw === undefined) {
      if (!scene.cache.json.exists(key)) {
        throw new Error(`No runtime file "${key}" in the JSON cache: pass it as { file }`);
      }
      raw = scene.cache.json.get(key);
    }
    const file = isFile(raw) ? raw : parseFile(raw);
    addFrames(texture, file);
    if (options.pixelArt !== false) texture.setFilter(NEAREST);
    const made: SpriteBuddySheet = {
      file,
      key,
      texture,
      animations: file.animations.map((a) => a.name),
      hasNormals: texture.dataSource.length > 0,
      editorLight: (animation) =>
        (animation === undefined
          ? file.animations[0]
          : file.animations.find((a) => a.name === animation)
        )?.light ?? null,
      sprite: (s, x, y, animation, spriteOptions) =>
        new SpriteClass(s, x, y, made, animation, spriteOptions),
    };
    sheets.set(texture, made);
    crisp.set(made, options.pixelArt !== false);
    return made;
  }

  /** Adds one Phaser frame per file frame: the pixels as stored on the sheet. */
  function addFrames(texture: any, file: SpriteBuddyFile): void {
    for (const f of file.frames) {
      if (texture.has(f.name)) texture.remove?.(f.name);
      const { x, y, w, h } = f.rect;
      if (f.rotated) texture.add(f.name, 0, x, y, h, w);
      else texture.add(f.name, 0, x, y, w, h);
    }
  }

  /**
   * The texture a lit part is drawn from: the sheet's own, or (for a flip) a copy sharing its
   * image whose normal map is mirrored to match. Made once per sheet and flip.
   */
  function litTexture(scene: PhaserScene, s: SpriteBuddySheet, flipX: boolean, flipY: boolean) {
    if (!flipX && !flipY) return s.key;
    const key = `${s.key}#spritebuddy-${flipX ? 'x' : ''}${flipY ? 'y' : ''}`;
    const textures = scene.textures;
    if (!textures.exists(key)) {
      const normals = mirroredNormalMap(s.texture.dataSource[0].image, flipX, flipY);
      const copy = textures.addImage(key, s.texture.source[0].image, normals);
      addFrames(copy, s.file);
      if (crisp.get(s)) copy.setFilter(NEAREST);
    }
    return key;
  }

  const Container = Phaser.GameObjects.Container as new (
    scene: PhaserScene,
    x: number,
    y: number,
  ) => {
    scene: PhaserScene;
    add(child: unknown): unknown;
    emit(event: string, ...args: unknown[]): boolean;
    addToUpdateList(): void;
    removeFromUpdateList(): void;
    destroy(fromScene?: boolean): void;
    on(event: string, listener: (...args: any[]) => void, context?: unknown): any;
    off(event: string, listener?: (...args: any[]) => void, context?: unknown): any;
    setPosition(x: number, y?: number): any;
    setScale(x: number, y?: number): any;
    setDepth(depth: number): any;
    x: number;
    y: number;
    readonly list: any[];
  };

  class SpriteClass extends Container {
    readonly sheet: SpriteBuddySheet;
    readonly player: Player;
    readonly lit: boolean;
    onFrame: ((index: number) => void) | null = null;
    onComplete: (() => void) | null = null;
    onEvent: ((name: string, index: number) => void) | null = null;
    #pool: any[] = [];
    #auto = false;
    #flipX = false;
    #flipY = false;

    constructor(
      scene: PhaserScene,
      x: number,
      y: number,
      sheet: SpriteBuddySheet,
      animation?: string,
      options: SpriteOptions = {},
    ) {
      super(scene, x, y);
      this.sheet = sheet;
      this.lit = options.lit === true;
      if (this.lit && !sheet.hasNormals) {
        throw new Error(
          sheet.file.normals
            ? "The sheet's normal map isn't loaded (load it without { normals: false })"
            : 'This file has no normal map: export it from SpriteBuddy Pro with normal maps on',
        );
      }
      this.player = new Player(sheet.file, {
        onFrame: (i) => {
          this.onFrame?.(i);
          this.emit('frame', i);
        },
        onComplete: () => {
          this.onComplete?.();
          this.emit('complete');
        },
        onEvent: (name, index) => {
          this.onEvent?.(name, index);
          this.emit('event', name, index);
          this.emit(`event:${name}`, index);
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

    get flipX(): boolean {
      return this.#flipX;
    }
    set flipX(value: boolean) {
      this.#flipX = !!value;
      this.#draw();
    }
    get flipY(): boolean {
      return this.#flipY;
    }
    set flipY(value: boolean) {
      this.#flipY = !!value;
      this.#draw();
    }
    setFlipX(value: boolean): this {
      this.flipX = value;
      return this;
    }
    setFlipY(value: boolean): this {
      this.flipY = value;
      return this;
    }

    get autoUpdate(): boolean {
      return this.#auto;
    }
    set autoUpdate(on: boolean) {
      if (on === this.#auto) return;
      this.#auto = on;
      if (on) this.addToUpdateList();
      else this.removeFromUpdateList();
    }

    /** Phaser calls this every frame for objects on the scene's update list. */
    preUpdate(_time: number, delta: number): void {
      this.advance(delta);
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
    advance(ms: number): this {
      if (!this.player.playing) return this;
      this.player.update(ms);
      this.#draw();
      return this;
    }

    override destroy(fromScene?: boolean): void {
      this.autoUpdate = false;
      super.destroy(fromScene);
    }

    /** Puts one child Image per part where the part's full frame belongs. */
    #draw(): void {
      const parts = this.player.parts;
      const scene = this.scene;
      while (this.#pool.length < parts.length) {
        const image = new Phaser.GameObjects.Image(scene, 0, 0, this.sheet.key);
        image.setOrigin(0, 0);
        if (this.lit) {
          if (version === 4) image.setLighting(true);
          else image.setPipeline('Light2D');
        }
        this.#pool.push(image);
        this.add(image);
      }
      this.#pool.forEach((image, i) => {
        const part = parts[i];
        image.setVisible(!!part);
        if (!part) return;
        const at = placePart(part, this.#flipX, this.#flipY);
        const key = this.lit ? litTexture(scene, this.sheet, at.flipX, at.flipY) : this.sheet.key;
        image.setTexture(key, part.frame.name);
        image.setOrigin(0, 0);
        image.setAlpha(part.opacity);
        image.setFlip(at.flipX, at.flipY);
        image.setAngle(at.angle);
        image.setPosition(at.x, at.y);
      });
    }
  }

  function add(
    scene: PhaserScene,
    x: number,
    y: number,
    key: string,
    animation?: string,
    options?: SpriteOptions,
  ): SpriteBuddySprite {
    const sprite = sheet(scene, key).sprite(scene, x, y, animation, options);
    scene.sys.displayList.add(sprite);
    return sprite;
  }

  // `this.load.spritebuddy(...)` and `this.add.spritebuddy(...)`, Phaser's own way.
  Phaser.Loader.LoaderPlugin.prototype.spritebuddy = function (
    key: string,
    url: string,
    options?: LoadOptions,
  ) {
    queue(this, key, url, options);
    return this;
  };
  Phaser.GameObjects.GameObjectFactory.register(
    'spritebuddy',
    function (
      this: { scene: PhaserScene },
      x: number,
      y: number,
      key: string,
      animation?: string,
      options?: SpriteOptions,
    ) {
      return add(this.scene, x, y, key, animation, options);
    },
  );

  return {
    version,
    load,
    sheet,
    add,
    light: (scene, settings) => createLight(scene, settings),
  };
}
