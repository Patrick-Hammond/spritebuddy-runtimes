# SpriteBuddy in Cocos Creator

A Cocos Creator 3.8 project with three scenes, all playing the slime from
[`../assets`](../assets) through [`@spritebuddy/cocos`](../../packages/cocos):

| Scene                  | Shows                                                                                           |
| ---------------------- | ----------------------------------------------------------------------------------------------- |
| `assets/scenes/slime`  | Three slimes from one sheet, one wearing a hat drawn as a live layer. Click one to jump.        |
| `assets/scenes/candle` | A candle's point light lighting the slime through its normal map. Arrow keys move; Space jumps. |
| `assets/scenes/events` | Frame events playing sounds: a squelch on every step, and sounds as a jump leaves and lands.    |

## Opening it

1. In the repo's root folder: `npm install`, then `npm run build`.
2. In this folder: `npm install`. It copies the package in from `packages/cocos` (building it)
   and fetches `@spritebuddy/core` from npm. Run it again after changing the package.
3. In Cocos Dashboard, **Add** (or Import) this folder and open it with Cocos Creator 3.8.
4. Open a scene from `assets/scenes`, then press **Play** (the triangle at the top).

## How it fits together

- `assets/scripts/`: one component per demo (`SlimeDemo.ts`, `CandleDemo.ts`, `EventsDemo.ts`),
  each a complete program. Every scene is just a Canvas, its camera and a node with the demo's
  component; the demo makes the rest in code.
- `assets/resources/slime/`: the slime from SpriteBuddy Pro (sheet, normal map, runtime file).
  The runtime file is the shared one with frame events added: `step` on the walk, `leap` and
  `land` on the jump.
- `assets/resources/sounds/`: the event sounds, drawn by `tools/make-sounds.py`.
- `assets/resources/spritebuddy/spritebuddy-lit.effect`: the package's lit effect, copied in.
- `tools/make-scenes.mjs` writes the scenes and the scripts' `.meta` files.
  [`../cocos.test.ts`](../cocos.test.ts) checks them, the assets and the scripts.
