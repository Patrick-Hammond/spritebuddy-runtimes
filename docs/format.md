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
        { "frame": 1, "duration": 150, "offset": [0, -1] },
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

A frame entry:

| Field      | Type        | Default         | Meaning                                                       |
| ---------- | ----------- | --------------- | ------------------------------------------------------------- |
| `frame`    | integer     |                 | Index into `frames`.                                          |
| `duration` | integer ≥ 1 | the animation's | Display time.                                                 |
| `offset`   | `[x, y]`    | `[0, 0]`        | Nudge from where the pivot puts the frame, +x right, +y down. |
| `layers`   | list        | `[]`            | Extra frames drawn with this one.                             |

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

## Drawing a frame

Put the sprite's **origin** where the character stands. For an animation frame whose base frame
has pivot `(px, py)` and whose offset is `(ox, oy)`:

1. The base frame's full-frame top-left goes at `origin + (ox − px, oy − py)`.
2. Each layer's full-frame top-left goes at that point plus the layer's `(x, y)`.
3. Draw the base and its layers in `z` order, applying flips and opacity per layer.
4. For a trimmed frame, draw its pixels at its full-frame top-left plus the trim's `(x, y)`.

`@spritebuddy/core`'s `partsOf` returns exactly this list, and every runtime is tested against
the tables in [`fixtures/`](../fixtures): for each fixture, which frame shows at a set of times
and where every part is drawn.
