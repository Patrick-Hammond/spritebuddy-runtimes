# SpriteBuddy for Godot 4

Plays [SpriteBuddy](https://github.com/Patrick-Hammond/spritebuddy) runtime files
(`.anims.json`, [format](https://github.com/Patrick-Hammond/spritebuddy-runtimes/blob/main/docs/format.md)) in Godot 4.3 or newer, with per-frame timing, loop
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
hero.frame_event.connect(func(event_name, _index):
	if event_name == &"hit":
		enemy.take_hit())
```

- `play(name, from_ms)`, `stop()`, `seek(ms)`, `advance(ms)`, `speed_scale`, `playing`, `time`,
  `frame_index`, and the `frame_changed`, `frame_event(event_name, index)` and
  `animation_finished` signals. `frame_event` fires for each event tagged on a frame as it
  starts showing, even when a long frame skips past it.
- `pixel_art` (on by default) uses nearest-neighbour filtering.
- Normal maps: when the export has one (`normals` in the file, `<name>_n.png` beside the sheet),
  the sprite draws through a `CanvasTexture`, so `PointLight2D` and `DirectionalLight2D` light
  it. Turn `use_normals` off to draw it unlit. `SpriteBuddyFile.set_normal_texture()` pairs a
  normal map you loaded yourself.
- `SpriteBuddyFile.load_path(path)` gives you the parsed file; `to_sprite_frames()` turns it into
  a `SpriteFrames` for `AnimatedSprite2D` when you don't need layers or offsets.

## Example

Open the `godot` folder in Godot and press Run: `examples/slime_demo.tscn` (the project's main
scene) shows three slimes from one sheet, two placed in the scene and one made in code, with a
hat drawn as a live layer. Click a slime, or press Space, to make it hop.

## Tests

```sh
godot --headless --path godot -s tests/run_tests.gd
```

They check the shared golden tables in `fixtures/`, the file checks and the example scene. CI
runs them in Godot 4.3 and 4.5 when started by hand.
