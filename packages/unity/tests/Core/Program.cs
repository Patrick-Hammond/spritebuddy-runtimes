using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using SpriteBuddy;

/// Tests the Unity package's core (Runtime/Core) without Unity:
///   dotnet run --project packages/unity/tests/Core
/// Checks every fixture in fixtures/ against its golden table, the file checks, the player and
/// where parts are placed. Exits with 1 if any check fails.
static class Program
{
    static int _checks;
    static int _failures;

    static int Main(string[] args)
    {
        var root = args.Length > 0 ? args[0] : FindRoot();
        var fixtures = Path.Combine(root, "fixtures");
        foreach (var path in Directory.GetFiles(fixtures, "*.anims.json").OrderBy(p => p, StringComparer.Ordinal))
            CheckFixture(path);
        CheckJson();
        CheckErrors();
        CheckPlayer(fixtures);
        CheckPlacement();
        CheckExampleAssets(root);
        Console.WriteLine(_checks + " checks, " + _failures + " failures");
        return _failures > 0 ? 1 : 0;
    }

    static string FindRoot()
    {
        var dir = AppContext.BaseDirectory;
        while (dir != null && !Directory.Exists(Path.Combine(dir, "fixtures"))) dir = Path.GetDirectoryName(dir);
        return dir ?? throw new Exception("can't find the repository's fixtures/ folder; pass the repository root");
    }

    static void Expect(bool condition, string message)
    {
        _checks++;
        if (condition) return;
        _failures++;
        Console.Error.WriteLine("FAIL: " + message);
    }

    static bool Near(double a, double b) => Math.Abs(a - b) < 1e-4;

    static Dictionary<string, object> Obj(object o) => (Dictionary<string, object>)o;
    static List<object> List(object o) => (List<object>)o;
    static object Get(Dictionary<string, object> o, string key, object fallback) => o.TryGetValue(key, out var v) ? v : fallback;

    // --- Golden tables ------------------------------------------------------------------------

    static void CheckFixture(string path)
    {
        var name = Path.GetFileName(path);
        SpriteBuddyFile file;
        try
        {
            file = SpriteBuddyFile.Parse(File.ReadAllText(path));
        }
        catch (SpriteBuddyFormatException e)
        {
            Expect(false, name + " parses: " + e.Message);
            return;
        }
        Expect(true, name + " parses");
        var expected = Obj(Json.Parse(File.ReadAllText(path.Replace(".anims.json", ".expected.json"))));
        foreach (var t in List(expected["animations"]))
        {
            var table = Obj(t);
            var animationName = (string)table["animation"];
            var animation = file.FindAnimation(animationName);
            Expect(animation != null, name + " has " + animationName);
            if (animation == null) continue;
            foreach (var c in List(table["checks"]))
            {
                var check = Obj(c);
                var time = (double)check["time"];
                var where = name + " " + animationName + " t=" + time;
                var at = Timing.FrameAt(animation, time);
                Expect(at.Index == (int)(double)check["index"] && at.Done == (bool)check["done"],
                    where + ": frame " + at.Index + " " + at.Done + ", expected " + check["index"] + " " + check["done"]);
                if (at.Index < 0) continue;
                var parts = file.PartsOf(animation.Frames[at.Index]);
                var want = List(check["parts"]);
                Expect(parts.Count == want.Count, where + ": " + parts.Count + " parts, expected " + want.Count);
                for (var i = 0; i < Math.Min(parts.Count, want.Count); i++)
                {
                    var got = parts[i];
                    var w = Obj(want[i]);
                    var same = got.Frame.Name == (string)w["frame"] && Near(got.X, (double)w["x"]) && Near(got.Y, (double)w["y"]) &&
                        Near(got.Opacity, (double)Get(w, "opacity", 1.0)) && got.FlipX == (bool)Get(w, "flipX", false) &&
                        got.FlipY == (bool)Get(w, "flipY", false);
                    Expect(same, where + " part " + i + ": got " + got.Frame.Name + " (" + got.X + ", " + got.Y + ")");
                }
            }
            if (!table.TryGetValue("events", out var ticks)) continue;
            foreach (var k in List(ticks))
            {
                var tick = Obj(k);
                var from = (double)tick["from"];
                var to = (double)tick["to"];
                var got = Timing.EventsBetween(animation, from, to).Select(e => e.Name + "@" + e.Index);
                var want = List(tick["fired"]).Select(p => (string)List(p)[0] + "@" + (int)(double)List(p)[1]);
                Expect(got.SequenceEqual(want), name + " " + animationName + " events (" + from + ", " + to + "]: got [" +
                    string.Join(", ", got) + "], expected [" + string.Join(", ", want) + "]");
            }
        }
    }

    // --- JSON and file checks -----------------------------------------------------------------

    static void CheckJson()
    {
        var o = Obj(Json.Parse("\uFEFF { \"a\": [1, -2.5e1, true, false, null, \"x\\n\\u00e9\\\"\"], \"b\": {} } "));
        var a = List(o["a"]);
        Expect((double)a[0] == 1 && (double)a[1] == -25 && (bool)a[2] && !(bool)a[3] && a[4] == null && (string)a[5] == "x\né\"",
            "JSON values read");
        Expect(Obj(o["b"]).Count == 0, "empty objects read");
        foreach (var bad in new[] { "", "{", "[1,]", "{\"a\" 1}", "tru", "\"abc", "1 2", "[01x]", "{a:1}", "\"\\q\"" })
        {
            var threw = false;
            try { Json.Parse(bad); } catch (FormatException) { threw = true; }
            Expect(threw, "bad JSON is refused: " + bad);
        }
        var line = "";
        try { Json.Parse("{\n\"a\": [1,\n }"); } catch (FormatException e) { line = e.Message; }
        Expect(line.StartsWith("not valid JSON (line 3)"), "JSON errors say the line: " + line);
    }

    const string Base = "\"format\": \"spritebuddy-animations\", \"version\": 3, \"image\": \"a.png\", \"size\": [64, 32], " +
        "\"frames\": [{ \"name\": \"a\", \"rect\": [0, 0, 16, 32] }]";

    /// A minimal valid file with `fields` replacing or adding top-level fields.
    static string With(string fields)
    {
        var data = Obj(Json.Parse("{" + Base + "}"));
        foreach (var pair in Obj(Json.Parse("{" + fields + "}"))) data[pair.Key] = pair.Value;
        return Write(data);
    }

    static string Write(object value)
    {
        switch (value)
        {
            case null: return "null";
            case bool b: return b ? "true" : "false";
            case double d: return d.ToString(System.Globalization.CultureInfo.InvariantCulture);
            case string s: return "\"" + s.Replace("\\", "\\\\").Replace("\"", "\\\"") + "\"";
            case List<object> l: return "[" + string.Join(",", l.Select(Write)) + "]";
            case Dictionary<string, object> o: return "{" + string.Join(",", o.Select(p => Write(p.Key) + ":" + Write(p.Value))) + "}";
            default: throw new ArgumentException("can't write " + value);
        }
    }

    static void CheckErrors()
    {
        var file = SpriteBuddyFile.Parse("{" + Base + "}");
        Expect(file.Frames[0].PivotX == 8 && file.Frames[0].PivotY == 32, "pivot defaults to bottom centre");
        Expect(file.Animations.Count == 0 && file.Scale == 1 && file.Normals == null, "defaults for a minimal file");
        var cases = new[]
        {
            ("\"version\": 4", "version: version 4 is newer"),
            ("\"version\": 2", "version: version 2 files need"),
            ("\"version\": 3.5", "version: expected a whole number ≥ 1"),
            ("\"format\": \"x\"", "format: not a SpriteBuddy"),
            ("\"image\": \"\"", "image: expected a non-empty string"),
            ("\"size\": [64]", "size: expected 2 numbers"),
            ("\"scale\": 0", "scale: expected a positive number"),
            ("\"frames\": {}", "frames: expected a list"),
            ("\"frames\": [{ \"name\": \"a\", \"rect\": [60, 0, 16, 4] }]", "frames[0].rect: lies outside the sheet"),
            ("\"frames\": [{ \"name\": \"a\", \"rect\": [0, 0, 40, 16], \"rotated\": true }]", "frames[0].rect: lies outside the sheet"),
            ("\"frames\": [{ \"name\": \"a\", \"rect\": [0, 0, 0, 4] }]", "frames[0].rect[2]: expected a whole number ≥ 1"),
            ("\"frames\": [{ \"name\": \"a\", \"rect\": [0, 0, 8, 4], \"rotated\": 1 }]", "frames[0].rotated: expected true or false"),
            ("\"frames\": [{ \"name\": \"a\", \"rect\": [0, 0, 8, 4], \"trim\": [2, 0, 8, 4] }]", "frames[0].trim: the trimmed pixels lie outside"),
            ("\"frames\": [{ \"name\": \"a\", \"rect\": [0, 0, 8, 4], \"pivot\": [1] }]", "frames[0].pivot: expected 2 numbers"),
            ("\"frames\": [{ \"name\": \"\", \"rect\": [0, 0, 8, 4] }]", "frames[0].name: expected a non-empty string"),
            ("\"animations\": {}", "animations: expected a list"),
            ("\"animations\": [{ \"name\": \"w\", \"frames\": [3] }]", "animations[0].frames[0]: no frame 3; the file has 1"),
            ("\"animations\": [{ \"name\": \"w\", \"loop\": \"bounce\", \"frames\": [] }]", "animations[0].loop"),
            ("\"animations\": [{ \"name\": \"w\", \"duration\": 0, \"frames\": [] }]", "animations[0].duration: expected a whole number ≥ 1"),
            ("\"animations\": [{ \"name\": \"w\", \"frames\": [{ \"frame\": 0, \"duration\": 0 }] }]", "animations[0].frames[0].duration"),
            ("\"animations\": [{ \"name\": \"w\", \"frames\": [{ \"frame\": 0, \"offset\": [1] }] }]", "animations[0].frames[0].offset: expected 2 numbers"),
            ("\"animations\": [{ \"name\": \"w\", \"frames\": [{ \"frame\": 0, \"layers\": [{ \"frame\": 0, \"opacity\": 2 }] }] }]", "animations[0].frames[0].layers[0].opacity"),
            ("\"animations\": [{ \"name\": \"w\", \"frames\": [{ \"frame\": 0, \"layers\": [{ \"frame\": 0, \"x\": 0.5 }] }] }]", "animations[0].frames[0].layers[0].x: expected a whole number"),
            ("\"animations\": [{ \"name\": \"w\", \"frames\": [{ \"frame\": 0, \"layers\": [{ \"frame\": 0, \"flipX\": \"yes\" }] }] }]", "animations[0].frames[0].layers[0].flipX"),
            ("\"animations\": [{ \"name\": \"w\", \"frames\": [] }, { \"name\": \"w\", \"frames\": [] }]", "animations[1].name: duplicate"),
            ("\"animations\": [{ \"name\": \"w\", \"frames\": [{ \"frame\": 0, \"events\": \"hit\" }] }]", "animations[0].frames[0].events: expected a list"),
            ("\"animations\": [{ \"name\": \"w\", \"frames\": [{ \"frame\": 0, \"events\": [\"hit\", \"\"] }] }]", "animations[0].frames[0].events[1]: expected a non-empty string"),
            ("\"normals\": \"\"", "normals: expected a non-empty string"),
            ("\"normals\": 3", "normals: expected a non-empty string"),
        };
        foreach (var (fields, start) in cases)
        {
            var error = "(no error)";
            try { SpriteBuddyFile.Parse(With(fields)); } catch (SpriteBuddyFormatException e) { error = e.Message; }
            Expect(error.StartsWith(start, StringComparison.Ordinal), "error for " + fields + ": got \"" + error + "\", expected \"" + start + "…\"");
        }
        var notJson = "";
        try { SpriteBuddyFile.Parse("{"); } catch (SpriteBuddyFormatException e) { notJson = e.Message; }
        Expect(notJson.StartsWith("not valid JSON"), "text that isn't JSON says so");
        var notObject = "";
        try { SpriteBuddyFile.Parse("[]"); } catch (SpriteBuddyFormatException e) { notObject = e.Message; }
        Expect(notObject == "expected an object", "a list instead of an object says so: " + notObject);
        Expect(SpriteBuddyFile.Parse(With("\"scale\": 2, \"normals\": \"a_n.png\"")).Normals == "a_n.png", "normals is read");
    }

    // --- Player -------------------------------------------------------------------------------

    static void CheckPlayer(string fixtures)
    {
        var file = SpriteBuddyFile.Parse(File.ReadAllText(Path.Combine(fixtures, "events.anims.json")));
        var withEvents = file.Animations.First(a => a.Frames.Any(f => f.Events.Count > 0));
        var log = new List<string>();
        var player = new Player(file);
        player.FrameChanged += i => log.Add("frame " + i);
        player.EventFired += (name, i) => log.Add("event " + name + "@" + i);
        player.Finished += name => log.Add("finished " + name);
        player.Play(withEvents.Name);
        var first = withEvents.Frames[0];
        Expect(log.FirstOrDefault() == "frame 0", "play reports the first frame first: " + string.Join("; ", log));
        Expect(log.Skip(1).SequenceEqual(first.Events.Select(e => "event " + e + "@0")), "play fires the first frame's events: " + string.Join("; ", log));

        // Every event in one cycle fires once over many small ticks, and the same as Timing says.
        log.Clear();
        var cycle = Timing.CycleDuration(withEvents);
        var expected = Timing.EventsBetween(withEvents, 0, cycle).Select(e => "event " + e.Name + "@" + e.Index).ToList();
        for (var t = 0; t < cycle; t += 7) player.Update(Math.Min(7, cycle - t));
        Expect(log.Where(l => l.StartsWith("event")).SequenceEqual(expected), "ticks fire each event once: " + string.Join("; ", log));

        // Seeking fires none.
        log.Clear();
        player.Seek(0).Seek(cycle * 0.75);
        Expect(!log.Any(l => l.StartsWith("event")), "seek fires no events");

        // Speed, stop and once.
        var loops = SpriteBuddyFile.Parse(File.ReadAllText(Path.Combine(fixtures, "loops.anims.json")));
        var once = loops.Animations.First(a => a.Loop == LoopMode.Once);
        var p = new Player(loops) { Speed = 2 };
        var finished = 0;
        p.Finished += _ => finished++;
        p.Play(once.Name);
        p.Update(Timing.CycleDuration(once) / 2.0);
        Expect(p.Done && !p.Playing && finished == 1, "once ends at half the time at speed 2 and reports it once");
        p.Update(1000);
        Expect(finished == 1 && p.Index == once.Frames.Count - 1, "once holds its last frame");
        p.Play(once.Name).Stop().Update(1000);
        Expect(p.Time == 0 && p.Index == 0, "a stopped player doesn't move");
        Expect(p.Entry == once.Frames[0] && p.Parts.Count >= 1, "the player says what to draw");

        var threw = "";
        try { p.Play("nope"); } catch (ArgumentException e) { threw = e.Message; }
        Expect(threw.StartsWith("No animation \"nope\"; this file has \""), "an unknown animation lists the ones there are: " + threw);
        Expect(new Player(loops).Index == -1 && new Player(loops).Parts.Count == 0, "a new player shows nothing");
    }

    // --- Placement ----------------------------------------------------------------------------

    /// <summary>
    /// For frames rotated, trimmed and flipped every way, every corner of the stored pixels must
    /// land where docs/format.md puts it, worked out here independently of Placement.
    /// </summary>
    static void CheckPlacement()
    {
        const int sheetHeight = 64;
        const float ppu = 16;
        foreach (var rotated in new[] { false, true })
        foreach (var trimmed in new[] { false, true })
        foreach (var flipX in new[] { false, true })
        foreach (var flipY in new[] { false, true })
        {
            var frame = new FrameDef { Name = "f", X = 3, Y = 5, Width = 6, Height = 10, Rotated = rotated, FullWidth = 6, FullHeight = 10 };
            if (trimmed)
            {
                frame.Trimmed = true;
                frame.TrimX = 2;
                frame.TrimY = 1;
                frame.FullWidth = 11;
                frame.FullHeight = 14;
            }
            var part = new Part(frame, 0, -4.5f, -14f, 1, flipX, flipY, 0);
            var placement = Placement.Of(part, sheetHeight, ppu);
            var name = "placement rotated=" + rotated + " trimmed=" + trimmed + " flipX=" + flipX + " flipY=" + flipY;
            var columns = rotated ? frame.Height : frame.Width;
            var rows = rotated ? frame.Width : frame.Height;
            Expect(placement.SpriteWidth == columns && placement.SpriteHeight == rows && placement.SpriteX == 3 &&
                placement.SpriteY == sheetHeight - 5 - rows, name + ": sprite rect");
            Expect(Math.Abs(placement.ScaleX) == 1 && Math.Abs(placement.ScaleY) == 1, name + ": unit scale");
            foreach (var (u, v) in new[] { (0f, 0f), (columns, 0f), (0f, rows), (columns, rows), (1f, 2f) })
            {
                // Stored turned 90° clockwise: upright (a, b) is stored at (h − b, a), so a = v, b = h − u.
                var a = rotated ? v : u;
                var b = rotated ? frame.Height - u : v;
                var fx = (trimmed ? frame.TrimX : 0) + a;
                var fy = (trimmed ? frame.TrimY : 0) + b;
                if (flipX) fx = frame.FullWidth - fx;
                if (flipY) fy = frame.FullHeight - fy;
                placement.Map(u, v, ppu, out var x, out var y);
                Expect(Near(x, part.X + fx) && Near(y, part.Y + fy),
                    name + ": stored (" + u + ", " + v + ") went to (" + x + ", " + y + "), expected (" + (part.X + fx) + ", " + (part.Y + fy) + ")");
                // Mirroring the whole sprite mirrors every point about the origin.
                foreach (var (mx, my) in new[] { (true, false), (false, true), (true, true) })
                {
                    placement.Mirrored(mx, my).Map(u, v, ppu, out var x2, out var y2);
                    Expect(Near(x2, mx ? -x : x) && Near(y2, my ? -y : y), name + ": mirrored " + mx + " " + my + " at (" + u + ", " + v + ")");
                }
            }
        }
    }

    // --- The Unity example's art --------------------------------------------------------------

    static void CheckExampleAssets(string root)
    {
        var art = Path.Combine(root, "packages", "unity", "examples", "Assets", "SpriteBuddyExamples", "Art");
        var path = Path.Combine(art, "slime.anims.json");
        Expect(File.Exists(path), "the Unity example has the slime");
        if (!File.Exists(path)) return;
        var file = SpriteBuddyFile.Parse(File.ReadAllText(path));
        Expect(file.Normals == "slime_n.png" && File.Exists(Path.Combine(art, "slime_n.png")), "the Unity example's slime has its normal map");
        var walk = file.FindAnimation("walk");
        var jump = file.FindAnimation("jump");
        Expect(walk != null && walk.Frames.Any(f => f.Events.Contains("squelch")), "the slime's walk has a squelch event");
        Expect(jump != null && jump.Frames.Last().Events.Contains("land"), "the slime's jump lands with an event");
    }
}
