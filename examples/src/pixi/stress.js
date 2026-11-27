// A lighting stress test for @spritebuddy/pixi: lots of lit slimes and lots of moving point
// lights, with sliders for both and a frames-per-second readout, to see what your machine and
// GPU can take. In @spritebuddy/pixi each sprite is lit by one light, so every slime here takes
// one of the lights in turn; the cost is the lit sprites drawn, not the number of lights.
import * as PIXI from 'pixi.js';
import { spriteBuddy } from '@spritebuddy/pixi';

const WIDTH = 480;
const HEIGHT = 320;
const ZOOM = 3;
const COLORS = ['#ffb466', '#66c8ff', '#ff6fa8', '#a8ff7a', '#ffe066', '#c58cff'];
const status = document.getElementById('status');

const app = new PIXI.Application();
await app.init({
  width: WIDTH,
  height: HEIGHT,
  background: '#0b0d14',
  antialias: false,
  preference: 'webgl', // lit sprites use a WebGL shader
});
const stage = document.getElementById('stage');
stage.append(app.canvas);

const sb = spriteBuddy(PIXI);
const sheet = await sb.load(new URL('./assets/slime.anims.json', import.meta.url).href);
const glow = glowTexture(64);

// Sliders for how many lights and slimes there are.
// Start with ?lights=20&slimes=500 in the address to pick the counts (the sliders change them too).
const query = new URLSearchParams(location.search);
const settings = {
  lights: Number(query.get('lights') ?? 8),
  slimes: Number(query.get('slimes') ?? 200),
};
const controls = document.createElement('div');
controls.className = 'buttons';
stage.append(controls);
slider('Lights', 'lights', 1, 64);
slider('Slimes', 'slimes', 1, 3000);

const world = new PIXI.Container();
app.stage.addChild(world);
let lights = [];
let slimes = [];

/** Throws everything away and makes `settings.lights` lights and `settings.slimes` slimes. */
function build() {
  for (const child of world.removeChildren()) child.destroy();
  // Each light wanders about the stage, with a glow drawn where it is so you can see it.
  lights = Array.from({ length: settings.lights }, (_, i) => {
    const color = COLORS[i % COLORS.length];
    const light = sb.light({ radius: 140, z: 30, color, brightness: 2, ambient: 0.15 });
    const marker = new PIXI.Sprite(glow);
    marker.anchor.set(0.5);
    marker.tint = color;
    marker.blendMode = 'add';
    world.addChild(marker);
    return { light, marker, ...wander() };
  });
  // Slimes walk about too, each lit by one of the lights.
  slimes = Array.from({ length: settings.slimes }, (_, i) => {
    const slime = sheet.sprite('walk', { light: lights[i % lights.length].light });
    slime.scale.set(ZOOM);
    slime.speed = 0.7 + Math.random() * 0.6;
    world.addChildAt(slime, 0);
    const mover = { slime, ...wander(25) };
    slime.x = mover.x;
    slime.y = mover.y;
    return mover;
  });
}

/** A random place and velocity, `speed` pixels a second at most. */
function wander(speed = 90) {
  const angle = Math.random() * Math.PI * 2;
  const v = speed * (0.4 + Math.random() * 0.6);
  return {
    x: 20 + Math.random() * (WIDTH - 40),
    y: 30 + Math.random() * (HEIGHT - 40),
    vx: Math.cos(angle) * v,
    vy: Math.sin(angle) * v,
  };
}

/** Moves a wanderer on and bounces it off the edges. */
function move(m, dt) {
  m.x += m.vx * dt;
  m.y += m.vy * dt;
  if (m.x < 20 || m.x > WIDTH - 20) m.vx = -m.vx;
  if (m.y < 30 || m.y > HEIGHT - 10) m.vy = -m.vy;
}

let shown = 0;
app.ticker.add((ticker) => {
  const dt = Math.min(ticker.deltaMS / 1000, 0.1);
  for (const l of lights) {
    move(l, dt);
    l.light.x = l.marker.x = l.x;
    l.light.y = l.marker.y = l.y;
  }
  for (const s of slimes) {
    move(s, dt);
    s.slime.x = s.x;
    s.slime.y = s.y;
    s.slime.scale.x = s.vx < 0 ? -ZOOM : ZOOM; // face the way it walks
  }
  // Update the readout four times a second, so it can be read.
  if ((shown += ticker.deltaMS) > 250) {
    shown = 0;
    status.textContent = `${Math.round(app.ticker.FPS)} fps · ${lights.length} lights · ${slimes.length} lit slimes`;
  }
});

function slider(label, key, min, max) {
  const wrap = document.createElement('label');
  const input = Object.assign(document.createElement('input'), {
    type: 'range',
    min,
    max,
    value: settings[key],
  });
  const value = document.createElement('output');
  value.textContent = settings[key];
  input.addEventListener('input', () => (value.textContent = input.value));
  input.addEventListener('change', () => {
    settings[key] = Number(input.value);
    build();
  });
  wrap.append(`${label} `, input, ' ', value);
  controls.append(wrap);
}

/** A round, soft glow `size` pixels across, white so it can be tinted each light's colour. */
function glowTexture(size) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  const r = size / 2;
  const gradient = ctx.createRadialGradient(r, r, 0, r, r, r);
  gradient.addColorStop(0, 'rgba(255, 255, 255, 0.9)');
  gradient.addColorStop(0.15, 'rgba(255, 255, 255, 0.35)');
  gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  return PIXI.Texture.from(canvas);
}

build();
window.stressExample = { app, settings, build, lights: () => lights, slimes: () => slimes }; // for the repo's tests
