// Bundled once and run with each Phaser version, which the page loads first as `window.Phaser`.
import { spriteBuddy } from '../src/index';
import { normalPixel, sheetPixel } from '../../pixi/test/pattern';

/* eslint-disable @typescript-eslint/no-explicit-any */
const Phaser = (window as any).Phaser;
const sb = spriteBuddy(Phaser);

function sheetCanvas(width: number, height: number, pixel = sheetPixel): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;
  const img = ctx.createImageData(width, height);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) img.data.set(pixel(x, y), (y * width + x) * 4);
  ctx.putImageData(img, 0, 0);
  return canvas;
}

/** A WebGL game of the given size, resolved with its scene once that scene has been created. */
function game(width: number, height: number, preload?: (scene: any) => void) {
  return new Promise<{ game: any; scene: any }>((resolve) => {
    const g = new Phaser.Game({
      type: Phaser.WEBGL,
      width,
      height,
      transparent: true,
      banner: false,
      audio: { noAudio: true },
      render: { preserveDrawingBuffer: true, antialias: false, pixelArt: true },
      scene: {
        preload() {
          preload?.(this);
        },
        create() {
          resolve({ game: g, scene: this });
        },
      },
    });
  });
}

/** The canvas's pixels after the next two renders. */
async function snapshot(g: any): Promise<number[]> {
  for (let i = 0; i < 2; i++) await new Promise((r) => g.events.once('postrender', r));
  const canvas = document.createElement('canvas');
  canvas.width = g.canvas.width;
  canvas.height = g.canvas.height;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(g.canvas, 0, 0);
  return Array.from(ctx.getImageData(0, 0, canvas.width, canvas.height).data);
}

type Transform = 'none' | 'mirror' | 'turn';

function transform(sprite: any, how: Transform) {
  if (how === 'mirror') sprite.setFlipX(true);
  if (how === 'turn') sprite.angle = 90;
}

/** Renders `animation` at each time with the sprite's origin at `origin`. */
async function renderFrames(
  json: unknown,
  animation: string,
  times: number[],
  origin: { x: number; y: number },
  size: { w: number; h: number },
  how: Transform = 'none',
) {
  const file = json as { size: [number, number] };
  const { game: g, scene } = await game(size.w, size.h);
  scene.textures.addCanvas('sheet', sheetCanvas(file.size[0], file.size[1]));
  const sheet = sb.sheet(scene, 'sheet', { file: json });
  const sprite = sheet.sprite(scene, origin.x, origin.y, animation, { autoUpdate: false });
  scene.add.existing(sprite);
  transform(sprite, how);
  const out = [];
  for (const t of times) {
    sprite.seek(t);
    out.push({ time: t, index: sprite.player.state.index, pixels: await snapshot(g) });
  }
  g.destroy(true);
  return { version: sb.version, frames: out };
}

/** Renders a lit sprite at each frame of `animation`, mirrored or turned if asked. */
async function renderLit(
  json: unknown,
  animation: string,
  settings: Record<string, number>,
  origin: { x: number; y: number },
  size: { w: number; h: number },
  how: Transform,
) {
  const file = json as { size: [number, number] };
  const { game: g, scene } = await game(size.w, size.h);
  const [w, h] = file.size;
  scene.textures.addImage('sheet', sheetCanvas(w, h), sheetCanvas(w, h, normalPixel));
  const sheet = sb.sheet(scene, 'sheet', { file: json });
  const light = sb.light(scene, settings);
  const sprite = sheet.sprite(scene, origin.x, origin.y, animation, {
    autoUpdate: false,
    lit: true,
  });
  scene.add.existing(sprite);
  transform(sprite, how);
  const frames = sprite.player.state.animation!.frames;
  const out = [];
  for (let i = 0; i < frames.length; i++) {
    sprite.seek(frames.slice(0, i).reduce((t, f) => t + f.duration, 0));
    out.push({ index: sprite.player.state.index, pixels: await snapshot(g) });
  }
  const p = light.phaserLight;
  const used = {
    x: p.x,
    y: p.y,
    z: p.z,
    radius: p.radius,
    intensity: p.intensity,
    color: [p.color.r, p.color.g, p.color.b],
    ambient: [
      scene.lights.ambientColor.r,
      scene.lights.ambientColor.g,
      scene.lights.ambientColor.b,
    ],
  };
  g.destroy(true);
  return { frames: out, light: used };
}

/** Loads a runtime file with the scene's loader, as `this.load.spritebuddy` does. */
async function loadSheet(url: string, options: { path?: string; normals?: boolean } = {}) {
  const { game: g, scene } = await game(16, 16, (s) => {
    if (options.path) s.load.setPath(options.path);
    s.load.spritebuddy('hero', url, { normals: options.normals });
    s.load.setPath('elsewhere/'); // the images are still found beside the JSON
  });
  const sprite = scene.add.spritebuddy(8, 8, 'hero');
  const sheet = sprite.sheet;
  const result = {
    animations: sheet.animations,
    frames: sheet.file.frames.filter((f: { name: string }) => sheet.texture.has(f.name)).length,
    hasNormals: sheet.hasNormals,
    onDisplayList: scene.sys.displayList.exists(sprite),
    same: sb.sheet(scene, 'hero') === sheet,
  };
  g.destroy(true);
  return result;
}

/** Plays the events fixture's "walk" for 240 ms and lists what the emitter heard. */
async function hearEvents(json: unknown) {
  const { game: g, scene } = await game(16, 16);
  scene.textures.addCanvas('events', sheetCanvas(48, 16));
  const sprite = sb.sheet(scene, 'events', { file: json }).sprite(scene, 0, 0, 'walk', {
    autoUpdate: false,
  });
  const heard: string[] = [];
  sprite.on('event', (name: string, index: number) => heard.push(`event ${name} ${index}`));
  sprite.on('event:step', (index: number) => heard.push(`step ${index}`));
  sprite.onEvent = (name, index) => heard.push(`onEvent ${name} ${index}`);
  for (let t = 0; t < 240; t += 40) sprite.advance(40);
  g.destroy(true);
  return heard;
}

/** Lets the scene's clock play "walk" and reports the frame it reached. */
async function autoPlays(json: unknown) {
  const { game: g, scene } = await game(16, 16);
  scene.textures.addCanvas('events', sheetCanvas(48, 16));
  sb.sheet(scene, 'events', { file: json }); // made once; sb.add finds it
  const sprite = sb.add(scene, 0, 0, 'events', 'walk');
  const frames: number[] = [];
  sprite.on('frame', (i: number) => frames.push(i));
  await new Promise((r) => setTimeout(r, 400));
  sprite.destroy();
  g.destroy(true);
  return frames;
}

Object.assign(window, { renderFrames, renderLit, loadSheet, hearEvents, autoPlays });
