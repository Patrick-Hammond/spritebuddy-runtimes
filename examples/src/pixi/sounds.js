// Plays a sound on a frame event in PixiJS 8 with @spritebuddy/pixi. In SpriteBuddy, the jump's
// take-off frame has the event "jump" and its landing frame has "land"; the sprite tells you as
// each of those frames starts showing, so the sound is always in time with the art, whatever
// the animation's speed. Click the slime (or press Space) to jump.
//
// PixiJS has no sound of its own, so this uses the browser's Web Audio. @pixi/sound, Howler or
// any other player works the same way: call it from the event.
import * as PIXI from 'pixi.js';
import { spriteBuddy } from '@spritebuddy/pixi';

const ZOOM = 6;
const status = document.getElementById('status');

const app = new PIXI.Application();
await app.init({ width: 480, height: 240, background: '#1d2430', antialias: false });
document.getElementById('stage').append(app.canvas);

const sb = spriteBuddy(PIXI);
// The same slime, exported with frame events on its jump.
const sheet = await sb.load(new URL('./assets/slime_sounds.anims.json', import.meta.url).href);

// Each sound is loaded once and decoded, ready to play as often as it's needed.
const audio = new AudioContext();
const sounds = {};
for (const name of ['jump', 'land']) {
  const url = new URL(`./assets/sounds/${name}.wav`, import.meta.url);
  const bytes = await (await fetch(url)).arrayBuffer();
  sounds[name] = await audio.decodeAudioData(bytes);
}
function play(name) {
  const source = audio.createBufferSource();
  source.buffer = sounds[name];
  source.connect(audio.destination);
  source.start();
}

app.stage.addChild(new PIXI.Graphics().rect(0, 200, 480, 40).fill('#2b3a2f'));

const slime = sheet.sprite('idle');
slime.x = 240;
slime.y = 200;
slime.scale.set(ZOOM);
app.stage.addChild(slime);

// The frame events. Each event's name is also a sound's name here, so one line plays them all.
// `slime.on('event:land', ...)` listens for one event by name instead.
const heard = [];
slime.onEvent = (name) => {
  if (sounds[name]) play(name);
  heard.push(name);
  status.textContent = `♪ ${name}`;
};

function jump() {
  // Browsers only start sound after the page is clicked or a key is pressed: this is that moment.
  audio.resume();
  if (slime.animation !== 'jump') slime.play('jump');
}
slime.onComplete = () => slime.play('idle');

slime.eventMode = 'static';
slime.cursor = 'pointer';
slime.hitArea = new PIXI.Rectangle(-8, -13, 16, 13); // in the sprite's own pixels
slime.on('pointertap', jump);
addEventListener('keydown', (e) => {
  if (e.code === 'Space') {
    e.preventDefault();
    jump();
  }
});

status.textContent = 'Click the slime (or press Space) to jump';
window.soundsExample = { slime, heard }; // for the repo's tests
window.exampleReady = true;
