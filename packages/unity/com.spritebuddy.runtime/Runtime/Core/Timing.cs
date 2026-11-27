using System;
using System.Collections.Generic;

namespace SpriteBuddy
{
    /// <summary>Which frame of an animation shows at a time, and whether a <c>once</c> animation is done.</summary>
    public struct FramePosition
    {
        /// <summary>Index into the animation's frames, or -1 for an animation with none.</summary>
        public int Index;
        public bool Done;

        public FramePosition(int index, bool done)
        {
            Index = index;
            Done = done;
        }
    }

    /// <summary>A frame event that fired: its name and the index of the frame entry it's on.</summary>
    public struct FiredEvent
    {
        public string Name;
        public int Index;

        public FiredEvent(string name, int index)
        {
            Name = name;
            Index = index;
        }
    }

    /// <summary>Animation timing, exactly as docs/format.md describes it. Times are ms.</summary>
    public static class Timing
    {
        /// <summary>The frame indices one cycle visits: pingpong plays back without repeating the end frames.</summary>
        public static List<int> CycleOrder(AnimationDef animation)
        {
            var count = animation.Frames.Count;
            var order = new List<int>(count * 2);
            for (var i = 0; i < count; i++) order.Add(i);
            if (animation.Loop == LoopMode.PingPong && count > 2)
                for (var i = count - 2; i > 0; i--) order.Add(i);
            return order;
        }

        /// <summary>How long one cycle lasts, in ms.</summary>
        public static int CycleDuration(AnimationDef animation)
        {
            var total = 0;
            foreach (var i in CycleOrder(animation)) total += animation.Frames[i].Duration;
            return total;
        }

        /// <summary>
        /// Which frame shows <paramref name="time"/> ms after the animation starts. A frame shows
        /// from its start up to, not including, its end; <c>once</c> holds the last frame and is then done.
        /// </summary>
        public static FramePosition FrameAt(AnimationDef animation, double time)
        {
            var order = CycleOrder(animation);
            if (order.Count == 0) return new FramePosition(-1, true);
            double total = CycleDuration(animation);
            var t = Math.Max(0, time);
            if (animation.Loop == LoopMode.Once && t >= total) return new FramePosition(order[order.Count - 1], true);
            var rest = t % total;
            foreach (var i in order)
            {
                rest -= animation.Frames[i].Duration;
                if (rest < 0) return new FramePosition(i, false);
            }
            return new FramePosition(order[order.Count - 1], false);
        }

        /// <summary>
        /// The events of every frame that starts showing after <paramref name="from"/> and up to
        /// and including <paramref name="to"/>, in the order they start. A frame starting exactly
        /// at <paramref name="from"/> was already counted, so passing each tick's old and new time
        /// fires every event once, even when a long tick skips short frames. One call fires at most
        /// one cycle's worth.
        /// </summary>
        public static List<FiredEvent> EventsBetween(AnimationDef animation, double from, double to)
        {
            var fired = new List<FiredEvent>();
            var order = CycleOrder(animation);
            if (order.Count == 0 || to <= from) return fired;
            var any = false;
            foreach (var entry in animation.Frames)
                if (entry.Events.Count > 0) { any = true; break; }
            if (!any) return fired;
            double total = CycleDuration(animation);
            var starts = new double[order.Count];
            double t = 0;
            for (var k = 0; k < order.Count; k++)
            {
                starts[k] = t;
                t += animation.Frames[order[k]].Duration;
            }
            var once = animation.Loop == LoopMode.Once;
            var first = once ? 0 : (long)Math.Max(Math.Floor(Math.Max(0, from) / total), Math.Floor(to / total) - 1);
            var last = once ? 0 : (long)Math.Floor(to / total);
            var crossed = new List<int>();
            for (var cycle = first; cycle <= last; cycle++)
            {
                for (var k = 0; k < order.Count; k++)
                {
                    var at = cycle * total + starts[k];
                    if (at > from && at <= to) crossed.Add(order[k]);
                }
            }
            for (var c = Math.Max(0, crossed.Count - order.Count); c < crossed.Count; c++)
            {
                var index = crossed[c];
                foreach (var name in animation.Frames[index].Events) fired.Add(new FiredEvent(name, index));
            }
            return fired;
        }
    }
}
