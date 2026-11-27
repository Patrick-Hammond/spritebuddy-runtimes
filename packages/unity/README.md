# SpriteBuddy for Unity 6

Plays [SpriteBuddy](https://github.com/Patrick-Hammond/spritebuddy) runtime files (`.anims.json`,
[format](../../docs/format.md)) in Unity 6, with per-frame timing, loop modes, frame offsets, live
layers, frame events, and normal maps for URP's 2D lights.

- [`com.spritebuddy.runtime`](com.spritebuddy.runtime): the package.
- [`examples`](examples): a Unity 6 project with three example scenes.
- [`tests`](tests): tests that run without Unity.

## Install

In Unity, open **Window → Package Manager**, click **+ → Install package from git URL…** and
paste:

```
https://github.com/Patrick-Hammond/spritebuddy-runtimes.git?path=/packages/unity/com.spritebuddy.runtime
```

Or add it to `Packages/manifest.json`:

```json
"com.spritebuddy.runtime": "https://github.com/Patrick-Hammond/spritebuddy-runtimes.git?path=/packages/unity/com.spritebuddy.runtime"
```

Add `#<tag or commit>` to the URL to pin a version.

## Import your export

Put the exported `<name>.anims.json`, `<name>.png` (and `<name>_n.png` if it has a normal map)
in your project. Select the sheet and set, in its import settings:

- **Filter Mode**: Point (no filter), and **Compression**: None, for crisp pixel art.
- **Non-Power of 2**: None (under Advanced), so the texture keeps the size the file says.
- For `<name>_n.png`: **Texture Type**: Normal map.

The sheet stays a plain texture (Texture Type Default); SpriteBuddy cuts the sprites itself.

## Use

Add a **SpriteBuddy Sprite** component (Add Component → SpriteBuddy → SpriteBuddy Sprite) and
drag the `.anims.json` into **File**. The sheet and normal map beside it fill in by themselves;
pick an **Animation** from the list. The GameObject's position is where the character stands
(the frame's pivot). Set **Pixels Per Unit** to match your game (16 by default). Sort it with the
**Sorting Group** it adds, which keeps its layers together.

In code:

```csharp
using SpriteBuddy;

var hero = gameObject.AddComponent<SpriteBuddySprite>();
hero.SetSource(heroFile, heroSheet, heroNormals); // TextAsset, Texture2D, Texture2D (or null)
hero.Play("attack");
hero.AnimationFinished += name => hero.Play("idle");
hero.FrameEvent += (name, frame) =>
{
    if (name == "hit") enemy.TakeHit();
    if (name == "step") footsteps.PlayOneShot(stepClip);
};
```

- `Play(name, fromMs)`, `Stop()`, `Resume()`, `Seek(ms)`, `Advance(ms)`, `Speed`, `Color`, `FlipX`, `FlipY`,
  `IsPlaying`, `TimeMs`, `FrameIndex`, `Animation`, and the `FrameChanged`, `FrameEvent` and
  `AnimationFinished` events (also **On Frame Event** and **On Finished** in the inspector).
  `FrameEvent` fires for each event tagged on a frame as it starts showing, even when a slow
  frame rate skips past it.
- Turn a character around with `FlipX` (and `FlipY`), which mirror it about where it stands.
  Prefer them to a negative scale: they flip each SpriteRenderer, which URP's 2D lights read to
  flip the normals, whereas a negative scale lights a sprite's top and bottom the wrong way round.
- Normal maps: when the sprite has one, its sprites carry it as their `_NormalMap` secondary
  texture, so URP 2D lights with **Normal Map Quality** set to Fast or Accurate light it. Untick
  **Use Normal Map** to draw it unlit.
- `SpriteBuddyFile.Parse(text)`, `Timing` and `Player` are plain C# with no Unity types: the
  parsed file, which frame shows when and which events fire, for your own renderer or a server.
  `SpriteBuddySheet.Load(file, sheet, normals, pixelsPerUnit)` shares one set of sprites between
  many SpriteBuddy Sprites (`SetSheet`).

## Examples

Open the `examples` folder in Unity Hub (**Add → Add project from disk**) with Unity 6. The first
time it opens, it sets itself up with URP and the 2D Renderer (**Tools → SpriteBuddy Examples →
Set Up URP 2D** does it again). Then open a scene from `Assets/SpriteBuddyExamples/Scenes` and
press Play:

- **Slimes**: three slimes from one sheet, two placed in the scene and one made in code, wearing
  a hat drawn as a live layer. Click a slime, or press Space, to make it hop.
- **Candle**: a flickering candle's Point Light 2D lights a slime through its normal map, under a
  dim Global Light 2D. The arrow keys move the slime and Space makes it jump.
- **FrameEvents**: frame events playing sounds. The slime's walk has a `squelch` event on its
  first frame, and its jump `hop` and `land`; `FrameEventSounds` plays a clip for each, and the
  screen lists them as they fire.

The example project uses the package from this folder (`file:../../com.spritebuddy.runtime`),
so changes to the package show up straight away.

## Tests

```sh
dotnet run --project packages/unity/tests/Core      # the C# core against the golden tables in fixtures/
dotnet build packages/unity/tests/Compile           # the package and examples against Unity's API
node scripts/unity-project.mjs             # after adding or moving files: metas and scenes
```

`packages/unity/tests/Core` checks the shared fixtures, the file checks, the player and where each part
is drawn. `packages/unity/tests/Compile` compiles the package and example scripts against UnityEngine's
reference assemblies (from NuGet), with stand-ins for the few URP and editor types they use.
Both need the .NET 8 SDK; CI runs them when started by hand. `npm run check` checks the metas
and scenes.
