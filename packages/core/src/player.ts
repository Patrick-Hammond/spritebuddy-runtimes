import { partsOf, type Part } from './resolve.js';
import { eventsBetween, frameAt, type FrameEvent } from './timing.js';
import type { AnimationDef, SpriteBuddyFile } from './types.js';

export interface PlayerState {
  /** The animation playing, or null before `play`. */
  readonly animation: AnimationDef | null;
  /** Index into the animation's frames, or -1. */
  readonly index: number;
  /** Ms since the animation started, scaled by `speed`. */
  readonly time: number;
  readonly done: boolean;
  /** What to draw now, bottom to top. */
  readonly parts: readonly Part[];
}

export interface PlayerEvents {
  /** Called with the frame index each time the frame changes. */
  onFrame?: (index: number) => void;
  /** Called when a `once` animation ends. */
  onComplete?: () => void;
  /**
   * Called for each event of a frame as it starts showing (see {@link eventsBetween}). `play`
   * fires the first frame's events; `seek` jumps without firing any.
   */
  onEvent?: (name: string, index: number) => void;
}

/**
 * Plays a file's animations with nothing but a clock: call {@link update} every tick with the
 * elapsed ms and draw {@link parts}. Engine adapters wrap this; games can use it directly too.
 */
export class Player {
  readonly file: SpriteBuddyFile;
  /** Playback rate: 1 is normal, 2 twice as fast, 0 frozen. */
  speed = 1;
  /** Whether {@link update} moves time on. */
  playing = false;
  #animation: AnimationDef | null = null;
  #time = 0;
  #index = -1;
  #done = false;
  #parts: readonly Part[] = [];
  #onFrame?: (index: number) => void;
  #onComplete?: () => void;
  #onEvent?: (name: string, index: number) => void;

  constructor(file: SpriteBuddyFile, events: PlayerEvents = {}) {
    this.file = file;
    this.#onFrame = events.onFrame;
    this.#onComplete = events.onComplete;
    this.#onEvent = events.onEvent;
  }

  /** Names of every animation in the file. */
  get names(): string[] {
    return this.file.animations.map((a) => a.name);
  }

  /** The animation called `name`, or undefined. */
  animation(name: string): AnimationDef | undefined {
    return this.file.animations.find((a) => a.name === name);
  }

  /**
   * Starts an animation from its first frame (or from `time` ms). Throws for an unknown name,
   * listing the ones there are.
   */
  play(name: string, time = 0): this {
    const anim = this.animation(name);
    if (!anim) {
      throw new Error(
        `No animation "${name}"; this file has ${this.names.map((n) => `"${n}"`).join(', ') || 'none'}`,
      );
    }
    this.#animation = anim;
    this.#index = -1;
    this.#done = false;
    this.playing = true;
    this.#time = Math.max(0, time);
    const index = frameAt(anim, this.#time).index;
    this.#refresh(index < 0 ? [] : anim.frames[index]!.events.map((name) => ({ name, index })));
    return this;
  }

  stop(): this {
    this.playing = false;
    return this;
  }

  /** Jumps to `time` ms into the current animation. */
  seek(time: number): this {
    this.#time = Math.max(0, time);
    this.#refresh();
    return this;
  }

  /** Moves time on by `ms` (times {@link speed}) while playing. */
  update(ms: number): this {
    const anim = this.#animation;
    if (this.playing && anim) {
      const from = this.#time;
      this.#time += Math.max(0, ms) * this.speed;
      this.#refresh(this.#onEvent ? eventsBetween(anim, from, this.#time) : []);
    }
    return this;
  }

  get state(): PlayerState {
    return {
      animation: this.#animation,
      index: this.#index,
      time: this.#time,
      done: this.#done,
      parts: this.#parts,
    };
  }

  get parts(): readonly Part[] {
    return this.#parts;
  }

  /** Works out the frame now showing, then reports frame, events and completion in that order. */
  #refresh(fired: readonly FrameEvent[] = []): void {
    const anim = this.#animation;
    if (!anim) return;
    const pos = frameAt(anim, this.#time);
    const changed = pos.index !== this.#index;
    this.#index = pos.index;
    this.#parts = pos.index < 0 ? [] : partsOf(this.file, anim.frames[pos.index]!);
    if (changed && pos.index >= 0) this.#onFrame?.(pos.index);
    for (const e of fired) this.#onEvent?.(e.name, e.index);
    if (pos.done && !this.#done) {
      this.#done = true;
      this.playing = false;
      this.#onComplete?.();
    }
  }
}
