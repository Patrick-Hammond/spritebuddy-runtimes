extends Node2D
## Real-time lighting with SpriteBuddy in Godot 4: a candle's PointLight2D lights the slime
## through its normal map, brighter the closer it gets and from whichever side the flame is on.
## The arrow keys move the slime; Space (ui_accept) makes it jump.
##
## Nothing here is special to SpriteBuddy: the export has a normal map (slime_n.png beside the
## sheet), so SpriteBuddySprite2D draws through a CanvasTexture and Godot's 2D lights light it.
## The scene (candle_demo.tscn) holds the light, the darkness (a CanvasModulate) and the candle,
## which is unshaded because it makes the light rather than receiving it.
##
## Open it and press F6 (Run Current Scene), or headless for a quick check:
##   godot --headless --path godot res://examples/candle_demo.tscn --quit-after 60

## The slime's speed, in pixels a second.
const SPEED := 90.0
## The light's energy before the flicker.
const ENERGY := 2.0

@onready var slime: SpriteBuddySprite2D = $World/Slime
@onready var light: PointLight2D = $Light
@onready var status: Label = $Hud/Status

var _jumping := false
var _time := 0.0


func _ready() -> void:
	# "jump" plays once; then the slime walks or idles again.
	slime.animation_finished.connect(func(_name: String) -> void: _jumping = false)


func _unhandled_input(event: InputEvent) -> void:
	if event.is_action_pressed("ui_accept") and not _jumping:
		_jumping = true
		slime.play("jump")


func _process(delta: float) -> void:
	_time += delta
	var direction := Input.get_vector("ui_left", "ui_right", "ui_up", "ui_down")
	if direction != Vector2.ZERO:
		var size := get_viewport_rect().size
		slime.position = (slime.position + direction * SPEED * delta).clamp(Vector2(30, 70), size - Vector2(30, 4))
		if direction.x != 0.0:
			# Face the way it goes. Godot turns the normals with the sprite, so it stays lit right.
			slime.scale.x = absf(slime.scale.x) * signf(direction.x)
	if not _jumping:
		var wanted := "walk" if direction != Vector2.ZERO else "idle"
		if slime.animation != wanted:
			slime.play(wanted)

	# Flicker: the light can change every frame.
	var flicker := 0.08 * sin(_time * 13.0) + 0.05 * sin(_time * 29.0 + 1.7)
	light.energy = ENERGY + 2.0 * flicker
	light.texture_scale = 2.4 + flicker
	_show_status()


## Says how far off the candle is and which side it lights the slime from.
func _show_status() -> void:
	var to_light := light.position - (slime.position - Vector2(0, 20)) # from the slime's middle
	var distance := roundi(to_light.length())
	var side: String
	if absf(to_light.x) > absf(to_light.y):
		side = "the right" if to_light.x > 0.0 else "the left"
	else:
		side = "below" if to_light.y > 0.0 else "above"
	status.text = "The candle is %d px away, lighting the slime from %s" % [distance, side]
