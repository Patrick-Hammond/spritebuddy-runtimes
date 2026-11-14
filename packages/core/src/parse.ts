import {
  FORMAT,
  VERSION,
  type AnimationDef,
  type AnimationFrameDef,
  type FrameDef,
  type LayerDef,
  type LightDef,
  type LoopMode,
  type SpriteBuddyFile,
} from './types.js';

/** Thrown for a file that isn't a readable SpriteBuddy runtime file; `path` says where. */
export class FormatError extends Error {
  constructor(
    message: string,
    readonly path: string,
  ) {
    super(path ? `${path}: ${message}` : message);
    this.name = 'FormatError';
  }
}

/** Default display time of a frame when neither it nor its animation says, in ms. */
export const DEFAULT_DURATION = 100;

type Json = Record<string, unknown>;

const isObject = (v: unknown): v is Json =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

function object(v: unknown, path: string): Json {
  if (!isObject(v)) throw new FormatError('expected an object', path);
  return v;
}

function array(v: unknown, path: string): unknown[] {
  if (!Array.isArray(v)) throw new FormatError('expected a list', path);
  return v;
}

function string(v: unknown, path: string): string {
  if (typeof v !== 'string' || v === '') throw new FormatError('expected a non-empty string', path);
  return v;
}

function int(v: unknown, path: string, min = -Infinity): number {
  if (typeof v !== 'number' || !Number.isInteger(v) || v < min) {
    throw new FormatError(
      min > -Infinity ? `expected a whole number ≥ ${min}` : 'expected a whole number',
      path,
    );
  }
  return v;
}

function number(v: unknown, path: string, min: number, max: number): number {
  if (typeof v !== 'number' || !Number.isFinite(v) || v < min || v > max) {
    throw new FormatError(`expected a number from ${min} to ${max}`, path);
  }
  return v;
}

function bool(v: unknown, path: string): boolean {
  if (typeof v !== 'boolean') throw new FormatError('expected true or false', path);
  return v;
}

/** A list of whole numbers of a fixed length, such as `[x, y]`. */
function ints(v: unknown, path: string, length: number, min: number[]): number[] {
  const list = array(v, path);
  if (list.length !== length) throw new FormatError(`expected ${length} numbers`, path);
  return list.map((n, i) => int(n, `${path}[${i}]`, min[i]));
}

const opt = <T>(v: unknown, fallback: T, read: (v: unknown) => T): T =>
  v === undefined ? fallback : read(v);

function frameDef(v: unknown, path: string, sheet: { w: number; h: number }): FrameDef {
  const o = object(v, path);
  const [x, y, w, h] = ints(o.rect, `${path}.rect`, 4, [0, 0, 1, 1]) as [
    number,
    number,
    number,
    number,
  ];
  const rotated = opt(o.rotated, false, (r) => bool(r, `${path}.rotated`));
  const [cols, rows] = rotated ? [h, w] : [w, h];
  if (x + cols > sheet.w || y + rows > sheet.h) {
    throw new FormatError('lies outside the sheet', `${path}.rect`);
  }
  let trim: FrameDef['trim'] = null;
  let width = w;
  let height = h;
  if (o.trim !== undefined) {
    const [tx, ty, fw, fh] = ints(o.trim, `${path}.trim`, 4, [0, 0, 1, 1]) as [
      number,
      number,
      number,
      number,
    ];
    if (tx + w > fw || ty + h > fh) {
      throw new FormatError('the trimmed pixels lie outside the full frame', `${path}.trim`);
    }
    trim = { x: tx, y: ty };
    width = fw;
    height = fh;
  }
  const pivot = array(o.pivot ?? [width / 2, height], `${path}.pivot`);
  if (pivot.length !== 2) throw new FormatError('expected 2 numbers', `${path}.pivot`);
  const [px, py] = pivot.map((n, i) => number(n, `${path}.pivot[${i}]`, -1e6, 1e6)) as [
    number,
    number,
  ];
  return {
    name: string(o.name, `${path}.name`),
    rect: { x, y, w, h },
    pivot: { x: px, y: py },
    rotated,
    trim,
    width,
    height,
  };
}

function frameIndex(v: unknown, path: string, count: number): number {
  const i = int(v, path, 0);
  if (i >= count) throw new FormatError(`no frame ${i}; the file has ${count}`, path);
  return i;
}

function layerDef(v: unknown, path: string, count: number): LayerDef {
  const o = object(v, path);
  return {
    frame: frameIndex(o.frame, `${path}.frame`, count),
    x: opt(o.x, 0, (n) => int(n, `${path}.x`)),
    y: opt(o.y, 0, (n) => int(n, `${path}.y`)),
    z: opt(o.z, 1, (n) => int(n, `${path}.z`)),
    opacity: opt(o.opacity, 1, (n) => number(n, `${path}.opacity`, 0, 1)),
    flipX: opt(o.flipX, false, (b) => bool(b, `${path}.flipX`)),
    flipY: opt(o.flipY, false, (b) => bool(b, `${path}.flipY`)),
  };
}

function animationFrameDef(
  v: unknown,
  path: string,
  count: number,
  duration: number,
): AnimationFrameDef {
  if (typeof v === 'number') {
    return {
      frame: frameIndex(v, path, count),
      duration,
      offset: { x: 0, y: 0 },
      layers: [],
      events: [],
    };
  }
  const o = object(v, path);
  const [ox, oy] = opt(o.offset, [0, 0], (n) =>
    ints(n, `${path}.offset`, 2, [-Infinity, -Infinity]),
  );
  return {
    frame: frameIndex(o.frame, `${path}.frame`, count),
    duration: opt(o.duration, duration, (n) => int(n, `${path}.duration`, 1)),
    offset: { x: ox!, y: oy! },
    layers: opt(o.layers, [], (l) =>
      array(l, `${path}.layers`).map((layer, i) => layerDef(layer, `${path}.layers[${i}]`, count)),
    ),
    events: opt(o.events, [], (e) =>
      array(e, `${path}.events`).map((name, i) => string(name, `${path}.events[${i}]`)),
    ),
  };
}

const LOOPS: readonly LoopMode[] = ['loop', 'pingpong', 'once'];

function animationDef(v: unknown, path: string, count: number): AnimationDef {
  const o = object(v, path);
  const loop = opt(o.loop, 'loop' as LoopMode, (l) => {
    if (!LOOPS.includes(l as LoopMode)) {
      throw new FormatError('expected "loop", "pingpong" or "once"', `${path}.loop`);
    }
    return l as LoopMode;
  });
  const duration = opt(o.duration, DEFAULT_DURATION, (n) => int(n, `${path}.duration`, 1));
  return {
    name: string(o.name, `${path}.name`),
    loop,
    frames: array(o.frames, `${path}.frames`).map((f, i) =>
      animationFrameDef(f, `${path}.frames[${i}]`, count, duration),
    ),
    light: lightDef(o.lighting),
  };
}

const LIGHT_NUMBERS = ['angle', 'height', 'size', 'brightness', 'ambient', 'opacity', 'bands'];

/**
 * Picks the editor's light out of an animation's `lighting`. Runtimes don't need it to play the
 * file, so a field of the wrong type is dropped rather than refused.
 */
function lightDef(lighting: unknown): LightDef | null {
  const light = isObject(lighting) ? lighting.light : undefined;
  if (!isObject(light)) return null;
  const out: Record<string, number | string> = {};
  for (const key of LIGHT_NUMBERS) {
    const v = light[key];
    if (typeof v === 'number' && Number.isFinite(v)) out[key] = v;
  }
  if (typeof light.color === 'string' && /^#[0-9a-f]{6}$/i.test(light.color)) {
    out.color = light.color;
  }
  return out as LightDef;
}

/**
 * Reads a SpriteBuddy runtime file (`.anims.json`, version 3) from parsed JSON, filling in every
 * default. Unknown fields are ignored so newer minor additions still load. Throws
 * {@link FormatError} saying where the file is wrong.
 */
export function parseFile(json: unknown): SpriteBuddyFile {
  const o = object(json, '');
  if (o.format !== FORMAT) {
    throw new FormatError(
      `not a SpriteBuddy animations file (format should be "${FORMAT}")`,
      'format',
    );
  }
  const version = int(o.version, 'version', 1);
  if (version < 3) {
    throw new FormatError(
      `version ${version} files need the sheet's own JSON; export again from SpriteBuddy for version ${VERSION}`,
      'version',
    );
  }
  if (version > VERSION) {
    throw new FormatError(
      `version ${version} is newer than this runtime reads (${VERSION}); update @spritebuddy packages`,
      'version',
    );
  }
  const [width, height] = ints(o.size, 'size', 2, [1, 1]) as [number, number];
  const sheet = { w: width, h: height };
  const frames = array(o.frames, 'frames').map((f, i) => frameDef(f, `frames[${i}]`, sheet));
  const animations = opt(o.animations, [], (a) =>
    array(a, 'animations').map((anim, i) => animationDef(anim, `animations[${i}]`, frames.length)),
  );
  const names = new Set<string>();
  animations.forEach((a, i) => {
    if (names.has(a.name))
      throw new FormatError(`duplicate animation "${a.name}"`, `animations[${i}].name`);
    names.add(a.name);
  });
  return {
    version,
    image: string(o.image, 'image'),
    normals: opt(o.normals, null, (n) => string(n, 'normals')),
    width,
    height,
    scale: opt(o.scale, 1, (s) => number(s, 'scale', 1e-6, 1e6)),
    frames,
    animations,
  };
}
