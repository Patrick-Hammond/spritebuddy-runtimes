// Plays a SpriteBuddy runtime file on a plain <canvas> with @spritebuddy/core, the
// engine-free package. Read this to see the whole drawing rule in one place; use it as a
// starting point for any renderer that can draw part of an image (Canvas, WebGL, a game engine
// without a SpriteBuddy package).
import { parseFile, Player } from '@spritebuddy/core';

const ZOOM = 6; // pixel art is tiny: draw every sheet pixel as a 6 × 6 block

const canvas = document.getElementById('stage');
const ctx = canvas.getContext('2d');
const status = document.getElementById('status');

// 1. Load the runtime file and its sheet image. `file.image` is relative to the file.
const fileUrl = new URL('../assets/slime.anims.json', import.meta.url);
const file = parseFile(await (await fetch(fileUrl)).json()); // throws a FormatError if wrong
const sheet = new Image();
sheet.src = new URL(file.image, fileUrl).href;
await sheet.decode();

// 2. A Player keeps time. onComplete fires when a "once" animation ends.
const player = new Player(file, {
  onComplete: () => play('idle'),
});

function play(name) {
  player.play(name);
  status.textContent = `Playing "${name}" (${player.animation(name).loop})`;
}

// One button per animation in the file.
const buttons = document.getElementById('buttons');
for (const name of player.names) {
  const button = document.createElement('button');
  button.textContent = name;
  button.addEventListener('click', () => play(name));
  buttons.append(button);
}

/**
 * 3. Draws everything the player says is showing, with the sprite's origin (where the
 * character stands: the frame's pivot) at `originX, originY` on the canvas.
 */
function draw(originX, originY) {
  for (const part of player.parts) {
    const { frame } = part;
    // part.x, part.y is where the part's full (untrimmed) frame has its top-left, relative to
    // the origin. Trimmed frames start a little further in.
    const x = part.x + (frame.trim?.x ?? 0);
    const y = part.y + (frame.trim?.y ?? 0);
    const { x: sx, y: sy, w, h } = frame.rect;

    ctx.save();
    ctx.globalAlpha = part.opacity;
    ctx.translate(originX + x * ZOOM, originY + y * ZOOM);
    // Flips mirror the part within its own full frame.
    if (part.flipX || part.flipY) {
      ctx.translate(part.flipX ? frame.width * ZOOM : 0, part.flipY ? frame.height * ZOOM : 0);
      ctx.scale(part.flipX ? -1 : 1, part.flipY ? -1 : 1);
    }
    if (frame.rotated) {
      // Stored turned 90° clockwise (h wide, w tall on the sheet): turn it back.
      ctx.translate(0, h * ZOOM);
      ctx.rotate(-Math.PI / 2);
      ctx.drawImage(sheet, sx, sy, h, w, 0, 0, h * ZOOM, w * ZOOM);
    } else {
      ctx.drawImage(sheet, sx, sy, w, h, 0, 0, w * ZOOM, h * ZOOM);
    }
    ctx.restore();
  }
}

// 4. Every animation frame: move time on, clear, draw.
ctx.imageSmoothingEnabled = false; // keep pixel art crisp
let last = performance.now();
function tick(now) {
  player.update(now - last);
  last = now;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#2b3a2f';
  ctx.fillRect(0, canvas.height - 40, canvas.width, 40); // the ground
  draw(canvas.width / 2, canvas.height - 40); // stand the slime on it
  requestAnimationFrame(tick);
}

play('party');
requestAnimationFrame(tick);
window.exampleReady = true; // for the repo's tests
