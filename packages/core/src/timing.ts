import type { AnimationDef } from './types.js';

export interface PlaybackPosition {
  /** Index into the animation's `frames`, or -1 for an animation with no frames. */
  readonly index: number;
  /** True once a `once` animation has reached its end (it then holds the last frame). */
  readonly done: boolean;
}

/**
 * The frame indices one cycle visits. `pingpong` plays forward then back without repeating the
 * end frames (0 1 2 3 2 1), so with two frames or fewer it is the same as `loop`.
 */
export function cycleOrder(anim: Pick<AnimationDef, 'frames' | 'loop'>): number[] {
  const forward = anim.frames.map((_, i) => i);
  if (anim.loop !== 'pingpong' || forward.length <= 2) return forward;
  return [...forward, ...forward.slice(1, -1).reverse()];
}

/** Length of one cycle in ms (forward and back for `pingpong`). */
export function cycleDuration(anim: Pick<AnimationDef, 'frames' | 'loop'>): number {
  return cycleOrder(anim).reduce((t, i) => t + anim.frames[i]!.duration, 0);
}

/**
 * Which frame shows `time` ms after the animation starts. A frame shows from its start time up
 * to, not including, its end; `loop` and `pingpong` repeat forever, `once` holds the last frame.
 * Negative times count as 0.
 */
export function frameAt(
  anim: Pick<AnimationDef, 'frames' | 'loop'>,
  time: number,
): PlaybackPosition {
  const order = cycleOrder(anim);
  if (order.length === 0) return { index: -1, done: true };
  const total = cycleDuration(anim);
  const t = Math.max(0, time);
  if (anim.loop === 'once' && t >= total) return { index: order[order.length - 1]!, done: true };
  let rest = t % total;
  for (const i of order) {
    rest -= anim.frames[i]!.duration;
    if (rest < 0) return { index: i, done: false };
  }
  /* v8 ignore next */
  return { index: order[order.length - 1]!, done: false };
}
