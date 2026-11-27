"""Draws the Cocos example's two sounds, so they're ours to share: python3 make-sounds.py"""
import math
import random
import struct
import wave
from pathlib import Path

RATE = 22050
OUT = Path(__file__).resolve().parent.parent / 'assets' / 'resources' / 'sounds'


def write(name, samples):
    with wave.open(str(OUT / name), 'wb') as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(RATE)
        w.writeframes(b''.join(struct.pack('<h', int(max(-1, min(1, s)) * 32000)) for s in samples))


def squelch(length, start, end, noise, seed):
    """A wet blip: a falling tone with a little filtered noise, fading out."""
    rng = random.Random(seed)
    out, phase, smooth = [], 0.0, 0.0
    n = int(length * RATE)
    for i in range(n):
        t = i / n
        phase += 2 * math.pi * (start + (end - start) * t * t) / RATE
        smooth += 0.25 * (rng.uniform(-1, 1) - smooth)
        envelope = min(1, i / (0.004 * RATE)) * (1 - t) ** 2
        out.append(envelope * (0.7 * math.sin(phase) + noise * smooth))
    return out


OUT.mkdir(parents=True, exist_ok=True)
write('step.wav', squelch(0.09, 420, 140, 0.5, 1))
write('leap.wav', squelch(0.16, 260, 700, 0.2, 2))
write('land.wav', squelch(0.22, 240, 55, 0.8, 3))
