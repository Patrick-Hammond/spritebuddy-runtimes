# @spritebuddy/core

Reads [SpriteBuddy runtime files](../../docs/format.md) and works out what to draw at any
moment. No dependencies and no engine: the PixiJS package builds on it, and you can use it with
any renderer.

```ts
import { parseFile, Player } from '@spritebuddy/core';

const file = parseFile(await (await fetch('knight.anims.json')).json());
const player = new Player(file, { onComplete: () => player.play('idle') }).play('attack');

// every tick
player.update(deltaMs);
for (const part of player.parts) {
  // draw part.frame (its rect on the sheet) with its full-frame top-left at
  // (spriteX + part.x, spriteY + part.y), mirrored by part.flipX / part.flipY,
  // at part.opacity; add part.frame.trim for trimmed frames
}
```

- `parseFile(json)` checks the file and fills in defaults; it throws a `FormatError` that says
  where the file is wrong.
- `Player` keeps time: `play(name, time?)`, `update(ms)`, `seek(ms)`, `stop()`, `speed`,
  `parts`, `state`, and `onFrame` / `onComplete` callbacks.
- `frameAt(animation, ms)` and `partsOf(file, frame)` are the pure functions underneath.
- The JSON Schema ships as `@spritebuddy/core/schema.json`.
