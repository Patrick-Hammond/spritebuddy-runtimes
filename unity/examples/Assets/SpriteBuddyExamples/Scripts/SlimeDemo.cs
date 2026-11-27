using System.Collections.Generic;
using UnityEngine;

namespace SpriteBuddy.Examples
{
    /// <summary>
    /// Three slimes from one sheet: two placed in the scene (Slimes.unity), and one made here in
    /// code, wearing a hat drawn as a live layer by its "party" animation. Click a slime, or press
    /// Space for all of them, to make it hop.
    /// </summary>
    public sealed class SlimeDemo : MonoBehaviour
    {
        [Tooltip("The slimes placed in the scene.")]
        [SerializeField] SpriteBuddySprite[] slimes = new SpriteBuddySprite[0];
        [Tooltip("The runtime file and sheet the slime made in code plays.")]
        [SerializeField] TextAsset file;
        [SerializeField] Texture2D sheet;
        [Tooltip("Where the slime made in code stands.")]
        [SerializeField] Vector2 partySlimeAt = new Vector2(1.6f, -0.8f);

        readonly List<SpriteBuddySprite> _all = new List<SpriteBuddySprite>();
        // What each slime goes back to after a hop.
        readonly Dictionary<SpriteBuddySprite, string> _resting = new Dictionary<SpriteBuddySprite, string>();

        void Start()
        {
            _all.AddRange(slimes);

            // A sprite made in code: add the component, give it the file and sheet, and play.
            var party = new GameObject("Party slime");
            party.transform.position = partySlimeAt;
            var sprite = party.AddComponent<SpriteBuddySprite>();
            sprite.SetSource(file, sheet);
            sprite.Play("party");
            _all.Add(sprite);

            foreach (var slime in _all)
            {
                var s = slime;
                // "jump" plays once; then the slime goes back to what it was doing.
                s.AnimationFinished += name =>
                {
                    if (name == "jump" && _resting.TryGetValue(s, out var resting)) s.Play(resting);
                };
            }
        }

        void Update()
        {
            if (Input.GetKeyDown(KeyCode.Space))
                foreach (var slime in _all) Hop(slime);
            if (Input.GetMouseButtonDown(0) && Camera.main != null)
            {
                var world = (Vector2)Camera.main.ScreenToWorldPoint(Input.mousePosition);
                foreach (var slime in _all)
                    if (Contains(slime, world)) Hop(slime);
            }
        }

        void Hop(SpriteBuddySprite slime)
        {
            if (slime.Animation == "jump" && slime.IsPlaying) return;
            _resting[slime] = slime.Animation;
            slime.Play("jump");
        }

        /// <summary>Whether a world point is inside any part the slime draws now.</summary>
        static bool Contains(SpriteBuddySprite slime, Vector2 world)
        {
            if (slime.Player == null || slime.Sheet == null) return false;
            // Into the sprite's own space, then into sheet pixels (y down) from its origin.
            Vector2 local = slime.transform.InverseTransformPoint(world);
            var ppu = slime.Sheet.PixelsPerUnit;
            var x = local.x * ppu;
            var y = -local.y * ppu;
            foreach (var part in slime.Player.Parts)
                if (x >= part.X && x < part.X + part.Frame.FullWidth && y >= part.Y && y < part.Y + part.Frame.FullHeight)
                    return true;
            return false;
        }

        void OnGUI()
        {
            GUI.Label(new Rect(10, 8, 600, 24), "Click a slime, or press Space, to make it hop.");
        }
    }
}
