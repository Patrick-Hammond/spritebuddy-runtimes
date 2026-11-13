# The SpriteBuddy runtime file, version 3

A runtime file (`<name>.anims.json`) describes one spritesheet image: where each frame sits, and
every animation with its timing, loop mode, per-frame offsets and layers. A game needs this
file and the image beside it, nothing else. SpriteBuddy writes it from the Export page; the
[JSON Schema](../schema/spritebuddy-animations.v3.schema.json) checks it.

Coordinates are **sheet pixels**, x right and y down, as in the image. Times are
**milliseconds**. Fields with a default can be left out, and readers ignore fields they don't
know, so later minor additions don't break older runtimes. A runtime refuses a higher
`version` than it knows.

```json
{
  "format": "spritebuddy-animations",
  "version": 3,
  "image": "knight.png",
  "size": [360, 288],
  "scale": 1,
  "frames": [
    { "name": "knight_0", "rect": [0, 0, 36, 36], "pivot": [18, 36] },
    { "name": "knight_1", "rect": [36, 0, 30, 34], "pivot": [18, 36], "trim": [3, 2, 36, 36] },
    { "name": "sword", "rect": [66, 0, 8, 20], "rotated": true }
  ],
  "animations": [
    {
      "name": "walk",
      "loop": "loop",
      "duration": 100,
      "frames": [
        0,
        { "frame": 1, "duration": 150, "offset": [0, -1], "events": ["step"] },
        { "frame": 0, "layers": [{ "frame": 2, "x": 20, "y": 6, "z": 1 }] }
      ]
    }
  ]
}
```

## Top level

| Field        | Type           | Default | Meaning                                                      |
| ------------ | -------------- | ------- | ------------------------------------------------------------ |
| `format`     | string         |         | Always `"spritebuddy-animations"`.                           |
| `version`    | integer        |         | `3`.                                                         |
| `image`      | string         |         | The sheet image, relative to this file.                      |
| `normals`    | string         | none    | A normal map for `image`; see [Normal maps](#normal-maps).   |
| `size`       | `[w, h]`       |         | Sheet size in pixels.                                        |
| `scale`      | number         | `1`     | Scale the sheet was exported at. Coordinates already use it. |
| `frames`     | list of frames |         | Referred to by index everywhere else.                        |
| `animations` | list of anims  | `[]`    | Names are unique.                                            |

## Frames

| Field     | Type                   | Default       | Meaning                                                                                                                                      |
| --------- | ---------------------- | ------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `name`    | string                 |               | For lookup and debugging.                                                                                                                    |
| `rect`    | `[x, y, w, h]`         |               | Where the pixels sit on the sheet, at their upright size.                                                                                    |
| `rotated` | boolean                | `false`       | Stored turned 90° clockwise: the pixels cover `h` columns and `w` rows from `x, y` (TexturePacker's rule). Turn them back counter-clockwise. |
| `trim`    | `[x, y, fullW, fullH]` | none          | Transparent edges were cut off. The pixels start at `x, y` inside a full frame of `fullW × fullH`.                                           |
| `pivot`   | `[x, y]`               | bottom centre | The point the frame hangs from, in full-frame pixels. May lie outside the frame.                                                             |

The **full frame** is `fullW × fullH` when trimmed, else `w × h`. Everything below is placed by
full frames, so trimming never moves anything.

## Animations

| Field      | Type                                   | Default  | Meaning                                   |
| ---------- | -------------------------------------- | -------- | ----------------------------------------- |
| `name`     | string                                 |          | Unique in the file.                       |
| `loop`     | `"loop"`, `"pingpong"` or `"once"`     | `"loop"` | See timing.                               |
| `duration` | integer ≥ 1                            | `100`    | Time of frames that don't give their own. |
| `frames`   | list of frame indices or frame entries |          | A bare index is `{ "frame": index }`.     |
| `lighting` | object                                 | none     | Editor settings; runtimes ignore it.      |

A frame entry:

| Field      | Type        | Default         | Meaning                                                       |
| ---------- | ----------- | --------------- | ------------------------------------------------------------- |
| `frame`    | integer     |                 | Index into `frames`.                                          |
| `duration` | integer ≥ 1 | the animation's | Display time.                                                 |
| `offset`   | `[x, y]`    | `[0, 0]`        | Nudge from where the pivot puts the frame, +x right, +y down. |
| `layers`   | list        | `[]`            | Extra frames drawn with this one.                             |
| `events`   | strings     | `[]`            | Names fired when this frame starts showing. See events.       |

A layer:

| Field            | Type     | Default | Meaning                                                                       |
| ---------------- | -------- | ------- | ----------------------------------------------------------------------------- |
| `frame`          | integer  |         | Index into `frames`.                                                          |
| `x`, `y`         | integers | `0`     | The layer's full-frame top-left, from the base frame's full-frame top-left.   |
| `z`              | integer  | `1`     | Draw order. The base frame is `0`; ties keep the base first, then list order. |
| `opacity`        | 0 to 1   | `1`     | Multiplies the layer's alpha.                                                 |
| `flipX`, `flipY` | booleans | `false` | Mirror the layer within its own full frame.                                   |

## Timing

A frame shows from its start time up to, but not including, its end.

- `loop` plays the frames in order forever.
- `pingpong` plays forward, then back without repeating the end frames: `0 1 2 3 2 1 0 1 …`.
  With two frames or fewer it is the same as `loop`.
- `once` plays the frames in order, then holds the last frame and is done.

## Events

A frame entry's `events` are names a game listens for, such as `"hit"` on the frame a sword
lands or `"step"` on a footstep. Each one fires when its frame **starts** showing:

- A tick from time `a` to time `b` fires the events of every frame whose start lies after `a`
  and up to and including `b`, in order. So a long tick that skips a short frame still fires it,
  and a frame starting exactly at `a` isn't fired twice.
- One tick fires at most one cycle's worth, so a game that was paused doesn't get a burst.
- Starting an animation fires its first frame's events. Jumping (seeking) fires none.
- `loop` and `pingpong` fire them again every time the frame shows, `pingpong` on the way back
  too; `once` fires them once.
- A runtime reports the frame change first, then the events, then that a `once` animation is done.

Events were added within version 3: older runtimes ignore them.

## Drawing a frame

Put the sprite's **origin** where the character stands. For an animation frame whose base frame
has pivot `(px, py)` and whose offset is `(ox, oy)`:

1. The base frame's full-frame top-left goes at `origin + (ox − px, oy − py)`.
2. Each layer's full-frame top-left goes at that point plus the layer's `(x, y)`.
3. Draw the base and its layers in `z` order, applying flips and opacity per layer.
4. For a trimmed frame, draw its pixels at its full-frame top-left plus the trim's `(x, y)`.

`@spritebuddy/core`'s `partsOf` returns exactly this list, and every runtime is tested against
the tables in [`fixtures/`](../fixtures): for each fixture, which frame shows at a set of times
and where every part is drawn, plus, for animations with events, which events a set of ticks fire.

## Normal maps

`normals` names an image the same size as `image`, with every frame at exactly the same rect,
rotation and trim, so one set of frame rects cuts both. Each pixel's RGB is the surface direction
`n` stored as `(n + 1) / 2`: red is +x (right), green is +y (**up**, the OpenGL and Godot 4
convention), blue is +z (towards the viewer). Alpha matches the sheet.

- A `rotated` frame's normals are stored turned with its pixels, vectors included, so turning
  the frame back upright turns them back too.
- When a runtime draws a part flipped, the light must see the normal's x (flipX) or y (flipY)
  negated; engines that flip by a negative scale usually do this for you.
- Runtimes that don't light simply ignore `normals`.

`lighting` on an animation holds SpriteBuddy Pro's light and normal settings (`light`: `angle`,
`height`, `size`, `color`, `brightness`, `ambient`, `opacity`, `bands`, `paletteSnap`; `normals`:
`shape`, `depth`, `softness`, `detail`), so SpriteBuddy can read them back. Runtimes ignore it;
lighting baked into frames needs no runtime support at all.
