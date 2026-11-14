import type { LightDef } from '@spritebuddy/core';
import type { PixiNamespace, PixiTexture } from './pixi-types.js';

/** A light's settings. Every one is optional; missing ones keep their current value. */
export interface LightSettings {
  /** Where the light comes from, in degrees clockwise from the top of the screen. */
  readonly angle?: number;
  /** Elevation in degrees: 90 shines from the viewer, below 0 from behind (a rim light). */
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
}

/**
 * A directional light for lit sprites (PixiJS 8). Change its fields at any time: every sprite
 * using it is lit the new way on the next render.
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
  /** Changes several settings at once. */
  set(settings: LightSettings | LightDef | null | undefined): this;
}

/** SpriteBuddy Pro's default light, so an unchanged light matches the editor's. */
export const DEFAULT_LIGHT = {
  angle: 315,
  height: 45,
  size: 0.5,
  color: 0xfff4e0,
  brightness: 1,
  ambient: 0.35,
  opacity: 1,
  bands: 0,
} as const;

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

export const LIT_VERTEX = /* glsl */ `
in vec2 aPosition;
in vec2 aUV;

out vec2 vUV;
out vec4 vColor;
out vec2 vNormal0;
out vec2 vNormal1;

uniform mat3 uProjectionMatrix;
uniform mat3 uWorldTransformMatrix;
uniform vec4 uWorldColorAlpha;
uniform vec2 uResolution;

uniform mat3 uTransformMatrix;
uniform vec4 uColor;
uniform float uRound;

vec2 roundPixels(vec2 position, vec2 targetSize) {
  return (floor(((position * 0.5 + 0.5) * targetSize) + 0.5) / targetSize) * 2.0 - 1.0;
}

void main(void) {
  mat3 model = uWorldTransformMatrix * uTransformMatrix;
  gl_Position = vec4((uProjectionMatrix * model * vec3(aPosition, 1.0)).xy, 0.0, 1.0);
  if (uRound == 1.0) gl_Position.xy = roundPixels(gl_Position.xy, uResolution);
  vUV = aUV;
  vColor = uColor * uWorldColorAlpha;
  // The inverse transpose of the sprite's 2D transform turns its normals to face the screen, so
  // flipped, rotated and scaled sprites are lit from the right side.
  mat2 m = mat2(model);
  float det = m[0][0] * m[1][1] - m[1][0] * m[0][1];
  vNormal0 = vec2(m[1][1], -m[1][0]) / det;
  vNormal1 = vec2(-m[0][1], m[0][0]) / det;
}
`;

export const LIT_FRAGMENT = /* glsl */ `
in vec2 vUV;
in vec4 vColor;
in vec2 vNormal0;
in vec2 vNormal1;

out vec4 finalColor;

uniform sampler2D uTexture;
uniform sampler2D uNormals;

uniform vec3 uLightDir;
uniform vec3 uLightColor;
// ambient, brightness, opacity, wrap
uniform vec4 uLightParams;
uniform float uBands;

uniform float uRotated;

void main(void) {
  vec4 c = texture(uTexture, vUV);
  if (c.a <= 0.0) {
    finalColor = vec4(0.0);
    return;
  }
  // Textures are premultiplied on upload; the normal map's alpha is the sheet's.
  vec4 t = texture(uNormals, vUV);
  vec3 n = t.a > 0.0 ? t.rgb / t.a * 2.0 - 1.0 : vec3(0.0, 0.0, 1.0);
  // A rotated frame's normals were turned clockwise with its pixels; turn them back (y up).
  if (uRotated > 0.5) n.xy = vec2(-n.y, n.x);
  vec2 local = vec2(n.x, -n.y);
  vec2 screen = mat2(vNormal0, vNormal1) * local;
  float len = length(screen);
  if (len > 0.0) screen *= length(local) / len;
  vec3 N = vec3(screen, n.z);

  float wrap = uLightParams.w;
  float d = clamp((dot(N, uLightDir) + wrap) / (1.0 + wrap), 0.0, 1.0);
  if (uBands > 1.0) {
    float steps = uBands - 1.0;
    d = floor(d * steps + 0.5) / steps;
  }
  vec3 C = c.rgb / c.a;
  vec3 lit = min(vec3(1.0), C * (uLightParams.x + uLightParams.y * d * uLightColor));
  finalColor = vec4(mix(C, lit, uLightParams.z) * c.a, c.a) * vColor;
}
`;

/* eslint-disable @typescript-eslint/no-explicit-any */

/** The uniforms one light shares with every sprite it lights. */
export interface LightInternals {
  readonly uniforms: any;
}

const internals = new WeakMap<object, LightInternals>();

/** The light's uniform group, or undefined for something that isn't a light made by `light()`. */
export function lightInternals(light: unknown): LightInternals | undefined {
  return typeof light === 'object' && light !== null ? internals.get(light) : undefined;
}

/** Makes a light whose fields write straight into a PixiJS 8 uniform group. */
export function createLight(PIXI: PixiNamespace, settings?: LightSettings | LightDef | null) {
  const group = new PIXI.UniformGroup({
    uLightDir: { value: new Float32Array(3), type: 'vec3<f32>' },
    uLightColor: { value: new Float32Array(3), type: 'vec3<f32>' },
    uLightParams: { value: new Float32Array(4), type: 'vec4<f32>' },
    uBands: { value: 0, type: 'f32' },
  });
  const state = { ...DEFAULT_LIGHT } as { -readonly [K in keyof typeof DEFAULT_LIGHT]: number };
  const u = group.uniforms;

  function sync(): void {
    u.uLightDir.set(lightDirection(state.angle, state.height));
    const c = state.color;
    u.uLightColor.set([((c >> 16) & 255) / 255, ((c >> 8) & 255) / 255, (c & 255) / 255]);
    u.uLightParams.set([state.ambient, state.brightness, state.opacity, 0.6 * state.size]);
    u.uBands = state.bands;
  }

  const light = {} as SpriteBuddyLight;
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
      if (key in DEFAULT_LIGHT && value !== undefined) (light as any)[key] = value;
    }
    return light;
  };
  sync();
  light.set(settings);
  internals.set(light, { uniforms: group });
  return light;
}

/** One lit part of a sprite: a quad mesh drawn with the normal-mapped shader. */
export interface LitPart {
  readonly mesh: any;
  /** Shows `texture` (and its normals) as the part's full frame, from (0, 0). */
  setFrame(texture: PixiTexture, rotated: boolean): void;
}

/** Shader programs are compiled once per PixiJS namespace. */
const programs = new WeakMap<object, unknown>();

export function createLitPart(
  PIXI: PixiNamespace,
  image: PixiTexture,
  normalMap: PixiTexture,
  light: LightInternals,
): LitPart {
  let glProgram = programs.get(PIXI);
  if (!glProgram) {
    glProgram = PIXI.GlProgram.from({ vertex: LIT_VERTEX, fragment: LIT_FRAGMENT, name: 'sb-lit' });
    programs.set(PIXI, glProgram);
  }
  const part = new PIXI.UniformGroup({ uRotated: { value: 0, type: 'f32' } });
  const shader = new PIXI.Shader({
    glProgram,
    resources: {
      uTexture: image.source,
      uNormals: normalMap.source,
      lightUniforms: light.uniforms,
      partUniforms: part,
    },
  });
  const geometry = new PIXI.MeshGeometry({
    positions: new Float32Array(8),
    uvs: new Float32Array(8),
    indices: new Uint32Array([0, 1, 2, 0, 2, 3]),
  });
  const mesh = new PIXI.Mesh({ geometry, shader, texture: PIXI.Texture.EMPTY });
  let shown: PixiTexture | null = null;

  return {
    mesh,
    setFrame(texture, rotated) {
      if (texture === shown) return;
      shown = texture;
      const t = texture as any;
      const box = t.trim ?? { x: 0, y: 0, width: t.orig.width, height: t.orig.height };
      const { x, y, width: w, height: h } = box;
      geometry.positions = new Float32Array([x, y, x + w, y, x + w, y + h, x, y + h]);
      const uv = t.uvs;
      geometry.uvs = new Float32Array([uv.x0, uv.y0, uv.x1, uv.y1, uv.x2, uv.y2, uv.x3, uv.y3]);
      part.uniforms.uRotated = rotated ? 1 : 0;
      mesh.texture = texture;
    },
  };
}
