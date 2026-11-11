class_name SpriteBuddyFile
extends RefCounted
## A SpriteBuddy runtime file (version 3): the sheet's frames and its animations with timing,
## offsets and layers. See docs/format.md in the spritebuddy-runtimes repository.
##
## Frames are Dictionaries: { name, rect: Rect2i, pivot: Vector2, rotated: bool,
## trim: Vector2i (or null), size: Vector2i (the full frame) }.
## Animations are Dictionaries: { name, loop: "loop" | "pingpong" | "once", frames: [entry] },
## where an entry is { frame: int, duration: int (ms), offset: Vector2i, layers: [layer] } and a
## layer is { frame: int, position: Vector2i, z: int, opacity: float, flip_x: bool, flip_y: bool }.

const FORMAT := "spritebuddy-animations"
const VERSION := 3
const DEFAULT_DURATION := 100

var version: int
## The sheet image's path, resolved next to the file when loaded with load_path().
var image: String
var size: Vector2i
var scale: float = 1.0
var frames: Array[Dictionary] = []
var animations: Array[Dictionary] = []
## The sheet texture, set by load_path() (or by you).
var texture: Texture2D


## Loads a runtime file and its sheet image from a res:// (or user://) path. Returns null and
## pushes an error if either can't be read.
static func load_path(path: String) -> SpriteBuddyFile:
	var text := FileAccess.get_file_as_string(path)
	if text.is_empty():
		push_error("SpriteBuddy: can't read %s" % path)
		return null
	var file := parse_text(text)
	if file == null:
		return null
	if not (file.image.begins_with("res://") or file.image.begins_with("user://")):
		file.image = path.get_base_dir().path_join(file.image)
	file.texture = load(file.image) as Texture2D
	if file.texture == null:
		push_error("SpriteBuddy: can't load the sheet %s" % file.image)
		return null
	return file


## Parses the text of a runtime file. Returns null and pushes an error saying where it's wrong.
static func parse_text(text: String) -> SpriteBuddyFile:
	var json := JSON.new()
	if json.parse(text) != OK:
		push_error("SpriteBuddy: not valid JSON (line %d): %s" % [json.get_error_line(), json.get_error_message()])
		return null
	var file := SpriteBuddyFile.new()
	var error := file._read(json.data)
	if error != "":
		push_error("SpriteBuddy: " + error)
		return null
	return file


## Like parse_text() but returns the problem instead of pushing it: "" when the data is fine.
func read(data: Variant) -> String:
	return _read(data)


# --- Timing --------------------------------------------------------------------------------

## The frame indices one cycle visits: pingpong plays back without repeating the end frames.
static func cycle_order(animation: Dictionary) -> Array[int]:
	var order: Array[int] = []
	var count: int = animation.frames.size()
	for i in count:
		order.append(i)
	if animation.loop == "pingpong" and count > 2:
		for i in range(count - 2, 0, -1):
			order.append(i)
	return order


static func cycle_duration(animation: Dictionary) -> int:
	var total := 0
	for i in cycle_order(animation):
		total += int(animation.frames[i].duration)
	return total


## Which frame shows `time_ms` after the animation starts: { index, done }. A frame shows from
## its start up to, not including, its end; `once` holds the last frame and is then done.
static func frame_at(animation: Dictionary, time_ms: float) -> Dictionary:
	var order := cycle_order(animation)
	if order.is_empty():
		return { "index": -1, "done": true }
	var total := cycle_duration(animation)
	var t := maxf(0.0, time_ms)
	if animation.loop == "once" and t >= total:
		return { "index": order[order.size() - 1], "done": true }
	var rest := fmod(t, float(total))
	for i in order:
		rest -= float(animation.frames[i].duration)
		if rest < 0.0:
			return { "index": i, "done": false }
	return { "index": order[order.size() - 1], "done": false }


## Everything to draw for an animation frame entry, bottom to top: { frame (Dictionary),
## index, position (Vector2: the full frame's top-left from the sprite's origin), opacity,
## flip_x, flip_y }. The origin is the base frame's pivot, moved by the entry's offset.
func parts_of(entry: Dictionary) -> Array[Dictionary]:
	var base: Dictionary = frames[entry.frame]
	var top_left: Vector2 = -base.pivot + Vector2(entry.offset)
	var stack: Array[Dictionary] = [{
		"z": 0, "order": 0, "frame": base, "index": entry.frame, "position": top_left,
		"opacity": 1.0, "flip_x": false, "flip_y": false,
	}]
	var order := 1
	for layer in entry.layers:
		stack.append({
			"z": layer.z, "order": order, "frame": frames[layer.frame], "index": layer.frame,
			"position": top_left + Vector2(layer.position), "opacity": layer.opacity,
			"flip_x": layer.flip_x, "flip_y": layer.flip_y,
		})
		order += 1
	stack.sort_custom(func(a: Dictionary, b: Dictionary) -> bool:
		return a.z < b.z or (a.z == b.z and a.order < b.order))
	var parts: Array[Dictionary] = []
	for item in stack:
		item.erase("z")
		item.erase("order")
		parts.append(item)
	return parts


## The animation called `animation_name`, or an empty Dictionary.
func find_animation(animation_name: String) -> Dictionary:
	for animation in animations:
		if animation.name == animation_name:
			return animation
	return {}


func animation_names() -> PackedStringArray:
	var names := PackedStringArray()
	for animation in animations:
		names.append(animation.name)
	return names


## A SpriteFrames resource for AnimatedSprite2D, for animations that need no layers or offsets.
## Ping-pong is unrolled and `once` doesn't loop. Needs `texture`.
func to_sprite_frames() -> SpriteFrames:
	var sprite_frames := SpriteFrames.new()
	sprite_frames.remove_animation(&"default")
	var atlases: Array[AtlasTexture] = []
	for frame in frames:
		atlases.append(_atlas_for(frame))
	for animation in animations:
		var animation_name := StringName(animation.name)
		sprite_frames.add_animation(animation_name)
		# 1000 frames a second makes each frame's relative duration its time in ms.
		sprite_frames.set_animation_speed(animation_name, 1000.0)
		sprite_frames.set_animation_loop(animation_name, animation.loop != "once")
		for i in cycle_order(animation):
			var entry: Dictionary = animation.frames[i]
			sprite_frames.add_frame(animation_name, atlases[entry.frame], float(entry.duration))
	return sprite_frames


func _atlas_for(frame: Dictionary) -> AtlasTexture:
	var atlas := AtlasTexture.new()
	atlas.atlas = texture
	var rect: Rect2i = frame.rect
	# AtlasTexture can't turn a rotated frame back upright; such frames show as stored.
	atlas.region = Rect2(rect.position, Vector2(rect.size.y, rect.size.x) if frame.rotated else Vector2(rect.size))
	if typeof(frame.trim) != TYPE_NIL:
		var trim: Vector2i = frame.trim
		var full: Vector2i = frame.size
		atlas.margin = Rect2(Vector2(trim), Vector2(full - rect.size))
	return atlas


# --- Reading --------------------------------------------------------------------------------

func _read(data: Variant) -> String:
	if typeof(data) != TYPE_DICTIONARY:
		return "expected an object"
	if data.get("format") != FORMAT:
		return "format: not a SpriteBuddy animations file (format should be \"%s\")" % FORMAT
	if not _is_int(data.get("version")) or int(data.version) < 1:
		return "version: expected a whole number ≥ 1"
	version = int(data.version)
	if version < 3:
		return "version: version %d files need the sheet's own JSON; export again from SpriteBuddy for version %d" % [version, VERSION]
	if version > VERSION:
		return "version: version %d is newer than this runtime reads (%d); update the SpriteBuddy addon" % [version, VERSION]
	if typeof(data.get("image")) != TYPE_STRING or String(data.image).is_empty():
		return "image: expected a non-empty string"
	image = data.image
	var sheet_size: Variant = _ints(data.get("size"), 2, [1, 1])
	if sheet_size is String:
		return "size: " + sheet_size
	size = Vector2i(sheet_size[0], sheet_size[1])
	if data.has("scale"):
		if not (data.scale is float or data.scale is int) or float(data.scale) <= 0.0:
			return "scale: expected a positive number"
		scale = float(data.scale)
	if typeof(data.get("frames")) != TYPE_ARRAY:
		return "frames: expected a list"
	frames.clear()
	for i in data.frames.size():
		var frame: Variant = _frame(data.frames[i])
		if frame is String:
			return "frames[%d]%s" % [i, frame]
		frames.append(frame)
	animations.clear()
	var list: Variant = data.get("animations", [])
	if typeof(list) != TYPE_ARRAY:
		return "animations: expected a list"
	var seen := {}
	for i in list.size():
		var animation: Variant = _animation(list[i])
		if animation is String:
			return "animations[%d]%s" % [i, animation]
		if seen.has(animation.name):
			return "animations[%d].name: duplicate animation \"%s\"" % [i, animation.name]
		seen[animation.name] = true
		animations.append(animation)
	return ""


static func _is_int(value: Variant) -> bool:
	return (value is int) or (value is float and is_finite(value) and value == floorf(value))


## A list of `length` whole numbers, each at least the given minimum, or an error String.
static func _ints(value: Variant, length: int, minimum: Array) -> Variant:
	if typeof(value) != TYPE_ARRAY:
		return "expected a list"
	if value.size() != length:
		return "expected %d numbers" % length
	var out: Array[int] = []
	for i in length:
		if not _is_int(value[i]) or (typeof(minimum[i]) != TYPE_NIL and int(value[i]) < int(minimum[i])):
			return "[%d]: expected a whole number%s" % [i, "" if typeof(minimum[i]) == TYPE_NIL else " ≥ %d" % minimum[i]]
		out.append(int(value[i]))
	return out


func _frame(value: Variant) -> Variant:
	if typeof(value) != TYPE_DICTIONARY:
		return ": expected an object"
	if typeof(value.get("name")) != TYPE_STRING or String(value.name).is_empty():
		return ".name: expected a non-empty string"
	var rect: Variant = _ints(value.get("rect"), 4, [0, 0, 1, 1])
	if rect is String:
		return ".rect" + (": " if rect.begins_with("e") else "") + rect
	var rotated: Variant = value.get("rotated", false)
	if typeof(rotated) != TYPE_BOOL:
		return ".rotated: expected true or false"
	var columns: int = rect[3] if rotated else rect[2]
	var rows: int = rect[2] if rotated else rect[3]
	if rect[0] + columns > size.x or rect[1] + rows > size.y:
		return ".rect: lies outside the sheet"
	var full := Vector2i(rect[2], rect[3])
	var trim: Variant = null
	if value.has("trim"):
		var t: Variant = _ints(value.trim, 4, [0, 0, 1, 1])
		if t is String:
			return ".trim" + (": " if t.begins_with("e") else "") + t
		if t[0] + rect[2] > t[2] or t[1] + rect[3] > t[3]:
			return ".trim: the trimmed pixels lie outside the full frame"
		trim = Vector2i(t[0], t[1])
		full = Vector2i(t[2], t[3])
	var pivot := Vector2(full.x / 2.0, float(full.y))
	if value.has("pivot"):
		var p: Variant = value.pivot
		if typeof(p) != TYPE_ARRAY or p.size() != 2 or not (p[0] is float or p[0] is int) or not (p[1] is float or p[1] is int):
			return ".pivot: expected 2 numbers"
		pivot = Vector2(p[0], p[1])
	return {
		"name": value.name,
		"rect": Rect2i(rect[0], rect[1], rect[2], rect[3]),
		"pivot": pivot,
		"rotated": rotated,
		"trim": trim,
		"size": full,
	}


func _frame_index(value: Variant) -> Variant:
	if not _is_int(value) or int(value) < 0:
		return "expected a whole number ≥ 0"
	if int(value) >= frames.size():
		return "no frame %d; the file has %d" % [int(value), frames.size()]
	return int(value)


func _layer(value: Variant) -> Variant:
	if typeof(value) != TYPE_DICTIONARY:
		return ": expected an object"
	var index: Variant = _frame_index(value.get("frame"))
	if index is String:
		return ".frame: " + index
	for key in ["x", "y", "z"]:
		if value.has(key) and not _is_int(value[key]):
			return ".%s: expected a whole number" % key
	var opacity: Variant = value.get("opacity", 1.0)
	if not (opacity is float or opacity is int) or float(opacity) < 0.0 or float(opacity) > 1.0:
		return ".opacity: expected a number from 0 to 1"
	for key in ["flipX", "flipY"]:
		if value.has(key) and typeof(value[key]) != TYPE_BOOL:
			return ".%s: expected true or false" % key
	return {
		"frame": index,
		"position": Vector2i(int(value.get("x", 0)), int(value.get("y", 0))),
		"z": int(value.get("z", 1)),
		"opacity": float(opacity),
		"flip_x": value.get("flipX", false),
		"flip_y": value.get("flipY", false),
	}


func _entry(value: Variant, duration: int) -> Variant:
	if value is float or value is int:
		var index: Variant = _frame_index(value)
		if index is String:
			return ": " + index
		return { "frame": index, "duration": duration, "offset": Vector2i.ZERO, "layers": [] }
	if typeof(value) != TYPE_DICTIONARY:
		return ": expected an object"
	var index: Variant = _frame_index(value.get("frame"))
	if index is String:
		return ".frame: " + index
	if value.has("duration"):
		if not _is_int(value.duration) or int(value.duration) < 1:
			return ".duration: expected a whole number ≥ 1"
		duration = int(value.duration)
	var offset := Vector2i.ZERO
	if value.has("offset"):
		var o: Variant = _ints(value.offset, 2, [null, null])
		if o is String:
			return ".offset" + (": " if o.begins_with("e") else "") + o
		offset = Vector2i(o[0], o[1])
	var layers: Array[Dictionary] = []
	var list: Variant = value.get("layers", [])
	if typeof(list) != TYPE_ARRAY:
		return ".layers: expected a list"
	for i in list.size():
		var layer: Variant = _layer(list[i])
		if layer is String:
			return ".layers[%d]%s" % [i, layer]
		layers.append(layer)
	return { "frame": index, "duration": duration, "offset": offset, "layers": layers }


func _animation(value: Variant) -> Variant:
	if typeof(value) != TYPE_DICTIONARY:
		return ": expected an object"
	if typeof(value.get("name")) != TYPE_STRING or String(value.name).is_empty():
		return ".name: expected a non-empty string"
	var loop: Variant = value.get("loop", "loop")
	if not (loop in ["loop", "pingpong", "once"]):
		return ".loop: expected \"loop\", \"pingpong\" or \"once\""
	var duration := DEFAULT_DURATION
	if value.has("duration"):
		if not _is_int(value.duration) or int(value.duration) < 1:
			return ".duration: expected a whole number ≥ 1"
		duration = int(value.duration)
	if typeof(value.get("frames")) != TYPE_ARRAY:
		return ".frames: expected a list"
	var entries: Array[Dictionary] = []
	for i in value.frames.size():
		var entry: Variant = _entry(value.frames[i], duration)
		if entry is String:
			return ".frames[%d]%s" % [i, entry]
		entries.append(entry)
	return { "name": value.name, "loop": loop, "frames": entries }
