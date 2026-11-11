import { build } from 'esbuild';
import { readFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { join } from 'node:path';
import { chromium, type Browser } from 'playwright';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { parseFile } from '@spritebuddy/core';
import { partsAt, sheetPixel, softwareRender } from './pattern';
import { png } from './png.test-util';

/**
 * Renders SpriteBuddy sprites with real PixiJS 5, 6, 7 and 8 in Chromium and checks every pixel
 * against a software render of the format's rules.
 */
const ROOT = join(__dirname, '../../..');
const fixture = (name: string) =>
  readFileSync(join(ROOT, 'fixtures', `${name}.anims.json`), 'utf8');
const VERSIONS = ['pixi5', 'pixi6', 'pixi7', 'pixi8'] as const;

let browser: Browser;
let server: Server;
let base: string;
const files = new Map<string, { type: string; body: string | Buffer }>();

beforeAll(async () => {
  for (const v of VERSIONS) {
    const out = await build({
      entryPoints: [join(__dirname, 'page.ts')],
      bundle: true,
      write: false,
      format: 'iife',
      target: 'es2020',
      alias: { pixi: v, '@spritebuddy/core': join(ROOT, 'packages/core/src/index.ts') },
      logLevel: 'silent',
    });
    files.set(`/${v}.js`, { type: 'text/javascript', body: out.outputFiles[0]!.text });
    files.set(`/${v}.html`, {
      type: 'text/html',
      body: `<!doctype html><meta charset="utf-8"><body><script src="/${v}.js"></script>`,
    });
  }
  const packed = fixture('packed');
  const size = JSON.parse(packed).size as [number, number];
  for (const dir of ['sheets', 'assets']) {
    files.set(`/${dir}/packed.anims.json`, { type: 'application/json', body: packed });
    files.set(`/${dir}/packed.png`, { type: 'image/png', body: png(size[0], size[1], sheetPixel) });
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

describe.each(VERSIONS)('%s', (version) => {
  it.each(cases)(
    'draws $fixture frames, layers and offsets exactly',
    async (c) => {
      const { p, errors } = await page(version);
      const json = JSON.parse(fixture(c.fixture));
      const result = (await p.evaluate(
        ([json, c]) => (window as any).renderFrames(json, c.animation, c.times, c.origin, c.size), // eslint-disable-line @typescript-eslint/no-explicit-any
        [json, c] as const,
      )) as { version: number; frames: { time: number; index: number; pixels: number[] }[] };
      expect(result.version).toBe(version === 'pixi5' ? 6 : Number(version.slice(4)));
      const file = parseFile(json);
      for (const frame of result.frames) {
        const expected = softwareRender(
          partsAt(file, c.animation, frame.index),
          c.origin,
          c.size.w,
          c.size.h,
        );
        expect(mismatches(frame.pixels, expected.data, c.size.w), `t=${frame.time}`).toEqual([]);
      }
      expect(errors).toEqual([]);
      await p.close();
    },
    60_000,
  );

  it('loads a runtime file and its image', async () => {
    const { p, errors } = await page(version);
    const result = await p.evaluate(
      (url) => (window as any).loadSheet(url),
      `${base}/sheets/packed.anims.json`,
    ); // eslint-disable-line @typescript-eslint/no-explicit-any
    expect(result).toMatchObject({ animations: ['idle'], textures: 3, width: 16 });
    if (version === 'pixi7' || version === 'pixi8') expect(result.assets).toEqual(['idle']);
    expect(errors).toEqual([]);
    await p.close();
  }, 60_000);
});
