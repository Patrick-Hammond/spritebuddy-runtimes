import { build } from 'esbuild';
import { readFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { join } from 'node:path';
import { chromium, type Browser } from 'playwright';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { parseFile, type Part } from '@spritebuddy/core';
import {
  mirrorX,
  normalPixel,
  partsAt,
  rotateCW,
  sheetPixel,
  softwareRender,
} from '../../pixi/test/pattern';
import { png } from '../../pixi/test/png.test-util';

/**
 * Renders SpriteBuddy sprites with real Phaser 3 and 4 in Chromium and checks every pixel against
 * a software render of the format's rules (and, for lit sprites, of Phaser's own lighting).
 */
const ROOT = join(__dirname, '../../..');
const fixture = (name: string) =>
  readFileSync(join(ROOT, 'fixtures', `${name}.anims.json`), 'utf8');
const VERSIONS = ['phaser3', 'phaser4'] as const;

let browser: Browser;
let server: Server;
let base: string;
const files = new Map<string, { type: string; body: string | Buffer }>();

beforeAll(async () => {
  const out = await build({
    entryPoints: [join(__dirname, 'page.ts')],
    bundle: true,
    write: false,
    format: 'iife',
    target: 'es2020',
    alias: { '@spritebuddy/core': join(ROOT, 'packages/core/src/index.ts') },
    logLevel: 'silent',
  });
  files.set('/page.js', { type: 'text/javascript', body: out.outputFiles[0]!.text });
  for (const v of VERSIONS) {
    const phaser = readFileSync(join(ROOT, 'node_modules', v, 'dist/phaser.min.js'));
    files.set(`/${v}.js`, { type: 'text/javascript', body: phaser });
    files.set(`/${v}.html`, {
      type: 'text/html',
      body: `<!doctype html><meta charset="utf-8"><body><script src="/${v}.js"></script><script src="/page.js"></script>`,
    });
  }
  for (const name of ['packed', 'normals']) {
    const json = fixture(name);
    const { size, image, normals } = JSON.parse(json);
    const [w, h] = size as [number, number];
    files.set(`/sheets/${name}.anims.json`, { type: 'application/json', body: json });
    files.set(`/sheets/${image}`, { type: 'image/png', body: png(w, h, sheetPixel) });
    if (normals)
      files.set(`/sheets/${normals}`, { type: 'image/png', body: png(w, h, normalPixel) });
  }
  server = createServer((req, res) => {
    const file = files.get((req.url ?? '').split('?')[0]!);
    res.writeHead(file ? 200 : 404, { 'content-type': file?.type ?? 'text/plain' });
    res.end(file?.body ?? 'not found');
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader'] });
}, 120_000);

afterAll(async () => {
  await browser?.close();
  server?.close();
});

async function page(version: string) {
  const p = await browser.newPage();
  const errors: string[] = [];
  p.on('pageerror', (e) => errors.push(e.message));
  p.on('response', (r) => r.status() >= 400 && errors.push(`${r.status()}: ${r.url()}`));
  await p.goto(`${base}/${version}.html`);
  await p.waitForFunction(() => 'renderFrames' in window);
  return { p, errors };
}

/** Differences beyond rounding between a render and the software render. */
function mismatches(actual: number[], expected: Uint8ClampedArray, width: number): string[] {
  const out: string[] = [];
  for (let i = 0; i < expected.length; i += 4) {
    const ea = expected[i + 3]!;
    const aa = actual[i + 3]!;
    const close =
      Math.abs(ea - aa) <= 3 &&
      (ea === 0 || [0, 1, 2].every((c) => Math.abs(expected[i + c]! - actual[i + c]!) <= 4));
    if (!close && out.length < 5) {
      const p = i / 4;
      out.push(
        `(${p % width},${Math.floor(p / width)}) expected ${[...expected.subarray(i, i + 4)]} got ${actual.slice(i, i + 4)}`,
      );
    }
  }
  return out;
}

const cases = [
  {
    fixture: 'layers',
    animation: 'slash',
    times: [0, 120, 220],
    origin: { x: 40, y: 48 },
    size: { w: 96, h: 64 },
  },
  {
    fixture: 'packed',
    animation: 'idle',
    times: [0, 150, 300],
    origin: { x: 24, y: 32 },
    size: { w: 48, h: 48 },
  },
];

type Transform = 'none' | 'mirror' | 'turn';
type Image = ReturnType<typeof softwareRender>;

/** What a sprite turned or mirrored about its origin looks like. */
const transformed = (image: Image, how: Transform, origin: { x: number; y: number }) =>
  how === 'mirror'
    ? mirrorX(image, origin.x)
    : how === 'turn'
      ? rotateCW(image, origin.x, origin.y)
      : image;

describe.each(VERSIONS)('%s', (version) => {
  it.each(cases)(
    'draws $fixture frames, layers and offsets exactly',
    async (c) => {
      const { p, errors } = await page(version);
      const json = JSON.parse(fixture(c.fixture));
      const file = parseFile(json);
      for (const how of ['none', 'mirror'] as const) {
        const result = (await p.evaluate(
          ([json, c, how]) =>
            (window as any).renderFrames(json, c.animation, c.times, c.origin, c.size, how), // eslint-disable-line @typescript-eslint/no-explicit-any
          [json, c, how] as const,
        )) as { version: number; frames: { time: number; index: number; pixels: number[] }[] };
        expect(result.version).toBe(Number(version.slice(6)));
        for (const frame of result.frames) {
          const parts = partsAt(file, c.animation, frame.index);
          const expected = transformed(
            softwareRender(parts, c.origin, c.size.w, c.size.h),
            how,
            c.origin,
          );
          expect(
            mismatches(frame.pixels, expected.data, c.size.w),
            `${how} t=${frame.time}`,
          ).toEqual([]);
        }
      }
      expect(errors).toEqual([]);
      await p.close();
    },
    60_000,
  );

  it('loads a runtime file, its sheet and its normal map with the scene loader', async () => {
    const { p, errors } = await page(version);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const load = (url: string, options: object) =>
      p.evaluate(([url, options]) => (window as any).loadSheet(url, options), [url, options]); // eslint-disable-line @typescript-eslint/no-explicit-any
    expect(await load(`${base}/sheets/packed.anims.json`, {})).toEqual({
      animations: ['idle'],
      frames: 3,
      hasNormals: false,
      onDisplayList: true,
      same: true,
    });
    // A relative URL under the loader's path, and a normal map.
    expect(await load('normals.anims.json', { path: `${base}/sheets/` })).toMatchObject({
      animations: ['idle', 'turn'],
      hasNormals: true,
    });
    expect(await load(`${base}/sheets/normals.anims.json`, { normals: false })).toMatchObject({
      hasNormals: false,
    });
    expect(errors).toEqual([]);
    await p.close();
  }, 60_000);

  it('emits frame events on the sprite', async () => {
    const { p, errors } = await page(version);
    const heard = await p.evaluate(
      (json) => (window as any).hearEvents(json), // eslint-disable-line @typescript-eslint/no-explicit-any
      JSON.parse(fixture('events')),
    );
    // walk: 80 ms frames, step on frames 0 and 2; frame 2 starts at 160 and frame 0 again at 240.
    expect(heard).toEqual([
      'onEvent step 2',
      'event step 2',
      'step 2',
      'onEvent step 0',
      'event step 0',
      'step 0',
    ]);
    expect(errors).toEqual([]);
    await p.close();
  }, 60_000);

  it("plays itself on the scene's clock", async () => {
    const { p, errors } = await page(version);
    const frames = (await p.evaluate(
      (json) => (window as any).autoPlays(json), // eslint-disable-line @typescript-eslint/no-explicit-any
      JSON.parse(fixture('events')),
    )) as number[];
    expect(frames.slice(0, 3)).toEqual([1, 2, 0]); // walk has three 80 ms frames
    expect(errors).toEqual([]);
    await p.close();
  }, 60_000);

  interface UsedLight {
    x: number;
    y: number;
    z: number;
    radius: number;
    intensity: number;
    color: number[];
    ambient: number[];
  }

  /**
   * Lights one pixel the way Phaser's lighting shader does, from the screen-space normal the
   * pixel should have (y up). Phaser 3 keeps its lights at a fixed low height.
   */
  function phaserShade(
    light: UsedLight,
    width: number,
    height: number,
    turn?: { x: number; y: number },
  ) {
    const res = version === 'phaser4' ? Math.min(width, height) : Math.min(width, height) / 2;
    return (rgb: readonly number[], sx: number, sy: number, part: Part, ux: number, uy: number) => {
      const [r, g, b] = normalPixel(sx, sy);
      let n = [(r / 255) * 2 - 1, (g / 255) * 2 - 1, (b / 255) * 2 - 1];
      if (part.frame.rotated) n = [-n[1]!, n[0]!, n[2]!];
      if (part.flipX) n[0] = -n[0]!;
      if (part.flipY) n[1] = -n[1]!;
      // A sprite turned 90° clockwise about `turn`: the pixel lands elsewhere, normal turned too.
      let dx = ux;
      let dy = uy;
      if (turn) {
        dx = turn.x + turn.y - uy - 1;
        dy = turn.y - turn.x + ux;
        n = [n[1]!, -n[0]!, n[2]!];
      }
      const len = Math.hypot(n[0]!, n[1]!, n[2]!);
      n = n.map((v) => v / len);
      const l = [
        (light.x - (dx + 0.5)) / res,
        (height - light.y - (height - dy - 0.5)) / res,
        version === 'phaser4' ? light.z / res : 0.1,
      ];
      const dist = Math.hypot(l[0]!, l[1]!, l[2]!);
      const diffuse = Math.max(0, (n[0]! * l[0]! + n[1]! * l[1]! + n[2]! * l[2]!) / dist);
      const radius = light.radius / res;
      const att = Math.min(1, Math.max(0, 1 - (dist * dist) / (radius * radius)));
      return rgb
        .slice(0, 3)
        .map((c, i) =>
          Math.min(
            255,
            c * (light.ambient[i]! + light.color[i]! * diffuse * att * light.intensity),
          ),
        );
    };
  }

  const lit = { color: 0xffe0c0, brightness: 1.2, ambient: 0.3 };
  const origin = { x: 24, y: 40 };
  const size = { w: 48, h: 48 };

  it.each([
    { animation: 'idle', how: 'none', light: { radius: 40, x: 40, y: 20, z: 12 } },
    { animation: 'idle', how: 'mirror', light: { radius: 40, x: 40, y: 20, z: 12 } },
    { animation: 'idle', how: 'turn', light: { radius: 50, x: 20, y: 4, z: 6 } },
    { animation: 'turn', how: 'none', light: { radius: 40, x: 8, y: 30, z: 12 } },
    { animation: 'turn', how: 'mirror', light: { radius: 40, x: 8, y: 30, z: 12 } },
    { animation: 'idle', how: 'none', light: { angle: 300, height: 30 } },
  ] as const)(
    'lights $animation ($how) through its normal map, from the right side',
    async ({ animation, how, light }) => {
      const { p, errors } = await page(version);
      const json = JSON.parse(fixture('normals'));
      const settings = { ...lit, ...light };
      const result = (await p.evaluate(
        ([json, animation, settings, origin, size, how]) =>
          (window as any).renderLit(json, animation, settings, origin, size, how), // eslint-disable-line @typescript-eslint/no-explicit-any
        [json, animation, settings, origin, size, how] as const,
      )) as { frames: { index: number; pixels: number[] }[]; light: UsedLight };
      const file = parseFile(json);
      expect(result.frames.length).toBeGreaterThan(0);
      const turn = how === 'turn' ? origin : undefined;
      const shade = phaserShade(result.light, size.w, size.h, turn);
      for (const frame of result.frames) {
        const parts = partsAt(file, animation, frame.index).map((part) => moved(part, how));
        const upright = softwareRender(parts, origin, size.w, size.h, shade);
        const expected = turn ? rotateCW(upright, origin.x, origin.y) : upright;
        expect(mismatches(frame.pixels, expected.data, size.w), `frame ${frame.index}`).toEqual([]);
      }
      expect(errors).toEqual([]);
      await p.close();
    },
    60_000,
  );
});

/** A part as the sprite's mirror puts it: mirrored about the origin. */
function moved(part: Part, how: Transform): Part {
  if (how !== 'mirror') return part;
  return { ...part, x: -(part.x + part.frame.width), flipX: !part.flipX };
}
