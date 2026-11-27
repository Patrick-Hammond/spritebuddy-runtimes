using System;
using System.Collections.Generic;

namespace SpriteBuddy
{
    /// <summary>How an animation plays its frames. See docs/format.md, "Timing".</summary>
    public enum LoopMode
    {
        /// <summary>In order, forever.</summary>
        Loop,
        /// <summary>Forward, then back without repeating the end frames: 0 1 2 3 2 1 0 1 …</summary>
        PingPong,
        /// <summary>In order, then holds the last frame and is done.</summary>
        Once,
    }

    /// <summary>One image on the sheet. Coordinates are sheet pixels, x right and y down.</summary>
    public sealed class FrameDef
    {
        public string Name;
        /// <summary>Where the pixels sit on the sheet, at their upright size.</summary>
        public int X, Y, Width, Height;
        /// <summary>Stored turned 90° clockwise: the pixels cover Height columns and Width rows from X, Y.</summary>
        public bool Rotated;
        /// <summary>Whether transparent edges were cut off; the pixels then start at TrimX, TrimY in the full frame.</summary>
        public bool Trimmed;
        public int TrimX, TrimY;
        /// <summary>The full (untrimmed) frame's size: everything is placed by full frames.</summary>
        public int FullWidth, FullHeight;
        /// <summary>The point the frame hangs from, in full-frame pixels.</summary>
        public float PivotX, PivotY;
    }

    /// <summary>An extra frame drawn with an animation frame, such as a hat or a sword.</summary>
    public sealed class LayerDef
    {
        /// <summary>Index into <see cref="SpriteBuddyFile.Frames"/>.</summary>
        public int Frame;
        /// <summary>The layer's full-frame top-left, from the base frame's full-frame top-left.</summary>
        public int X, Y;
        /// <summary>Draw order: the base frame is 0; ties keep the base first, then list order.</summary>
        public int Z = 1;
        public float Opacity = 1f;
        public bool FlipX, FlipY;
    }

    /// <summary>One step of an animation: a frame, its display time, offset, layers and events.</summary>
    public sealed class FrameEntry
    {
        /// <summary>Index into <see cref="SpriteBuddyFile.Frames"/>.</summary>
        public int Frame;
        /// <summary>Display time in ms.</summary>
        public int Duration;
        /// <summary>Nudge from where the pivot puts the frame, +x right, +y down.</summary>
        public int OffsetX, OffsetY;
        public List<LayerDef> Layers = new List<LayerDef>();
        /// <summary>Names fired when this frame starts showing, such as "hit" or "step".</summary>
        public List<string> Events = new List<string>();
    }

    public sealed class AnimationDef
    {
        public string Name;
        public LoopMode Loop = LoopMode.Loop;
        public List<FrameEntry> Frames = new List<FrameEntry>();
    }

    /// <summary>Thrown for text that isn't a readable SpriteBuddy runtime file; the message says where.</summary>
    public sealed class SpriteBuddyFormatException : Exception
    {
        public SpriteBuddyFormatException(string message) : base(message) { }
    }

    /// <summary>
    /// A SpriteBuddy runtime file (<c>&lt;name&gt;.anims.json</c>, version 3): the sheet's frames,
    /// and every animation with its timing, offsets, layers and events. Pure C#, no Unity types,
    /// so it runs and is tested anywhere. See docs/format.md in the spritebuddy-runtimes repository.
    /// </summary>
    public sealed class SpriteBuddyFile
    {
        public const string Format = "spritebuddy-animations";
        /// <summary>The newest file version this runtime reads.</summary>
        public const int Version = 3;
        /// <summary>Display time of a frame when neither it nor its animation says, in ms.</summary>
        public const int DefaultDuration = 100;

        /// <summary>The version the file says it is.</summary>
        public int FileVersion;
        /// <summary>The sheet image, relative to the file.</summary>
        public string Image;
        /// <summary>The normal map image, relative to the file, or null.</summary>
        public string Normals;
        public int SheetWidth, SheetHeight;
        public float Scale = 1f;
        public List<FrameDef> Frames = new List<FrameDef>();
        public List<AnimationDef> Animations = new List<AnimationDef>();

        /// <summary>Reads the text of a runtime file. Throws <see cref="SpriteBuddyFormatException"/> saying where it's wrong.</summary>
        public static SpriteBuddyFile Parse(string text)
        {
            object data;
            try
            {
                data = Json.Parse(text);
            }
            catch (FormatException e)
            {
                throw new SpriteBuddyFormatException(e.Message);
            }
            return Read(data);
        }

        /// <summary>Reads already parsed JSON (as <see cref="Json.Parse"/> returns it).</summary>
        public static SpriteBuddyFile Read(object data)
        {
            var o = Obj(data, "");
            var file = new SpriteBuddyFile();
            if (!(o.TryGetValue("format", out var format) && format is string f && f == Format))
                throw Fail("format", "not a SpriteBuddy animations file (format should be \"" + Format + "\")");
            var version = Int(Get(o, "version"), "version", 1);
            file.FileVersion = version;
            if (version < 3)
                throw Fail("version", "version " + version + " files need the sheet's own JSON; export again from SpriteBuddy for version " + Version);
            if (version > Version)
                throw Fail("version", "version " + version + " is newer than this runtime reads (" + Version + "); update the SpriteBuddy package");
            file.Image = Str(Get(o, "image"), "image");
            if (o.TryGetValue("normals", out var normals)) file.Normals = Str(normals, "normals");
            var size = Ints(Get(o, "size"), "size", 2, new int?[] { 1, 1 });
            file.SheetWidth = size[0];
            file.SheetHeight = size[1];
            if (o.TryGetValue("scale", out var scale))
            {
                if (!(scale is double s) || !(s > 0) || double.IsInfinity(s)) throw Fail("scale", "expected a positive number");
                file.Scale = (float)s;
            }
            var frames = List(Get(o, "frames"), "frames");
            for (var i = 0; i < frames.Count; i++) file.Frames.Add(file.ReadFrame(frames[i], "frames[" + i + "]"));
            if (o.TryGetValue("animations", out var animations))
            {
                var list = List(animations, "animations");
                var seen = new HashSet<string>();
                for (var i = 0; i < list.Count; i++)
                {
                    var path = "animations[" + i + "]";
                    var animation = file.ReadAnimation(list[i], path);
                    if (!seen.Add(animation.Name)) throw Fail(path + ".name", "duplicate animation \"" + animation.Name + "\"");
                    file.Animations.Add(animation);
                }
            }
            return file;
        }

        /// <summary>The animation called <paramref name="name"/>, or null.</summary>
        public AnimationDef FindAnimation(string name)
        {
            foreach (var animation in Animations)
                if (animation.Name == name) return animation;
            return null;
        }

        /// <summary>Every animation's name, in file order.</summary>
        public string[] AnimationNames()
        {
            var names = new string[Animations.Count];
            for (var i = 0; i < names.Length; i++) names[i] = Animations[i].Name;
            return names;
        }

        /// <summary>
        /// Everything to draw for an animation frame, bottom to top: the base frame and its layers
        /// sorted by z (ties keep the base first, then list order). Each part's X, Y is its full
        /// frame's top-left from the sprite's origin (the base frame's pivot, moved by the offset),
        /// in sheet pixels with y down.
        /// </summary>
        public List<Part> PartsOf(FrameEntry entry)
        {
            var parts = new List<Part>(entry.Layers.Count + 1);
            PartsOf(entry, parts);
            return parts;
        }

        /// <summary>Like <see cref="PartsOf(FrameEntry)"/>, filling a list you keep, to save garbage each frame.</summary>
        public void PartsOf(FrameEntry entry, List<Part> parts)
        {
            parts.Clear();
            var basis = Frames[entry.Frame];
            var left = -basis.PivotX + entry.OffsetX;
            var top = -basis.PivotY + entry.OffsetY;
            parts.Add(new Part(basis, entry.Frame, left, top, 1f, false, false, 0));
            for (var i = 0; i < entry.Layers.Count; i++)
            {
                var layer = entry.Layers[i];
                parts.Add(new Part(Frames[layer.Frame], layer.Frame, left + layer.X, top + layer.Y, layer.Opacity, layer.FlipX, layer.FlipY, layer.Z));
            }
            // Insertion sort is stable, so equal z keeps list order (the base comes first).
            for (var i = 1; i < parts.Count; i++)
            {
                var part = parts[i];
                var j = i - 1;
                while (j >= 0 && parts[j].Z > part.Z)
                {
                    parts[j + 1] = parts[j];
                    j--;
                }
                parts[j + 1] = part;
            }
        }

        // --- Reading -------------------------------------------------------------------------

        FrameDef ReadFrame(object value, string path)
        {
            var o = Obj(value, path);
            var frame = new FrameDef { Name = Str(Get(o, "name"), path + ".name") };
            var rect = Ints(Get(o, "rect"), path + ".rect", 4, new int?[] { 0, 0, 1, 1 });
            frame.X = rect[0];
            frame.Y = rect[1];
            frame.Width = rect[2];
            frame.Height = rect[3];
            if (o.TryGetValue("rotated", out var rotated)) frame.Rotated = Bool(rotated, path + ".rotated");
            var columns = frame.Rotated ? frame.Height : frame.Width;
            var rows = frame.Rotated ? frame.Width : frame.Height;
            if (frame.X + columns > SheetWidth || frame.Y + rows > SheetHeight) throw Fail(path + ".rect", "lies outside the sheet");
            frame.FullWidth = frame.Width;
            frame.FullHeight = frame.Height;
            if (o.TryGetValue("trim", out var trimValue))
            {
                var trim = Ints(trimValue, path + ".trim", 4, new int?[] { 0, 0, 1, 1 });
                if (trim[0] + frame.Width > trim[2] || trim[1] + frame.Height > trim[3])
                    throw Fail(path + ".trim", "the trimmed pixels lie outside the full frame");
                frame.Trimmed = true;
                frame.TrimX = trim[0];
                frame.TrimY = trim[1];
                frame.FullWidth = trim[2];
                frame.FullHeight = trim[3];
            }
            frame.PivotX = frame.FullWidth / 2f;
            frame.PivotY = frame.FullHeight;
            if (o.TryGetValue("pivot", out var pivotValue))
            {
                var pivot = List(pivotValue, path + ".pivot");
                if (pivot.Count != 2) throw Fail(path + ".pivot", "expected 2 numbers");
                frame.PivotX = Number(pivot[0], path + ".pivot[0]", -1e6, 1e6);
                frame.PivotY = Number(pivot[1], path + ".pivot[1]", -1e6, 1e6);
            }
            return frame;
        }

        int FrameIndex(object value, string path)
        {
            var index = Int(value, path, 0);
            if (index >= Frames.Count) throw Fail(path, "no frame " + index + "; the file has " + Frames.Count);
            return index;
        }

        LayerDef ReadLayer(object value, string path)
        {
            var o = Obj(value, path);
            var layer = new LayerDef { Frame = FrameIndex(Get(o, "frame"), path + ".frame") };
            if (o.TryGetValue("x", out var x)) layer.X = Int(x, path + ".x");
            if (o.TryGetValue("y", out var y)) layer.Y = Int(y, path + ".y");
            if (o.TryGetValue("z", out var z)) layer.Z = Int(z, path + ".z");
            if (o.TryGetValue("opacity", out var opacity)) layer.Opacity = Number(opacity, path + ".opacity", 0, 1);
            if (o.TryGetValue("flipX", out var flipX)) layer.FlipX = Bool(flipX, path + ".flipX");
            if (o.TryGetValue("flipY", out var flipY)) layer.FlipY = Bool(flipY, path + ".flipY");
            return layer;
        }

        FrameEntry ReadEntry(object value, string path, int duration)
        {
            if (value is double) return new FrameEntry { Frame = FrameIndex(value, path), Duration = duration };
            var o = Obj(value, path);
            var entry = new FrameEntry { Frame = FrameIndex(Get(o, "frame"), path + ".frame"), Duration = duration };
            if (o.TryGetValue("duration", out var d)) entry.Duration = Int(d, path + ".duration", 1);
            if (o.TryGetValue("offset", out var offsetValue))
            {
                var offset = Ints(offsetValue, path + ".offset", 2, new int?[] { null, null });
                entry.OffsetX = offset[0];
                entry.OffsetY = offset[1];
            }
            if (o.TryGetValue("layers", out var layersValue))
            {
                var layers = List(layersValue, path + ".layers");
                for (var i = 0; i < layers.Count; i++) entry.Layers.Add(ReadLayer(layers[i], path + ".layers[" + i + "]"));
            }
            if (o.TryGetValue("events", out var eventsValue))
            {
                var events = List(eventsValue, path + ".events");
                for (var i = 0; i < events.Count; i++) entry.Events.Add(Str(events[i], path + ".events[" + i + "]"));
            }
            return entry;
        }

        AnimationDef ReadAnimation(object value, string path)
        {
            var o = Obj(value, path);
            var animation = new AnimationDef { Name = Str(Get(o, "name"), path + ".name") };
            if (o.TryGetValue("loop", out var loop))
            {
                switch (loop as string)
                {
                    case "loop": animation.Loop = LoopMode.Loop; break;
                    case "pingpong": animation.Loop = LoopMode.PingPong; break;
                    case "once": animation.Loop = LoopMode.Once; break;
                    default: throw Fail(path + ".loop", "expected \"loop\", \"pingpong\" or \"once\"");
                }
            }
            var duration = DefaultDuration;
            if (o.TryGetValue("duration", out var d)) duration = Int(d, path + ".duration", 1);
            var frames = List(Get(o, "frames"), path + ".frames");
            for (var i = 0; i < frames.Count; i++) animation.Frames.Add(ReadEntry(frames[i], path + ".frames[" + i + "]", duration));
            return animation;
        }

        static SpriteBuddyFormatException Fail(string path, string message) =>
            new SpriteBuddyFormatException(path == "" ? message : path + ": " + message);

        static object Get(Dictionary<string, object> o, string key) => o.TryGetValue(key, out var value) ? value : null;

        static Dictionary<string, object> Obj(object value, string path) =>
            value as Dictionary<string, object> ?? throw Fail(path, "expected an object");

        static List<object> List(object value, string path) => value as List<object> ?? throw Fail(path, "expected a list");

        static string Str(object value, string path) =>
            value is string s && s.Length > 0 ? s : throw Fail(path, "expected a non-empty string");

        static bool Bool(object value, string path) => value is bool b ? b : throw Fail(path, "expected true or false");

        static int Int(object value, string path, int? min = null)
        {
            if (!(value is double d) || Math.Floor(d) != d || double.IsInfinity(d) || Math.Abs(d) > int.MaxValue || (min.HasValue && d < min.Value))
                throw Fail(path, min.HasValue ? "expected a whole number ≥ " + min.Value : "expected a whole number");
            return (int)d;
        }

        static float Number(object value, string path, double min, double max)
        {
            if (!(value is double d) || double.IsNaN(d) || d < min || d > max)
                throw Fail(path, "expected a number from " + min + " to " + max);
            return (float)d;
        }

        static int[] Ints(object value, string path, int length, int?[] min)
        {
            var list = List(value, path);
            if (list.Count != length) throw Fail(path, "expected " + length + " numbers");
            var result = new int[length];
            for (var i = 0; i < length; i++) result[i] = Int(list[i], path + "[" + i + "]", min[i]);
            return result;
        }
    }

    /// <summary>
    /// One image to draw for an animation frame: the base frame or one of its layers. X, Y is where
    /// the part's full (untrimmed, upright) frame has its top-left, from the sprite's origin, in
    /// sheet pixels with y down.
    /// </summary>
    public struct Part
    {
        public FrameDef Frame;
        /// <summary>Index into the file's frames.</summary>
        public int Index;
        public float X, Y;
        public float Opacity;
        /// <summary>Mirrored within the part's own full frame.</summary>
        public bool FlipX, FlipY;
        /// <summary>The draw order it was sorted by (0 for the base frame).</summary>
        public int Z;

        public Part(FrameDef frame, int index, float x, float y, float opacity, bool flipX, bool flipY, int z)
        {
            Frame = frame;
            Index = index;
            X = x;
            Y = y;
            Opacity = opacity;
            FlipX = flipX;
            FlipY = flipY;
            Z = z;
        }
    }
}
