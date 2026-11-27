// Bundles the examples playground (examples/playground/main.js and CodeMirror) into
// examples/dist/playground.js.
//
// With --site it also gathers everything the examples load into site/, a folder any static host
// (GitHub Pages, itch.io, a plain web server) can serve as it is: site/examples/ is the
// playground. Run `npm run build` first so the packages' dist folders exist.
import { build } from 'esbuild';
import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

await build({
  entryPoints: [join(ROOT, 'examples/playground/main.js')],
  outfile: join(ROOT, 'examples/dist/playground.js'),
  bundle: true,
  format: 'esm',
  minify: true,
  logLevel: 'warning',
});

if (process.argv.includes('--site')) {
  const SITE = join(ROOT, 'site');
  rmSync(SITE, { recursive: true, force: true });
  // Kept at the same paths as in the repo, so run.html's import map works unchanged.
  const copy = (path, filter) => {
    const from = join(ROOT, path);
    if (!existsSync(from)) throw new Error(`${path} is missing: run \`npm run build\` first`);
    mkdirSync(dirname(join(SITE, path)), { recursive: true });
    cpSync(from, join(SITE, path), { recursive: true, filter });
  };
  copy('examples', (path) => !path.endsWith('.test.ts') && !path.endsWith('.md'));
  for (const pkg of ['core', 'pixi', 'phaser']) copy(`packages/${pkg}/dist`);
  copy('node_modules/pixi8/dist/pixi.mjs');
  copy('node_modules/phaser4/dist/phaser.esm.js');
  writeFileSync(
    join(SITE, 'index.html'),
    '<!doctype html><meta charset="utf-8"><meta http-equiv="refresh" content="0; url=examples/">' +
      '<a href="examples/">SpriteBuddy examples</a>\n',
  );
  writeFileSync(join(SITE, '.nojekyll'), '');
  console.log('Wrote site/: serve it and open /examples/');
}
