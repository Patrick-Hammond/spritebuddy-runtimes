# @spritebuddy/phaser

Play [SpriteBuddy](https://github.com/Patrick-Hammond/spritebuddy) animations in **Phaser 3.60+
and Phaser 4** with one package: per-frame timing, loop, ping-pong and play-once, frame offsets,
layers drawn live (export with "Play layers live" so the sheet holds each frame once), frame
events, and normal-mapped lighting with Phaser's own lights.

```sh
npm install @spritebuddy/phaser
```

```ts
import Phaser from 'phaser';
import { spriteBuddy } from '@spritebuddy/phaser';

const sb = spriteBuddy(Phaser); // pass your Phaser in once, before the game starts

class Level extends Phaser.Scene {
  preload() {
    this.load.spritebuddy('knight', 'assets/knight.anims.json'); // loads knight.png beside it
  }

  create() {
    const hero = this.add.spritebuddy(200, 300, 'knight', 'walk'); // a Container
    hero.setScale(4);
    hero.onComplete = () => hero.play('idle'); // for "once" animations
    hero.on('event:hit', () => enemy.takeHit()); // an event tagged on a frame in SpriteBuddy
    hero.play('attack');
  }
}
```

`spriteBuddy(Phaser)` adds `this.load.spritebuddy(key, url)` to every scene's loader and
`this.add.spritebuddy(x, y, key, animation?, options?)` to every scene's game object factory. The
loader reads the runtime file, then loads the sheet image (and its normal map) named in it from
beside it; the texture and the JSON both go under `key`.

The sprite is a Phaser Container whose origin is where the character stands (the frame's pivot),
so `x` and `y` put its feet on the ground. It draws each frame and its layers as child Images, and
plays itself on the scene's clock.

## Real-time lighting

When the file was exported from SpriteBuddy Pro with a normal map, the loader loads it with the
sheet, and a sprite made with `{ lit: true }` is lit by the scene's lights (Phaser 3's `Light2D`
pipeline, or `setLighting(true)` in Phaser 4), so lights can move, flicker and follow a torch.
`sb.light(scene, settings)` adds a Phaser light that takes SpriteBuddy Pro's settings and turns
the scene's lights on:

```ts
create() {
  const candle = sb.light(this, { radius: 260, x: 240, y: 125, z: 40, color: '#ffb466', ambient: 0.3 });
  const slime = this.add.spritebuddy(110, 210, 'slime', 'walk', { lit: true });
  slime.setFlipX(true); // flip lit sprites with setFlipX, not a negative scale
  candle.set({ x: torch.x, y: torch.y }); // move it with whatever carries it
}
```

A light with a `radius` is a point light, such as a candle or a torch: it shines from (`x`, `y`)
in the world, `z` pixels toward the viewer (Phaser 4), and fades out `radius` pixels away.
`brightness` is the light's intensity and `ambient` sets the scene's ambient light (a grey that
bright; Phaser has one per scene). A radius of 0 (the default) is a directional light, like the
sun, from `angle` (degrees clockwise from the top of the screen) and `height`: Phaser only has
point lights, so it is a strong one placed far off that follows the camera. `sb.light(scene,
sheet.editorLight('walk'))` takes the colour, brightness, ambient and direction SpriteBuddy Pro
lit the animation with.

The lighting is Phaser's own, so it mixes with any other lights and lit objects in your game. It
is not the editor's: Phaser's lights have no wrap (`size`), cel bands (`bands`) or `opacity`, and
fade out differently, so a lit sprite looks close to SpriteBuddy Pro's preview but not the same.
In Phaser 3 lights sit at a fixed low height, so `z` and a directional light's `height` have no
effect there. Phaser turns normals with a sprite's rotation but not its flips, so this package
draws flipped parts from a copy of the sheet whose normal map is mirrored to match: flipped
layers, rotated frames and sprites you flip with `setFlipX` / `setFlipY` or turn are all lit from
the right side. A negative scale is not; use the flips.

The [Phaser example](https://github.com/Patrick-Hammond/spritebuddy-runtimes/tree/main/examples/phaser)
is a complete page: three slimes from one sheet, one wearing a hat drawn as a live layer, and a
jump on click; then a slime you move with the cursor keys, lit by a flickering candle's point
light.

## API

- `this.load.spritebuddy(key, url, { normals })`, or `sb.load(scene, key, url, options)`, queues
  a runtime file, its sheet and its normal map (`{ normals: false }` skips it).
- `this.add.spritebuddy(x, y, key, animation?, options)`, or `sb.add(scene, ...)`, makes a sprite
  and adds it to the scene.
- `sb.sheet(scene, key, { pixelArt, file })` is the sheet for a loaded texture: it adds the
  file's frames to the texture the first time (named as in the file; rotated frames stay turned
  as stored). `pixelArt` (default `true`) turns on nearest-neighbour sampling; `file` is the
  runtime file when it isn't in the JSON cache under `key`. A sheet has `file`, `texture`,
  `animations`, `hasNormals`, `editorLight(name?)` and `sprite(scene, x, y, animation?,
options)`, which makes a sprite without adding it to the scene.
- Sprite options: `autoPlay`, `autoUpdate`, `speed` and `lit`.
- A sprite has `play(name, time?)`, `stop()`, `seek(ms)`, `advance(ms)`, `speed`, `playing`,
  `animation`, `flipX` / `flipY` (and `setFlipX` / `setFlipY`), `onFrame`, `onEvent` and
  `onComplete`, besides everything a Container has. It moves on with the scene's clock unless you
  set `autoUpdate = false` and call `advance(ms)` yourself.
- Events: the sprite emits `"frame"` (index) and `"complete"`, and, as a frame tagged with events
  starts showing, calls `onEvent(name, index)` and emits `"event"` (name, index) and
  `"event:<name>"` (index), so `hero.on('event:step', playFootstep)` works.
- `sb.light(scene, settings?)` adds a light; change its fields (`x`, `y`, `z`, `radius`,
  `color`, `brightness`, `ambient`, `angle`, `height`) at any time, or several with `set()`.
  `light.phaserLight` is the Phaser light; `light.destroy()` removes it.

Both Phaser versions are tested by rendering the shared fixtures in Chromium and comparing each
pixel with a software render of the format's rules, and lit sprites with a software render of
Phaser's lighting.

Licence: ISC.
