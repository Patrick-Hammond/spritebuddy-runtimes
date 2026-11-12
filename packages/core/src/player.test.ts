import { describe, expect, it, vi } from 'vitest';
import { parseFile } from './parse';
import { Player } from './player';
import { boundsOf, partsOf } from './resolve';
import { cycleDuration, cycleOrder, eventsBetween, frameAt } from './timing';

const file = parseFile({
  format: 'spritebuddy-animations',
  version: 3,
  image: 'hero.png',
  size: [64, 32],
  frames: [
    { name: 'a', rect: [0, 0, 16, 32] },
    { name: 'b', rect: [16, 0, 16, 32] },
    { name: 'c', rect: [32, 0, 16, 32] },
  ],
  animations: [
    { name: 'walk', frames: [0, 1, 2] },
    { name: 'hit', loop: 'once', frames: [0, { frame: 1, duration: 50 }] },
    { name: 'none', frames: [] },
    {
      name: 'armed',
      frames: [
        {
          frame: 0,
          offset: [1, 2],
          layers: [
            { frame: 2, x: 10, y: -4, z: -1 },
            { frame: 1, x: -3 },
          ],
        },
      ],
    },
  ],
});
const anim = (name: string) => file.animations.find((a) => a.name === name)!;

describe('timing', () => {
  it('orders a cycle', () => {
    expect(cycleOrder({ loop: 'pingpong', frames: anim('walk').frames })).toEqual([0, 1, 2, 1]);
    expect(cycleDuration({ loop: 'pingpong', frames: anim('walk').frames })).toBe(400);
    expect(cycleDuration(anim('walk'))).toBe(300);
  });

  it('finds frames, with negative times at the start and empty animations at -1', () => {
    expect(frameAt(anim('walk'), -5)).toEqual({ index: 0, done: false });
    expect(frameAt(anim('walk'), 299)).toEqual({ index: 2, done: false });
    expect(frameAt(anim('walk'), 300)).toEqual({ index: 0, done: false });
    expect(frameAt(anim('hit'), 150)).toEqual({ index: 1, done: true });
    expect(frameAt(anim('none'), 0)).toEqual({ index: -1, done: true });
  });
});

describe('partsOf and boundsOf', () => {
  it('stacks layers by z around the pivot, moved by the offset', () => {
    const parts = partsOf(file, anim('armed').frames[0]!);
    expect(parts.map((p) => [p.frame.name, p.x, p.y])).toEqual([
      ['c', -7 + 10 - 0, -30 - 4],
      ['a', -7, -30],
      ['b', -10, -30],
    ]);
    expect(boundsOf(parts)).toEqual({ x: -10, y: -34, w: 29, h: 36 });
    expect(boundsOf([])).toEqual({ x: 0, y: 0, w: 0, h: 0 });
  });
});

describe('Player', () => {
  it('plays, reports frames and stops once a "once" animation ends', () => {
    const onFrame = vi.fn();
    const onComplete = vi.fn();
    const player = new Player(file, { onFrame, onComplete });
    expect(player.names).toEqual(['walk', 'hit', 'none', 'armed']);
    expect(player.state).toMatchObject({ animation: null, index: -1, parts: [] });
    player.update(100); // nothing playing yet
    expect(player.state.time).toBe(0);

    player.play('hit');
    expect(onFrame).toHaveBeenLastCalledWith(0);
    player.update(99);
    expect(player.state.index).toBe(0);
    player.update(1);
    expect(onFrame).toHaveBeenLastCalledWith(1);
    expect(player.parts[0]!.frame.name).toBe('b');
    player.update(60);
    expect(player.state).toMatchObject({ index: 1, done: true });
    expect(player.playing).toBe(false);
    expect(onComplete).toHaveBeenCalledTimes(1);
    player.update(500);
    expect(player.state.time).toBe(160);
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it('loops with speed, seeks, stops and ignores negative steps', () => {
    const player = new Player(file).play('walk', 250);
    expect(player.state.index).toBe(2);
    player.speed = 2;
    player.update(50);
    expect(player.state).toMatchObject({ index: 0, time: 350 });
    player.update(-10);
    expect(player.state.time).toBe(350);
    player.stop().update(100);
    expect(player.state.time).toBe(350);
    player.seek(-20);
    expect(player.state.time).toBe(0);
    expect(player.animation('walk')).toBe(anim('walk'));
  });

  it('plays an empty animation as nothing, and refuses unknown names', () => {
    const player = new Player(file).play('none');
    expect(player.parts).toEqual([]);
    expect(player.state.done).toBe(true);
    expect(() => player.play('run')).toThrow(
      'No animation "run"; this file has "walk", "hit", "none", "armed"',
    );
    const empty = new Player({ ...file, animations: [] });
    expect(() => empty.play('run')).toThrow('this file has none');
    expect(empty.seek(10).state.time).toBe(10);
  });
});

describe('frame events', () => {
  const evented = parseFile({
    format: 'spritebuddy-animations',
    version: 3,
    image: 'hero.png',
    size: [64, 32],
    frames: [
      { name: 'a', rect: [0, 0, 16, 32] },
      { name: 'b', rect: [16, 0, 16, 32] },
      { name: 'c', rect: [32, 0, 16, 32] },
    ],
    animations: [
      {
        name: 'swing',
        loop: 'once',
        frames: [
          { frame: 0, events: ['windup'] },
          { frame: 1, duration: 20, events: ['hit', 'shake'] },
          2,
        ],
      },
      { name: 'step', frames: [{ frame: 0, events: ['step'] }, 1, { frame: 2, events: ['step'] }] },
      { name: 'bob', loop: 'pingpong', frames: [{ frame: 0, events: ['up'] }, 1, 2] },
      { name: 'plain', frames: [0, 1] },
    ],
  });
  const a = (name: string) => evented.animations.find((x) => x.name === name)!;
  const names = (list: { name: string; index: number }[]) =>
    list.map((e) => `${e.name}@${e.index}`);

  it('reads events, defaulting to none', () => {
    expect(a('swing').frames.map((f) => f.events)).toEqual([['windup'], ['hit', 'shake'], []]);
    expect(a('plain').frames[0]!.events).toEqual([]);
  });

  it('fires the frames that start in (from, to], even ones a long tick skips', () => {
    expect(names(eventsBetween(a('swing'), 0, 100))).toEqual(['hit@1', 'shake@1']);
    expect(names(eventsBetween(a('swing'), 99, 100))).toEqual(['hit@1', 'shake@1']);
    expect(eventsBetween(a('swing'), 100, 119)).toEqual([]);
    expect(names(eventsBetween(a('swing'), 50, 500))).toEqual(['hit@1', 'shake@1']);
    expect(eventsBetween(a('swing'), 300, 900)).toEqual([]); // a once animation doesn't repeat
    expect(eventsBetween(a('swing'), 10, 10)).toEqual([]);
    expect(eventsBetween(a('plain'), 0, 1000)).toEqual([]);
    expect(eventsBetween({ loop: 'loop', frames: [] }, 0, 10)).toEqual([]);
  });

  it('repeats on loops and on the way back of a ping-pong, at most one cycle per call', () => {
    expect(names(eventsBetween(a('step'), 0, 300))).toEqual(['step@2', 'step@0']);
    expect(names(eventsBetween(a('step'), 250, 1_000_000))).toEqual(['step@2', 'step@0']);
    // bob plays 0 1 2 1, 400 ms a cycle; frame 0 shows once a cycle.
    expect(names(eventsBetween(a('bob'), 0, 400))).toEqual(['up@0']);
    expect(names(eventsBetween(a('bob'), 0, 800))).toEqual(['up@0']); // capped at one cycle
    expect(names(eventsBetween(a('bob'), 399, 400))).toEqual(['up@0']);
  });

  it('lets a Player report events after the frame and before completion', () => {
    const log: string[] = [];
    const player = new Player(evented, {
      onFrame: (i) => log.push(`frame ${i}`),
      onEvent: (name, i) => log.push(`${name} ${i} showing ${player.state.index}`),
      onComplete: () => log.push('done'),
    });
    player.play('swing');
    expect(log).toEqual(['frame 0', 'windup 0 showing 0']);
    log.length = 0;
    player.update(500);
    expect(log).toEqual(['frame 2', 'hit 1 showing 2', 'shake 1 showing 2', 'done']);
    log.length = 0;
    player.play('step', 150).seek(0).update(50);
    expect(log).toEqual(['frame 1', 'frame 0']); // seek doesn't fire, and frame 1 has none
    player.update(150);
    expect(log).toEqual(['frame 1', 'frame 0', 'frame 2', 'step 2 showing 2']);
    log.length = 0;
    player.update(100);
    expect(log).toEqual(['frame 0', 'step 0 showing 0']);
    log.length = 0;
    player.play('plain');
    expect(log).toEqual(['frame 0']);
  });

  it('skips the work without a listener', () => {
    const player = new Player(evented).play('step');
    player.update(250);
    expect(player.state.index).toBe(2);
  });
});
