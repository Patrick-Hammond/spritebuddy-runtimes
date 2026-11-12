extends Node2D
## The SpriteBuddy example for Godot 4: three slimes from one sheet. Two are placed in the
## scene file (see slime_demo.tscn: a SpriteBuddySprite2D needs only File Path and Animation),
## and one is made here in code. Click a slime, or press Space, to make it hop.
##
## Run it from the editor (it is this project's main scene), or headless for a quick check:
##   godot --headless --path godot res://examples/slime_demo.tscn --quit-after 60

const FILE := "res://examples/art/slime.anims.json"

## Each slime's own animation, to go back to after a hop.
var _home := {}


func _ready() -> void:
	# A third slime, made in code. Its position is where it stands: the frame's pivot.
	var party := SpriteBuddySprite2D.new()
	party.name = "PartySlime"
	party.file_path = FILE
	party.animation = "party" # the hat is a live layer, drawn with each frame
	party.position = Vector2(240, 200)
	party.scale = Vector2(6, 6)
	add_child(party)

	for slime in _slimes():
		_home[slime] = slime.animation
		# "hop" plays once; animation_finished fires at its end.
		slime.animation_finished.connect(func(_name: String) -> void: slime.play(_home[slime]))
		slime.frame_changed.connect(func(_index: int) -> void: pass) # also there: per-frame events


func _slimes() -> Array[SpriteBuddySprite2D]:
	var out: Array[SpriteBuddySprite2D] = []
	for child in get_children():
		if child is SpriteBuddySprite2D:
			out.append(child)
	return out


func _unhandled_input(event: InputEvent) -> void:
	if event.is_action_pressed("ui_accept"):
		for slime in _slimes():
			slime.play("hop")
	elif event is InputEventMouseButton and event.pressed and event.button_index == MOUSE_BUTTON_LEFT:
		for slime in _slimes():
			# Each frame is 16 × 16 with its pivot at the bottom centre, drawn at 6×.
			var local := slime.to_local(event.position)
			if Rect2(-8, -16, 16, 16).has_point(local):
				slime.play("hop")
