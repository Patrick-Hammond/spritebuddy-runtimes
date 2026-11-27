using UnityEngine;
using UnityEngine.Rendering;
using UnityEngine.Rendering.Universal;

namespace SpriteBuddy.Examples
{
    /// <summary>
    /// Real-time lighting with SpriteBuddy and URP's 2D lights: a candle's Point Light 2D lights
    /// the slime through its normal map, brighter the closer it gets and from whichever side the
    /// flame is on. The arrow keys move the slime; Space makes it jump.
    /// </summary>
    /// <remarks>
    /// Nothing here is special to SpriteBuddy: the export has a normal map (slime_n.png beside the
    /// sheet), so the SpriteBuddy Sprite hands it to URP as the sprites' _NormalMap and the 2D
    /// Renderer lights them. The scene (Candle.unity) holds the lights: a dim Global Light 2D for
    /// the dark room, and the candle's Point Light 2D with Normal Map Quality set to Accurate. The
    /// candle uses the unlit sprite material, because it makes the light rather than receiving it.
    /// </remarks>
    public sealed class CandleDemo : MonoBehaviour
    {
        [SerializeField] SpriteBuddySprite slime;
        [SerializeField] SpriteBuddySprite candle;
        [SerializeField] Light2D candleLight;
        [Tooltip("The slime's speed, in units a second.")]
        [SerializeField] float speed = 1.4f;
        [Tooltip("How far above the candle's base the flame is, in sheet pixels.")]
        [SerializeField] float flameHeight = 13f;
        [Tooltip("The floor's colour; it's lit like the slime.")]
        [SerializeField] Color floorColor = new Color(0.25f, 0.25f, 0.3f);

        float _intensity;
        float _radius;
        bool _jumping;
        string _status = "";

        void Start()
        {
            _intensity = candleLight.intensity;
            _radius = candleLight.pointLightOuterRadius;
            MakeFloor();
            var ppu = candle.Sheet != null ? candle.Sheet.PixelsPerUnit : 16f;
            candleLight.transform.position = candle.transform.position + new Vector3(0f, flameHeight / ppu, 0f);
            // "jump" plays once; then the slime walks or idles again.
            slime.AnimationFinished += name => _jumping = false;
        }

        void Update()
        {
            var direction = new Vector2(Axis(KeyCode.LeftArrow, KeyCode.RightArrow), Axis(KeyCode.DownArrow, KeyCode.UpArrow));
            if (direction != Vector2.zero)
            {
                direction.Normalize();
                var view = ViewHalfSize();
                var p = (Vector2)slime.transform.position + direction * speed * Time.deltaTime;
                p.x = Mathf.Clamp(p.x, -view.x + 0.5f, view.x - 0.5f);
                p.y = Mathf.Clamp(p.y, -view.y + 0.1f, view.y - 1f);
                slime.transform.position = p;
                // Face the way it goes. FlipX (rather than a negative scale) keeps the light on the right side.
                if (direction.x != 0f) slime.FlipX = direction.x < 0f;
            }
            if (Input.GetKeyDown(KeyCode.Space) && !_jumping)
            {
                _jumping = true;
                slime.Play("jump");
            }
            if (!_jumping)
            {
                var wanted = direction != Vector2.zero ? "walk" : "idle";
                if (slime.Animation != wanted) slime.Play(wanted);
            }

            // Whoever stands lower on the screen is in front.
            SortByHeight(slime);
            SortByHeight(candle);

            // Flicker: the light can change every frame.
            var t = Time.time;
            var flicker = 0.08f * Mathf.Sin(t * 13f) + 0.05f * Mathf.Sin(t * 29f + 1.7f);
            candleLight.intensity = _intensity + 2f * flicker;
            candleLight.pointLightOuterRadius = _radius * (1f + 0.4f * flicker);
            _status = Describe();
        }

        static float Axis(KeyCode negative, KeyCode positive) =>
            (Input.GetKey(positive) ? 1f : 0f) - (Input.GetKey(negative) ? 1f : 0f);

        static Vector2 ViewHalfSize()
        {
            var camera = Camera.main;
            if (camera == null) return new Vector2(3.5f, 2f);
            return new Vector2(camera.orthographicSize * camera.aspect, camera.orthographicSize);
        }

        static void SortByHeight(SpriteBuddySprite sprite)
        {
            var group = sprite.GetComponent<SortingGroup>();
            if (group != null) group.sortingOrder = Mathf.RoundToInt(-sprite.transform.position.y * 100f);
        }

        /// <summary>A plain floor to light: a one-pixel white sprite, stretched over the view.</summary>
        void MakeFloor()
        {
            var texture = new Texture2D(1, 1) { name = "Floor", filterMode = FilterMode.Point };
            texture.SetPixel(0, 0, Color.white);
            texture.Apply();
            var floor = new GameObject("Floor");
            var renderer = floor.AddComponent<SpriteRenderer>();
            renderer.sprite = Sprite.Create(texture, new Rect(0, 0, 1, 1), new Vector2(0.5f, 0.5f), 1f);
            renderer.color = floorColor;
            renderer.sortingOrder = -10000;
            var view = ViewHalfSize();
            floor.transform.localScale = new Vector3(view.x * 2f + 1f, view.y * 2f + 1f, 1f);
        }

        /// <summary>Says how far off the candle is and which side it lights the slime from.</summary>
        string Describe()
        {
            var ppu = slime.Sheet != null ? slime.Sheet.PixelsPerUnit : 16f;
            // From the slime's middle, about 5 sheet pixels up from where it stands.
            var toLight = (Vector2)(candleLight.transform.position - slime.transform.position) - new Vector2(0f, 5f / ppu);
            var distance = Mathf.RoundToInt(toLight.magnitude * ppu);
            if (toLight.magnitude > candleLight.pointLightOuterRadius) return "The candle is " + distance + " px away: out of reach";
            string side;
            if (Mathf.Abs(toLight.x) > Mathf.Abs(toLight.y)) side = toLight.x > 0f ? "the right" : "the left";
            else side = toLight.y > 0f ? "above" : "below";
            return "The candle is " + distance + " px away, lighting the slime from " + side;
        }

        void OnGUI()
        {
            GUI.Label(new Rect(10, 8, 700, 24), "Arrow keys move the slime; Space jumps.");
            GUI.Label(new Rect(10, 30, 700, 24), _status);
        }
    }
}
