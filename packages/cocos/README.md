# @spritebuddy/cocos

Play [SpriteBuddy](https://github.com/Patrick-Hammond/spritebuddy) animations in **Cocos Creator
3.8**: per-frame timing, loop, ping-pong and play-once, frame offsets, layers drawn live (export
with "Play layers live" so the sheet holds each frame once), frame events, and normal-mapped
lighting with a candle, a torch or the sun.

```sh
npm install @spritebuddy/cocos
```

Run it in your Cocos Creator project's folder (beside `assets/`), then import it from any script:

```ts
import * as cc from 'cc';
import { _decorator, Component } from 'cc';
import { spriteBuddy } from '@spritebuddy/cocos';
const { ccclass } = _decorator;

@ccclass('Hero')
export class Hero extends Component {
  async start() {
    const sb = spriteBuddy(cc); // pass your cc in; the package doesn't import it
    // assets/resources/characters/knight.anims.json, and knight.png beside it
    const sheet = await sb.load('characters/knight.anims');
    const knight = sheet.sprite(this.node, 'walk'); // a new child node, playing
    knight.node.setScale(4, 4);
    knight.onComplete = () => knight.play('idle'); // for "once" animations
    knight.node.on('event:hit', () => this.enemy.takeHit()); // an event tagged on a frame
    knight.play('attack');
  }
}
```

`sb.load(path)` reads a runtime file from `cc.resources` (the `assets/resources` folder; pass
`{ bundle }` for another bundle), then loads the sheet image and its normal map named in it from
beside it. Paths are Cocos asset paths, without the extension: `knight.anims.json` is
`'characters/knight.anims'`. Images can be imported as any type (texture or sprite-frame); the
package cuts its own SpriteFrames.

`sheet.sprite(parent, animation?, options?)` makes a node under `parent` with a
`SpriteBuddySprite` component. The node's position is where the character stands (the frame's
pivot), so its feet go where you put it. It draws each frame and its layers as child nodes with
a `cc.Sprite` each, on its parent's layer, and plays itself in the component's `update`.

## Frame events

Tag frames with events in SpriteBuddy (such as `"step"` on a footstep, or `"hit"` on the frame a
sword lands). As each tagged frame starts showing, the sprite calls `onEvent(name, index)` and
its node emits `"event"` (name, index) and `"event:<name>"` (index):

```ts
const audio = this.node.addComponent(AudioSource);
slime.onEvent = (name) => audio.playOneShot(sounds[name]);
slime.node.on('event:land', () => camera.shake());
```

## Real-time lighting

Cocos Creator has no 2D lights of its own, so this package brings an effect,
[`effects/spritebuddy-lit.effect`](effects/spritebuddy-lit.effect), that lights a sprite through
its normal map with the same sums as SpriteBuddy Pro's preview: wrap (`size`), cel `bands`,
`opacity`, `ambient` and all. Copy it into your project's `assets/resources/spritebuddy/` (it
ships in the package at `node_modules/@spritebuddy/cocos/effects/`), export your sheet from
SpriteBuddy Pro with normal maps on, then:

```ts
const [sheet, effect] = await Promise.all([sb.load('slime/slime.anims'), sb.loadEffect()]);
const candle = sb.light(effect, { radius: 260, x: 640, y: 420, z: 40, color: '#ffb466' });
const slime = sheet.sprite(this.node, 'walk', { light: candle });
slime.flipX = true; // flip lit sprites with flipX, not a negative scale
candle.set({ x: torch.worldPosition.x, y: torch.worldPosition.y }); // move it any time
```

A light with a `radius` is a point light: it shines from (`x`, `y`) in **world space** (y up, as
`node.worldPosition` gives it), `z` pixels toward the viewer, and fades out `radius` pixels away.
A radius of 0 (the default) is a directional light, like the sun, from `angle` (degrees
clockwise from the top of the screen) and `height`. `sb.light(effect, sheet.editorLight('walk'))`
lights the game the way SpriteBuddy Pro lit the animation. Change a light's fields at any time;
every sprite it lights changes on the next frame.

Each sprite is lit by one light. Lit sprites share a material per sheet and facing, so they still
batch. The light follows flipped layers, rotated frames and sprites flipped with `flipX` /
`flipY`; it doesn't see a negative scale or a turn you give the sprite's node, so flip with the
flags and keep lit sprites upright. `sb.loadEffect(path?, bundle?)` loads the effect (default
`spritebuddy/spritebuddy-lit` in resources); an `@property(EffectAsset)` on your component works
too.

The [Cocos example project](https://github.com/Patrick-Hammond/spritebuddy-runtimes/tree/main/examples/cocos)
has three scenes: three slimes and a jump on click; a slime you move with the cursor keys, lit
by a flickering candle; and a slime whose steps and jumps play sounds through frame events.

## API

- `spriteBuddy(cc)` binds the package to your Cocos (`import * as cc from 'cc'`) and registers
  the `SpriteBuddySprite` component. Calling it again gives the same object.
- `sb.load(path, { bundle, normals, pixelArt })` loads a sheet. `normals: false` skips the
  normal map; `pixelArt` (default `true`) turns on nearest-neighbour sampling.
- `sb.sheet(file, image, normals?, { pixelArt })` makes a sheet from assets you loaded yourself:
  `file` is a `JsonAsset`, its `.json` or a parsed file; the images are `ImageAsset`s or
  `Texture2D`s. A sheet has `file`, `texture`, `normals`, `frames` (one SpriteFrame per file
  frame), `animations`, `editorLight(name?)` and `sprite(parent, animation?, options)`.
- Sprite options: `name`, `autoPlay`, `autoUpdate`, `speed` and `light`.
- A sprite has `node`, `play(name, time?)`, `stop()`, `seek(ms)`, `advance(ms)`, `speed`,
  `playing`, `animation`, `flipX` / `flipY`, `onFrame`, `onEvent`, `onComplete`, `player` (the
  `@spritebuddy/core` Player) and `parts` (the child nodes showing now). It moves on every frame
  unless you set `autoUpdate = false` and call `advance(ms)` yourself. `node.getComponent(sb.Sprite)`
  finds it again.
- The node emits `"frame"` (index), `"complete"`, `"event"` (name, index) and `"event:<name>"`.
- `sb.light(effect, settings?)` makes a light; its fields are `x`, `y`, `z`, `radius`, `color`,
  `brightness`, `ambient`, `angle`, `height`, `size`, `opacity` and `bands`, or several at once
  with `set()`.

The placement of every pixel is tested against the format's rules for every flip and rotation,
and the effect's shader is compiled and checked against SpriteBuddy Pro's lighting in WebGL 2.

Licence: ISC.
