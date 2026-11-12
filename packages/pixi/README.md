# @spritebuddy/pixi

Play [SpriteBuddy](https://github.com/Patrick-Hammond/spritebuddy) animations in **PixiJS 5.3+,
6, 7 and 8** with one package: per-frame timing, loop, ping-pong and play-once, frame offsets,
and layers drawn live (export with "Play layers live" so the sheet holds each frame once).

```sh
npm install @spritebuddy/pixi
```

```ts
import * as PIXI from 'pixi.js';
import { spriteBuddy } from '@spritebuddy/pixi';

const sb = spriteBuddy(PIXI); // pass your PixiJS in: that is how one package serves 5 to 8

const knight = await sb.load('assets/knight.anims.json'); // loads knight.png beside it
const hero = knight.sprite('walk'); // a Container whose origin is the character's pivot
hero.x = 200;
hero.y = 300;
app.stage.addChild(hero);

hero.onComplete = () => hero.play('idle'); // for "once" animations
hero.on('event:hit', () => enemy.takeHit()); // an event tagged on a frame in SpriteBuddy
hero.play('attack');
```

The sprite's origin is where the character stands (the frame's pivot), so `x` and `y` put its
feet on the ground. Scale it up for pixel art: `hero.scale.set(4)`.

With PixiJS 7 or 8 you can use `Assets` instead:

```ts
PIXI.extensions.add(sb.assetsParser);
const knight = await PIXI.Assets.load('assets/knight.anims.json'); // a SpriteBuddySheet
```

The [PixiJS example](https://github.com/Patrick-Hammond/spritebuddy-runtimes/tree/main/examples/pixi) is a complete page: three slimes from one
sheet, one wearing a hat drawn as a live layer, and a hop on click.

## API

- `sb.load(url, { pixelArt })` loads a runtime file and its image. `pixelArt` (default `true`)
  turns on nearest-neighbour sampling.
- `sb.sheet(json, texture)` makes a sheet from a file and an image you loaded yourself.
- `sheet.sprite(animation?, { autoPlay, autoUpdate, speed })` makes an animated sprite.
  `sheet.textures`, `sheet.texture(name)` and `sheet.animations` are there too.
- A sprite has `play(name, time?)`, `stop()`, `seek(ms)`, `update(ms)`, `speed`, `playing`,
  `animation`, `onFrame`, `onEvent` and `onComplete`. It moves on with `Ticker.shared` unless you set
  `autoUpdate = false` and call `update(ms)` yourself.
- Frame events: as a frame tagged with events starts showing, the sprite calls
  `onEvent(name, index)` and emits `"event"` (name, index) and `"event:<name>"` (index) on its
  PixiJS event emitter, so `hero.on('event:step', playFootstep)` works.

Every PixiJS version is tested by rendering the shared fixtures in Chromium and comparing each
pixel with a software render of the format's rules.

Licence: ISC.
