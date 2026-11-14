// Bundled once per PixiJS version; `pixi` is aliased to that version's package.
import * as PIXI from 'pixi';
import { spriteBuddy } from '../src/index';
import { normalPixel, sheetPixel } from './pattern';

const sb = spriteBuddy(PIXI as never);
const P = PIXI as any; // eslint-disable-line @typescript-eslint/no-explicit-any

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

async function renderer(width: number, height: number) {
  const options = {
    width,
    height,
    preserveDrawingBuffer: true,
    backgroundAlpha: 0,
    transparent: true,
    antialias: false,
  };
  if (sb.version === 8) return P.autoDetectRenderer({ ...options, preference: 'webgl' });
  return new P.Renderer(options);
}

async function snapshot(r: any, stage: unknown, width: number, height: number) {
  r.render(stage);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(r.canvas ?? r.view, 0, 0);
  return Array.from(ctx.getImageData(0, 0, width, height).data);
}

/** Renders `animation` at each time with the sprite's origin at `origin`. */
async function renderFrames(
  json: unknown,
  animation: string,
  times: number[],
  origin: { x: number; y: number },
  size: { w: number; h: number },
) {
  const file = json as { size: [number, number] };
  const image = P.Texture.from(sheetCanvas(file.size[0], file.size[1]));
  const sheet = sb.sheet(json, image);
  const sprite = sheet.sprite(animation, { autoUpdate: false });
  sprite.x = origin.x;
  sprite.y = origin.y;
  const stage = new P.Container();
  stage.addChild(sprite);
  const r = await renderer(size.w, size.h);
  const out = [];
  for (const t of times) {
    sprite.seek(t);
    out.push({
      time: t,
      index: sprite.player.state.index,
      pixels: await snapshot(r, stage, size.w, size.h),
    });
  }
  return { version: sb.version, frames: out };
}

/** Renders a lit sprite (PixiJS 8) at each frame of `animation`, mirrored or turned if asked. */
async function renderLit(
  json: unknown,
  animation: string,
  light: Record<string, number>,
  origin: { x: number; y: number },
  size: { w: number; h: number },
  transform: 'none' | 'mirror' | 'turn',
) {
  const file = json as { size: [number, number] };
  const image = P.Texture.from(sheetCanvas(file.size[0], file.size[1]));
  const normalMap = P.Texture.from(sheetCanvas(file.size[0], file.size[1], normalPixel));
  const sheet = sb.sheet(json, image, { normalMap });
  const sprite = sheet.sprite(animation, { autoUpdate: false, light: sb.light(light) });
  sprite.x = origin.x;
  sprite.y = origin.y;
  if (transform === 'mirror') (sprite as any).scale.x = -1;
  if (transform === 'turn') (sprite as any).rotation = Math.PI / 2;
  const stage = new P.Container();
  stage.addChild(sprite);
  const r = await renderer(size.w, size.h);
  const frames = sprite.player.state.animation!.frames.length;
  const out = [];
  for (let i = 0; i < frames; i++) {
    sprite.seek(
      sprite.player.state.animation!.frames.slice(0, i).reduce((t, f) => t + f.duration, 0),
    );
    out.push({
      index: sprite.player.state.index,
      pixels: await snapshot(r, stage, size.w, size.h),
    });
  }
  // Changing the light takes effect on the next render.
  sprite.light!.set({ ambient: 1, brightness: 0, opacity: 1 });
  const unlit = await snapshot(r, stage, size.w, size.h);
  return { frames: out, unlit };
}

async function loadSheet(url: string) {
  const sheet = await sb.load(url);
  const result: Record<string, unknown> = {
    animations: sheet.animations,
    textures: sheet.textures.length,
    width: (sheet.texture('idle_2') as any).orig?.width ?? (sheet.texture('idle_2') as any).width,
  };
  if (P.Assets && P.extensions) {
    P.extensions.add(sb.assetsParser);
    const viaAssets = await P.Assets.load(url.replace('/sheets/', '/assets/'));
    result.assets = viaAssets.animations;
  }
  return result;
}

/** Plays the events fixture's "walk" for 240 ms and lists what the emitter heard. */
function hearEvents(json: unknown) {
  const sheet = sb.sheet(json, P.Texture.from(sheetCanvas(48, 16)));
  const sprite = sheet.sprite('walk', { autoUpdate: false });
  const heard: string[] = [];
  sprite.on('event', (name: string, index: number) => heard.push(`event ${name} ${index}`));
  sprite.on('event:step', (index: number) => heard.push(`step ${index}`));
  sprite.onEvent = (name, index) => heard.push(`onEvent ${name} ${index}`);
  for (let t = 0; t < 240; t += 40) sprite.update(40);
  return heard;
}

Object.assign(window, { renderFrames, renderLit, loadSheet, hearEvents, sbVersion: sb.version });
