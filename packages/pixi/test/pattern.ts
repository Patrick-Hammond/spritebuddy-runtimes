import { partsOf, type SpriteBuddyFile, type Part } from '@spritebuddy/core';

/** The colour of every sheet pixel in the tests: varies in x and y, so a turned frame shows. */
export function sheetPixel(x: number, y: number): [number, number, number, number] {
  return [(x * 37 + 11) & 255, (y * 53 + 7) & 255, ((x + y) * 29) & 255, 255];
}

/**
 * The normal-map pixel at sheet (x, y) in the tests: tilts every way across the sheet, always
 * facing the viewer a little.
 */
export function normalPixel(x: number, y: number): [number, number, number, number] {
  const nx = Math.sin(x * 0.7) * 0.7;
  const ny = Math.cos(y * 0.5) * 0.6;
  const nz = Math.sqrt(Math.max(0.05, 1 - nx * nx - ny * ny));
  const byte = (v: number) => Math.round(((v + 1) / 2) * 255);
  return [byte(nx), byte(ny), byte(nz), 255];
}

export interface Light {
  readonly angle: number;
  readonly height: number;
  readonly size: number;
  readonly color: number;
  readonly brightness: number;
  readonly ambient: number;
  readonly opacity: number;
  readonly bands: number;
}

/**
 * Lights one pixel the way SpriteBuddy Pro's editor does (src/pro/core/lighting/light.ts), from
 * its colour and a y-up normal already turned to face the screen.
 */
export function lightPixel(
  rgb: readonly number[],
  n: readonly [number, number, number],
  light: Light,
): [number, number, number] {
  const rad = Math.PI / 180;
  const flat = Math.cos(light.height * rad);
  const l = [Math.sin(light.angle * rad) * flat, Math.cos(light.angle * rad) * flat];
  const lz = Math.sin(light.height * rad);
  const wrap = 0.6 * light.size;
  let d = Math.min(1, Math.max(0, (n[0] * l[0]! + n[1] * l[1]! + n[2] * lz + wrap) / (1 + wrap)));
  if (light.bands > 1) d = Math.round(d * (light.bands - 1)) / (light.bands - 1);
  const k = [(light.color >> 16) & 255, (light.color >> 8) & 255, light.color & 255];
  return rgb.map((c, i) => {
    const lit = Math.min(255, c * (light.ambient + light.brightness * d * (k[i]! / 255)));
    return Math.round(c + (lit - c) * light.opacity);
  }) as [number, number, number];
}

/** A shader for {@link softwareRender} that lights each pixel with {@link normalPixel}. */
export function litShade(light: Light) {
  return (rgb: readonly number[], sx: number, sy: number, part: Part) => {
    const [r, g, b] = normalPixel(sx, sy);
    let n: [number, number, number] = [(r / 255) * 2 - 1, (g / 255) * 2 - 1, (b / 255) * 2 - 1];
    if (part.frame.rotated) n = [-n[1], n[0], n[2]];
    if (part.flipX) n[0] = -n[0];
    if (part.flipY) n[1] = -n[1];
    return lightPixel(rgb, n, light);
  };
}

export interface Image {
  readonly width: number;
  readonly height: number;
  readonly data: Uint8ClampedArray;
}

/**
 * Draws parts the slow, obvious way, straight from the format's rules, so the browser render
 * can be checked against it.
 */
export function softwareRender(
  parts: readonly Part[],
  origin: { x: number; y: number },
  width: number,
  height: number,
  shade?: (rgb: readonly number[], sx: number, sy: number, part: Part) => readonly number[],
): Image {
  const data = new Uint8ClampedArray(width * height * 4);
  for (const part of parts) {
    const f = part.frame;
    const trim = f.trim ?? { x: 0, y: 0 };
    for (let v = 0; v < f.height; v++) {
      for (let u = 0; u < f.width; u++) {
        const su = part.flipX ? f.width - 1 - u : u;
        const sv = part.flipY ? f.height - 1 - v : v;
        const tu = su - trim.x;
        const tv = sv - trim.y;
        if (tu < 0 || tv < 0 || tu >= f.rect.w || tv >= f.rect.h) continue;
        // A rotated frame is stored turned 90° clockwise.
        const [sx, sy] = f.rotated
          ? [f.rect.x + f.rect.h - 1 - tv, f.rect.y + tu]
          : [f.rect.x + tu, f.rect.y + tv];
        const pixel = sheetPixel(sx, sy);
        const [r, g, b] = shade ? shade(pixel, sx, sy, part) : pixel;
        const a = pixel[3];
        const dx = origin.x + part.x + u;
        const dy = origin.y + part.y + v;
        if (dx < 0 || dy < 0 || dx >= width || dy >= height) continue;
        const i = (dy * width + dx) * 4;
        const sa = (a / 255) * part.opacity;
        const da = data[i + 3]! / 255;
        const oa = sa + da * (1 - sa);
        if (oa === 0) continue;
        data[i] = (r! * sa + data[i]! * da * (1 - sa)) / oa;
        data[i + 1] = (g! * sa + data[i + 1]! * da * (1 - sa)) / oa;
        data[i + 2] = (b! * sa + data[i + 2]! * da * (1 - sa)) / oa;
        data[i + 3] = oa * 255;
      }
    }
  }
  return { width, height, data };
}

/** Parts of an animation at a time, for the software render. */
export function partsAt(file: SpriteBuddyFile, animation: string, index: number): Part[] {
  const anim = file.animations.find((a) => a.name === animation)!;
  return partsOf(file, anim.frames[index]!);
}

/** `image` mirrored left to right about x = `ox` (a sprite drawn with scale.x = -1 there). */
export function mirrorX(image: Image, ox: number): Image {
  const { width, height } = image;
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const mx = 2 * ox - 1 - x;
      if (mx < 0 || mx >= width) continue;
      data.set(
        image.data.subarray((y * width + x) * 4, (y * width + x) * 4 + 4),
        (y * width + mx) * 4,
      );
    }
  }
  return { width, height, data };
}

/** `image` turned 90° clockwise about (`ox`, `oy`) (a sprite drawn with rotation π/2 there). */
export function rotateCW(image: Image, ox: number, oy: number): Image {
  const { width, height } = image;
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const rx = ox + oy - y - 1;
      const ry = oy - ox + x;
      if (rx < 0 || ry < 0 || rx >= width || ry >= height) continue;
      data.set(
        image.data.subarray((y * width + x) * 4, (y * width + x) * 4 + 4),
        (ry * width + rx) * 4,
      );
    }
  }
  return { width, height, data };
}
