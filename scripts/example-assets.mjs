// Draws the example slime sheet and writes its runtime file, so the examples have real art to
// play without shipping anything made elsewhere. Run after changing the art:
//
//   npm run examples:assets
//
// It writes examples/assets/slime.png and slime.anims.json, and copies both into the Godot
// example (godot/examples/art/), which can only load files inside its own project.
import { copyFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CELL = 16;

const OUTLINE = [28, 60, 40, 255];
const BODY = [92, 196, 104, 255];
const SHADE = [60, 150, 80, 255];
const SHINE = [214, 255, 210, 255];
const EYE = [24, 32, 40, 255];
const HAT = [196, 64, 72, 255];
const BAND = [250, 214, 92, 255];

/** A blank RGBA canvas with a pixel setter. */
function canvas(width, height) {
  const data = new Uint8Array(width * height * 4);
  const set = (x, y, rgba) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    data.set(rgba, (y * width + x) * 4);
  };
  return { width, height, data, set };
}

/**
 * One slime in the cell starting at `cx`: a half-ellipse `w` wide and `h` tall sitting on the
 * cell's bottom row, with an outline, a shaded base, a shine and two eyes.
 */
function slime(c, cx, w, h) {
  const left = cx + (CELL - w) / 2;
  const top = CELL - h;
  const rx = w / 2;
  const inside = (x, y) => {
    // Upper half of an ellipse centred on the bottom edge, plus a flat base.
    const dx = (x + 0.5 - (left + rx)) / rx;
    const dy = (y + 0.5 - CELL) / h;
    return dx * dx + dy * dy <= 1;
  };
  for (let y = top; y < CELL; y++) {
    for (let x = left; x < left + w; x++) {
      if (!inside(x, y)) continue;
      const edge = !inside(x - 1, y) || !inside(x + 1, y) || !inside(x, y - 1) || y === CELL - 1;
      c.set(x, y, edge ? OUTLINE : y >= CELL - 3 ? SHADE : BODY);
    }
  }
  c.set(left + 3, top + 3, SHINE);
  c.set(left + 4, top + 3, SHINE);
  c.set(left + 3, top + 4, SHINE);
  const eyeY = top + Math.max(4, Math.round(h / 2));
  c.set(left + Math.round(w * 0.35), eyeY, EYE);
  c.set(left + Math.round(w * 0.65), eyeY, EYE);
}

/** A little party hat, 8 × 7, in the cell starting at `cx`: a pompom, a cone and a band. */
function hat(c, cx) {
  c.set(cx + 3, 0, BAND);
  c.set(cx + 4, 0, BAND);
  for (let row = 1; row <= 6; row++) {
    const half = Math.floor(row / 2);
    for (let x = 3 - half; x <= 4 + half; x++) c.set(cx + x, row, row === 6 ? BAND : HAT);
  }
}

// The sheet: three slime poses (tall, normal, squashed) and the hat, one 16 × 16 cell each.
const POSES = [
  { name: 'slime_tall', w: 12, h: 13 },
  { name: 'slime', w: 14, h: 11 },
  { name: 'slime_squash', w: 16, h: 8 },
];
const sheet = canvas(CELL * (POSES.length + 1), CELL);
POSES.forEach((p, i) => slime(sheet, i * CELL, p.w, p.h));
hat(sheet, POSES.length * CELL);

/** Where the hat's 16 × 16 cell goes on a pose: centred, its brim on the slime's head. */
const hatOn = (pose) => ({ frame: 3, x: 4, y: CELL - pose.h - 5, z: 1 });

const file = {
  format: 'spritebuddy-animations',
  version: 3,
  image: 'slime.png',
  size: [sheet.width, sheet.height],
  scale: 1,
  frames: [
    ...POSES.map((p, i) => ({ name: p.name, rect: [i * CELL, 0, CELL, CELL], pivot: [8, 16] })),
    { name: 'hat', rect: [POSES.length * CELL, 0, CELL, CELL] },
  ],
  animations: [
    // Breathing in and out: 0 1 2 1 0 1 2 …
    { name: 'idle', loop: 'pingpong', duration: 160, frames: [0, 1, 2] },
    // The same, wearing the hat as a live layer that rides on the slime's head.
    {
      name: 'party',
      loop: 'pingpong',
      duration: 160,
      frames: POSES.map((p, i) => ({ frame: i, layers: [hatOn(p)] })),
    },
    // A jump: squash, leap (offsets lift the slime), land, squash. Plays once.
    {
      name: 'hop',
      loop: 'once',
      duration: 70,
      frames: [
        { frame: 2, duration: 120 },
        { frame: 0, offset: [0, -4] },
        { frame: 0, offset: [0, -9] },
        { frame: 0, offset: [0, -11], duration: 120 },
        { frame: 0, offset: [0, -9] },
        { frame: 1, offset: [0, -4] },
        { frame: 2, duration: 120 },
        { frame: 1 },
      ],
    },
  ],
};

// A minimal 8-bit RGBA PNG writer.
const CRC = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(bytes) {
  let c = 0xffffffff;
  for (const b of bytes) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, body) {
  const out = Buffer.alloc(12 + body.length);
  out.writeUInt32BE(body.length, 0);
  out.write(type, 4, 'latin1');
  Buffer.from(body).copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + body.length)), 8 + body.length);
  return out;
}
function png({ width, height, data }) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header.set([8, 6, 0, 0, 0], 8); // 8-bit, RGBA, deflate, no filter, no interlace
  const rows = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    rows[y * (width * 4 + 1)] = 0;
    Buffer.from(data.subarray(y * width * 4, (y + 1) * width * 4)).copy(
      rows,
      y * (width * 4 + 1) + 1,
    );
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(rows, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const assets = join(ROOT, 'examples/assets');
const godotArt = join(ROOT, 'godot/examples/art');
mkdirSync(assets, { recursive: true });
mkdirSync(godotArt, { recursive: true });
writeFileSync(join(assets, 'slime.png'), png(sheet));
writeFileSync(join(assets, 'slime.anims.json'), JSON.stringify(file, null, 2) + '\n');
for (const name of ['slime.png', 'slime.anims.json']) {
  copyFileSync(join(assets, name), join(godotArt, name));
}
console.log(`wrote ${assets} and ${godotArt}`);
