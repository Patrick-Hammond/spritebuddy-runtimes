# SpriteBuddy for Defold

Plays [SpriteBuddy](https://github.com/Patrick-Hammond/spritebuddy) runtime files
(`.anims.json`,
[format](https://github.com/Patrick-Hammond/spritebuddy-runtimes/blob/main/docs/format.md)) in
Defold, with per-frame timing, loop modes, frame offsets, live layers, frame events and real-time
lighting through the sheet's normal map. Made and tested with Defold 1.14.1.

The library loads the exported files as they are, at run time: there is no atlas to rebuild when
you export again.

## Install

Add the library zip to your `game.project` under Project → Dependencies, then Project → Fetch
Libraries:

```
https://github.com/Patrick-Hammond/spritebuddy-runtimes/releases/download/defold-v0.1.0/spritebuddy-defold-0.1.0.zip
```

Then put the export (`knight.png`, `knight.anims.json` and, from SpriteBuddy Pro, `knight_n.png`)
in a folder of your project, say `/art`, and tell `game.project` about it:

```ini
[project]
# The library reads the files with sys.load_resource, so they ship as custom resources.
custom_resources = /art

[spritebuddy]
# Every runtime file a spritebuddy game object plays, comma-separated.
files = /art/knight.anims.json
```

For crisp pixel art, also set Graphics → Default Texture Min Filter and Mag Filter to `nearest`.

## Use

Add a game object from **`/spritebuddy/spritebuddy.go`** to a collection, and set its
`spritebuddy` script's **Sheet** to the file's name (`knight`) and **Animation** to the one to
play. The game object's position is where the character stands (the frame's pivot); scale it to
zoom. Then talk to it with messages:

```lua
msg.post("hero#spritebuddy", "play", { animation = "attack" })

function on_message(self, message_id, message, sender)
	if message_id == hash("frame_event") and message.name == hash("hit") then
		enemy_take_hit()
	elseif message_id == hash("animation_finished") then
		msg.post(sender, "play", { animation = "idle" })
	end
end
```

- Messages it takes: `play { animation, from }` (from is in ms), `stop`, `seek { ms }`,
  `flip { x, y }` (mirrors the whole sprite about its pivot), `speed { speed }` and `listen`.
- Messages it sends, to whoever last sent `play` or `listen` (else its own game object), in this
  order: `frame_changed { index }`, `frame_event { name, event, index }` for each event tagged on
  a frame as it starts showing (even when a long frame skips past it; `name` is a hash, `event`
  the text), and `animation_finished { animation }` when a `once` animation ends.
- Script properties: `sheet`, `animation`, `autoplay`, `speed`, `flip_x`, `flip_y` and `lit`.
- Or call it directly, without messages:
  `require("spritebuddy.spritebuddy").get("hero"):play("attack")`.
- Make one in code with a factory whose prototype is `/spritebuddy/spritebuddy.go`:
  `factory.create("#hero_factory", pos, nil, { sheet = hash("knight"), animation = hash("walk") })`.

Frames, events and entry indices are 1-based, as Lua is.

### Lighting

When the file has a normal map, set the script's **Lit** property (or `lit = true` on a player)
and the sprite is drawn with `spritebuddy/materials/lit_sprite.material`, lit by one point light
with the same light model as SpriteBuddy Pro's preview. Set the light from any script:

```lua
local spritebuddy = require "spritebuddy.spritebuddy"
local light = spritebuddy.light
light.x, light.y, light.z = 480, 290, 24 -- world position; z is towards the viewer
light.radius = 320                       -- it fades out this far away
light.color = vmath.vector3(1, 0.7, 0.4)
light.brightness, light.ambient = 2.2, 0.3
light.size, light.bands = 0.3, 4         -- softness, and cel bands (0 for smooth)
```

Flipped sprites and layers, and frames stored rotated, are lit from the right side. Rotating the
game object isn't taken into account.

### The Lua API

`spritebuddy.go` wraps a player from `spritebuddy/spritebuddy.lua`, which you can also use
yourself:

```lua
local spritebuddy = require "spritebuddy.spritebuddy"

function init(self)
	local sheet = assert(spritebuddy.load("/art/knight.anims.json"))
	-- Needs factories of /spritebuddy/part.go and /spritebuddy/lit_part.go on this game
	-- object, named part_factory and lit_part_factory (or pass factory = and lit_factory =).
	self.knight = spritebuddy.player(sheet, {
		on_event = function(name, index) print("event", name) end,
		on_done = function(animation) self.knight:play("idle") end,
	})
	self.knight:play("walk")
end

function update(self, dt)
	self.knight:update(dt)
end
```

- `spritebuddy.load(path)` and `spritebuddy.load_data(key, json_text, png_bytes, normal_bytes)`
  give a sheet (cached by path or key); `spritebuddy.unload(sheet)` frees its textures.
- A player has `play(name, from_ms)`, `stop()`, `seek(ms)`, `update(dt)`, `set_flip(x, y)`,
  `animation_name()`, `part_ids()`, `delete()`, and the fields `speed`, `playing`, `time`, `index`
  and `file`.
- `spritebuddy.core` (plain Lua, no Defold calls) reads the file and has the timing and drawing
  rule: `read`, `frame_at`, `events_between`, `parts_of`.

Each part of a frame (the base frame and each live layer) is a child game object with a sprite.
Each frame of the sheet is its own one-frame atlas animation, made at run time with
`resource.create_atlas`, with the frame's pivot as the sprite's pivot.

## Example

Open this `defold` folder in the Defold editor (File → Open Project → `game.project`) and press
Project → Build. Keys 1, 2 and 3 switch between three examples, all playing a slime exported
from SpriteBuddy Pro:

1. **Slimes** (`examples/slimes.collection`): two slimes placed in the collection and one made
   by a factory, one wearing a hat drawn as a live layer. Click a slime, or press Space, to make
   it jump; each goes back to its own animation when the jump ends.
2. **Candle light** (`examples/candle.collection`): a flickering candle's point light lights the
   slime through its normal map, brighter the closer it gets and from the side the flame is on.
   The arrow keys move the slime and Space jumps.
3. **Frame events** (`examples/events.collection`): the walk tags a `"squelch"` on each step and
   the jump a `"land"`; each `frame_event` plays a sound and is logged on screen. Space jumps.

The example art in `examples/art/` is a copy of the repository's example slime, with those two
frame events added.

## Tests

The tests run in the engine: `tests/tests.collection` checks every fixture in `../fixtures`
against its golden table, the file checks, the players' sprites, flips, lighting and callbacks,
and loads each example collection. With Defold's `bob.jar` (it needs Java 25; the editor ships
one in `packages/`) and the `dmengine` it contains:

```sh
cd defold
java -jar bob.jar --platform x86_64-linux --variant debug \
  --settings tests/tests.settings --output build/tests build
unzip -j bob.jar 'libexec/x86_64-linux/*' -d engine
xvfb-run engine/dmengine build/tests/game.projectc   # exits 1 if a check fails
```

CI does this when started by hand.
