"""Makes the Unity frame events example's sounds: short, soft blips, synthesized so they're ours
to give away. Run after changing them (Python 3, no packages):

    python3 scripts/unity-sounds.py

It writes packages/unity/examples/Assets/SpriteBuddyExamples/Audio/{squelch,hop,land}.wav.
"""
import math
import os
import random
import struct
import wave

RATE = 22050
OUT = os.path.join(os.path.dirname(__file__), "..", "packages", "unity", "examples", "Assets", "SpriteBuddyExamples", "Audio")


def write(name, samples):
    os.makedirs(OUT, exist_ok=True)
    with wave.open(os.path.join(OUT, name + ".wav"), "wb") as f:
        f.setnchannels(1)
        f.setsampwidth(2)
        f.setframerate(RATE)
        f.writeframes(b"".join(struct.pack("<h", int(max(-1, min(1, s)) * 32000)) for s in samples))


def sweep(seconds, start_hz, end_hz, attack=0.005, noise=0.0, volume=0.6, seed=1):
    """A sine that glides from start_hz to end_hz under a quick attack and an exponential fade."""
    rng = random.Random(seed)
    n = int(RATE * seconds)
    phase = 0.0
    out = []
    for i in range(n):
        t = i / RATE
        k = i / n
        hz = start_hz * (end_hz / start_hz) ** k
        phase += 2 * math.pi * hz / RATE
        envelope = min(1.0, t / attack) * math.exp(-5 * k)
        wobble = math.sin(phase) + 0.3 * math.sin(2 * phase)
        out.append(volume * envelope * (wobble / 1.3 + noise * (rng.random() * 2 - 1)))
    return out


# A wet footstep: a low, wobbly downward glide with a little noise.
squelch = sweep(0.16, 260, 90, noise=0.15, volume=0.55, seed=2)
squelch = [s * (1 + 0.4 * math.sin(2 * math.pi * 38 * i / RATE)) for i, s in enumerate(squelch)]
write("squelch", squelch)
# Leaving the ground: a quick upward chirp.
write("hop", sweep(0.12, 300, 900, volume=0.45))
# Landing: a short, low thump.
write("land", sweep(0.14, 140, 50, attack=0.002, noise=0.25, volume=0.7, seed=3))
