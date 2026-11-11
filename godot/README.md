# SpriteBuddy for Godot 4

Plays [SpriteBuddy](https://github.com/Patrick-Hammond/spritebuddy) runtime files
(`.anims.json`, [format](../docs/format.md)) in Godot 4.3 or newer, with per-frame timing, loop
modes, frame offsets and live layers.

## Install

Copy `addons/spritebuddy` into your project's `addons/` folder and enable **SpriteBuddy** under
Project → Project Settings → Plugins. Put the exported `.anims.json` beside its sheet image.

## Use

Add a **SpriteBuddySprite2D** node, set **File Path** to the `.anims.json`, and pick an
**Animation**. The node's position is where the character stands (the frame pivot). Or in code:

```gdscript
var hero := SpriteBuddySprite2D.new()
hero.file_path = "res://art/knight.anims.json"
add_child(hero)
hero.play("attack")
hero.animation_finished.connect(func(_name): hero.play("idle"))
```

- `play(name, from_ms)`, `stop()`, `seek(ms)`, `advance(ms)`, `speed_scale`, `playing`, `time`,
  `frame_index`, and the `frame_changed` and `animation_finished` signals.
- `pixel_art` (on by default) uses nearest-neighbour filtering.
- `SpriteBuddyFile.load_path(path)` gives you the parsed file; `to_sprite_frames()` turns it into
  a `SpriteFrames` for `AnimatedSprite2D` when you don't need layers or offsets.

## Tests

```sh
godot --headless --path godot -s tests/run_tests.gd
```

They check the shared golden tables in `fixtures/` and the file checks. CI runs them on every
pull request.
