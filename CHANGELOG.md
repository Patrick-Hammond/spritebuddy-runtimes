# Changelog

All runtimes share one version while they are below 1.0.

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
