import * as cc from 'cc';
import {
  _decorator,
  clamp,
  Component,
  EventKeyboard,
  Input,
  input,
  KeyCode,
  Label,
  Vec3,
} from 'cc';
import { spriteBuddy, type SpriteBuddyLight, type SpriteBuddySprite } from '@spritebuddy/cocos';
import { statusLine } from './status';
const { ccclass } = _decorator;

const ZOOM = 5;
/** The slime's speed, in screen pixels a second. */
const SPEED = 110;
/** The flame is about 13 sheet pixels above the candle's base. */
const FLAME = 13;

/**
 * Real-time lighting with @spritebuddy/cocos: a candle's point light lights the slime through
 * its normal map, brighter the closer it gets and from whichever side the flame is on. The arrow
 * keys move the slime; Space makes it jump.
 *
 * Cocos Creator has no 2D lights of its own, so the package brings an effect
 * (assets/resources/spritebuddy/spritebuddy-lit.effect) and a light that drives it, with
 * SpriteBuddy Pro's own lighting sums. The file was exported from SpriteBuddy Pro with a normal
 * map (slime_n.png beside the sheet), which `sb.load` loads too.
 */
@ccclass('CandleDemo')
export class CandleDemo extends Component {
  private candle: SpriteBuddySprite | null = null;
  private slime: SpriteBuddySprite | null = null;
  private light: SpriteBuddyLight | null = null;
  private flame = new Vec3();
  private status: Label | null = null;
  private keys = new Set<KeyCode>();
  private jumping = false;
  private moving = false;
  private time = 0;

  async start() {
    const sb = spriteBuddy(cc);
    const [sheet, effect] = await Promise.all([sb.load('slime/slime.anims'), sb.loadEffect()]);

    // The candle stands in the middle. It makes the light rather than receiving it, so it isn't lit.
    const candle = sheet.sprite(this.node, 'candle');
    candle.node.setPosition(0, -10);
    candle.node.setScale(ZOOM, ZOOM);
    this.candle = candle;

    // A point light: give it a radius and it shines from (x, y), `z` pixels toward the viewer,
    // and fades out `radius` pixels away. Lights work in world space, so it takes the flame's
    // world position (update() keeps it there if the window changes size).
    this.findFlame();
    this.light = sb.light(effect, {
      radius: 260,
      x: this.flame.x,
      y: this.flame.y,
      z: 40,
      color: '#ffb466',
      brightness: 1.6,
      ambient: 0.3,
    });

    // `{ light }` draws the slime with its normal map, lit by that light.
    this.slime = sheet.sprite(this.node, 'idle', { light: this.light });
    this.slime.node.setPosition(-130, -60);
    this.slime.node.setScale(ZOOM, ZOOM);
    this.slime.onComplete = () => {
      this.jumping = false; // "jump" plays once; update() picks idle or walk again
    };

    this.status = statusLine(this.node);
    input.on(Input.EventType.KEY_DOWN, this.onKeyDown, this);
    input.on(Input.EventType.KEY_UP, this.onKeyUp, this);
  }

  onDestroy() {
    input.off(Input.EventType.KEY_DOWN, this.onKeyDown, this);
    input.off(Input.EventType.KEY_UP, this.onKeyUp, this);
  }

  private onKeyDown(event: EventKeyboard) {
    this.keys.add(event.keyCode);
    if (event.keyCode === KeyCode.SPACE && this.slime && !this.jumping) {
      this.jumping = true;
      this.slime.play('jump');
    }
  }

  private onKeyUp(event: EventKeyboard) {
    this.keys.delete(event.keyCode);
  }

  update(dt: number) {
    const { slime, light } = this;
    if (!slime || !light) return;
    this.time += dt;

    const down = (key: KeyCode) => (this.keys.has(key) ? 1 : 0);
    const dx = down(KeyCode.ARROW_RIGHT) - down(KeyCode.ARROW_LEFT);
    const dy = down(KeyCode.ARROW_UP) - down(KeyCode.ARROW_DOWN);
    this.moving = dx !== 0 || dy !== 0;
    if (this.moving) {
      const step = (SPEED * dt) / Math.hypot(dx, dy);
      const p = slime.node.position;
      slime.node.setPosition(clamp(p.x + dx * step, -260, 260), clamp(p.y + dy * step, -160, 120));
      // Face the way it goes. Flip lit sprites with flipX, not a negative scale, so the light
      // still comes from the right side.
      if (dx) slime.flipX = dx < 0;
    }
    if (!this.jumping) {
      const wanted = this.moving ? 'walk' : 'idle';
      if (slime.animation !== wanted) slime.play(wanted);
    }
    // Further up the screen is further away: draw the slime behind the candle there.
    slime.node.setSiblingIndex(slime.node.position.y > -10 ? 0 : this.node.children.length - 1);

    // Follow the flame (it only moves if the window does), and flicker: change the light whenever you like; it takes effect on the next frame.
    const t = this.time;
    const flicker = 0.08 * Math.sin(t * 13) + 0.05 * Math.sin(t * 29 + 1.7);
    this.findFlame();
    light.set({ x: this.flame.x, y: this.flame.y });
    light.brightness = 1.6 + 1.5 * flicker;
    light.radius = 260 + 30 * flicker;
    this.showStatus();
  }

  /** The flame's place in world space: the candle's base, raised to the flame. */
  private findFlame() {
    this.candle?.node.getWorldPosition(this.flame);
    this.flame.y += FLAME * ZOOM;
  }

  /** Says how far off the candle is and which side it lights the slime from. */
  private showStatus() {
    const { slime, light, status } = this;
    if (!slime || !light || !status) return;
    const at = slime.node.getWorldPosition();
    const x = this.flame.x - at.x;
    const y = this.flame.y - (at.y + 5 * ZOOM); // from the slime's middle, y up
    const distance = Math.round(Math.hypot(x, y));
    if (distance > light.radius) {
      status.string = `The candle is ${distance} px away: out of reach`;
      return;
    }
    const side =
      Math.abs(x) > Math.abs(y) ? (x > 0 ? 'the right' : 'the left') : y > 0 ? 'above' : 'below';
    status.string = `The candle is ${distance} px away, lighting the slime from ${side}`;
  }
}
