import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseFile } from '@spritebuddy/core';
// @ts-expect-error: a plain script with no types
import { compressUuid, DEMOS, HELPERS, scene } from './cocos/tools/make-scenes.mjs';

/**
 * Keeps the Cocos Creator example project in step: Cocos Creator itself can't run here, so this
 * checks what it will read.
 */
const COCOS = join(__dirname, 'cocos');
const read = (path: string) => readFileSync(join(COCOS, path));
const json = (path: string) => JSON.parse(read(path).toString('utf8'));

describe('the Cocos example', () => {
  it('plays the shared slime, with frame events added for the sounds', () => {
    const shared = JSON.parse(readFileSync(join(__dirname, 'assets/slime.anims.json'), 'utf8'));
    const copy = json('assets/resources/slime/slime.anims.json');
    const withoutEvents = (file: any) => ({
      ...file,
      animations: file.animations.map((a: any) => ({
        ...a,
        frames: a.frames.map((f: any) => {
          if (typeof f === 'number' || !f.events) return f;
          const { events: _, ...rest } = f;
          return Object.keys(rest).length === 1 ? rest.frame : rest;
        }),
      })),
    });
    expect(withoutEvents(copy)).toEqual(withoutEvents(shared));
    for (const name of ['slime.png', 'slime_n.png']) {
      expect(
        read(`assets/resources/slime/${name}`).equals(
          readFileSync(join(__dirname, 'assets', name)),
        ),
        name,
      ).toBe(true);
    }
  });

  it('has a sound for every frame event', () => {
    const file = parseFile(json('assets/resources/slime/slime.anims.json'));
    const events = new Set(file.animations.flatMap((a) => a.frames.flatMap((f) => f.events)));
    expect([...events].sort()).toEqual(['land', 'leap', 'step']);
    const sounds = readdirSync(join(COCOS, 'assets/resources/sounds')).filter((f) =>
      f.endsWith('.wav'),
    );
    expect(sounds.map((f) => f.replace('.wav', '')).sort()).toEqual([...events].sort());
    for (const s of sounds)
      expect(read(`assets/resources/sounds/${s}`).toString('ascii', 0, 4)).toBe('RIFF');
  });

  it('compresses uuids the way Cocos Creator reads them back', () => {
    // The engine's decodeUuid: two base-64 digits back into three hex digits, after the head.
    const BASE64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
    const decode = (short: string, keep: number) => {
      let hex = short.slice(0, keep);
      for (let i = keep; i < short.length; i += 2) {
        const lhs = BASE64.indexOf(short[i]!);
        const rhs = BASE64.indexOf(short[i + 1]!);
        hex += [lhs >> 2, ((lhs & 3) << 2) | (rhs >> 4), rhs & 0xf]
          .map((v) => v.toString(16))
          .join('');
      }
      return hex;
    };
    for (const demo of DEMOS) {
      const hex = demo.scriptUuid.replace(/-/g, '');
      const short = compressUuid(demo.scriptUuid);
      expect(short).toHaveLength(23);
      expect(decode(short, 5)).toBe(hex);
      expect(compressUuid(demo.scriptUuid, 2)).toHaveLength(22);
      expect(decode(compressUuid(demo.scriptUuid, 2), 2)).toBe(hex);
    }
  });

  it('has a scene per demo, running its script', () => {
    for (const demo of DEMOS) {
      // Cocos Creator rewrites a scene when it saves it, so this checks what matters rather
      // than every field: the scene's id, a Canvas with a camera, and the demo's component.
      const saved = json(`assets/scenes/${demo.scene}.scene`);
      const types = saved.map((o: any) => o.__type__);
      expect(types).toEqual(expect.arrayContaining(['cc.Scene', 'cc.Canvas', 'cc.Camera']));
      expect(saved.find((o: any) => o.__type__ === 'cc.Scene')._id).toBe(demo.sceneUuid);
      expect(json(`assets/scenes/${demo.scene}.scene.meta`).uuid).toBe(demo.sceneUuid);
      const meta = json(`assets/scripts/${demo.script}.ts.meta`);
      expect(meta.uuid).toBe(demo.scriptUuid);
      expect(types).toContain(compressUuid(meta.uuid));
      const source = read(`assets/scripts/${demo.script}.ts`).toString('utf8');
      expect(source).toContain(`@ccclass('${demo.script}')`);
      expect(source).toContain(`export class ${demo.script} extends Component`);
    }
  });

  it('writes scenes whose every reference points inside the scene', () => {
    for (const demo of DEMOS) {
      const objects = scene(demo);
      const refs = JSON.stringify(objects)
        .match(/"__id__":\d+/g)!
        .map((r) => +r.split(':')[1]!);
      for (const r of refs) expect(r).toBeLessThan(objects.length);
      // Every component's node lists it, and every child's parent lists it.
      objects.forEach((o: any, i: number) => {
        if (o.node) expect(objects[o.node.__id__]._components).toContainEqual({ __id__: i });
        if (o._parent) expect(objects[o._parent.__id__]._children).toContainEqual({ __id__: i });
      });
    }
  });

  it('gives every script a .meta and imports only cc, the package and its own files', () => {
    const scripts = readdirSync(join(COCOS, 'assets/scripts')).filter((f) => f.endsWith('.ts'));
    const named = [...DEMOS, ...HELPERS].map((d: any) => `${d.script}.ts`);
    expect(scripts.sort()).toEqual(named.sort());
    for (const file of scripts) {
      const source = read(`assets/scripts/${file}`).toString('utf8');
      const from = [...source.matchAll(/from '([^']+)'/g)].map((m) => m[1]!);
      for (const f of from)
        expect(['cc', '@spritebuddy/cocos'].includes(f) || f.startsWith('./'), f).toBe(true);
    }
  });

  it('loads what is in its resources folder', () => {
    const sources = readdirSync(join(COCOS, 'assets/scripts'))
      .filter((f) => f.endsWith('.ts'))
      .map((f) => read(`assets/scripts/${f}`).toString('utf8'))
      .join('\n');
    expect(sources).toContain("sb.load('slime/slime.anims')");
    expect(sources).toContain('sb.loadEffect()');
    expect(read('assets/resources/spritebuddy/spritebuddy-lit.effect').length).toBeGreaterThan(0);
  });
});
