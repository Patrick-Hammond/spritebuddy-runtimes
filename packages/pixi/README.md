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

## Real-time lighting (PixiJS 8)

When the file was exported from SpriteBuddy Pro with a normal map, PixiJS 8 can light the sprite
as it plays, so the light can move, follow a torch or change with the time of day:

```ts
const knight = await sb.load('assets/knight.anims.json'); // loads knight_n.png too
const sun = sb.light(knight.editorLight('walk')); // the light the editor used, or {} for defaults
const hero = knight.sprite('walk', { light: sun });

sun.angle = 90; // light from the right; every sprite using `sun` changes on the next render
sun.set({ height: -20, color: '#ffb070', bands: 3 }); // a low warm rim light, cel shaded
```

The light works like SpriteBuddy Pro's: `angle` (degrees clockwise from the top of the screen),
`height` (90 shines from the viewer, below 0 from behind), `size`, `color`, `brightness`,
`ambient`, `opacity` and `bands` (0 for smooth, or 2 to 4 cel levels). Unset values are the
editor's defaults, so a lit sprite looks like the editor's preview. Flipped layers, rotated frames
and sprites you flip, turn or scale are all lit from the right side. Lit sprites use the WebGL
renderer (PixiJS 8's default); with PixiJS 5 to 7, hand `sheet.normalTextures` to your own
lighting shader.

The [PixiJS example](https://github.com/Patrick-Hammond/spritebuddy-runtimes/tree/main/examples/pixi) is a complete page: three slimes from one
sheet, one wearing a hat drawn as a live layer, and a hop on click.

## API

- `sb.load(url, { pixelArt })` loads a runtime file and its image. `pixelArt` (default `true`)
  turns on nearest-neighbour sampling.
- `sb.sheet(json, texture)` makes a sheet from a file and an image you loaded yourself.
- `sheet.sprite(animation?, { autoPlay, autoUpdate, speed, light })` makes an animated sprite.
  `sheet.textures`, `sheet.texture(name)` and `sheet.animations` are there too.
- Normal maps: when the file has `normals`, `sb.load()` (and the Assets parser) loads it too
  (`{ normals: false }` skips it) and `sheet.normalTextures` holds one normal-map texture per
  frame, cut exactly like `sheet.textures`; `sheet.normalTexture(name)` finds one. With
  `sb.sheet()`, pass the loaded image as `{ normalMap }`.
- `sb.light(settings?)` (PixiJS 8) makes a light for `{ light }`, and `sheet.editorLight(name?)`
  gives the light SpriteBuddy Pro lit an animation with (or null). `sprite.light` is the sprite's.
- A sprite has `play(name, time?)`, `stop()`, `seek(ms)`, `update(ms)`, `speed`, `playing`,
  `animation`, `onFrame`, `onEvent` and `onComplete`. It moves on with `Ticker.shared` unless you set
  `autoUpdate = false` and call `update(ms)` yourself.
- Frame events: as a frame tagged with events starts showing, the sprite calls
  `onEvent(name, index)` and emits `"event"` (name, index) and `"event:<name>"` (index) on its
  PixiJS event emitter, so `hero.on('event:step', playFootstep)` works.

Every PixiJS version is tested by rendering the shared fixtures in Chromium and comparing each
pixel with a software render of the format's rules.

Licence: ISC.
