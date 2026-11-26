// Plays SpriteBuddy animations in Phaser 4 with @spritebuddy/phaser. The same code works in
// Phaser 3.60 and later.
import Phaser from 'phaser';
import { spriteBuddy } from '@spritebuddy/phaser';

const ZOOM = 6;
const status = document.getElementById('status');

// Pass your Phaser in once. This also adds `this.load.spritebuddy` and `this.add.spritebuddy`
// to every scene.
spriteBuddy(Phaser);

class Slimes extends Phaser.Scene {
  preload() {
    // Loads the runtime file, then the sheet image (and normal map) it names, from beside it.
    // Both end up under the one key: the texture and the JSON.
    this.load.spritebuddy('slime', new URL('../assets/slime.anims.json', import.meta.url).href);
  }

  create() {
    // The ground.
    this.add.rectangle(0, 200, 480, 40, 0x2b3a2f).setOrigin(0, 0);

    // A sprite is a Container whose origin is where the character stands (the frame pivot), so
    // putting it on the ground is just its x and y. It plays itself on the scene's clock.
    const slimes = ['idle', 'party', 'idle'].map((animation, i) => {
      const slime = this.add.spritebuddy(120 + i * 120, 200, 'slime', animation);
      slime.setScale(ZOOM);
      slime.speed = 0.8 + i * 0.2; // each breathes at its own pace

      // Click to jump; "jump" plays once, then onComplete puts the slime back to its own animation.
      // The hit area is in the sprite's own pixels, around its origin.
      slime.setInteractive({
        hitArea: new Phaser.Geom.Rectangle(-8, -13, 16, 13),
        hitAreaCallback: Phaser.Geom.Rectangle.Contains,
        useHandCursor: true,
      });
      slime.on('pointerdown', () => {
        slime.play('jump');
        status.textContent = `Slime ${i + 1} jumps`;
      });
      slime.onComplete = () => slime.play(animation);
      return slime;
    });

    const names = slimes[0].sheet.animations;
    status.textContent = `Loaded ${names.length} animations: ${names.join(', ')}`;
    window.exampleReady = true; // for the repo's tests
  }
}

new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'stage',
  width: 480,
  height: 240,
  backgroundColor: '#1d2430',
  pixelArt: true,
  scene: Slimes,
});
