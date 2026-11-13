/** `format` of every SpriteBuddy runtime file. */
export const FORMAT = 'spritebuddy-animations';
/** The newest runtime file version this package reads. */
export const VERSION = 3;

export type LoopMode = 'loop' | 'pingpong' | 'once';

/**
 * One frame on the sheet. Coordinates are pixels with y down, as in the image.
 *
 * - `rect` is where the frame's pixels sit on the sheet, at their upright size. A `rotated`
 *   frame is stored turned 90° clockwise, so it covers `rect.h` columns and `rect.w` rows
 *   starting at `rect.x, rect.y` (TexturePacker's rule).
 * - `trim` is set when transparent edges were cut off: the cut pixels' place inside the full
 *   frame and the full frame's size. Without it the full frame is `rect`.
 * - `pivot` is in full-frame pixels; the frame hangs from it (feet, usually).
 */
export interface FrameDef {
  readonly name: string;
  readonly rect: Rect;
  readonly pivot: Point;
  readonly rotated: boolean;
  readonly trim: Trim | null;
  /** Full (untrimmed) frame size. */
  readonly width: number;
  readonly height: number;
}

export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

export interface Point {
  readonly x: number;
  readonly y: number;
}

export interface Trim {
  /** Where the trimmed pixels start inside the full frame. */
  readonly x: number;
  readonly y: number;
}

/** An extra frame drawn with an animation frame: a weapon, an effect, a shadow. */
export interface LayerDef {
  /** Index into {@link SpriteBuddyFile.frames}. */
  readonly frame: number;
  /** Top-left of the layer's full frame, relative to the base frame's full top-left. */
  readonly x: number;
  readonly y: number;
  /** Draw order: the base frame is 0, higher draws on top, ties keep list order. */
  readonly z: number;
  readonly opacity: number;
  readonly flipX: boolean;
  readonly flipY: boolean;
}

export interface AnimationFrameDef {
  /** Index into {@link SpriteBuddyFile.frames}. */
  readonly frame: number;
  /** Display time in ms. */
  readonly duration: number;
  /** Nudge in pixels from where the pivot puts the frame (+x right, +y down). */
  readonly offset: Point;
  readonly layers: readonly LayerDef[];
  /**
   * Names fired when this frame starts showing, such as `"hit"` on the frame a sword lands or
   * `"step"` on a footstep. Empty for most frames.
   */
  readonly events: readonly string[];
}

export interface AnimationDef {
  readonly name: string;
  readonly loop: LoopMode;
  readonly frames: readonly AnimationFrameDef[];
}

/** A parsed runtime file, with every default filled in. */
export interface SpriteBuddyFile {
  readonly version: number;
  /** The sheet image's file name, relative to the runtime file. */
  readonly image: string;
  /**
   * A normal-map image with the same size and frame layout as `image`, for real-time lighting,
   * or null when the export has none. Relative to the runtime file.
   */
  readonly normals: string | null;
  readonly width: number;
  readonly height: number;
  /** Scale the sheet was exported at (1 = original pixels). */
  readonly scale: number;
  readonly frames: readonly FrameDef[];
  readonly animations: readonly AnimationDef[];
}
