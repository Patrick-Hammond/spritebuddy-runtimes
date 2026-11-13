@tool
@icon("res://addons/spritebuddy/icon.svg")
class_name SpriteBuddySprite2D
extends Node2D
## Plays a SpriteBuddy animation, layers and offsets included. The node's position is where the
## character stands: the frame's pivot.

## Emitted with the frame index each time the frame changes.
signal frame_changed(index: int)
## Emitted for each event of a frame (such as "hit") as the frame starts showing, after
## frame_changed. play() fires the first frame's events; seek() jumps without firing any.
signal frame_event(event_name: StringName, index: int)
## Emitted when a "once" animation reaches its end.
signal animation_finished(animation_name: String)

## The runtime file (`.anims.json`); its sheet image is loaded from beside it.
@export_file("*.json") var file_path: String = "":
	set(value):
		file_path = value
		_load()

## The animation to play.
@export var animation: String = "":
	set(value):
		animation = value
		if is_node_ready() and value != _animation.get("name", ""):
			play(value)

## Plays when the scene starts (and in the editor, to preview).
@export var autoplay := true
## Playback rate: 1 is normal.
@export_range(0.0, 10.0, 0.05, "or_greater") var speed_scale := 1.0
## Crisp pixels when scaled.
@export var pixel_art := true:
	set(value):
		pixel_art = value
		texture_filter = TEXTURE_FILTER_NEAREST if value else TEXTURE_FILTER_PARENT_NODE

## Draws with the file's normal map when it has one, so 2D lights light the sprite.
@export var use_normals := true:
	set(value):
		use_normals = value
		queue_redraw()

var file: SpriteBuddyFile
var playing := false
## Ms since the animation started, scaled by speed_scale.
var time := 0.0
## Index into the animation's frames, or -1.
var frame_index := -1
var _animation: Dictionary = {}
var _parts: Array[Dictionary] = []
var _done := false


func _ready() -> void:
	pixel_art = pixel_art
	if file == null:
		_load()
	if file != null and autoplay:
		play(animation if animation != "" else (file.animations[0].name if not file.animations.is_empty() else ""))


## Uses an already loaded file instead of `file_path`.
func set_file(value: SpriteBuddyFile) -> void:
	file = value
	_animation = {}
	_parts = []
	queue_redraw()


## Starts `animation_name` from its start (or from `from_ms`).
func play(animation_name: String, from_ms := 0.0) -> void:
	if file == null or animation_name == "":
		return
	var found := file.find_animation(animation_name)
	if found.is_empty():
		push_error("SpriteBuddy: no animation \"%s\"; this file has %s" % [animation_name, ", ".join(file.animation_names())])
		return
	_animation = found
	animation = animation_name
	frame_index = -1
	_done = false
	playing = true
	time = maxf(0.0, from_ms)
	var fired: Array[Dictionary] = []
	var first: int = SpriteBuddyFile.frame_at(_animation, time).index
	if first >= 0:
		for event_name in _animation.frames[first].events:
			fired.append({ "name": event_name, "index": first })
	_refresh(fired)


func stop() -> void:
	playing = false


## Jumps to `ms` into the animation.
func seek(ms: float) -> void:
	time = maxf(0.0, ms)
	_refresh()


## Moves time on by `ms` (times speed_scale); called for you every frame while playing.
func advance(ms: float) -> void:
	if playing and not _animation.is_empty():
		var from_ms := time
		time += maxf(0.0, ms) * speed_scale
		_refresh(SpriteBuddyFile.events_between(_animation, from_ms, time))


func _process(delta: float) -> void:
	advance(delta * 1000.0)


## Works out the frame now showing, then emits frame_changed, frame_event and
## animation_finished in that order.
func _refresh(fired: Array[Dictionary] = []) -> void:
	if _animation.is_empty():
		return
	var position_at := SpriteBuddyFile.frame_at(_animation, time)
	var index: int = position_at.index
	var changed := index != frame_index
	frame_index = index
	if index < 0:
		_parts = []
	else:
		_parts = file.parts_of(_animation.frames[index])
	if changed:
		queue_redraw()
		if index >= 0:
			frame_changed.emit(index)
	for event in fired:
		frame_event.emit(StringName(event.name), event.index)
	if position_at.done and not _done:
		_done = true
		playing = false
		animation_finished.emit(_animation.name)


func _load() -> void:
	if file_path == "":
		return
	var loaded := SpriteBuddyFile.load_path(file_path)
	if loaded != null:
		set_file(loaded)


func _draw() -> void:
	if file == null or file.texture == null:
		return
	for part in _parts:
		_draw_part(part)
	draw_set_transform_matrix(Transform2D.IDENTITY)


## The texture parts are drawn from: the sheet with its normal map when there is one and
## use_normals is on, else the plain sheet.
func sheet_texture() -> Texture2D:
	if file == null:
		return null
	if use_normals and file.canvas_texture != null:
		return file.canvas_texture
	return file.texture


## Draws one part: its full frame's top-left at `part.position`, flipped within the full frame,
## a rotated frame turned back upright.
func _draw_part(part: Dictionary) -> void:
	var frame: Dictionary = part.frame
	var rect: Rect2i = frame.rect
	var full: Vector2 = Vector2(frame.size)
	var trim: Vector2 = Vector2(frame.trim) if typeof(frame.trim) != TYPE_NIL else Vector2.ZERO
	var local := Transform2D(0.0, part.position)
	if part.flip_x:
		local = local * Transform2D(Vector2(-1, 0), Vector2(0, 1), Vector2(full.x, 0))
	if part.flip_y:
		local = local * Transform2D(Vector2(1, 0), Vector2(0, -1), Vector2(0, full.y))
	var color := Color(1, 1, 1, part.opacity)
	if frame.rotated:
		# Stored turned 90° clockwise: turn it back a quarter turn the other way.
		local = local * Transform2D(-PI / 2.0, trim + Vector2(0, rect.size.y))
		draw_set_transform_matrix(local)
		var stored := Rect2(Vector2(rect.position), Vector2(rect.size.y, rect.size.x))
		draw_texture_rect_region(sheet_texture(), Rect2(Vector2.ZERO, stored.size), stored, color)
	else:
		draw_set_transform_matrix(local)
		draw_texture_rect_region(sheet_texture(), Rect2(trim, Vector2(rect.size)), Rect2(rect), color)
