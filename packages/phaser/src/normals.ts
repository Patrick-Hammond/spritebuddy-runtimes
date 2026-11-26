/**
 * Phaser's lights turn a sprite's normals with its rotation but not with its flips, so a flipped
 * sprite would be lit from the wrong side. A flipped lit part is drawn from a copy of the sheet
 * whose normal map is mirrored to match: red (x) inverted for a horizontal flip, green (y) for a
 * vertical one.
 */

/** `[r, g, b, a]` pixels with the normals mirrored, in place. */
export function mirrorNormals(data: Uint8ClampedArray, flipX: boolean, flipY: boolean): void {
  for (let i = 0; i < data.length; i += 4) {
    if (flipX) data[i] = 255 - data[i]!;
    if (flipY) data[i + 1] = 255 - data[i + 1]!;
  }
}

/** A canvas of `image` (a normal map) with its normals mirrored. */
export function mirroredNormalMap(
  image: CanvasImageSource & { width: number; height: number },
  flipX: boolean,
  flipY: boolean,
): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = image.width;
  canvas.height = image.height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(image, 0, 0);
  const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
  mirrorNormals(pixels.data, flipX, flipY);
  ctx.putImageData(pixels, 0, 0);
  return canvas;
}
