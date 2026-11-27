# Changelog

## 0.1.0

- First release: plays SpriteBuddy runtime files (`.anims.json`, version 3) in Unity 6. The
  **SpriteBuddy Sprite** component plays an animation with per-frame timing, loop, ping-pong and
  play-once modes, frame offsets, live layers (flipped, faded and z-ordered), rotated and trimmed
  frames, and frame events (C# `FrameEvent` and the inspector's **On Frame Event**).
- Normal maps: when the export has one, the sprites carry it as their `_NormalMap`, so URP's 2D
  lights light them.
- `SpriteBuddyFile`, `Timing` and `Player` are plain C#, for your own renderer or a server.
