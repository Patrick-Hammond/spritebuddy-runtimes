# SpriteBuddy runtimes

Play animations exported from [SpriteBuddy](https://github.com/Patrick-Hammond/spritebuddy) in
your game, with per-frame timing, loop, ping-pong and play-once modes, frame offsets and layers
played live instead of baked into the sheet.

Every runtime reads one file, the [runtime file](docs/format.md) (`<name>.anims.json`, version
3), plus its sheet image.

| Package                              | For                   | Status      |
| ------------------------------------ | --------------------- | ----------- |
| [`@spritebuddy/core`](packages/core) | any JavaScript engine | in progress |
| `@spritebuddy/pixi`                  | PixiJS 5, 6, 7 and 8  | planned     |
| `addons/spritebuddy`                 | Godot 4               | planned     |

## The format

- [docs/format.md](docs/format.md): the runtime file, field by field, and how to draw a frame.
- [schema/](schema): its JSON Schema.
- [fixtures/](fixtures): sample files with golden tables (`*.expected.json`) of which frame
  shows at each time and where every part is drawn. Every runtime, in any language, is tested
  against them.

## Working on this repo

```sh
npm install
npm run check      # format, typecheck, tests with 95% coverage
npm run build      # builds every package into its dist/
UPDATE_FIXTURES=1 npx vitest run packages/core/src/golden.test.ts   # after a deliberate change
```

Licence: ISC.
