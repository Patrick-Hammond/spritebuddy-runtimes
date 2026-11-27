extends Node2D
## Plays a sound on a frame event with SpriteBuddy in Godot 4. In SpriteBuddy, the hop's take-off
## frame has the event "jump" and its landing frame has "land". SpriteBuddySprite2D emits
## frame_event as each of those frames starts showing, so the sound is always in time with the
## art, whatever the speed_scale. Click the slime, or press Space (ui_accept), to make it hop.
##
## The sounds are ordinary AudioStreamPlayer nodes in the scene (sounds_demo.tscn), named after
## the events they play on, so one signal handler plays them all.
##
## Open it and press F6 (Run Current Scene), or headless for a quick check:
##   godot --headless --path godot res://examples/sounds_demo.tscn --quit-after 60

@onready var slime: SpriteBuddySprite2D = $Slime
@onready var sounds: Node = $Sounds
@onready var status: Label = $Hud/Status

## Every event heard, in order (the tests read it).
var heard: Array[String] = []


func _ready() -> void:
	slime.frame_event.connect(_on_frame_event)
	# "hop" plays once; then the slime breathes again.
	slime.animation_finished.connect(func(_name: String) -> void: slime.play("idle"))
	status.text = "Click the slime (or press Space) to hop"


func _on_frame_event(event_name: StringName, _index: int) -> void:
	var player := sounds.get_node_or_null(NodePath(event_name)) as AudioStreamPlayer
	if player:
		player.play()
	heard.append(String(event_name))
	status.text = "♪ %s" % event_name


func hop() -> void:
	if slime.animation != "hop":
		slime.play("hop")


func _unhandled_input(event: InputEvent) -> void:
	if event.is_action_pressed("ui_accept"):
		hop()
	elif event is InputEventMouseButton and event.pressed and event.button_index == MOUSE_BUTTON_LEFT:
		# The frame is 16 × 16 with its pivot at the bottom centre, drawn at 6×.
		if Rect2(-8, -16, 16, 16).has_point(slime.to_local(event.position)):
			hop()
