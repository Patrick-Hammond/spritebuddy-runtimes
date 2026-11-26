# Examples

Small, complete programs that play the same sheet, a slime and a candle exported from
SpriteBuddy Pro:

- `idle`: breathing in and out (ping-pong).
- `walk`: a looping squash and stretch.
- `party`: the walk, wearing a hat. The hat is a **live layer**: it is stored on the sheet once
  and drawn on top of each frame at its own position.
- `jump`: plays **once**. The leap is made of **per-frame offsets** that lift the slime without
  new art; the top of the leap lasts longer than the rest (**per-frame timing**).
- `candle`: a flickering flame.

The sheet has a **normal map** (`slime_n.png`), so the PixiJS example can light it in real time.

| Example                             | Uses                | Shows                                                                                                                        |
| ----------------------------------- | ------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| [canvas](canvas)                    | `@spritebuddy/core` | The whole drawing rule by hand on a 2D canvas                                                                                |
| [pixi](pixi)                        | `@spritebuddy/pixi` | Sprites in PixiJS 8, events, clicking to play a jump; a candle's point light lighting a slime you move with the cursor keys  |
| [godot/examples](../godot/examples) | the Godot addon     | Sprites placed in a scene and made in code, signals; a candle's `PointLight2D` lighting a slime you move with the arrow keys |

## Running the browser examples

```sh
npm install
npm run examples   # builds the packages and serves this repo
```

Then open <http://localhost:8080/examples/>. The pages load the packages from this repo's
`packages/*/dist` through an import map; each page's comments show the lines to use instead in
your own project (a CDN URL, or `npm install` and a bundler).

## Running the Godot example

Open the `godot` folder in Godot 4.3 or newer and press Run for the slime demo. For the lighting
demo, open `examples/candle_demo.tscn` and press F6 (Run Current Scene).

## The assets

`assets/` is an export from SpriteBuddy Pro: the sheet (`slime.png`), its normal map
(`slime_n.png`), the runtime file (`slime.anims.json`) and a TexturePacker-style sheet
(`slime.json`). The Godot lighting demo uses a copy in `godot/examples/art/lit/`, since Godot
can only load files inside its own project. The Godot slime demo has its own simpler slime, drawn
by [`scripts/example-assets.mjs`](../scripts/example-assets.mjs); `npm run examples:assets`
redraws it.

`examples.test.ts` keeps everything here working: it checks the assets against the schema and
drives both pages in Chromium, including moving the lit slime around the candle. The Godot test run loads both example scenes.
