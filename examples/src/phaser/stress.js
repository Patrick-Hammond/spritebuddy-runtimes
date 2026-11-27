// A lighting stress test for @spritebuddy/phaser: lots of lit slimes and lots of moving point
// lights, with sliders for both and a frames-per-second readout, to see what your machine and
// GPU can take. Phaser lights every lit sprite with all the lights near the camera, up to the
// game's `maxLights` (10 unless you set it, and it can't change once the game has started).
import Phaser from 'phaser';
import { spriteBuddy } from '@spritebuddy/phaser';

const WIDTH = 480;
const HEIGHT = 320;
const ZOOM = 3;
const MAX_LIGHTS = 64;
const COLORS = [0xffb466, 0x66c8ff, 0xff6fa8, 0xa8ff7a, 0xffe066, 0xc58cff];
const status = document.getElementById('status');
const stage = document.getElementById('stage');

const sb = spriteBuddy(Phaser);
const settings = { lights: 8, slimes: 200 };

class Stress extends Phaser.Scene {
  preload() {
    this.load.spritebuddy('slime', new URL('./assets/slime.anims.json', import.meta.url).href);
  }

  create() {
    this.makeGlow();
    this.lightsList = [];
    this.slimes = [];
    this.build();
    window.stressExample = { scene: this, settings, build: () => this.build() }; // for the repo's tests
  }

  /** Throws everything away and makes `settings.lights` lights and `settings.slimes` slimes. */
  build() {
    for (const l of this.lightsList) {
      l.light.destroy();
      l.marker.destroy();
    }
    for (const s of this.slimes) s.slime.destroy();
    // Each light wanders about, with a glow drawn where it is so you can see it.
    this.lightsList = Array.from({ length: settings.lights }, (_, i) => {
      const color = COLORS[i % COLORS.length];
      const light = sb.light(this, { radius: 140, z: 30, color, brightness: 1.5, ambient: 0.15 });
      const marker = this.add
        .image(0, 0, 'glow')
        .setTint(color)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setDepth(1);
      return { light, marker, ...wander() };
    });
    // Slimes walk about too, lit by whichever lights are near.
    this.slimes = Array.from({ length: settings.slimes }, () => {
      const mover = wander(25);
      const slime = this.add.spritebuddy(mover.x, mover.y, 'slime', 'walk', { lit: true });
      slime.setScale(ZOOM);
      slime.speed = 0.7 + Math.random() * 0.6;
      return { slime, ...mover };
    });
  }

  update(time, delta) {
    const dt = Math.min(delta / 1000, 0.1);
    for (const l of this.lightsList) {
      move(l, dt);
      l.light.x = l.marker.x = l.x;
      l.light.y = l.marker.y = l.y;
    }
    for (const s of this.slimes) {
      move(s, dt);
      s.slime.setPosition(s.x, s.y);
      s.slime.flipX = s.vx < 0; // face the way it walks
    }
    // Update the readout four times a second, so it can be read.
    if (time - (this.shown ?? 0) > 250) {
      this.shown = time;
      const fps = Math.round(this.game.loop.actualFps);
      status.textContent = `${fps} fps · ${this.lightsList.length} lights · ${this.slimes.length} lit slimes`;
    }
  }

  /** A round, soft glow, white so it can be tinted each light's colour. */
  makeGlow() {
    const size = 64;
    const texture = this.textures.createCanvas('glow', size, size);
    const ctx = texture.getContext();
    const r = size / 2;
    const gradient = ctx.createRadialGradient(r, r, 0, r, r, r);
    gradient.addColorStop(0, 'rgba(255, 255, 255, 0.9)');
    gradient.addColorStop(0.15, 'rgba(255, 255, 255, 0.35)');
    gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);
    texture.refresh();
  }
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

const game = new Phaser.Game({
  type: Phaser.WEBGL, // lit sprites need WebGL
  parent: 'stage',
  width: WIDTH,
  height: HEIGHT,
  backgroundColor: '#0b0d14',
  pixelArt: true,
  render: { maxLights: MAX_LIGHTS }, // how many lights can shine at once
  scene: Stress,
});

// Sliders for how many lights and slimes there are.
const controls = document.createElement('div');
controls.className = 'buttons';
stage.append(controls);
slider('Lights', 'lights', 1, MAX_LIGHTS);
slider('Slimes', 'slimes', 1, 3000);

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
    window.stressExample?.build();
  });
  wrap.append(`${label} `, input, ' ', value);
  controls.append(wrap);
}
