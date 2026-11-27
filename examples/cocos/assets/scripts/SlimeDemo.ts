import * as cc from 'cc';
import { _decorator, Component, EventKeyboard, EventTouch, Input, input, KeyCode, Vec3 } from 'cc';
import { boundsOf, spriteBuddy, type SpriteBuddySprite } from '@spritebuddy/cocos';
import { statusLine } from './status';
const { ccclass } = _decorator;

/** Sheet pixels per screen pixel: the slime is drawn at 6x, crisp. */
const ZOOM = 6;

/**
 * The SpriteBuddy example for Cocos Creator: three slimes from one sheet. The one on the right
 * wears a hat drawn as a live layer. Click a slime to make it jump; Space makes them all jump.
 *
 * It needs the files in assets/resources/slime/ (an export from SpriteBuddy Pro: slime.png and
 * slime.anims.json) and nothing in the scene but this component on a node under the Canvas.
 */
@ccclass('SlimeDemo')
export class SlimeDemo extends Component {
  private slimes: SpriteBuddySprite[] = [];
  /** Each slime's own animation, to go back to after a jump. */
  private home = new Map<SpriteBuddySprite, string>();

  async start() {
    const sb = spriteBuddy(cc);
    // Loads assets/resources/slime/slime.anims.json, then slime.png from beside it.
    const sheet = await sb.load('slime/slime.anims');

    // Each sprite is a new node under this one; its position is where the slime stands.
    const places: [number, string][] = [
      [-220, 'idle'],
      [0, 'walk'],
      [220, 'party'], // the hat is a live layer, drawn with each frame
    ];
    for (const [x, animation] of places) {
      const slime = sheet.sprite(this.node, animation);
      slime.node.setPosition(x, -40);
      slime.node.setScale(ZOOM, ZOOM);
      this.home.set(slime, animation);
      // "jump" plays once; then the slime goes back to what it was doing.
      slime.onComplete = () => slime.play(this.home.get(slime)!);
      this.slimes.push(slime);
    }

    statusLine(this.node, 'Click a slime to make it jump, or press Space');
    input.on(Input.EventType.TOUCH_START, this.onTouch, this);
    input.on(Input.EventType.KEY_DOWN, this.onKey, this);
  }

  onDestroy() {
    input.off(Input.EventType.TOUCH_START, this.onTouch, this);
    input.off(Input.EventType.KEY_DOWN, this.onKey, this);
  }

  private onKey(event: EventKeyboard) {
    if (event.keyCode === KeyCode.SPACE) for (const slime of this.slimes) slime.play('jump');
  }

  private onTouch(event: EventTouch) {
    const at = event.getUILocation();
    for (const slime of this.slimes) {
      // The click in the slime's own sheet pixels (y up), and the frame's box (y down).
      const local = slime.node.inverseTransformPoint(new Vec3(), new Vec3(at.x, at.y, 0));
      const box = boundsOf(slime.player.parts);
      const inside =
        local.x >= box.x &&
        local.x <= box.x + box.w &&
        -local.y >= box.y &&
        -local.y <= box.y + box.h;
      if (inside) slime.play('jump');
    }
  }
}
