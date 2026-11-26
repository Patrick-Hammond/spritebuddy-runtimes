import Ajv2020 from 'ajv/dist/2020.js';
import { build } from 'esbuild';
import { readdirSync, readFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { extname, join, normalize } from 'node:path';
import { chromium, type Browser, type Page } from 'playwright';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { parseFile } from '@spritebuddy/core';

/**
 * Keeps the examples working: their assets are valid, and both browser examples run in
 * Chromium against the packages' current source.
 */
const ROOT = join(__dirname, '..');
const read = (path: string) => readFileSync(join(ROOT, path));

describe('example assets', () => {
  const json = JSON.parse(read('examples/assets/slime.anims.json').toString('utf8'));

  it('are a valid runtime file', () => {
    const schema = JSON.parse(read('schema/spritebuddy-animations.v3.schema.json').toString());
    const validate = new Ajv2020({ strict: true, allErrors: true }).compile(schema);
    expect(validate(json) ? null : validate.errors).toBeNull();
    const file = parseFile(json);
    expect(file.animations.map((a) => a.name)).toEqual(['idle', 'jump', 'walk', 'party', 'candle']);
    expect(file.normals).toBe('slime_n.png');
  });

  it('match the sheet image and its normal map', () => {
    for (const name of ['slime.png', 'slime_n.png']) {
      const png = read(`examples/assets/${name}`);
      expect([png.readUInt32BE(16), png.readUInt32BE(20)], name).toEqual(json.size);
    }
  });
});

describe('published packages', () => {
  // Node and browsers resolve ES modules without guessing extensions, so `./types` would only
  // work through a bundler. Built files must import `./types.js`.
  it('import their own files with a .js extension', () => {
    for (const pkg of ['core', 'pixi']) {
      const dir = join(ROOT, 'packages', pkg, 'src');
      for (const name of readdirSync(dir).filter((f) => /(?<!\.test)\.ts$/.test(f))) {
        const source = readFileSync(join(dir, name), 'utf8');
        const bare = [...source.matchAll(/from '(\.[^']*)'/g)]
          .map((m) => m[1]!)
          .filter((p) => !p.endsWith('.js'));
        expect(bare, `${pkg}/src/${name}`).toEqual([]);
      }
    }
  });
});

describe('browser examples', () => {
  const TYPES: Record<string, string> = {
    '.html': 'text/html',
    '.js': 'text/javascript',
    '.mjs': 'text/javascript',
    '.css': 'text/css',
    '.json': 'application/json',
    '.png': 'image/png',
  };
  /** The packages' builds, made from source so the test needs no `npm run build`. */
  const builds = new Map<string, string>();
  let server: Server;
  let browser: Browser;
  let base: string;

  beforeAll(async () => {
    for (const pkg of ['core', 'pixi']) {
      const out = await build({
        entryPoints: [join(ROOT, 'packages', pkg, 'src/index.ts')],
        bundle: true,
        write: false,
        format: 'esm',
        external: ['@spritebuddy/core'],
        logLevel: 'silent',
      });
      builds.set(`/packages/${pkg}/dist/index.js`, out.outputFiles[0]!.text);
    }
    server = createServer((req, res) => {
      let path = decodeURIComponent((req.url ?? '/').split('?')[0]!);
      if (path.endsWith('/')) path += 'index.html';
      const built = builds.get(path);
      let body: string | Buffer | undefined = built;
      if (body === undefined) {
        try {
          body = readFileSync(join(ROOT, normalize(path).replace(/^(\.\.[/\\])+/, '')));
        } catch {
          body = undefined;
        }
      }
      res.writeHead(body === undefined ? 404 : 200, {
        'content-type': TYPES[extname(path)] ?? 'application/octet-stream',
      });
      res.end(body ?? 'not found');
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader'] });
  }, 120_000);

  afterAll(async () => {
    await browser?.close();
    server?.close();
  });

  async function open(example: string): Promise<{ page: Page; errors: string[] }> {
    const page = await browser.newPage();
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('requestfailed', (r) => errors.push(`failed: ${r.url()}`));
    page.on('response', (r) => r.status() >= 400 && errors.push(`${r.status()}: ${r.url()}`));
    await page.goto(`${base}/examples/${example}/`);
    await page.waitForFunction(() => 'exampleReady' in window, null, { timeout: 20_000 });
    return { page, errors };
  }

  /**
   * How many pixels of the canvas are slime green-ish, from a screenshot (a WebGL canvas can't
   * be read back once it has been shown).
   */
  async function greenPixels(page: Page, canvas = 'canvas'): Promise<number> {
    const shot = await page.locator(canvas).screenshot();
    return page.evaluate(async (base64) => {
      const image = new Image();
      image.src = `data:image/png;base64,${base64}`;
      await image.decode();
      const copy = document.createElement('canvas');
      copy.width = image.width;
      copy.height = image.height;
      const ctx = copy.getContext('2d')!;
      ctx.drawImage(image, 0, 0);
      const data = ctx.getImageData(0, 0, copy.width, copy.height).data;
      let count = 0;
      for (let i = 0; i < data.length; i += 4) {
        if (data[i + 1]! > 150 && data[i]! < 120 && data[i + 2]! < 140) count++;
      }
      return count;
    }, shot.toString('base64'));
  }

  it('the canvas example draws the slime and switches animations', async () => {
    const { page, errors } = await open('canvas');
    await expect.poll(() => greenPixels(page)).toBeGreaterThan(500);
    await page.getByRole('button', { name: 'jump' }).click();
    await expect.poll(() => page.textContent('#status')).toContain('"jump"');
    // "jump" plays once, then onComplete goes back to idle.
    await expect.poll(() => page.textContent('#status'), { timeout: 5000 }).toContain('"idle"');
    expect(errors).toEqual([]);
    await page.close();
  }, 30_000);

  it('the PixiJS example draws three slimes, and one jumps when clicked', async () => {
    const { page, errors } = await open('pixi');
    await expect.poll(() => greenPixels(page, '#stage canvas')).toBeGreaterThan(1500);
    const canvas = (await page.locator('#stage canvas').boundingBox())!;
    // The middle slime stands at (240, 200), about 14 × 11 pixels drawn at 6×.
    await page.mouse.click(canvas.x + 240, canvas.y + 200 - 30);
    await expect.poll(() => page.textContent('#status')).toBe('Slime 2 jumps');
    expect(errors).toEqual([]);
    await page.close();
  }, 30_000);

  /** Mean brightness (r + g + b) of the left and right halves of a box on a canvas. */
  async function brightness(page: Page, canvas: string, box: number[]) {
    const shot = await page.locator(canvas).screenshot();
    return page.evaluate(
      async ([base64, [x0, y0, x1, y1]]) => {
        const image = new Image();
        image.src = `data:image/png;base64,${base64}`;
        await image.decode();
        const copy = document.createElement('canvas');
        copy.width = image.width;
        copy.height = image.height;
        const ctx = copy.getContext('2d')!;
        ctx.drawImage(image, 0, 0);
        const half = (from: number, to: number) => {
          const data = ctx.getImageData(from, y0!, to - from, y1! - y0!).data;
          let sum = 0;
          for (let i = 0; i < data.length; i += 4) sum += data[i]! + data[i + 1]! + data[i + 2]!;
          return sum / (data.length / 4);
        };
        const mid = Math.round((x0! + x1!) / 2);
        return { left: half(x0!, mid), right: half(mid, x1!) };
      },
      [shot.toString('base64'), box] as const,
    );
  }

  it('the PixiJS lighting example lights the slime from the candle, and the keys move it', async () => {
    const { page, errors } = await open('pixi');
    await page.waitForFunction(() => 'lightingExample' in window, null, { timeout: 20_000 });
    // Puts the slime somewhere and measures it: it is 14 × 11 pixels drawn at 5×, standing on y.
    const at = async (x: number, y: number) => {
      await page.evaluate(
        ([x, y]) => Object.assign((window as any).lightingExample.slime, { x, y }), // eslint-disable-line @typescript-eslint/no-explicit-any
        [x, y] as const,
      );
      await page.waitForTimeout(100);
      return brightness(page, '#lit-stage canvas', [x - 35, y - 55, x + 35, y]);
    };
    // The candle's flame is at (240, 125).
    const far = await at(60, 290);
    const left = await at(170, 190);
    const right = await at(310, 190);
    const total = (b: { left: number; right: number }) => b.left + b.right;
    expect(total(left)).toBeGreaterThan(total(far) * 1.3);
    // Lit from the side the candle is on.
    expect(left.right).toBeGreaterThan(left.left);
    expect(right.left).toBeGreaterThan(right.right);
    expect(await page.textContent('#lit-status')).toMatch(/lighting the slime from the left/);

    await page.keyboard.down('ArrowRight');
    await expect
      .poll(() => page.evaluate(() => (window as any).lightingExample.slime.x)) // eslint-disable-line @typescript-eslint/no-explicit-any
      .toBeGreaterThan(330);
    expect(await page.evaluate(() => (window as any).lightingExample.slime.animation)).toBe('walk'); // eslint-disable-line @typescript-eslint/no-explicit-any
    await page.keyboard.up('ArrowRight');
    await expect
      .poll(() => page.evaluate(() => (window as any).lightingExample.slime.animation)) // eslint-disable-line @typescript-eslint/no-explicit-any
      .toBe('idle');
    expect(errors).toEqual([]);
    await page.close();
  }, 30_000);
});
