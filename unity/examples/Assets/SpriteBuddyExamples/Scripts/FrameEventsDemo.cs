using System.Collections.Generic;
using UnityEngine;

namespace SpriteBuddy.Examples
{
    /// <summary>
    /// Frame events playing sounds. The slime's sheet tags frames with events in SpriteBuddy:
    /// "squelch" on the first frame of "walk", and "hop" and "land" on "jump". The slime has a
    /// <see cref="FrameEventSounds"/> beside it that plays a clip for each; this script walks it
    /// back and forth, makes it jump now and then (or when you press Space), and lists the events
    /// as they fire.
    /// </summary>
    /// <remarks>
    /// To react to an event in your own code, listen on the sprite:
    /// <code>
    /// sprite.FrameEvent += (name, frame) => { if (name == "hit") enemy.TakeHit(); };
    /// </code>
    /// or wire up its On Frame Event in the inspector. Events fire as their frame starts showing,
    /// even when a slow frame rate skips past a short frame.
    /// </remarks>
    public sealed class FrameEventsDemo : MonoBehaviour
    {
        [SerializeField] SpriteBuddySprite slime;
        [Tooltip("How far either side of the middle the slime walks, in units.")]
        [SerializeField] float walkWidth = 2.5f;
        [Tooltip("The slime's speed, in units a second.")]
        [SerializeField] float speed = 1.2f;
        [Tooltip("Seconds between jumps.")]
        [SerializeField] float jumpEvery = 3.5f;

        readonly List<string> _log = new List<string>();
        float _direction = 1f;
        float _nextJump;
        bool _jumping;

        void Start()
        {
            _nextJump = Time.time + jumpEvery;
            slime.FrameEvent += (name, frame) => Log("\"" + name + "\" on frame " + frame + " of " + slime.Animation);
            slime.AnimationFinished += name =>
            {
                _jumping = false;
                slime.Play("walk");
            };
        }

        void Update()
        {
            if ((Input.GetKeyDown(KeyCode.Space) || Time.time >= _nextJump) && !_jumping)
            {
                _jumping = true;
                _nextJump = Time.time + jumpEvery;
                slime.Play("jump");
            }
            if (_jumping) return;
            var p = slime.transform.position;
            p.x += _direction * speed * Time.deltaTime;
            if (Mathf.Abs(p.x) > walkWidth)
            {
                p.x = Mathf.Sign(p.x) * walkWidth;
                _direction = -_direction;
            }
            slime.transform.position = p;
            slime.FlipX = _direction < 0f;
        }

        void Log(string line)
        {
            _log.Insert(0, Time.time.ToString("0.00") + " s  " + line);
            if (_log.Count > 8) _log.RemoveAt(_log.Count - 1);
        }

        void OnGUI()
        {
            GUI.Label(new Rect(10, 8, 700, 24), "Frame events play sounds: listen for the squelch, hop and land. Space jumps.");
            for (var i = 0; i < _log.Count; i++) GUI.Label(new Rect(10, 34 + i * 20, 700, 20), _log[i]);
        }
    }
}
