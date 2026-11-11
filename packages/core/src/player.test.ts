import { describe, expect, it, vi } from 'vitest';
import { parseFile } from './parse';
import { Player } from './player';
import { boundsOf, partsOf } from './resolve';
import { cycleDuration, cycleOrder, frameAt } from './timing';

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
