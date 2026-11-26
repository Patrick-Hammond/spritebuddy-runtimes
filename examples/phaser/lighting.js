// Real-time lighting in Phaser 4 with @spritebuddy/phaser: a candle's point light lights the slime
// through its normal map, brighter the closer it gets and from whichever side the flame is on.
// It uses Phaser's own lights, so the same code works in Phaser 3.60 and later (where lights sit
// at a fixed height, so `z` has no effect). Needs WebGL and a file exported from SpriteBuddy Pro
// with normal maps.
import Phaser from 'phaser';
import { spriteBuddy } from '@spritebuddy/phaser';

const ZOOM = 5;
const WIDTH = 480;
const HEIGHT = 300;
const SPEED = 110; // the slime's speed, in pixels a second
const status = document.getElementById('lit-status');

const sb = spriteBuddy(Phaser);

class Candlelight extends Phaser.Scene {
  preload() {
    // Also loads the normal map the file names (slime_n.png), which lit sprites need.
    this.load.spritebuddy('slime', new URL('../assets/slime.anims.json', import.meta.url).href);
  }

  create() {
    // The candle stands in the middle. It makes the light rather than receiving it, so it isn't
    // lit. Depth follows y, so the slime walks behind it when it is further up the screen.
    const candle = this.add.spritebuddy(WIDTH / 2, HEIGHT / 2 + 40, 'slime', 'candle');
    candle.setScale(ZOOM).setDepth(candle.y);

    // A point light: give it a radius and it shines from (x, y), `z` pixels toward the viewer,
    // and fades out `radius` pixels away. It also turns the scene's lights on, and `ambient` sets
    // the scene's ambient light. The flame is about 13 sheet pixels above the candle's base.
    this.flame = { x: candle.x, y: candle.y - 13 * ZOOM };
    this.light = sb.light(this, {
      radius: 260,
      x: this.flame.x,
      y: this.flame.y,
      z: 40,
      color: '#ffb466',
      brightness: 1.6,
      ambient: 0.3,
    });

    // A soft glow on the floor round the flame, drawn additively under everything.
    this.glow = this.add
      .image(this.flame.x, candle.y - 6, glowTexture(this, 300))
      .setBlendMode(Phaser.BlendModes.ADD)
      .setDepth(-Infinity);

    // The slime is lit by the scene's lights: `{ lit: true }` draws it with its normal map.
    this.slime = this.add.spritebuddy(110, 210, 'slime', 'idle', { lit: true });
    this.slime.setScale(ZOOM);

    // Cursor keys move the slime; Space makes it jump.
    this.keys = this.input.keyboard.createCursorKeys();
    this.jumping = false;
    this.keys.space.on('down', () => {
      if (this.jumping) return;
      this.jumping = true;
      this.slime.play('jump');
    });
    this.slime.onComplete = () => {
      this.jumping = false; // "jump" plays once; update() picks idle or walk again
      this.slime.play(this.moving ? 'walk' : 'idle');
    };

    this.time0 = 0;
    this.showStatus();
    window.lightingExample = { slime: this.slime, light: this.light, candle, flame: this.flame }; // for the repo's tests
  }

  update(_time, delta) {
    const dt = delta / 1000;
    this.time0 += dt;
    const { slime, keys, light } = this;

    const dx = (keys.right.isDown ? 1 : 0) - (keys.left.isDown ? 1 : 0);
    const dy = (keys.down.isDown ? 1 : 0) - (keys.up.isDown ? 1 : 0);
    this.moving = dx !== 0 || dy !== 0;
    if (this.moving) {
      const step = (SPEED * dt) / Math.hypot(dx, dy);
      slime.x = Phaser.Math.Clamp(slime.x + dx * step, 40, WIDTH - 40);
      slime.y = Phaser.Math.Clamp(slime.y + dy * step, 70, HEIGHT - 10);
      // Face the way it goes. Lit sprites flip with setFlipX, not a negative scale, so the light
      // still comes from the right side.
      if (dx) slime.setFlipX(dx < 0);
    }
    if (!this.jumping) {
      const wanted = this.moving ? 'walk' : 'idle';
      if (slime.animation !== wanted) slime.play(wanted);
    }
    slime.setDepth(slime.y);

    // Flicker: change the light whenever you like; it takes effect on the next render.
    const t = this.time0;
    const flicker = 0.08 * Math.sin(t * 13) + 0.05 * Math.sin(t * 29 + 1.7);
    light.brightness = 1.6 + 1.5 * flicker;
    light.radius = 260 + 30 * flicker;
    this.glow.setAlpha(0.7 + 1.5 * flicker);

    this.showStatus();
  }

  /** Says how far off the candle is and which side it lights the slime from. */
  showStatus() {
    const { slime, flame, light } = this;
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
}

/** A round, soft, warm glow `size` pixels across, drawn on a 2D canvas; returns its key. */
function glowTexture(scene, size) {
  const texture = scene.textures.createCanvas('glow', size, size);
  const ctx = texture.getContext();
  const r = size / 2;
  const gradient = ctx.createRadialGradient(r, r, 0, r, r, r);
  gradient.addColorStop(0, 'rgba(255, 170, 80, 0.55)');
  gradient.addColorStop(0.4, 'rgba(255, 130, 50, 0.18)');
  gradient.addColorStop(1, 'rgba(255, 110, 40, 0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  texture.refresh();
  return 'glow';
}

new Phaser.Game({
  type: Phaser.WEBGL, // lit sprites need WebGL
  parent: 'lit-stage',
  width: WIDTH,
  height: HEIGHT,
  backgroundColor: '#0b0d14',
  pixelArt: true,
  scene: Candlelight,
});
