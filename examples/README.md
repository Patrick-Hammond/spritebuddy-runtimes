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

The sheet has a **normal map** (`slime_n.png`), so the PixiJS, Phaser, Godot and Unity examples can
light it in real time.

The examples are a **playground**, like PixiJS's: a list of examples down the side, the chosen
one's code in an editor, and the example running beside it. Edit the code and it runs again
(or press Ctrl+Enter); Reset puts it back.

| Example                                                    | Uses                  | Shows                                                                                              |
| ---------------------------------------------------------- | --------------------- | -------------------------------------------------------------------------------------------------- |
| [canvas/drawing](src/canvas/drawing.js)                    | `@spritebuddy/core`   | The whole drawing rule by hand on a 2D canvas                                                      |
| [pixi/sprites](src/pixi/sprites.js)                        | `@spritebuddy/pixi`   | Sprites in PixiJS 8, a live-layer hat, clicking to play a jump                                     |
| [pixi/lighting](src/pixi/lighting.js)                      | `@spritebuddy/pixi`   | A candle's point light lighting a slime you move with the cursor keys                              |
| [pixi/stress](src/pixi/stress.js)                          | `@spritebuddy/pixi`   | A lighting stress test: sliders for lights and lit slimes, and a frames-per-second readout         |
| [phaser/sprites](src/phaser/sprites.js)                    | `@spritebuddy/phaser` | Sprites in Phaser 4 made with `this.add.spritebuddy`, clicking to play a jump                      |
| [phaser/lighting](src/phaser/lighting.js)                  | `@spritebuddy/phaser` | The candle lighting with Phaser's own lights                                                       |
| [phaser/stress](src/phaser/stress.js)                      | `@spritebuddy/phaser` | The same stress test with Phaser's lights (up to 64 at once)                                       |
| [godot/examples](../godot/examples) (linked, not run here) | the Godot addon       | Sprites placed in a scene and made in code, signals; a candle's `PointLight2D` lighting a slime    |
| [cocos](cocos) (linked, not run here)                      | `@spritebuddy/cocos`  | Three slimes, a candle-lit slime, and sounds played by frame events, in Cocos Creator 3.8          |
| [unity/examples](../unity/examples) (linked, not run here) | the Unity package     | Sprites placed in a scene and made in code; a candle's Point Light 2D; frame events playing sounds |

## How it fits together

- `src/<engine>/<name>.js`: one file per example, a complete program. Each draws into the page's
  `#stage` and writes to its `#status` line, and loads `./assets/...`.
- `list.js`: the sidebar, grouped by engine. Add a line here when you add a file.
- `run.html?example=pixi/sprites`: runs one example on its own. Its import map says where the
  packages are; its comments show the CDN lines to use in your own page.
- `index.html` and `playground/`: the playground. `playground/main.js` (with CodeMirror) is
  bundled into `dist/playground.js` by `scripts/build-playground.mjs`.

## Running the browser examples

```sh
npm install
npm run examples        # builds the packages and the playground, and serves this repo
```

Then open <http://localhost:8080/examples/>.

To put the playground online, `npm run examples:site` gathers everything it loads into `site/`,
which any static host can serve as it is (open `site/examples/`). The **Examples site**
workflow does this and publishes it to GitHub Pages when started by hand.

## Running the Godot example

Open the `godot` folder in Godot 4.3 or newer and press Run for the slime demo. For the lighting
demo, open `examples/candle_demo.tscn` and press F6 (Run Current Scene).

## Running the Cocos Creator example

See [cocos/README.md](cocos/README.md): `npm install` and `npm run build` here, `npm install` in
`examples/cocos`, then open that folder in Cocos Creator 3.8 and play a scene from
`assets/scenes`.

## Running the Unity examples

Open the `unity/examples` folder in Unity Hub with Unity 6, open a scene from
`Assets/SpriteBuddyExamples/Scenes` and press Play. See [unity/README.md](../unity/README.md).

## The assets

`assets/` is an export from SpriteBuddy Pro: the sheet (`slime.png`), its normal map
(`slime_n.png`), the runtime file (`slime.anims.json`) and a TexturePacker-style sheet
(`slime.json`). The Godot lighting demo uses a copy in `godot/examples/art/lit/`, since Godot
can only load files inside its own project, and the Unity examples one in
`unity/examples/Assets/SpriteBuddyExamples/Art/` with frame events added for their sounds. The Godot slime demo has its own simpler slime, drawn
by [`scripts/example-assets.mjs`](../scripts/example-assets.mjs); `npm run examples:assets`
redraws it.

`examples.test.ts` keeps everything here working: it checks the assets against the schema and
drives every example and the playground (picking, editing, resetting) in Chromium, including
moving the lit slime around the candle. The Godot test run loads both example scenes.
