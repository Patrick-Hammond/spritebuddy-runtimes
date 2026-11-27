// Makes the two little sounds the frame events examples play, from code, so they are free to use
// anywhere (this repo is ISC; the sounds are too). Run after changing them:
//
//   npm run examples:sounds
//
// It writes jump.wav and land.wav to examples/assets/sounds (the browser examples) and to
// godot/examples/sounds (Godot can only load files inside its own project). Both are 16-bit mono
// WAV at 22 050 Hz, a fraction of a second long. Replace them with your own if you like: the
// examples only need the file names.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const RATE = 22050;

/** Samples (-1 to 1) for `seconds`, each worked out by `sample(t, i)`. */
function render(seconds, sample) {
  return Float32Array.from({ length: Math.round(seconds * RATE) }, (_, i) => sample(i / RATE, i));
}

/** A boing: a square wave sweeping up, fading out. */
function jump() {
  const seconds = 0.16;
  let phase = 0;
  return render(seconds, (t) => {
    const progress = t / seconds;
    phase += (260 + 640 * progress * progress) / RATE;
    const square = phase % 1 < 0.5 ? 1 : -1;
    return 0.35 * square * (1 - progress) ** 1.5;
  });
}

/** A soft thud: a sine dropping in pitch, with a burst of noise at the start. */
function land() {
  const seconds = 0.14;
  let phase = 0;
  let seed = 7; // a fixed seed, so every run writes the same file
  const noise = () => (seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 30 - 1;
  return render(seconds, (t) => {
    const progress = t / seconds;
    phase += (150 - 90 * progress) / RATE;
    const thump = Math.sin(phase * 2 * Math.PI) * (1 - progress) ** 2;
    const crunch = noise() * Math.max(0, 1 - t / 0.03);
    return 0.6 * thump + 0.25 * crunch;
  });
}

/** A 16-bit mono PCM WAV file. */
function wav(samples) {
  const out = Buffer.alloc(44 + samples.length * 2);
  out.write('RIFF', 0, 'latin1');
  out.writeUInt32LE(36 + samples.length * 2, 4);
  out.write('WAVEfmt ', 8, 'latin1');
  out.writeUInt32LE(16, 16); // format chunk size
  out.writeUInt16LE(1, 20); // PCM
  out.writeUInt16LE(1, 22); // mono
  out.writeUInt32LE(RATE, 24);
  out.writeUInt32LE(RATE * 2, 28); // bytes a second
  out.writeUInt16LE(2, 32); // bytes a sample
  out.writeUInt16LE(16, 34); // bits a sample
  out.write('data', 36, 'latin1');
  out.writeUInt32LE(samples.length * 2, 40);
  samples.forEach((s, i) =>
    out.writeInt16LE(Math.round(Math.max(-1, Math.min(1, s)) * 32767), 44 + i * 2),
  );
  return out;
}

const sounds = { 'jump.wav': wav(jump()), 'land.wav': wav(land()) };
for (const dir of ['examples/assets/sounds', 'godot/examples/sounds']) {
  mkdirSync(join(ROOT, dir), { recursive: true });
  for (const [name, bytes] of Object.entries(sounds)) writeFileSync(join(ROOT, dir, name), bytes);
  console.log(`wrote ${dir}`);
}
