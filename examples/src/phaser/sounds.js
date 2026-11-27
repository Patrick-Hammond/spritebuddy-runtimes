// Plays a sound on a frame event in Phaser 4 with @spritebuddy/phaser. In SpriteBuddy, the jump's
// take-off frame has the event "jump" and its landing frame has "land"; the sprite tells you as
// each of those frames starts showing, so the sound is always in time with the art, whatever
// the animation's speed. Click the slime (or press Space) to jump. Works in Phaser 3.60 and later.
import Phaser from 'phaser';
import { spriteBuddy } from '@spritebuddy/phaser';

const ZOOM = 6;
const status = document.getElementById('status');

spriteBuddy(Phaser);

class Sounds extends Phaser.Scene {
  preload() {
    // The same slime, exported with frame events on its jump, and the two sounds, loaded the
    // usual Phaser way.
    this.load.spritebuddy(
      'slime',
      new URL('./assets/slime_sounds.anims.json', import.meta.url).href,
    );
    for (const name of ['jump', 'land'])
      this.load.audio(name, new URL(`./assets/sounds/${name}.wav`, import.meta.url).href);
  }

  create() {
    this.add.rectangle(0, 200, 480, 40, 0x2b3a2f).setOrigin(0, 0);

    const slime = this.add.spritebuddy(240, 200, 'slime', 'idle');
    slime.setScale(ZOOM);

    // The frame events. Each event's name is also a sound's name here, so one line plays them
    // all. `slime.on('event:land', ...)` listens for one event by name instead.
    const heard = [];
    slime.on('event', (name) => {
      if (this.cache.audio.exists(name)) this.sound.play(name);
      heard.push(name);
      status.textContent = `♪ ${name}`;
    });

    // Phaser starts its sound on the first click or key press by itself.
    const jump = () => {
      if (slime.animation !== 'jump') slime.play('jump');
    };
    slime.onComplete = () => slime.play('idle');

    slime.setInteractive({
      hitArea: new Phaser.Geom.Rectangle(-8, -13, 16, 13), // in the sprite's own pixels
      hitAreaCallback: Phaser.Geom.Rectangle.Contains,
      useHandCursor: true,
    });
    slime.on('pointerdown', jump);
    this.input.keyboard.on('keydown-SPACE', jump);

    status.textContent = 'Click the slime (or press Space) to jump';
    window.soundsExample = { slime, heard }; // for the repo's tests
    window.exampleReady = true;
  }
}

new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'stage',
  width: 480,
  height: 240,
  backgroundColor: '#1d2430',
  pixelArt: true,
  scene: Sounds,
});
