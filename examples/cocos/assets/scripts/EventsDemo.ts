import * as cc from 'cc';
import {
  _decorator,
  AudioClip,
  AudioSource,
  Component,
  EventKeyboard,
  Input,
  input,
  KeyCode,
  Label,
  resources,
} from 'cc';
import { spriteBuddy, type SpriteBuddySprite } from '@spritebuddy/cocos';
import { statusLine } from './status';
const { ccclass } = _decorator;

const ZOOM = 6;
/** The slime's walking speed, in screen pixels a second. */
const SPEED = 70;
/** How far it walks either side of the middle. */
const EDGE = 300;

/** Loads a sound from assets/resources/sounds/. */
function sound(name: string): Promise<AudioClip> {
  return new Promise((resolve, reject) =>
    resources.load(`sounds/${name}`, AudioClip, (error, clip) =>
      error ? reject(error) : resolve(clip),
    ),
  );
}

/**
 * Frame events with @spritebuddy/cocos: sounds that play on the frame they belong to. In
 * SpriteBuddy, events are names tagged on animation frames; this file has "step" on the walk's
 * squash, "leap" as the jump leaves the ground and "land" as it comes down. The slime walks to
 * and fro, squelching on every step. Click or press Space to make it jump.
 *
 * Browsers only play sound after a click or a key press, so the first steps are silent until
 * then.
 */
@ccclass('EventsDemo')
export class EventsDemo extends Component {
  private slime: SpriteBuddySprite | null = null;
  private status: Label | null = null;
  private heard: string[] = [];
  private steps = 0;
  private jumping = false;

  async start() {
    const sb = spriteBuddy(cc);
    const [sheet, step, leap, land] = await Promise.all([
      sb.load('slime/slime.anims'),
      sound('step'),
      sound('leap'),
      sound('land'),
    ]);
    const audio = this.node.addComponent(AudioSource);
    const clips: Record<string, AudioClip> = { step, leap, land };

    const slime = sheet.sprite(this.node, 'walk');
    slime.node.setPosition(0, -40);
    slime.node.setScale(ZOOM, ZOOM);
    this.slime = slime;

    // Every event, as its frame starts showing: play the sound with the event's name.
    slime.onEvent = (name, frame) => {
      const clip = clips[name];
      if (clip) audio.playOneShot(clip, name === 'step' ? 0.6 : 1);
      this.heard = [...this.heard.slice(-3), `${name} (frame ${frame})`];
      this.showStatus();
    };
    // Or listen for one event on the node: "event:<name>".
    slime.node.on('event:step', () => this.steps++);
    // "jump" plays once; then the slime walks on.
    slime.onComplete = () => {
      this.jumping = false;
      slime.play('walk');
    };

    this.status = statusLine(this.node);
    this.showStatus();
    input.on(Input.EventType.TOUCH_START, this.jump, this);
    input.on(Input.EventType.KEY_DOWN, this.onKey, this);
  }

  onDestroy() {
    input.off(Input.EventType.TOUCH_START, this.jump, this);
    input.off(Input.EventType.KEY_DOWN, this.onKey, this);
  }

  private onKey(event: EventKeyboard) {
    if (event.keyCode === KeyCode.SPACE) this.jump();
  }

  private jump() {
    if (!this.slime || this.jumping) return;
    this.jumping = true;
    this.slime.play('jump');
  }

  update(dt: number) {
    const slime = this.slime;
    if (!slime || this.jumping) return;
    // Walk to one edge, turn round, walk to the other.
    const dir = slime.flipX ? -1 : 1;
    const x = slime.node.position.x + dir * SPEED * dt;
    if (Math.abs(x) > EDGE) slime.flipX = !slime.flipX;
    slime.node.setPosition(Math.max(-EDGE, Math.min(EDGE, x)), -40);
  }

  private showStatus() {
    if (!this.status) return;
    const heard = this.heard.length ? this.heard.join(', ') : 'nothing yet';
    this.status.string = `Click or press Space to jump. ${this.steps} steps. Heard: ${heard}`;
  }
}
