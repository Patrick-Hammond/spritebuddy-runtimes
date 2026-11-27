import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseFile } from '@spritebuddy/core';
// @ts-expect-error: a plain script, without types
import { check } from '../scripts/unity-project.mjs';

/**
 * Keeps the Unity package and example project whole. The C# itself is tested with dotnet
 * (unity/tests/Core) and compiled against Unity's API (unity/tests/Compile); see unity/README.md.
 */
const ROOT = join(__dirname, '..');
const read = (path: string) => readFileSync(join(ROOT, path));
const ART = 'unity/examples/Assets/SpriteBuddyExamples/Art';

describe('the Unity package and example project', () => {
  it('have a meta with a stable GUID beside every file and folder, and every scene', () => {
    expect(check()).toEqual([]);
  });

  it("play the browser examples' slime, with frame events added", () => {
    for (const name of ['slime.png', 'slime_n.png']) {
      expect(read(`${ART}/${name}`).equals(read(`examples/assets/${name}`)), name).toBe(true);
    }
    const unity = JSON.parse(read(`${ART}/slime.anims.json`).toString('utf8'));
    const shared = JSON.parse(read('examples/assets/slime.anims.json').toString('utf8'));
    const events = (name: string) =>
      parseFile(unity)
        .animations.find((a) => a.name === name)!
        .frames.flatMap((f, i) => f.events.map((e) => `${e}@${i}`));
    expect(events('walk')).toEqual(['squelch@0']);
    expect(events('jump')).toEqual(['hop@2', 'land@8']);
    // Apart from the events (and the sheet JSON it doesn't ship), it's the same file.
    const strip = (file: { animations: { frames: unknown[] }[] }) =>
      file.animations.map((a) =>
        a.frames.map((f) => {
          if (typeof f !== 'object' || f === null) return f;
          const { events: _, ...rest } = f as Record<string, unknown>;
          return Object.keys(rest).length === 1 ? rest.frame : rest;
        }),
      );
    expect(strip(unity)).toEqual(strip(shared));
    const { sheet: _, animations: __, ...sharedTop } = shared;
    const { animations: ___, ...unityTop } = unity;
    expect(unityTop).toEqual(sharedTop);
  });

  it('have the frame event sounds as WAV files', () => {
    for (const name of ['squelch', 'hop', 'land']) {
      const wav = read(`unity/examples/Assets/SpriteBuddyExamples/Audio/${name}.wav`);
      expect(
        wav.subarray(0, 4).toString('latin1') + wav.subarray(8, 12).toString('latin1'),
        name,
      ).toBe('RIFFWAVE');
    }
  });

  it('install from the package folder', () => {
    const pkg = JSON.parse(read('unity/com.spritebuddy.runtime/package.json').toString('utf8'));
    expect(pkg.name).toBe('com.spritebuddy.runtime');
    expect(pkg.unity).toBe('6000.0');
    const changelog = read('unity/com.spritebuddy.runtime/CHANGELOG.md').toString('utf8');
    expect(changelog).toContain(`## ${pkg.version}`);
    const manifest = JSON.parse(read('unity/examples/Packages/manifest.json').toString('utf8'));
    expect(manifest.dependencies['com.spritebuddy.runtime']).toBe(
      'file:../../com.spritebuddy.runtime',
    );
  });
});
