import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseFile } from './parse';
import { partsOf } from './resolve';
import { cycleDuration, eventsBetween, frameAt } from './timing';
import type { AnimationDef, SpriteBuddyFile } from './types';

/**
 * The golden tables every runtime is tested against: for each fixture, which frame shows at a
 * set of times and where each part is drawn. Run with UPDATE_FIXTURES=1 to rewrite them after a
 * deliberate change, then check the diff by hand.
 */
const DIR = join(__dirname, '../../../fixtures');

/** Every frame boundary, the ms before it, over two and a half cycles, plus a far-off time. */
function sampleTimes(anim: AnimationDef): number[] {
  const total = cycleDuration(anim);
  if (total === 0) return [0, 1000];
  const times = new Set<number>([0]);
  for (let t = 0, i = 0; t <= total * 2.5; i++) {
    const order = anim.frames.length;
    t += anim.frames[Math.min(i % Math.max(order, 1), order - 1)]!.duration;
    times.add(t - 1);
    times.add(t);
  }
  // Pingpong boundaries differ from the forward ones, so add every 10 ms of a cycle too.
  for (let t = 0; t < total * 2; t += 10) times.add(t);
  times.add(1_000_003);
  return [...times].sort((a, b) => a - b);
}

/**
 * Ticks for the event tables: 30 ms steps over two and a half cycles (so ticks straddle frame
 * starts), then one long tick that skips several cycles.
 */
function eventTicks(anim: AnimationDef): [number, number][] {
  const total = cycleDuration(anim);
  const ticks: [number, number][] = [];
  for (let t = 0; t < total * 2.5; t += 30) ticks.push([t, t + 30]);
  ticks.push([total * 2.5, total * 10 + 1]);
  return ticks;
}

export function goldenTable(file: SpriteBuddyFile) {
  return file.animations.map((anim) => ({
    animation: anim.name,
    // Only animations with events get an event table, so older fixtures stay as they were.
    ...(anim.frames.some((f) => f.events.length > 0)
      ? {
          events: eventTicks(anim).map(([from, to]) => ({
            from,
            to,
            fired: eventsBetween(anim, from, to).map((e) => [e.name, e.index]),
          })),
        }
      : {}),
    checks: sampleTimes(anim).map((time) => {
      const pos = frameAt(anim, time);
      return {
        time,
        index: pos.index,
        done: pos.done,
        parts:
          pos.index < 0
            ? []
            : partsOf(file, anim.frames[pos.index]!).map((p) => ({
                frame: p.frame.name,
                x: p.x,
                y: p.y,
                ...(p.opacity !== 1 ? { opacity: p.opacity } : {}),
                ...(p.flipX ? { flipX: true } : {}),
                ...(p.flipY ? { flipY: true } : {}),
              })),
      };
    }),
  }));
}

const fixtures = readdirSync(DIR).filter((f) => f.endsWith('.anims.json'));

describe('golden fixtures', () => {
  it('has fixtures', () => expect(fixtures.length).toBeGreaterThanOrEqual(4));

  for (const name of fixtures) {
    it(`${name} plays as its expected table says`, () => {
      const file = parseFile(JSON.parse(readFileSync(join(DIR, name), 'utf8')));
      const table = { fixture: name, animations: goldenTable(file) };
      const expectedPath = join(DIR, name.replace('.anims.json', '.expected.json'));
      if (process.env.UPDATE_FIXTURES || !existsSync(expectedPath)) {
        writeFileSync(expectedPath, `${JSON.stringify(table, null, 1)}\n`);
      }
      expect(table).toEqual(JSON.parse(readFileSync(expectedPath, 'utf8')));
    });
  }
});
