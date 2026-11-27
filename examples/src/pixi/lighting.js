// Real-time lighting in PixiJS 8 with @spritebuddy/pixi: a candle's point light lights the slime
// through its normal map, brighter the closer it gets and from whichever side the flame is on.
// Needs PixiJS 8's WebGL renderer and a file exported from SpriteBuddy Pro with normal maps.
import * as PIXI from 'pixi.js';
import { spriteBuddy } from '@spritebuddy/pixi';

const ZOOM = 5;
const WIDTH = 480;
const HEIGHT = 300;
const SPEED = 110; // the slime's speed, in canvas pixels a second
const status = document.getElementById('status');

const app = new PIXI.Application();
await app.init({
  width: WIDTH,
  height: HEIGHT,
  background: '#0b0d14',
  antialias: false,
  preference: 'webgl', // lit sprites use a WebGL shader
});
document.getElementById('stage').append(app.canvas);

const sb = spriteBuddy(PIXI);
// `load` also loads the normal map the file names (slime_n.png), which lit sprites need.
const sheet = await sb.load(new URL('./assets/slime.anims.json', import.meta.url).href);

// The world is y-sorted, so the slime walks behind the candle when it is further up the screen.
const world = new PIXI.Container();
world.sortableChildren = true;
app.stage.addChild(world);

// The candle stands in the middle. It makes the light rather than receiving it, so it isn't lit.
const candle = sheet.sprite('candle');
candle.x = WIDTH / 2;
candle.y = HEIGHT / 2 + 40;
candle.scale.set(ZOOM);
candle.zIndex = candle.y;
world.addChild(candle);

// A point light: give it a radius and it shines from (x, y), `z` pixels toward the viewer, and
// fades out `radius` pixels away. The flame is about 13 sheet pixels above the candle's base.
const flame = { x: candle.x, y: candle.y - 13 * ZOOM };
const light = sb.light({
  radius: 320,
  x: flame.x,
  y: flame.y,
  z: 24,
  color: '#ffb466',
  brightness: 2.2,
  ambient: 0.3,
  size: 0.3,
  // The cel bands SpriteBuddy Pro's preview used for this art.
  bands: sheet.editorLight('idle')?.bands ?? 0,
});

// A soft glow on the floor round the flame, drawn additively under everything.
const glow = new PIXI.Sprite(glowTexture(300));
glow.anchor.set(0.5);
glow.x = flame.x;
glow.y = candle.y - 6;
glow.blendMode = 'add';
glow.zIndex = -Infinity;
world.addChild(glow);

// The slime is lit by the candle: `{ light }` draws it with the normal-mapped shader.
const slime = sheet.sprite('idle', { light });
slime.x = 110;
slime.y = 210;
slime.scale.set(ZOOM);
world.addChild(slime);

// Cursor keys move the slime; Space makes it jump.
const held = new Set();
const KEYS = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', ' '];
let jumping = false;
addEventListener('keydown', (e) => {
  if (!KEYS.includes(e.key)) return;
  e.preventDefault(); // don't scroll the page
  if (e.key === ' ') {
    if (!jumping) {
      jumping = true;
      slime.play('jump');
    }
  } else {
    held.add(e.key);
  }
});
addEventListener('keyup', (e) => held.delete(e.key));
addEventListener('blur', () => held.clear());
slime.onComplete = () => {
  jumping = false; // "jump" plays once; the ticker picks idle or walk again
  slime.play(held.size ? 'walk' : 'idle');
};

let time = 0;
app.ticker.add((ticker) => {
  const dt = ticker.deltaMS / 1000;
  time += dt;

  const dx = (held.has('ArrowRight') ? 1 : 0) - (held.has('ArrowLeft') ? 1 : 0);
  const dy = (held.has('ArrowDown') ? 1 : 0) - (held.has('ArrowUp') ? 1 : 0);
  const moving = dx !== 0 || dy !== 0;
  if (moving) {
    const step = (SPEED * dt) / Math.hypot(dx, dy);
    slime.x = Math.min(WIDTH - 40, Math.max(40, slime.x + dx * step));
    slime.y = Math.min(HEIGHT - 10, Math.max(70, slime.y + dy * step));
    if (dx) slime.scale.x = dx * ZOOM; // face the way it goes: flipped sprites are lit correctly
  }
  if (!jumping) {
    const wanted = moving ? 'walk' : 'idle';
    if (slime.animation !== wanted) slime.play(wanted);
  }
  slime.zIndex = slime.y;

  // Flicker: change the light whenever you like; it takes effect on the next render.
  const flicker = 0.08 * Math.sin(time * 13) + 0.05 * Math.sin(time * 29 + 1.7);
  light.brightness = 2.2 + 2 * flicker;
  light.radius = 320 + 40 * flicker;
  glow.alpha = 0.7 + 1.5 * flicker;

  showStatus();
});

/** Says how far off the candle is and which side it lights the slime from. */
function showStatus() {
  const x = flame.x - slime.x;
  const y = flame.y - (slime.y - 5 * ZOOM); // from the slime's middle
  const distance = Math.round(Math.hypot(x, y));
  if (distance > light.radius) {
    status.textContent = `The candle is ${distance} px away: out of reach`;
    return;
  }
  const side =
    Math.abs(x) > Math.abs(y) ? (x > 0 ? 'the right' : 'the left') : y > 0 ? 'below' : 'above';
  status.textContent = `The candle is ${distance} px away, lighting the slime from ${side}`;
}

/** A round, soft, warm glow `size` pixels across, drawn on a 2D canvas. */
function glowTexture(size) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  const r = size / 2;
  const gradient = ctx.createRadialGradient(r, r, 0, r, r, r);
  gradient.addColorStop(0, 'rgba(255, 170, 80, 0.55)');
  gradient.addColorStop(0.4, 'rgba(255, 130, 50, 0.18)');
  gradient.addColorStop(1, 'rgba(255, 110, 40, 0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  return PIXI.Texture.from(canvas);
}

showStatus();
window.lightingExample = { slime, light, candle, flame }; // for the repo's tests
