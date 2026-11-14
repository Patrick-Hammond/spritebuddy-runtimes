# SpriteBuddy runtimes

Play animations exported from [SpriteBuddy](https://github.com/Patrick-Hammond/spritebuddy) in
your game, with per-frame timing, loop, ping-pong and play-once modes, frame offsets and layers
played live instead of baked into the sheet, and frame events (such as `"hit"` when the sword
lands) for your game to listen for.

Every runtime reads one file, the [runtime file](docs/format.md) (`<name>.anims.json`, version
3), plus its sheet image.

| Package                              | For                     | Status       |
| ------------------------------------ | ----------------------- | ------------ |
| [`@spritebuddy/core`](packages/core) | any JavaScript engine   | 0.3.0 on npm |
| [`@spritebuddy/pixi`](packages/pixi) | PixiJS 5.3+, 6, 7 and 8 | 0.3.0 on npm |
| [`addons/spritebuddy`](godot)        | Godot 4.3+              | 0.3.0        |

## Getting started

1. Make your sheet in [SpriteBuddy](https://github.com/Patrick-Hammond/spritebuddy) and export it
   with **Also write `<name>.anims.json`** ticked. You get `<name>.png` and `<name>.anims.json`.
2. Pick your runtime from the table above and follow its README.
3. Or start from an [example](examples): a plain canvas, PixiJS 8 and Godot 4, all playing the
   same slime.

## The format

- [docs/format.md](docs/format.md): the runtime file, field by field, and how to draw a frame.
- [schema/](schema): its JSON Schema.
- [fixtures/](fixtures): sample files with golden tables (`*.expected.json`) of which frame
  shows at each time and where every part is drawn. Every runtime, in any language, is tested
  against them.

## Working on this repo

```sh
npm install
npm run check      # format, typecheck, tests with 95% coverage (Pixi tests render in Chromium)
npm run build      # builds every package into its dist/
npm run examples   # builds, then serves the examples at http://localhost:8080/examples/
UPDATE_FIXTURES=1 npx vitest run packages/core/src/golden.test.ts   # after a deliberate change
```

Changes are listed in [CHANGELOG.md](CHANGELOG.md).

Licence: ISC.
