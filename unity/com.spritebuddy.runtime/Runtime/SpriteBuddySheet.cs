using System.Collections.Generic;
using System.Runtime.CompilerServices;
using UnityEngine;

namespace SpriteBuddy
{
    /// <summary>
    /// A runtime file with its sheet texture (and normal map), cutting a Unity
    /// <see cref="Sprite"/> for each frame as it's first drawn. Sprites that use the same file,
    /// textures and pixels per unit share one sheet, so a hundred slimes cut each frame once.
    /// </summary>
    public sealed class SpriteBuddySheet
    {
        /// <summary>The name URP's 2D lit sprite shaders read a normal map from.</summary>
        public const string NormalMapName = "_NormalMap";

        public readonly SpriteBuddyFile File;
        public readonly Texture2D Texture;
        /// <summary>The normal map (same size and layout as <see cref="Texture"/>), or null.</summary>
        public readonly Texture2D NormalMap;
        public readonly float PixelsPerUnit;

        readonly Sprite[] _sprites;

        struct Key : System.IEquatable<Key>
        {
            public Object File, Texture, NormalMap;
            public float PixelsPerUnit;

            public bool Equals(Key other) =>
                ReferenceEquals(File, other.File) && ReferenceEquals(Texture, other.Texture) &&
                ReferenceEquals(NormalMap, other.NormalMap) && PixelsPerUnit == other.PixelsPerUnit;

            public override bool Equals(object obj) => obj is Key other && Equals(other);

            public override int GetHashCode()
            {
                unchecked
                {
                    var hash = RuntimeHelpers.GetHashCode(File);
                    hash = hash * 31 + (Texture is null ? 0 : RuntimeHelpers.GetHashCode(Texture));
                    hash = hash * 31 + (NormalMap is null ? 0 : RuntimeHelpers.GetHashCode(NormalMap));
                    return hash * 31 + PixelsPerUnit.GetHashCode();
                }
            }
        }

        sealed class Cached
        {
            public string Text;
            public SpriteBuddySheet Sheet;
        }

        static readonly Dictionary<Key, Cached> Cache = new Dictionary<Key, Cached>();

        /// <summary>
        /// A sheet for <paramref name="file"/> on <paramref name="texture"/>. Pass the normal map
        /// to have URP's 2D lights light it. Throws <see cref="SpriteBuddyFormatException"/> for a
        /// file that can't be read, and <see cref="System.ArgumentException"/> when the texture
        /// isn't the size the file says.
        /// </summary>
        public SpriteBuddySheet(SpriteBuddyFile file, Texture2D texture, Texture2D normalMap = null, float pixelsPerUnit = 16f)
        {
            File = file ?? throw new System.ArgumentNullException(nameof(file));
            Texture = texture != null ? texture : throw new System.ArgumentNullException(nameof(texture));
            if (texture.width != file.SheetWidth || texture.height != file.SheetHeight)
                throw new System.ArgumentException("SpriteBuddy: the sheet " + texture.name + " is " + texture.width + "×" + texture.height +
                    " but the file says " + file.SheetWidth + "×" + file.SheetHeight + ". Check its import settings: Max Size, and Non-Power of 2 set to None.");
            if (normalMap != null && (normalMap.width != texture.width || normalMap.height != texture.height))
            {
                Debug.LogWarning("SpriteBuddy: the normal map " + normalMap.name + " isn't the sheet's size; drawing unlit.");
                normalMap = null;
            }
            NormalMap = normalMap;
            PixelsPerUnit = pixelsPerUnit > 0 ? pixelsPerUnit : 16f;
            _sprites = new Sprite[file.Frames.Count];
        }

        /// <summary>
        /// The shared sheet for a runtime file asset and its textures, read once and then reused.
        /// Reads the file again when its text changes (as when you export over it).
        /// </summary>
        public static SpriteBuddySheet Load(TextAsset file, Texture2D texture, Texture2D normalMap = null, float pixelsPerUnit = 16f)
        {
            if (file == null) throw new System.ArgumentNullException(nameof(file));
            var key = new Key
            {
                File = file,
                Texture = texture,
                NormalMap = normalMap,
                PixelsPerUnit = pixelsPerUnit,
            };
            var text = file.text;
            if (Cache.TryGetValue(key, out var cached) && cached.Text == text) return cached.Sheet;
            var sheet = new SpriteBuddySheet(SpriteBuddyFile.Parse(text), texture, normalMap, pixelsPerUnit);
            Cache[key] = new Cached { Text = text, Sheet = sheet };
            return sheet;
        }

        /// <summary>The sprite for frame <paramref name="index"/>: its stored pixels, pivot at their top-left.</summary>
        public Sprite SpriteFor(int index)
        {
            var sprite = _sprites[index];
            if (sprite != null) return sprite;
            var frame = File.Frames[index];
            Placement.SpriteRect(frame, File.SheetHeight, out var x, out var y, out var width, out var height);
            var rect = new Rect(x, y, width, height);
            var pivot = new Vector2(0f, 1f);
#if UNITY_2022_2_OR_NEWER
            if (NormalMap != null)
            {
                // The normal map rides along as the sprite's secondary texture, as if set in the Sprite Editor.
                var secondary = new[] { new SecondarySpriteTexture { name = NormalMapName, texture = NormalMap } };
                sprite = Sprite.Create(Texture, rect, pivot, PixelsPerUnit, 0, SpriteMeshType.FullRect, Vector4.zero, false, secondary);
            }
            else
#endif
            {
                sprite = Sprite.Create(Texture, rect, pivot, PixelsPerUnit, 0, SpriteMeshType.FullRect);
            }
            sprite.name = frame.Name;
            sprite.hideFlags = HideFlags.DontSave;
            _sprites[index] = sprite;
            return sprite;
        }
    }
}
