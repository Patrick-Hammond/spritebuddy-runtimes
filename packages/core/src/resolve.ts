import type { AnimationFrameDef, FrameDef, SpriteBuddyFile } from './types';

/**
 * One image to draw for an animation frame: the base frame or one of its layers, in draw order.
 * `x, y` is where the part's full (untrimmed, upright) frame has its top-left, relative to the
 * sprite's origin: the base frame's pivot, already moved by the frame's offset. So a renderer
 * puts the sprite where the character stands and draws each part at `origin + (x, y)`.
 */
export interface Part {
  readonly frame: FrameDef;
  /** Index into the file's frames. */
  readonly index: number;
  readonly x: number;
  readonly y: number;
  readonly opacity: number;
  /** Mirrored within the part's own full frame. */
  readonly flipX: boolean;
  readonly flipY: boolean;
}

/**
 * Everything to draw for one animation frame, bottom to top: the base frame (z 0) and its
 * layers sorted by z, ties keeping the base first and then list order.
 */
export function partsOf(file: Pick<SpriteBuddyFile, 'frames'>, entry: AnimationFrameDef): Part[] {
  const base = file.frames[entry.frame]!;
  const left = -base.pivot.x + entry.offset.x;
  const top = -base.pivot.y + entry.offset.y;
  const stack = [
    {
      z: 0,
      part: {
        frame: base,
        index: entry.frame,
        x: left,
        y: top,
        opacity: 1,
        flipX: false,
        flipY: false,
      },
    },
    ...entry.layers.map((l) => ({
      z: l.z,
      part: {
        frame: file.frames[l.frame]!,
        index: l.frame,
        x: left + l.x,
        y: top + l.y,
        opacity: l.opacity,
        flipX: l.flipX,
        flipY: l.flipY,
      },
    })),
  ];
  return stack
    .map((s, order) => ({ ...s, order }))
    .sort((a, b) => a.z - b.z || a.order - b.order)
    .map((s) => s.part);
}

/** Box around every part of an animation frame, relative to the sprite's origin. */
export function boundsOf(parts: readonly Part[]): { x: number; y: number; w: number; h: number } {
  if (parts.length === 0) return { x: 0, y: 0, w: 0, h: 0 };
  const x0 = Math.min(...parts.map((p) => p.x));
  const y0 = Math.min(...parts.map((p) => p.y));
  const x1 = Math.max(...parts.map((p) => p.x + p.frame.width));
  const y1 = Math.max(...parts.map((p) => p.y + p.frame.height));
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}
