# @spritebuddy/core

Reads [SpriteBuddy](https://github.com/Patrick-Hammond/spritebuddy) runtime files
([format](https://github.com/Patrick-Hammond/spritebuddy-runtimes/blob/main/docs/format.md)) and works out what to draw at any moment. No
dependencies and no engine: [`@spritebuddy/pixi`](https://www.npmjs.com/package/@spritebuddy/pixi)
builds on it, and you can use it with any renderer that can draw part of an image.

```sh
npm install @spritebuddy/core
```

## Quick start

```ts
import { parseFile, Player } from '@spritebuddy/core';

const file = parseFile(await (await fetch('knight.anims.json')).json());
const player = new Player(file, { onComplete: () => player.play('idle') }).play('attack');

// every tick
player.update(deltaMs);
for (const part of player.parts) {
  // Draw part.frame.rect from the sheet with its full-frame top-left at
  // (spriteX + part.x, spriteY + part.y), mirrored by part.flipX / part.flipY, at
  // part.opacity. Trimmed frames start part.frame.trim.x/y further in; rotated frames are
  // stored turned 90° clockwise.
}
```

The [canvas example](https://github.com/Patrick-Hammond/spritebuddy-runtimes/tree/main/examples/canvas) is a complete page that does exactly
this with a 2D canvas, rotation, trim and flips included, in about 60 lines.

## API

- `parseFile(json)` checks a runtime file and fills in every default. It throws a
  `FormatError` that says where the file is wrong, and refuses versions newer than `VERSION`.
- `new Player(file, { onFrame, onComplete })` keeps time for one sprite:
  - `play(name, fromMs?)` starts an animation (it throws for an unknown name, listing the
    names there are), `stop()`, `seek(ms)` and `update(ms)`.
  - `speed` (1 is normal), `playing`, `names`, `animation(name)`.
  - `parts`: what to draw now, bottom to top. `state` adds the animation, frame index, time
    and whether a `once` animation is done.
  - `onFrame(index)` fires when the frame changes; `onComplete()` when a `once` animation
    ends.
- The pure functions underneath, for engines that keep their own clock:
  - `frameAt(animation, ms)` gives the frame index showing at a time, and whether it is done.
  - `partsOf(file, animationFrame)` gives the parts to draw for one frame.
  - `boundsOf`, `cycleDuration` and `cycleOrder` help with layout and timelines.
- The JSON Schema ships as `@spritebuddy/core/schema.json`.

Every function is tested against the shared
[golden tables](https://github.com/Patrick-Hammond/spritebuddy-runtimes/tree/main/fixtures), the same ones the PixiJS and Godot runtimes pass.

Licence: ISC.
