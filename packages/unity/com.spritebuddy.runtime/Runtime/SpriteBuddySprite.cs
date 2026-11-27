using System;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.Events;
using UnityEngine.Rendering;

namespace SpriteBuddy
{
    /// <summary>
    /// Plays a SpriteBuddy animation, with per-frame timing, frame offsets, live layers and frame
    /// events. The GameObject's position is where the character stands: the frame's pivot.
    /// </summary>
    /// <remarks>
    /// Each part (the frame and its layers) is a hidden child <see cref="SpriteRenderer"/>, under
    /// a <see cref="SortingGroup"/> that sorts the sprite as one: set the sorting layer and order
    /// on the SortingGroup. With a normal map, URP's 2D lights light it (Sprite-Lit-Default).
    /// </remarks>
    [ExecuteAlways]
    [DisallowMultipleComponent]
    [RequireComponent(typeof(SortingGroup))]
    [AddComponentMenu("SpriteBuddy/SpriteBuddy Sprite")]
    public sealed class SpriteBuddySprite : MonoBehaviour
    {
        const string PartName = "SpriteBuddy part";

        [Tooltip("The runtime file (<name>.anims.json) exported from SpriteBuddy.")]
        [SerializeField] TextAsset file;
        [Tooltip("The sheet image beside it. Filled in for you when it's next to the file.")]
        [SerializeField] Texture2D sheet;
        [Tooltip("The normal map (<name>_n.png), for URP 2D lights. Optional; filled in for you when the file names one.")]
        [SerializeField] Texture2D normalMap;
        [Tooltip("Draw with the normal map when there is one.")]
        [SerializeField] bool useNormalMap = true;
        [Tooltip("The animation to play.")]
        [SerializeField] string animationName = "";
        [Tooltip("Play when the scene starts.")]
        [SerializeField] bool playOnStart = true;
        [Tooltip("Playback rate: 1 is normal.")]
        [SerializeField, Min(0f)] float speed = 1f;
        [Tooltip("Sheet pixels in one Unity unit.")]
        [SerializeField, Min(0.01f)] float pixelsPerUnit = 16f;
        [Tooltip("Mirror the sprite left for right about where it stands, as when it turns around. Use this rather than a negative scale, so 2D lights stay on the right side.")]
        [SerializeField] bool flipX;
        [Tooltip("Mirror the sprite upside down about where it stands.")]
        [SerializeField] bool flipY;
        [Tooltip("Tints every part; alpha fades the sprite.")]
        [SerializeField] Color color = Color.white;
        [Tooltip("Material for the parts. Empty uses the render pipeline's sprite material.")]
        [SerializeField] Material material;

        [Tooltip("Called with the event's name for each frame event (such as \"hit\") as its frame starts showing.")]
        public UnityEvent<string> onFrameEvent = new UnityEvent<string>();
        [Tooltip("Called with the animation's name when a \"once\" animation ends.")]
        public UnityEvent<string> onFinished = new UnityEvent<string>();

        /// <summary>Called with the frame index each time the frame changes.</summary>
        public event Action<int> FrameChanged;
        /// <summary>
        /// Called for each event of a frame (such as "hit") as the frame starts showing, after
        /// <see cref="FrameChanged"/>, with the event's name and the frame index. Fires even when
        /// a long frame skips past a short one. <see cref="Play"/> fires the first frame's events;
        /// <see cref="Seek"/> jumps without firing any.
        /// </summary>
        public event Action<string, int> FrameEvent;
        /// <summary>Called with the animation's name when a <c>once</c> animation ends.</summary>
        public event Action<string> AnimationFinished;

        SpriteBuddySheet _sheet;
        Player _player;
        readonly List<SpriteRenderer> _renderers = new List<SpriteRenderer>();
        TextAsset _sourceFile;
        bool _loadFailed;
        bool _reload;
        bool _redraw;

        /// <summary>The sheet being drawn, or null when there's no readable file.</summary>
        public SpriteBuddySheet Sheet => EnsureSheet();
        /// <summary>The parsed runtime file, or null.</summary>
        public SpriteBuddyFile File => EnsureSheet()?.File;
        /// <summary>The player behind the sprite: its time, frame and parts. Null without a file.</summary>
        public Player Player => EnsurePlayer();
        /// <summary>The animation playing (or last played).</summary>
        public string Animation => animationName;
        /// <summary>Whether time is moving on.</summary>
        public bool IsPlaying => _player != null && _player.Playing;
        /// <summary>Index into the animation's frames, or -1.</summary>
        public int FrameIndex => _player != null ? _player.Index : -1;
        /// <summary>Ms since the animation started, scaled by <see cref="Speed"/>.</summary>
        public double TimeMs => _player != null ? _player.Time : 0;

        public float Speed
        {
            get => speed;
            set
            {
                speed = Mathf.Max(0f, value);
                if (_player != null) _player.Speed = speed;
            }
        }

        /// <summary>
        /// Mirrors the sprite left for right about its origin, as when a character turns around.
        /// Prefer it to a negative scale: URP's 2D lights then light the flipped normals right.
        /// </summary>
        public bool FlipX
        {
            get => flipX;
            set
            {
                flipX = value;
                Redraw();
            }
        }

        /// <summary>Mirrors the sprite upside down about its origin.</summary>
        public bool FlipY
        {
            get => flipY;
            set
            {
                flipY = value;
                Redraw();
            }
        }

        public Color Color
        {
            get => color;
            set
            {
                color = value;
                Redraw();
            }
        }

        /// <summary>Uses a runtime file and textures given in code instead of the inspector's.</summary>
        public void SetSource(TextAsset runtimeFile, Texture2D sheetTexture, Texture2D normalMapTexture = null)
        {
            file = runtimeFile;
            sheet = sheetTexture;
            normalMap = normalMapTexture;
            ResetSheet();
            if (!Application.isPlaying) _reload = true;
        }

        /// <summary>Uses an already loaded sheet, shared with other sprites.</summary>
        public void SetSheet(SpriteBuddySheet value)
        {
            ResetSheet();
            _sheet = value;
        }

        /// <summary>
        /// Starts <paramref name="name"/> from its first frame (or <paramref name="fromMs"/> ms in).
        /// Logs an error naming the animations there are when it has no such animation.
        /// </summary>
        public void Play(string name, double fromMs = 0)
        {
            var player = EnsurePlayer();
            if (player == null) return;
            if (player.File.FindAnimation(name) == null)
            {
                Debug.LogError("SpriteBuddy: no animation \"" + name + "\" in " + DescribeSource() +
                    "; it has " + string.Join(", ", player.File.AnimationNames()), this);
                return;
            }
            animationName = name;
            _reload = false;
            player.Play(name, fromMs);
            Redraw();
        }

        /// <summary>Stops time; the frame stays showing.</summary>
        public void Stop()
        {
            _player?.Stop();
        }

        /// <summary>Carries on after <see cref="Stop"/>.</summary>
        public void Resume()
        {
            if (_player != null && _player.Animation != null && !_player.Done) _player.Playing = true;
        }

        /// <summary>Jumps to <paramref name="ms"/> into the animation, firing no events.</summary>
        public void Seek(double ms)
        {
            _player?.Seek(ms);
        }

        /// <summary>Moves time on by <paramref name="ms"/> (times <see cref="Speed"/>); called for you every frame in play mode.</summary>
        public void Advance(double ms)
        {
            _player?.Update(ms);
        }

        void OnEnable()
        {
            RemoveStrayParts();
            if (Application.isPlaying) Redraw();
            else Rebuild();
        }

        void Start()
        {
            if (!Application.isPlaying) return;
            var player = EnsurePlayer();
            if (player == null || !playOnStart) return;
            if (player.Animation != null) return; // Played from code before Start.
            var names = player.File.AnimationNames();
            if (names.Length == 0) return;
            Play(string.IsNullOrEmpty(animationName) || player.File.FindAnimation(animationName) == null ? names[0] : animationName);
        }

        void Update()
        {
            if (_reload) Reload();
            else if (_redraw) Redraw();
            if (Application.isPlaying && _player != null && _player.Playing) _player.Update(UnityEngine.Time.deltaTime * 1000.0);
        }

        void OnDisable()
        {
            DestroyParts();
        }

        void OnValidate()
        {
            speed = Mathf.Max(0f, speed);
            pixelsPerUnit = Mathf.Max(0.01f, pixelsPerUnit);
#if UNITY_EDITOR
            FindTexturesBesideFile();
#endif
            if (_player != null) _player.Speed = speed;
            if (_sheet == null || !SameSource() || (_player != null && _player.Animation != null && _player.Animation.Name != animationName))
                _reload = true;
            else _redraw = true;
#if UNITY_EDITOR
            // Objects can't be made inside OnValidate, so do it straight after.
            UnityEditor.EditorApplication.delayCall += () =>
            {
                if (this != null && isActiveAndEnabled && (_reload || _redraw)) Update();
            };
#endif
        }

        /// <summary>Whether the loaded sheet still matches the inspector's file, textures and size.</summary>
        bool SameSource() =>
            _sourceFile == file && _sheet.Texture == sheet && _sheet.NormalMap == (useNormalMap ? normalMap : null) &&
            Mathf.Approximately(_sheet.PixelsPerUnit, pixelsPerUnit);

        /// <summary>
        /// Reads the source again after it changed in the inspector. Out of play mode it shows the
        /// chosen animation's first frame; in play mode it carries on with the animation at the same time.
        /// </summary>
        void Reload()
        {
            var playing = _player != null && _player.Playing;
            var had = _player != null && _player.Animation != null;
            // Carry on at the same time, unless the inspector picked another animation.
            var time = had && _player.Animation.Name == animationName ? _player.Time : 0;
            ResetSheet();
            if (Application.isPlaying)
            {
                var player = EnsurePlayer();
                if (player == null || !had) return;
                if (player.File.FindAnimation(animationName) == null) return;
                Play(animationName, time);
                if (!playing) player.Stop();
            }
            else
            {
                Rebuild();
            }
        }

        /// <summary>Shows the chosen animation's first frame in the editor, out of play mode.</summary>
        void Rebuild()
        {
            _reload = false;
            var player = EnsurePlayer();
            if (player == null)
            {
                DestroyParts();
                return;
            }
            var names = player.File.AnimationNames();
            if (names.Length == 0)
            {
                Redraw();
                return;
            }
            var name = player.File.FindAnimation(animationName) != null ? animationName : names[0];
            player.Play(name);
            player.Stop();
            Redraw();
        }

        void ResetSheet()
        {
            if (_player != null)
            {
                _player.FrameChanged -= OnFrameChanged;
                _player.EventFired -= OnEventFired;
                _player.Finished -= OnFinished;
            }
            _player = null;
            _sheet = null;
            _sourceFile = null;
            _loadFailed = false;
            _reload = false;
        }

        SpriteBuddySheet EnsureSheet()
        {
            if (_sheet != null) return _sheet;
            if (file == null || sheet == null || _loadFailed) return null;
            try
            {
                _sheet = SpriteBuddySheet.Load(file, sheet, useNormalMap ? normalMap : null, pixelsPerUnit);
                _sourceFile = file;
            }
            catch (SpriteBuddyFormatException e)
            {
                _loadFailed = true; // Said once, until the inspector changes.
                Debug.LogError("SpriteBuddy: " + DescribeSource() + ": " + e.Message, this);
            }
            catch (ArgumentException e)
            {
                _loadFailed = true;
                Debug.LogError(e.Message, this);
            }
            return _sheet;
        }

        Player EnsurePlayer()
        {
            if (_player != null) return _player;
            var loaded = EnsureSheet();
            if (loaded == null) return null;
            _player = new Player(loaded.File) { Speed = speed };
            _player.FrameChanged += OnFrameChanged;
            _player.EventFired += OnEventFired;
            _player.Finished += OnFinished;
            return _player;
        }

        void OnFrameChanged(int index)
        {
            Redraw();
            if (Application.isPlaying) FrameChanged?.Invoke(index);
        }

        void OnEventFired(string name, int index)
        {
            if (!Application.isPlaying) return;
            FrameEvent?.Invoke(name, index);
            onFrameEvent?.Invoke(name);
        }

        void OnFinished(string name)
        {
            if (!Application.isPlaying) return;
            AnimationFinished?.Invoke(name);
            onFinished?.Invoke(name);
        }

        /// <summary>Puts a child SpriteRenderer in place for each part showing now.</summary>
        void Redraw()
        {
            _redraw = false;
            if (_player == null || _sheet == null) return;
            var parts = _player.Parts;
            for (var i = 0; i < parts.Count; i++)
            {
                var part = parts[i];
                var renderer = PartRenderer(i);
                var placement = Placement.Of(part, _sheet.File.SheetHeight, _sheet.PixelsPerUnit).Mirrored(flipX, flipY);
                var t = renderer.transform;
                t.localPosition = new Vector3(placement.X, placement.Y, 0f);
                t.localRotation = Quaternion.Euler(0f, 0f, placement.Rotation);
                t.localScale = Vector3.one;
                renderer.sprite = _sheet.SpriteFor(part.Index);
                // Flipping the renderer, not the scale, so URP's 2D lights flip the normals too.
                renderer.flipX = placement.ScaleX < 0f;
                renderer.flipY = placement.ScaleY < 0f;
                renderer.color = new Color(color.r, color.g, color.b, color.a * part.Opacity);
                renderer.sortingOrder = i;
                if (material != null) renderer.sharedMaterial = material;
                if (!renderer.enabled) renderer.enabled = true;
            }
            for (var i = parts.Count; i < _renderers.Count; i++)
                if (_renderers[i] != null) _renderers[i].enabled = false;
        }

        SpriteRenderer PartRenderer(int i)
        {
            while (_renderers.Count <= i) _renderers.Add(null);
            if (_renderers[i] != null) return _renderers[i];
            var part = new GameObject(PartName) { hideFlags = HideFlags.HideAndDontSave };
            part.layer = gameObject.layer;
            part.transform.SetParent(transform, false);
            var renderer = part.AddComponent<SpriteRenderer>();
            if (material != null) renderer.sharedMaterial = material;
            _renderers[i] = renderer;
            return renderer;
        }

        void DestroyParts()
        {
            foreach (var renderer in _renderers)
                if (renderer != null) DestroyNow(renderer.gameObject);
            _renderers.Clear();
        }

        /// <summary>Removes hidden parts this component didn't make, such as ones a duplicate copied.</summary>
        void RemoveStrayParts()
        {
            for (var i = transform.childCount - 1; i >= 0; i--)
            {
                var child = transform.GetChild(i);
                if (child.name == PartName && (child.hideFlags & HideFlags.DontSave) != 0)
                {
                    var renderer = child.GetComponent<SpriteRenderer>();
                    if (renderer == null || !_renderers.Contains(renderer)) DestroyNow(child.gameObject);
                }
            }
        }

        static void DestroyNow(UnityEngine.Object target)
        {
            if (Application.isPlaying) Destroy(target);
            else DestroyImmediate(target);
        }

        string DescribeSource() => file != null ? file.name : "(no file)";

#if UNITY_EDITOR
        /// <summary>Fills in the sheet and normal map from beside the runtime file, as the file names them.</summary>
        void FindTexturesBesideFile()
        {
            if (file == null || (sheet != null && (normalMap != null || !useNormalMap))) return;
            var path = UnityEditor.AssetDatabase.GetAssetPath(file);
            if (string.IsNullOrEmpty(path)) return;
            SpriteBuddyFile parsed;
            try
            {
                parsed = SpriteBuddyFile.Parse(file.text);
            }
            catch (SpriteBuddyFormatException)
            {
                return; // Reported when it's drawn.
            }
            var folder = System.IO.Path.GetDirectoryName(path)?.Replace('\\', '/') ?? "";
            if (sheet == null)
                sheet = UnityEditor.AssetDatabase.LoadAssetAtPath<Texture2D>(folder + "/" + parsed.Image);
            if (normalMap == null && useNormalMap && parsed.Normals != null)
                normalMap = UnityEditor.AssetDatabase.LoadAssetAtPath<Texture2D>(folder + "/" + parsed.Normals);
        }
#endif
    }
}
