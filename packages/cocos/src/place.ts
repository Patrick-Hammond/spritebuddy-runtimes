import type { Part } from '@spritebuddy/core';

/**
 * Where one part's node goes inside a sprite node, in Cocos's coordinates: y up, the sprite
 * node's origin at the frame pivot (where the character stands).
 *
 * The part's node shows the frame's pixels as they are stored on the sheet (a `width` x `height`
 * SpriteFrame, anchored in its middle), then is mirrored by `scaleX` / `scaleY` and turned by
 * `angle` (degrees, anticlockwise, as Cocos turns nodes). A rotated frame is stored turned 90°
 * clockwise, so its node is turned back by +90°.
 */
export interface Placement {
  /** The middle of the part's pixels, from the sprite's origin, y up. */
  readonly x: number;
  readonly y: number;
  /** 1, or -1 to mirror the stored image across its own x or y axis. */
  readonly scaleX: number;
  readonly scaleY: number;
  /** 0, or 90 for a rotated frame. */
  readonly angle: number;
  /** Size of the frame's pixels as stored on the sheet (turned, for a rotated frame). */
  readonly width: number;
  readonly height: number;
}

/** Places one part; `spriteFlipX` / `spriteFlipY` mirror the whole sprite about its origin. */
export function placePart(
  part: Pick<Part, 'frame' | 'x' | 'y' | 'flipX' | 'flipY'>,
  spriteFlipX = false,
  spriteFlipY = false,
): Placement {
  const f = part.frame;
  const tx = f.trim?.x ?? 0;
  const ty = f.trim?.y ?? 0;
  const { w, h } = f.rect;
  // The upright pixels' box on screen (y down), after the part's own flips, then the sprite's.
  let left = part.x + (part.flipX ? f.width - tx - w : tx);
  let top = part.y + (part.flipY ? f.height - ty - h : ty);
  if (spriteFlipX) left = -(left + w);
  if (spriteFlipY) top = -(top + h);
  const flipX = part.flipX !== spriteFlipX;
  const flipY = part.flipY !== spriteFlipY;
  const x = left + w / 2;
  const y = -(top + h / 2);
  // Turning the stored image back upright swaps its axes, so an upright flip in x is a flip of
  // the stored image in y, and the other way round.
  return f.rotated
    ? { x, y, scaleX: flipY ? -1 : 1, scaleY: flipX ? -1 : 1, angle: 90, width: h, height: w }
    : { x, y, scaleX: flipX ? -1 : 1, scaleY: flipY ? -1 : 1, angle: 0, width: w, height: h };
}

/**
 * The 2 x 2 matrix (`[m00, m10, m01, m11]`, column by column) that turns a normal read from the
 * stored sheet (x right, y up, as SpriteBuddy writes them) into the direction it faces on screen
 * (Cocos's world: x right, y up). It is the part node's own turn and mirror, so flipped layers,
 * flipped sprites and rotated frames are lit from the right side.
 */
export function normalBasis(
  p: Pick<Placement, 'scaleX' | 'scaleY' | 'angle'>,
): [number, number, number, number] {
  const r = (p.angle * Math.PI) / 180;
  const c = Math.round(Math.cos(r));
  const s = Math.round(Math.sin(r));
  // R(angle) * S(scaleX, scaleY): columns are where the stored x and y axes end up.
  return [c * p.scaleX, s * p.scaleX, -s * p.scaleY, c * p.scaleY].map((v) => v + 0) as [
    number,
    number,
    number,
    number,
  ];
}
