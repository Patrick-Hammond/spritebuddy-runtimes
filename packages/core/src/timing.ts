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

/** An event fired by an animation frame: its name and the frame's index in the animation. */
export interface FrameEvent {
  readonly name: string;
  readonly index: number;
}

/**
 * The events of every frame that starts showing after `from` ms and up to and including `to` ms,
 * in the order they start. A frame that starts exactly at `from` was already counted, so calling
 * this with each tick's old and new time fires every event once, even when a long tick skips
 * past short frames. A ping-pong cycle fires a frame's events each time it shows. One call fires
 * at most one cycle's worth, so a game that was paused for a minute doesn't get a burst.
 */
export function eventsBetween(
  anim: Pick<AnimationDef, 'frames' | 'loop'>,
  from: number,
  to: number,
): FrameEvent[] {
  const order = cycleOrder(anim);
  if (order.length === 0 || to <= from) return [];
  if (!anim.frames.some((f) => f.events.length > 0)) return [];
  const total = cycleDuration(anim);
  const starts: number[] = [];
  let t = 0;
  for (const i of order) {
    starts.push(t);
    t += anim.frames[i]!.duration;
  }
  const crossed: number[] = [];
  const once = anim.loop === 'once';
  const first = once
    ? 0
    : Math.max(Math.floor(Math.max(0, from) / total), Math.floor(to / total) - 1);
  const last = once ? 0 : Math.floor(to / total);
  for (let cycle = first; cycle <= last; cycle++) {
    order.forEach((index, k) => {
      const at = cycle * total + starts[k]!;
      if (at > from && at <= to) crossed.push(index);
    });
  }
  return crossed
    .slice(-order.length)
    .flatMap((index) => anim.frames[index]!.events.map((name) => ({ name, index })));
}
