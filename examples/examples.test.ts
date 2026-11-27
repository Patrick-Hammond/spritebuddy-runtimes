import Ajv2020 from 'ajv/dist/2020.js';
import { build } from 'esbuild';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { extname, join, normalize } from 'node:path';
import { chromium, type Browser, type Page } from 'playwright';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { parseFile } from '@spritebuddy/core';
import { examples } from './list.js';

/**
 * Keeps the examples working: their assets are valid, and the browser examples run in Chromium
 * against the packages' current source.
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

  it('are the same in the Godot lighting example', () => {
    for (const name of ['slime.png', 'slime_n.png', 'slime.anims.json']) {
      const copy = read(`godot/examples/art/lit/${name}`);
      expect(copy.equals(read(`examples/assets/${name}`)), name).toBe(true);
    }
  });
});

describe('the examples list', () => {
  it('names every example file, and every file it names exists', () => {
    const runnable = examples.filter((e) => !e.link).map((e) => e.id);
    for (const id of runnable)
      expect(existsSync(join(ROOT, `examples/src/${id}.js`)), id).toBe(true);
    const files = readdirSync(join(ROOT, 'examples/src'), { recursive: true, encoding: 'utf8' })
      .filter((f) => f.endsWith('.js'))
      .map((f) => f.replaceAll('\\', '/').replace(/\.js$/, ''));
    expect([...files].sort()).toEqual([...runnable].sort());
    expect(new Set(examples.map((e) => e.id)).size).toBe(examples.length);
  });
});

describe('published packages', () => {
  // Node and browsers resolve ES modules without guessing extensions, so `./types` would only
  // work through a bundler. Built files must import `./types.js`.
  it('import their own files with a .js extension', () => {
    for (const pkg of ['core', 'pixi', 'phaser', 'cocos']) {
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
    for (const pkg of ['core', 'pixi', 'phaser']) {
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
    const playground = await build({
      entryPoints: [join(ROOT, 'examples/playground/main.js')],
      bundle: true,
      write: false,
      format: 'esm',
      logLevel: 'silent',
    });
    builds.set('/examples/dist/playground.js', playground.outputFiles[0]!.text);
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

  /** Opens one example on its own, and waits for the global it sets when it is running. */
  async function open(
    example: string,
    ready = 'exampleReady',
  ): Promise<{ page: Page; errors: string[] }> {
    const page = await browser.newPage();
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('requestfailed', (r) => errors.push(`failed: ${r.url()}`));
    page.on('response', (r) => r.status() >= 400 && errors.push(`${r.status()}: ${r.url()}`));
    await page.goto(`${base}/examples/run.html?example=${example}`);
    await page.waitForFunction((ready) => ready in window, ready, { timeout: 40_000 });
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

  /** How many pixels of the canvas are clearly brighter than the stress tests' dark floor. */
  async function drawnPixels(page: Page, canvas: string): Promise<number> {
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
        if (data[i]! + data[i + 1]! + data[i + 2]! > 90) count++;
      }
      return count;
    }, shot.toString('base64'));
  }

  it('the canvas example draws the slime and switches animations', async () => {
    const { page, errors } = await open('canvas/drawing');
    await expect.poll(() => greenPixels(page)).toBeGreaterThan(500);
    await page.getByRole('button', { name: 'jump' }).click();
    await expect.poll(() => page.textContent('#status')).toContain('"jump"');
    // "jump" plays once, then onComplete goes back to idle.
    await expect.poll(() => page.textContent('#status'), { timeout: 5000 }).toContain('"idle"');
    expect(errors).toEqual([]);
    await page.close();
  }, 60_000);

  it('the PixiJS example draws three slimes, and one jumps when clicked', async () => {
    const { page, errors } = await open('pixi/sprites');
    await expect.poll(() => greenPixels(page, '#stage canvas')).toBeGreaterThan(1500);
    const canvas = (await page.locator('#stage canvas').boundingBox())!;
    // The middle slime stands at (240, 200), about 14 × 11 pixels drawn at 6×.
    await page.mouse.click(canvas.x + 240, canvas.y + 200 - 30);
    await expect.poll(() => page.textContent('#status')).toBe('Slime 2 jumps');
    expect(errors).toEqual([]);
    await page.close();
  }, 60_000);

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
    const { page, errors } = await open('pixi/lighting', 'lightingExample');
    // Puts the slime somewhere and measures it: it is 14 × 11 pixels drawn at 5×, standing on y.
    const at = async (x: number, y: number) => {
      await page.evaluate(
        ([x, y]) => Object.assign((window as any).lightingExample.slime, { x, y }), // eslint-disable-line @typescript-eslint/no-explicit-any
        [x, y] as const,
      );
      await page.waitForTimeout(100);
      return brightness(page, '#stage canvas', [x - 35, y - 55, x + 35, y]);
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
    expect(await page.textContent('#status')).toMatch(/lighting the slime from the left/);

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
  }, 60_000);

  it('the Phaser example draws three slimes, and one jumps when clicked', async () => {
    const { page, errors } = await open('phaser/sprites');
    await expect.poll(() => greenPixels(page, '#stage canvas')).toBeGreaterThan(1500);
    expect(await page.textContent('#status')).toMatch(/^Loaded 5 animations/);
    const canvas = (await page.locator('#stage canvas').boundingBox())!;
    // The middle slime stands at (240, 200), about 14 × 11 pixels drawn at 6×.
    await page.mouse.click(canvas.x + 240, canvas.y + 200 - 30);
    await expect.poll(() => page.textContent('#status')).toBe('Slime 2 jumps');
    expect(errors).toEqual([]);
    await page.close();
  }, 60_000);

  it('the Phaser lighting example lights the slime from the candle, and the keys move it', async () => {
    const { page, errors } = await open('phaser/lighting', 'lightingExample');
    const slime = (key: string) =>
      page.evaluate((key) => (window as any).lightingExample.slime[key], key); // eslint-disable-line @typescript-eslint/no-explicit-any
    // Puts the slime somewhere and measures it: it is 14 × 11 pixels drawn at 5×, standing on y.
    const at = async (x: number, y: number) => {
      await page.evaluate(
        ([x, y]) => Object.assign((window as any).lightingExample.slime, { x, y }), // eslint-disable-line @typescript-eslint/no-explicit-any
        [x, y] as const,
      );
      await page.waitForTimeout(100);
      return brightness(page, '#stage canvas', [x - 35, y - 55, x + 35, y]);
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
    expect(await page.textContent('#status')).toMatch(/lighting the slime from the left/);

    await page.keyboard.down('ArrowRight');
    await expect.poll(() => slime('x')).toBeGreaterThan(330);
    expect(await slime('animation')).toBe('walk');
    await page.keyboard.up('ArrowRight');
    await expect.poll(() => slime('animation')).toBe('idle');

    // Walking left flips the slime, and it is still lit from the candle's side.
    await page.keyboard.down('ArrowLeft');
    await expect.poll(() => slime('flipX')).toBe(true);
    await page.keyboard.up('ArrowLeft');
    const flipped = await at(310, 190);
    expect(flipped.left).toBeGreaterThan(flipped.right);
    expect(errors).toEqual([]);
    await page.close();
  }, 60_000);

  for (const engine of ['pixi', 'phaser']) {
    it(`the ${engine} lighting stress test draws lit slimes and remakes them at new counts`, async () => {
      // Few enough that a slow machine keeps up; the counts come from the address.
      const { page, errors } = await open(`${engine}/stress&lights=4&slimes=40`, 'stressExample');
      await expect
        .poll(() => page.textContent('#status'))
        .toMatch(/^\d+ fps · 4 lights · 40 lit slimes$/);
      // Lit or in the dark, the slimes are drawn: plenty of the canvas is brighter than the floor.
      await expect.poll(() => drawnPixels(page, '#stage canvas')).toBeGreaterThan(1000);
      // The sliders change the counts.
      for (const [index, value] of [
        ['0', '20'],
        ['1', '50'],
      ]) {
        await page.locator('input[type=range]').nth(Number(index)).fill(value!);
      }
      await expect
        .poll(() => page.textContent('#status'))
        .toMatch(/^\d+ fps · 20 lights · 50 lit slimes$/);
      expect(errors).toEqual([]);
      await page.close();
    }, 60_000);
  }

  it('the playground lists the examples and runs the chosen one beside its code', async () => {
    const page = await browser.newPage({ viewport: { width: 1400, height: 800 } });
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(`${base}/examples/#pixi/sprites`);
    const links = page.locator('#list a');
    await expect.poll(() => links.allTextContents()).toEqual(examples.map((e) => e.title));
    await expect(page.locator('#list a[aria-current]').textContent()).resolves.toBe(
      'Sprites and clicks',
    );
    const preview = page.frameLocator('#preview');
    await expect
      .poll(() => preview.locator('#status').textContent(), { timeout: 40_000 })
      .toMatch(/^Loaded 5 animations/);
    await expect
      .poll(() => page.locator('.cm-content').textContent())
      .toContain('spriteBuddy(PIXI)');

    // Picking another example shows its code and runs it.
    await page.locator('#list a', { hasText: 'Drawing by hand' }).click();
    expect(page.url()).toMatch(/#canvas\/drawing$/);
    await expect.poll(() => page.locator('.cm-content').textContent()).toContain('new Player(');
    await expect
      .poll(() => preview.locator('#status').textContent(), { timeout: 40_000 })
      .toContain('"party"');

    // Editing the code runs it again, with the edit.
    await page.locator('.cm-content').click();
    await page.keyboard.press('Control+End');
    await page.keyboard.type("\nstatus.textContent = 'Edited!';");
    await expect
      .poll(() => preview.locator('#status').textContent(), { timeout: 40_000 })
      .toBe('Edited!');
    // A mistake shows in the preview.
    await page.keyboard.type("\nthrow new Error('Oops');");
    await expect
      .poll(() => preview.locator('#error').textContent(), { timeout: 40_000 })
      .toContain('Oops');
    // Reset puts the example back as it was.
    await page.locator('#reset').click();
    await expect.poll(() => page.locator('.cm-content').textContent()).not.toContain('Oops');
    await expect
      .poll(() => preview.locator('#status').textContent(), { timeout: 40_000 })
      .toContain('"party"');
    expect(await preview.locator('#error').isHidden()).toBe(true);

    // The filter narrows the list.
    await page.locator('#filter').fill('stress');
    await expect
      .poll(() => page.locator('#list a:visible').allTextContents())
      .toEqual(['Lighting stress test', 'Lighting stress test']);
    await page.locator('#filter').fill('');

    // Godot runs in its own editor, so its entry links to the scenes instead.
    await page.locator('#list a', { hasText: 'Slime and candle scenes' }).click();
    await expect.poll(() => page.locator('#external-link').isVisible()).toBe(true);
    expect(await page.locator('#external-link').getAttribute('href')).toMatch(/godot\/examples$/);
    expect(await page.locator('#workspace').isHidden()).toBe(true);
    // And so does Unity.
    await page.locator('#list a[data-id="unity/scenes"]').click();
    await expect
      .poll(() => page.locator('#external-link').getAttribute('href'))
      .toMatch(/unity\/examples$/);
    // The mistake typed above. (A run cut short by the next one can add an error of its own.)
    expect(errors).toContain('Oops');
    await page.close();
  }, 120_000);
});
