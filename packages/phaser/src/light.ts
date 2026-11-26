import type { LightDef } from '@spritebuddy/core';
import type { PhaserScene } from './phaser-types.js';

/** A light's settings. Every one is optional; missing ones keep their current value. */
export interface LightSettings {
  /** Where a directional light comes from, in degrees clockwise from the top of the screen. */
  readonly angle?: number;
  /** A directional light's elevation in degrees: 90 shines from the viewer. */
  readonly height?: number;
  /** Kept for SpriteBuddy Pro's settings; Phaser's lighting has no wrap. */
  readonly size?: number;
  /** `0xrrggbb` or `"#rrggbb"`. */
  readonly color?: number | string;
  /** Phaser's light `intensity`. */
  readonly brightness?: number;
  /**
   * Light every pixel gets, lit or not: the scene's ambient colour, a grey this bright. Phaser
   * has one ambient colour per scene, so the light set last decides it.
   */
  readonly ambient?: number;
  /** Kept for SpriteBuddy Pro's settings; Phaser's lighting always applies in full. */
  readonly opacity?: number;
  /** Kept for SpriteBuddy Pro's settings; Phaser's lighting is smooth. */
  readonly bands?: number;
  /**
   * Above 0 makes a point light, such as a candle or a torch: it shines from (`x`, `y`) and fades
   * out `radius` pixels away. 0 (the default) is a directional light, like the sun.
   */
  readonly radius?: number;
  /** A point light's position in the world. */
  readonly x?: number;
  readonly y?: number;
  /** Phaser 4: how far a point light floats toward the viewer, in pixels. */
  readonly z?: number;
}

/**
 * A light made by `sb.light()`: a Phaser light that takes SpriteBuddy's settings. Change its
 * fields at any time. It lights every lit sprite (and every other lit game object) in its scene.
 */
export interface SpriteBuddyLight {
  angle: number;
  height: number;
  size: number;
  /** `0xrrggbb`; setting a `"#rrggbb"` string works too. */
  color: number;
  brightness: number;
  ambient: number;
  opacity: number;
  bands: number;
  /** Above 0: a point light at (`x`, `y`, `z`) that fades out this many pixels away. */
  radius: number;
  x: number;
  y: number;
  z: number;
  /** The Phaser light underneath, from `scene.lights.addLight`. */
  readonly phaserLight: any; // eslint-disable-line @typescript-eslint/no-explicit-any
  /** Changes several settings at once. */
  set(settings: LightSettings | LightDef | null | undefined): this;
  /** Removes the light from its scene. */
  destroy(): void;
}

/** SpriteBuddy Pro's default light, so an unchanged light matches the editor's settings. */
export const DEFAULT_LIGHT = {
  angle: 315,
  height: 45,
  size: 0.5,
  color: 0xfff4e0,
  brightness: 1,
  ambient: 0.35,
  opacity: 1,
  bands: 0,
  radius: 0,
  x: 0,
  y: 0,
  z: 32,
} as const;

/**
 * Phaser only has point lights, so a directional light is a point light this far off (from the
 * middle of the camera's view) with a radius ten times as big: near enough the same direction
 * and strength everywhere on screen.
 */
export const SUN_DISTANCE = 2000;

const RAD = Math.PI / 180;

/** `0xrrggbb` from a number or `"#rrggbb"`. */
export function colorNumber(color: number | string): number {
  if (typeof color === 'number') return color & 0xffffff;
  const m = /^#?([0-9a-f]{6})$/i.exec(color);
  if (!m) throw new Error(`Light colour should be "#rrggbb", not "${color}"`);
  return parseInt(m[1]!, 16);
}

/**
 * Unit vector toward the light in screen space (x right, y down, z toward the viewer), exactly as
 * SpriteBuddy computes it.
 */
export function lightDirection(angle: number, height: number): [number, number, number] {
  const flat = Math.cos(height * RAD);
  return [Math.sin(angle * RAD) * flat, -Math.cos(angle * RAD) * flat, Math.sin(height * RAD)];
}

/** `0xgggggg`: a grey `level` bright (0 to 1). */
export function grey(level: number): number {
  const v = Math.round(Math.min(1, Math.max(0, level)) * 255);
  return (v << 16) | (v << 8) | v;
}

/** Adds a light to `scene` (and turns the scene's lights on) that takes SpriteBuddy's settings. */
export function createLight(
  scene: PhaserScene,
  settings?: LightSettings | LightDef | null,
): SpriteBuddyLight {
  const lights = scene.lights;
  lights.enable();
  const phaserLight = lights.addLight(0, 0, 1, 0xffffff, 1);
  const state = { ...DEFAULT_LIGHT } as { -readonly [K in keyof typeof DEFAULT_LIGHT]: number };

  function place(): void {
    if (state.radius > 0) {
      phaserLight.x = state.x;
      phaserLight.y = state.y;
      phaserLight.z = state.z;
      phaserLight.radius = state.radius;
      return;
    }
    const [dx, dy, dz] = lightDirection(state.angle, state.height);
    const mid = scene.cameras?.main?.midPoint ?? { x: 0, y: 0 };
    phaserLight.x = mid.x + dx * SUN_DISTANCE;
    phaserLight.y = mid.y + dy * SUN_DISTANCE;
    phaserLight.z = dz * SUN_DISTANCE;
    phaserLight.radius = SUN_DISTANCE * 10;
  }

  function sync(): void {
    place();
    phaserLight.setColor(state.color);
    phaserLight.intensity = state.brightness;
    lights.setAmbientColor(grey(state.ambient));
  }

  // A directional light follows the camera, so it shines the same way wherever the view goes.
  const follow = () => state.radius > 0 || place();
  scene.events.on('prerender', follow);

  const light = {
    phaserLight,
    destroy() {
      scene.events.off('prerender', follow);
      lights.removeLight(phaserLight);
    },
  } as SpriteBuddyLight;
  for (const key of Object.keys(DEFAULT_LIGHT) as (keyof typeof DEFAULT_LIGHT)[]) {
    Object.defineProperty(light, key, {
      enumerable: true,
      get: () => state[key],
      set: (value: number | string) => {
        state[key] = key === 'color' ? colorNumber(value) : Number(value);
        sync();
      },
    });
  }
  light.set = function (s) {
    for (const [key, value] of Object.entries(s ?? {})) {
      if (key in DEFAULT_LIGHT && value !== undefined) (light as any)[key] = value; // eslint-disable-line @typescript-eslint/no-explicit-any
    }
    return light;
  };
  sync();
  light.set(settings);
  return light;
}
