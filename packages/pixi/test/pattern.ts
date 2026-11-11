import { partsOf, type SpriteBuddyFile, type Part } from '@spritebuddy/core';

/** The colour of every sheet pixel in the tests: varies in x and y, so a turned frame shows. */
export function sheetPixel(x: number, y: number): [number, number, number, number] {
  return [(x * 37 + 11) & 255, (y * 53 + 7) & 255, ((x + y) * 29) & 255, 255];
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
        const [r, g, b, a] = sheetPixel(sx, sy);
        const dx = origin.x + part.x + u;
        const dy = origin.y + part.y + v;
        if (dx < 0 || dy < 0 || dx >= width || dy >= height) continue;
        const i = (dy * width + dx) * 4;
        const sa = (a / 255) * part.opacity;
        const da = data[i + 3]! / 255;
        const oa = sa + da * (1 - sa);
        if (oa === 0) continue;
        data[i] = (r * sa + data[i]! * da * (1 - sa)) / oa;
        data[i + 1] = (g * sa + data[i + 1]! * da * (1 - sa)) / oa;
        data[i + 2] = (b * sa + data[i + 2]! * da * (1 - sa)) / oa;
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
