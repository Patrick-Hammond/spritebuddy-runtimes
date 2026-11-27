using System;
using UnityEngine;

namespace SpriteBuddy.Examples
{
    /// <summary>
    /// Plays a sound when a SpriteBuddy frame event fires: name the event (as tagged on the frame
    /// in SpriteBuddy, such as "squelch") and give it a clip. Put it beside a SpriteBuddy Sprite.
    /// </summary>
    [RequireComponent(typeof(SpriteBuddySprite))]
    [RequireComponent(typeof(AudioSource))]
    public sealed class FrameEventSounds : MonoBehaviour
    {
        [Serializable]
        public struct Sound
        {
            [Tooltip("The frame event's name.")]
            public string eventName;
            public AudioClip clip;
            [Range(0f, 1f)] public float volume;
        }

        [SerializeField] Sound[] sounds = new Sound[0];
        [Tooltip("Varies the pitch a little each time, so repeats don't sound mechanical.")]
        [SerializeField, Range(0f, 0.5f)] float pitchVariation = 0.08f;

        SpriteBuddySprite _sprite;
        AudioSource _audio;

        /// <summary>Called after each sound plays, with the event's name (the example shows a log).</summary>
        public event Action<string> Played;

        void Awake()
        {
            _sprite = GetComponent<SpriteBuddySprite>();
            _audio = GetComponent<AudioSource>();
            if (_audio == null) _audio = gameObject.AddComponent<AudioSource>();
            _audio.playOnAwake = false;
        }

        void OnEnable()
        {
            if (_sprite != null) _sprite.FrameEvent += OnFrameEvent;
        }

        void OnDisable()
        {
            if (_sprite != null) _sprite.FrameEvent -= OnFrameEvent;
        }

        void OnFrameEvent(string eventName, int frameIndex)
        {
            foreach (var sound in sounds)
            {
                if (sound.eventName != eventName || sound.clip == null) continue;
                _audio.pitch = 1f + UnityEngine.Random.Range(-pitchVariation, pitchVariation);
                _audio.PlayOneShot(sound.clip, sound.volume > 0f ? sound.volume : 1f);
                Played?.Invoke(eventName);
            }
        }
    }
}
