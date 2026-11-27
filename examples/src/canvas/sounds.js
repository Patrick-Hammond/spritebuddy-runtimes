// Plays a sound on a frame event with @spritebuddy/core, the engine-free package, on a plain
// <canvas>. In SpriteBuddy, the jump's take-off frame has the event "jump" and its landing frame
// has "land". The Player calls onEvent as each of those frames starts showing, so the sound is
// always in time with the art. Click the slime (or press Space) to jump.
//
// The drawing is the same as in "Drawing by hand", cut down to what this slime needs.
import { parseFile, Player } from '@spritebuddy/core';

const ZOOM = 6;

const canvas = document.createElement('canvas');
canvas.width = 480;
canvas.height = 240;
document.getElementById('stage').append(canvas);
const ctx = canvas.getContext('2d');
const status = document.getElementById('status');

// The same slime, exported with frame events on its jump.
const fileUrl = new URL('./assets/slime_sounds.anims.json', import.meta.url);
const file = parseFile(await (await fetch(fileUrl)).json());
const sheet = new Image();
sheet.src = new URL(file.image, fileUrl).href;
await sheet.decode();

// Each sound is loaded once and decoded with Web Audio, ready to play as often as it's needed.
const audio = new AudioContext();
const sounds = {};
for (const name of ['jump', 'land']) {
  const url = new URL(`./assets/sounds/${name}.wav`, import.meta.url);
  sounds[name] = await audio.decodeAudioData(await (await fetch(url)).arrayBuffer());
}
function playSound(name) {
  const source = audio.createBufferSource();
  source.buffer = sounds[name];
  source.connect(audio.destination);
  source.start();
}

// The frame events. Each event's name is also a sound's name here, so one line plays them all.
const heard = [];
const player = new Player(file, {
  onEvent: (name) => {
    if (sounds[name]) playSound(name);
    heard.push(name);
    status.textContent = `♪ ${name}`;
  },
  onComplete: () => player.play('idle'),
});

function jump() {
  // Browsers only start sound after the page is clicked or a key is pressed: this is that moment.
  audio.resume();
  if (player.state.animation?.name !== 'jump') player.play('jump');
}
canvas.addEventListener('click', jump);
addEventListener('keydown', (e) => {
  if (e.code === 'Space') {
    e.preventDefault();
    jump();
  }
});

/** Draws every part the player says is showing, with the slime standing at `originX, originY`. */
function draw(originX, originY) {
  for (const { frame, x, y } of player.parts) {
    const { x: sx, y: sy, w, h } = frame.rect;
    const left = originX + (x + (frame.trim?.x ?? 0)) * ZOOM;
    const top = originY + (y + (frame.trim?.y ?? 0)) * ZOOM;
    ctx.drawImage(sheet, sx, sy, w, h, left, top, w * ZOOM, h * ZOOM);
  }
}

ctx.imageSmoothingEnabled = false;
let last = performance.now();
function tick(now) {
  player.update(now - last);
  last = now;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#2b3a2f';
  ctx.fillRect(0, canvas.height - 40, canvas.width, 40);
  draw(canvas.width / 2, canvas.height - 40);
  requestAnimationFrame(tick);
}

player.play('idle');
requestAnimationFrame(tick);
status.textContent = 'Click the slime (or press Space) to jump';
window.soundsExample = { player, heard }; // for the repo's tests
window.exampleReady = true;
