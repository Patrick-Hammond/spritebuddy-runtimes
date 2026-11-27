# Changelog

All runtimes share one version while they are below 1.0.

## Unreleased

- New runtime, `@spritebuddy/cocos`, for Cocos Creator 3.8: `sb.load('path/name.anims')` loads a
  runtime file with its sheet and normal map from a bundle, and `sheet.sprite(parent, animation)`
  makes a node with a `SpriteBuddySprite` component that plays it with per-frame timing, loop
  modes, offsets, live layers and frame events (`onEvent`, and `"event:<name>"` on the node).
  `sb.light(effect, settings)` lights sprites through their normal maps with SpriteBuddy Pro's own
  sums, using the package's `spritebuddy-lit.effect`, directional or as a point light.
- Examples: a Cocos Creator project in `examples/cocos` with three scenes: the slimes, the candle
  lighting demo, and footstep and jump sounds played by frame events.
- New runtime for Defold, in `defold/`: a library (`spritebuddy/`) that loads a runtime file and
  its sheet at run time and plays it with per-frame timing, loop modes, offsets, live layers and
  frame events, through a `spritebuddy.go` game object (properties and messages) or a Lua
  player. Sprites with a normal map can be lit by a point light with SpriteBuddy Pro's light
  model. Games add it as a library zip from the `defold-v*` GitHub releases (the **Defold
  release** workflow builds one). The Defold example project shows three slimes, a candle
  lighting a slime and frame events playing sounds; its tests run the shared fixtures in the
  engine, and CI runs them when started by hand.
- New runtime for Unity 6, `com.spritebuddy.runtime` 0.1.0, a UPM package installed by git URL
  (`unity/com.spritebuddy.runtime`). The **SpriteBuddy Sprite** component plays a runtime file
  with per-frame timing, loop modes, offsets, live layers, rotated and trimmed frames, and frame
  events, and hands the normal map to URP's 2D lights. Examples: a Unity 6 project in
  `unity/examples` with slimes, a candle lighting a slime, and frame events playing sounds.

- Examples: the browser examples are now a playground, like PixiJS's: a list of examples down
  the side, the chosen one's code in an editor (CodeMirror), and the example running beside it.
  Editing the code runs it again. Each example is one file in `examples/src/`, listed in
  `examples/list.js`, and runs on its own at `examples/run.html?example=<id>`.
  `npm run examples:site` builds the playground into `site/` for static hosting.
- Examples: a lighting stress test for PixiJS and Phaser, with sliders for the number of moving
  point lights and lit slimes and a frames-per-second readout.

- New runtime, `@spritebuddy/phaser`, for Phaser 3.60+ and Phaser 4: `this.load.spritebuddy(key,
url)` loads a runtime file with its sheet and normal map, and `this.add.spritebuddy(x, y, key,
animation)` makes a Container that plays it with per-frame timing, loop modes, offsets, live
  layers and frame events. `{ lit: true }` lights a sprite with Phaser's own lights through its
  normal map (flipped layers, rotated frames and flipped or turned sprites lit from the right
  side), and `sb.light(scene, settings)` adds a Phaser light that takes SpriteBuddy Pro's
  settings, including point lights.
- Examples: a Phaser 4 page, with the three slimes and the candle lighting demo.

- Point lights in PixiJS 8: give `sb.light()` a `radius` and it shines from (`x`, `y`), `z`
  pixels toward the viewer, fading out `radius` pixels away, so sprites are lit by distance and
  from the light's side. A radius of 0 (the default) is the directional light as before.
- Examples: the browser examples play a slime exported from SpriteBuddy Pro, with a normal map, a
  walk and a candle. The PixiJS page adds a second canvas where a candle lights the slime, which
  the cursor keys move.
- Godot: a second example scene, `examples/candle_demo.tscn`: the same candle lighting the
  exported slime with a `PointLight2D` through its normal map, moved with the arrow keys. The
  first scene keeps its own drawn slime.

## 0.3.0

- Normal maps for real-time lighting: an optional top-level `normals` image with the sheet's
  layout, and an animation's `lighting` settings (editor only, runtimes ignore them). Still
  version 3; older runtimes ignore both.
  - `@spritebuddy/core`: `SpriteBuddyFile.normals`.
  - `@spritebuddy/pixi`: loads the normal map and offers `sheet.normalTextures` and
    `sheet.normalTexture(name)`; `sb.sheet()` takes `{ normalMap }`, `sb.load()` takes
    `{ normals: false }`.
  - Godot: `SpriteBuddySprite2D` draws through a `CanvasTexture` so 2D lights light it
    (`use_normals`), and `SpriteBuddyFile.normals`, `canvas_texture` and `set_normal_texture()`.
  - JSON Schema and docs for both fields, and a `normals` fixture.
- Real-time lighting in PixiJS 8: `sb.light(settings)` makes a directional light that works like
  SpriteBuddy Pro's (angle, height, size, colour, brightness, ambient, opacity, cel bands), and
  `sheet.sprite(name, { light })` draws the sprite with a normal-mapped shader. Change the light
  at any time. Flipped layers, rotated frames and flipped or turned sprites are lit correctly.
  - `@spritebuddy/core`: `AnimationDef.light`, the editor's light for the animation (or null).
  - `@spritebuddy/pixi`: `sb.light()`, `SpriteOptions.light`, `sprite.light`,
    `sheet.editorLight(name)`, `DEFAULT_LIGHT` and `lightDirection()`.

## 0.2.0

- Frame events: a frame entry can carry `events`, names such as `"hit"` or `"step"` that fire
  as the frame starts showing. Still version 3; older runtimes ignore them.
  - `@spritebuddy/core`: `Player`'s `onEvent(name, index)` and `eventsBetween(animation, from, to)`.
  - `@spritebuddy/pixi`: `sprite.onEvent`, and the sprite emits `"event"` and `"event:<name>"`.
  - Godot: `SpriteBuddySprite2D.frame_event(event_name, index)` and
    `SpriteBuddyFile.events_between()`.
  - A new `events` fixture with golden tables of which ticks fire which events.

- Examples: a plain canvas page, a PixiJS 8 page and a Godot 4 scene, all playing one slime
  sheet with ping-pong, once, per-frame offsets and a live layer.
- `@spritebuddy/core` and `@spritebuddy/pixi` now load in Node and straight from a CDN: the
  built files import each other with `.js` extensions instead of relying on a bundler.
- Package READMEs link to GitHub, so their links work on npm too. Each package carries its
  licence.

## 0.1.0

- Runtime file version 3: format docs, JSON Schema and golden fixtures.
- `@spritebuddy/core`: `parseFile`, `Player`, `frameAt` and `partsOf`.
- `@spritebuddy/pixi`: one package for PixiJS 5.3+, 6, 7 and 8, with an `Assets` parser for 7
  and 8.
- Godot 4.3+ addon: `SpriteBuddyFile` and `SpriteBuddySprite2D`.
