using System;
using System.Collections.Generic;

namespace SpriteBuddy
{
    /// <summary>
    /// Plays a file's animations with nothing but a clock: call <see cref="Update"/> every tick
    /// with the elapsed ms and draw <see cref="Parts"/>. <see cref="SpriteBuddySprite"/> wraps it;
    /// games can use it directly too (on a server, or for their own renderer).
    /// </summary>
    public sealed class Player
    {
        public readonly SpriteBuddyFile File;
        /// <summary>Playback rate: 1 is normal, 2 twice as fast, 0 frozen.</summary>
        public float Speed = 1f;
        /// <summary>Whether <see cref="Update"/> moves time on.</summary>
        public bool Playing;

        /// <summary>Called with the frame index each time the frame changes.</summary>
        public event Action<int> FrameChanged;
        /// <summary>
        /// Called for each event of a frame as it starts showing, after <see cref="FrameChanged"/>,
        /// with the event's name and the frame index. <see cref="Play"/> fires the first frame's
        /// events; <see cref="Seek"/> jumps without firing any.
        /// </summary>
        public event Action<string, int> EventFired;
        /// <summary>Called with the animation's name when a <c>once</c> animation ends.</summary>
        public event Action<string> Finished;

        readonly List<Part> _parts = new List<Part>();
        readonly List<FiredEvent> _none = new List<FiredEvent>();

        public Player(SpriteBuddyFile file)
        {
            File = file ?? throw new ArgumentNullException(nameof(file));
        }

        /// <summary>The animation playing, or null before <see cref="Play"/>.</summary>
        public AnimationDef Animation { get; private set; }
        /// <summary>Index into the animation's frames, or -1.</summary>
        public int Index { get; private set; } = -1;
        /// <summary>Ms since the animation started, scaled by <see cref="Speed"/>.</summary>
        public double Time { get; private set; }
        /// <summary>Whether a <c>once</c> animation has ended.</summary>
        public bool Done { get; private set; }
        /// <summary>What to draw now, bottom to top. The list is reused: copy it to keep it.</summary>
        public IReadOnlyList<Part> Parts => _parts;
        /// <summary>The frame entry showing now, or null.</summary>
        public FrameEntry Entry => Animation != null && Index >= 0 ? Animation.Frames[Index] : null;

        /// <summary>
        /// Starts an animation from its first frame (or from <paramref name="time"/> ms). Throws
        /// <see cref="ArgumentException"/> for an unknown name, listing the ones there are.
        /// </summary>
        public Player Play(string name, double time = 0)
        {
            var animation = File.FindAnimation(name);
            if (animation == null)
            {
                var names = File.AnimationNames();
                throw new ArgumentException("No animation \"" + name + "\"; this file has " +
                    (names.Length == 0 ? "none" : "\"" + string.Join("\", \"", names) + "\""));
            }
            Animation = animation;
            Index = -1;
            Done = false;
            Playing = true;
            Time = Math.Max(0, time);
            var first = Timing.FrameAt(animation, Time).Index;
            var fired = new List<FiredEvent>();
            if (first >= 0)
                foreach (var e in animation.Frames[first].Events) fired.Add(new FiredEvent(e, first));
            Refresh(fired);
            return this;
        }

        public Player Stop()
        {
            Playing = false;
            return this;
        }

        /// <summary>Jumps to <paramref name="time"/> ms into the current animation, firing no events.</summary>
        public Player Seek(double time)
        {
            Time = Math.Max(0, time);
            Refresh(_none);
            return this;
        }

        /// <summary>Moves time on by <paramref name="ms"/> (times <see cref="Speed"/>) while playing.</summary>
        public Player Update(double ms)
        {
            if (Playing && Animation != null)
            {
                var from = Time;
                Time += Math.Max(0, ms) * Speed;
                Refresh(EventFired != null ? Timing.EventsBetween(Animation, from, Time) : _none);
            }
            return this;
        }

        /// <summary>Works out the frame now showing, then reports frame, events and completion in that order.</summary>
        void Refresh(List<FiredEvent> fired)
        {
            var animation = Animation;
            if (animation == null) return;
            var position = Timing.FrameAt(animation, Time);
            var changed = position.Index != Index;
            Index = position.Index;
            if (position.Index < 0) _parts.Clear();
            else File.PartsOf(animation.Frames[position.Index], _parts);
            if (changed && position.Index >= 0) FrameChanged?.Invoke(position.Index);
            foreach (var e in fired) EventFired?.Invoke(e.Name, e.Index);
            if (position.Done && !Done)
            {
                Done = true;
                Playing = false;
                Finished?.Invoke(animation.Name);
            }
        }
    }
}
