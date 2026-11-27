import type { LightDef } from '@spritebuddy/core';

/** A light's settings. Every one is optional; missing ones keep their current value. */
export interface LightSettings {
  /** Where a directional light comes from, in degrees clockwise from the top of the screen. */
  readonly angle?: number;
  /** A directional light's elevation in degrees: 90 shines from the viewer, below 0 from behind. */
  readonly height?: number;
  /** How far the light wraps round the shape: 0 tight, 1 broad and soft. */
  readonly size?: number;
  /** `0xrrggbb` or `"#rrggbb"`. */
  readonly color?: number | string;
  readonly brightness?: number;
  /** Light every pixel gets, lit or not. */
  readonly ambient?: number;
  /** Blend of the lit colours over the original ones. */
  readonly opacity?: number;
  /** Cel shading: 2, 3 or 4 light levels, or 0 for smooth shading. */
  readonly bands?: number;
  /**
   * Above 0 makes a point light, such as a candle or a torch: it shines from (`x`, `y`, `z`) and
   * fades to nothing `radius` pixels away, and `angle` and `height` are unused. 0 (the default)
   * is a directional light, like the sun.
   */
  readonly radius?: number;
  /** A point light's position in world space (Cocos's: y up), such as a node's `worldPosition`. */
  readonly x?: number;
  readonly y?: number;
  /** How far a point light floats toward the viewer, in world pixels: low skims the surface. */
  readonly z?: number;
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

export type LightState = { -readonly [K in keyof typeof DEFAULT_LIGHT]: number };

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

/** The lit effect's uniforms for a light, each a vec4. */
export interface LightUniforms {
  /** Toward a directional light in world space (y up), and the number of cel bands. */
  readonly lightDir: [number, number, number, number];
  /** A point light's world x, y, z and radius; a radius of 0 means directional. */
  readonly lightPos: [number, number, number, number];
  /** Red, green and blue, 0 to 1. */
  readonly lightColor: [number, number, number, number];
  /** Ambient, brightness, opacity and wrap. */
  readonly lightParams: [number, number, number, number];
}

/** What the effect is given for a light's settings: the same sums as SpriteBuddy Pro's. */
export function lightUniforms(state: LightState): LightUniforms {
  const [dx, dy, dz] = lightDirection(state.angle, state.height);
  const c = state.color;
  return {
    lightDir: [dx, -dy + 0, dz, state.bands],
    lightPos: [state.x, state.y, state.z, Math.max(0, state.radius)],
    lightColor: [((c >> 16) & 255) / 255, ((c >> 8) & 255) / 255, (c & 255) / 255, 1],
    lightParams: [state.ambient, state.brightness, state.opacity, 0.6 * state.size],
  };
}
