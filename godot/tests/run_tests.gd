extends SceneTree
## Runs the SpriteBuddy addon's tests headless:
##   godot --headless --path godot -s tests/run_tests.gd
## Exits with 1 if any check fails. Checks every fixture against its golden table.

var failures := 0
var checks := 0


func _init() -> void:
	var fixtures := ProjectSettings.globalize_path("res://").path_join("../fixtures").simplify_path()
	var dir := DirAccess.open(fixtures)
	if dir == null:
		_fail("can't open %s" % fixtures)
	else:
		for fixture_name in dir.get_files():
			if fixture_name.ends_with(".anims.json"):
				_check_fixture(fixtures, fixture_name)
	_check_errors()
	_check_sprite_frames(fixtures)
	print("%d checks, %d failures" % [checks, failures])
	quit(1 if failures > 0 else 0)


func _fail(message: String) -> void:
	failures += 1
	printerr("FAIL: " + message)


func _expect(condition: bool, message: String) -> void:
	checks += 1
	if not condition:
		_fail(message)


func _check_fixture(dir: String, fixture: String) -> void:
	var file := SpriteBuddyFile.parse_text(FileAccess.get_file_as_string(dir.path_join(fixture)))
	_expect(file != null, "%s parses" % fixture)
	if file == null:
		return
	var expected: Dictionary = JSON.parse_string(FileAccess.get_file_as_string(dir.path_join(fixture.replace(".anims.json", ".expected.json"))))
	for table in expected.animations:
		var animation := file.find_animation(table.animation)
		_expect(not animation.is_empty(), "%s has %s" % [fixture, table.animation])
		for check in table.checks:
			var at := SpriteBuddyFile.frame_at(animation, float(check.time))
			var where := "%s %s t=%d" % [fixture, table.animation, int(check.time)]
			_expect(at.index == int(check.index) and at.done == check.done, "%s: frame %s, expected %d %s" % [where, at, int(check.index), check.done])
			if at.index < 0:
				continue
			var parts := file.parts_of(animation.frames[at.index])
			_expect(parts.size() == check.parts.size(), "%s: %d parts, expected %d" % [where, parts.size(), check.parts.size()])
			for i in mini(parts.size(), check.parts.size()):
				var got: Dictionary = parts[i]
				var want: Dictionary = check.parts[i]
				var same: bool = got.frame.name == want.frame \
					and is_equal_approx(got.position.x, float(want.x)) \
					and is_equal_approx(got.position.y, float(want.y)) \
					and is_equal_approx(got.opacity, float(want.get("opacity", 1.0))) \
					and got.flip_x == want.get("flipX", false) \
					and got.flip_y == want.get("flipY", false)
				_expect(same, "%s part %d: got %s %s, expected %s" % [where, i, got.frame.name, got.position, want])


func _check_errors() -> void:
	var file := SpriteBuddyFile.new()
	var base := {
		"format": "spritebuddy-animations", "version": 3, "image": "a.png", "size": [64, 32],
		"frames": [{ "name": "a", "rect": [0, 0, 16, 32] }],
	}
	_expect(file.read(base) == "", "a minimal file reads")
	_expect(file.frames[0].pivot == Vector2(8, 32), "pivot defaults to bottom centre")
	var cases := [
		[{ "version": 4 }, "version: version 4 is newer"],
		[{ "version": 2 }, "version: version 2 files need"],
		[{ "format": "x" }, "format: not a SpriteBuddy"],
		[{ "size": [64] }, "size: expected 2 numbers"],
		[{ "frames": [{ "name": "a", "rect": [60, 0, 16, 4] }] }, "frames[0].rect: lies outside the sheet"],
		[{ "frames": [{ "name": "a", "rect": [0, 0, 0, 4] }] }, "frames[0].rect[2]: expected a whole number ≥ 1"],
		[{ "animations": [{ "name": "w", "frames": [3] }] }, "animations[0].frames[0]: no frame 3; the file has 1"],
		[{ "animations": [{ "name": "w", "loop": "bounce", "frames": [] }] }, "animations[0].loop"],
		[{ "animations": [{ "name": "w", "frames": [{ "frame": 0, "layers": [{ "frame": 0, "opacity": 2 }] }] }] }, "animations[0].frames[0].layers[0].opacity"],
		[{ "animations": [{ "name": "w", "frames": [] }, { "name": "w", "frames": [] }] }, "animations[1].name: duplicate"],
	]
	for c in cases:
		var data := base.duplicate(true)
		data.merge(c[0], true)
		var error := SpriteBuddyFile.new().read(data)
		_expect(error.begins_with(c[1]), "error for %s: got \"%s\", expected \"%s…\"" % [c[0], error, c[1]])


func _check_sprite_frames(dir: String) -> void:
	var file := SpriteBuddyFile.parse_text(FileAccess.get_file_as_string(dir.path_join("loops.anims.json")))
	file.texture = PlaceholderTexture2D.new()
	var frames := file.to_sprite_frames()
	_expect(frames.get_frame_count(&"bounce") == 6, "ping-pong is unrolled into 6 frames")
	_expect(frames.get_animation_loop(&"attack") == false, "once doesn't loop")
	_expect(is_equal_approx(frames.get_frame_duration(&"attack", 2), 300.0), "frame durations are ms at 1000 fps")
