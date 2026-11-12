# Examples

Small, complete programs that play the same sheet, a slime with three animations:

- `idle`: breathing in and out (ping-pong).
- `party`: the same, wearing a hat. The hat is a **live layer**: it is stored on the sheet once
  and drawn on top of each frame at its own position.
- `hop`: a jump that plays **once**. The leap is made of **per-frame offsets** that lift the
  slime without new art; the squash frames last longer than the rest (**per-frame timing**).

| Example                             | Uses                | Shows                                               |
| ----------------------------------- | ------------------- | --------------------------------------------------- |
| [canvas](canvas)                    | `@spritebuddy/core` | The whole drawing rule by hand on a 2D canvas       |
| [pixi](pixi)                        | `@spritebuddy/pixi` | Sprites in PixiJS 8, events, clicking to play a hop |
| [godot/examples](../godot/examples) | the Godot addon     | Sprites placed in a scene and made in code, signals |

## Running the browser examples

```sh
npm install
npm run examples   # builds the packages and serves this repo
```

Then open <http://localhost:8080/examples/>. The pages load the packages from this repo's
`packages/*/dist` through an import map; each page's comments show the lines to use instead in
your own project (a CDN URL, or `npm install` and a bundler).

## Running the Godot example

Open the `godot` folder in Godot 4.3 or newer and press Run.

## The assets

`assets/slime.png` and `assets/slime.anims.json` are drawn by
[`scripts/example-assets.mjs`](../scripts/example-assets.mjs), which also copies them into the
Godot example. `npm run examples:assets` redraws them. A real game would export both files from
SpriteBuddy's Export page instead.

`examples.test.ts` keeps everything here working: it checks the assets against the schema and
drives both pages in Chromium. The Godot test run loads the example scene.
