// Plays SpriteBuddy animations in PixiJS 8 with @spritebuddy/pixi. The same code works in
// PixiJS 5, 6 and 7, apart from how the Application starts (see the comment below).
import * as PIXI from 'pixi.js';
import { spriteBuddy } from '@spritebuddy/pixi';

const ZOOM = 6;
const status = document.getElementById('status');

// PixiJS 8 starts with `await app.init(...)`. In 5 to 7 it is `new PIXI.Application({...})`
// and the canvas is `app.view`.
const app = new PIXI.Application();
await app.init({ width: 480, height: 240, background: '#1d2430', antialias: false });
document.getElementById('stage').append(app.canvas);

// Pass your PixiJS in once; this is how one package serves every version from 5 to 8.
const sb = spriteBuddy(PIXI);

// Loads the runtime file and the sheet image beside it. Pixel art sampling is on by default.
const slimes = await sb.load(new URL('../assets/slime.anims.json', import.meta.url).href);

// The ground.
const ground = new PIXI.Graphics().rect(0, 200, 480, 40).fill('#2b3a2f');
app.stage.addChild(ground);

// A sprite is a Container whose origin is where the character stands (the frame pivot), so
// putting it on the ground is just setting x and y. It plays itself on PixiJS's shared ticker.
['idle', 'party', 'idle'].forEach((animation, i) => {
  const slime = slimes.sprite(animation);
  slime.x = 120 + i * 120;
  slime.y = 200;
  slime.scale.set(ZOOM);
  slime.speed = 0.8 + i * 0.2; // each breathes at its own pace

  // Click to hop; "hop" plays once, then onComplete puts the slime back to its own animation.
  slime.eventMode = 'static';
  slime.cursor = 'pointer';
  slime.hitArea = new PIXI.Rectangle(-8, -16, 16, 16); // in the sprite's own pixels
  slime.on('pointertap', () => {
    slime.play('hop');
    status.textContent = `Slime ${i + 1} hops`;
  });
  slime.onComplete = () => slime.play(animation);

  app.stage.addChild(slime);
});

status.textContent = `Loaded ${slimes.animations.length} animations: ${slimes.animations.join(', ')}`;
window.exampleReady = true; // for the repo's tests
