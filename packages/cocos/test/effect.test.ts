import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium, type Browser, type Page } from 'playwright';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DEFAULT_LIGHT, lightUniforms } from '../src/light';

/**
 * Cocos Creator compiles the effect, and only Cocos Creator can: these tests check what can be
 * checked without it. The effect's properties match its uniforms and what the package sets, and
 * its GLSL (with Cocos's built-ins stood in for) compiles in WebGL 2 and lights a pixel the way
 * SpriteBuddy Pro does.
 */
const EFFECT = readFileSync(join(__dirname, '../effects/spritebuddy-lit.effect'), 'utf8');

function program(name: string): string {
  const m = new RegExp(`CCProgram ${name} %\\{([\\s\\S]*?)\\n\\}%`).exec(EFFECT);
  if (!m) throw new Error(`no CCProgram ${name}`);
  return m[1]!;
}

/** The effect's GLSL as plain WebGL 2 shaders, with Cocos's globals as ordinary uniforms. */
function webgl(): { vertex: string; fragment: string } {
  const vertex = program('sprite-vs')
    .replace('#include <builtin/uniforms/cc-global>', 'uniform mat4 cc_matViewProj;')
    .concat('\nvoid main() { gl_Position = vert(); gl_PointSize = 1.0; }\n');
  const fragment = program('sprite-fs')
    .replace('#pragma builtin(local)', '')
    .replace('layout(set = 2, binding = 12) ', '')
    .concat('\nout vec4 sbOut;\nvoid main() { sbOut = frag(); }\n');
  return { vertex: `#version 300 es\n${vertex}`, fragment: `#version 300 es\n${fragment}` };
}

describe('the lit effect', () => {
  it('declares a property for every uniform the package sets', () => {
    const properties = /properties:\n([\s\S]*?)\n\}%/.exec(EFFECT)![1]!;
    const declared = [...properties.matchAll(/^\s+(\w+):/gm)].map((m) => m[1]);
    const block = /uniform SpriteBuddyLight \{([\s\S]*?)\};/.exec(EFFECT)![1]!;
    const members = [...block.matchAll(/vec4 (\w+);/g)].map((m) => m[1]);
    const set = ['normalMap', 'orient', ...Object.keys(lightUniforms({ ...DEFAULT_LIGHT }))];
    expect([...declared].sort()).toEqual([...set].sort());
    expect([...members, 'normalMap'].sort()).toEqual([...set].sort());
  });

  it('keeps the package and the copy in the Cocos example the same', () => {
    const copy = readFileSync(
      join(
        __dirname,
        '../../../examples/cocos/assets/resources/spritebuddy/spritebuddy-lit.effect',
      ),
      'utf8',
    );
    expect(copy).toBe(EFFECT);
  });
});

/** SpriteBuddy Pro's sums for one pixel (as in @spritebuddy/pixi's shader), 0 to 255. */
function reference(
  color: number[],
  normal: number[],
  orient: number[],
  world: number[],
  u: ReturnType<typeof lightUniforms>,
): number[] {
  const n = normal.slice(0, 3).map((v) => (v / 255) * 2 - 1) as [number, number, number];
  const N = [orient[0]! * n[0] + orient[2]! * n[1], orient[1]! * n[0] + orient[3]! * n[1], n[2]];
  let L = u.lightDir.slice(0, 3);
  let falloff = 1;
  if (u.lightPos[3] > 0) {
    const t = [u.lightPos[0] - world[0]!, u.lightPos[1] - world[1]!, u.lightPos[2]];
    const len = Math.hypot(t[0]!, t[1]!, t[2]!);
    L = t.map((v) => v / len);
    const f = Math.min(1, Math.max(0, 1 - Math.hypot(t[0]!, t[1]!) / u.lightPos[3]));
    falloff = f * f;
  }
  const wrap = u.lightParams[3];
  const dot = N[0]! * L[0]! + N[1]! * L[1]! + N[2]! * L[2]!;
  let d = Math.min(1, Math.max(0, (dot + wrap) / (1 + wrap))) * falloff;
  if (u.lightDir[3] > 1) {
    const steps = u.lightDir[3] - 1;
    d = Math.floor(d * steps + 0.5) / steps;
  }
  const c = color.slice(0, 3).map((v) => v / 255);
  return c.map((v, i) => {
    const lit = Math.min(1, v * (u.lightParams[0] + u.lightParams[1] * d * u.lightColor[i]!));
    return Math.round((v + (lit - v) * u.lightParams[2]) * 255);
  });
}

describe('the lit effect in WebGL 2', () => {
  let browser: Browser;
  let page: Page;
  beforeAll(async () => {
    browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader'] });
    page = await browser.newPage();
  });
  afterAll(async () => {
    await browser?.close();
  });

  /** Draws one pixel at `world` with the effect and reads it back. */
  async function shade(
    color: number[],
    normal: number[],
    orient: number[],
    world: number[],
    u: ReturnType<typeof lightUniforms>,
  ): Promise<number[]> {
    const { vertex, fragment } = webgl();
    return page.evaluate(
      ({ vertex, fragment, color, normal, orient, world, u }) => {
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = 1;
        const gl = canvas.getContext('webgl2', { premultipliedAlpha: false })!;
        const compile = (type: number, src: string) => {
          const s = gl.createShader(type)!;
          gl.shaderSource(s, src);
          gl.compileShader(s);
          if (!gl.getShaderParameter(s, gl.COMPILE_STATUS))
            throw new Error(gl.getShaderInfoLog(s)!);
          return s;
        };
        const p = gl.createProgram()!;
        gl.attachShader(p, compile(gl.VERTEX_SHADER, vertex));
        gl.attachShader(p, compile(gl.FRAGMENT_SHADER, fragment));
        gl.linkProgram(p);
        if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p)!);
        gl.useProgram(p);
        const attr = (name: string, size: number, data: number[]) => {
          const loc = gl.getAttribLocation(p, name);
          if (loc < 0) return;
          gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
          gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(data), gl.STATIC_DRAW);
          gl.enableVertexAttribArray(loc);
          gl.vertexAttribPointer(loc, size, gl.FLOAT, false, 0, 0);
        };
        // One point at `world`. A view-projection of all zeros but w puts it in the middle of
        // the 1 x 1 canvas, whatever `world` is.
        attr('a_position', 3, [world[0]!, world[1]!, 0]);
        attr('a_texCoord', 2, [0.5, 0.5]);
        attr('a_color', 4, [1, 1, 1, 1]);
        const toClip = new Float32Array(16);
        toClip[15] = 1;
        gl.uniformMatrix4fv(gl.getUniformLocation(p, 'cc_matViewProj'), false, toClip);
        const texture = (unit: number, name: string, rgba: number[]) => {
          gl.activeTexture(gl.TEXTURE0 + unit);
          gl.bindTexture(gl.TEXTURE_2D, gl.createTexture());
          gl.texImage2D(
            gl.TEXTURE_2D,
            0,
            gl.RGBA,
            1,
            1,
            0,
            gl.RGBA,
            gl.UNSIGNED_BYTE,
            new Uint8Array(rgba),
          );
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
          gl.uniform1i(gl.getUniformLocation(p, name), unit);
        };
        texture(0, 'cc_spriteTexture', color);
        texture(1, 'normalMap', normal);
        const block = gl.getUniformBlockIndex(p, 'SpriteBuddyLight');
        const values = [orient, u.lightDir, u.lightPos, u.lightColor, u.lightParams].flat();
        const buffer = gl.createBuffer();
        gl.bindBuffer(gl.UNIFORM_BUFFER, buffer);
        gl.bufferData(gl.UNIFORM_BUFFER, new Float32Array(values), gl.STATIC_DRAW);
        gl.uniformBlockBinding(p, block, 0);
        gl.bindBufferBase(gl.UNIFORM_BUFFER, 0, buffer);
        gl.drawArrays(gl.POINTS, 0, 1);
        const out = new Uint8Array(4);
        gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, out);
        return [...out];
      },
      { vertex, fragment, color, normal, orient, world, u },
    );
  }

  const cases = [
    { name: 'the default light, facing the viewer', light: {}, normal: [128, 128, 255, 255] },
    {
      name: 'cel bands and a coloured light from the left',
      light: { angle: 270, height: 20, bands: 3, color: 0xff9040 },
      normal: [40, 128, 200, 255],
    },
    {
      name: 'a point light up and to the right',
      light: { radius: 100, x: 30, y: 40, z: 20, brightness: 1.5, ambient: 0.2 },
      normal: [200, 180, 150, 255],
      world: [10, 10],
    },
    {
      name: 'a mirrored, turned part',
      light: { angle: 90, height: 10 },
      normal: [230, 128, 160, 255],
      orient: [0, -1, -1, 0],
    },
  ];

  for (const c of cases) {
    it(`lights ${c.name} as SpriteBuddy Pro does`, async () => {
      const u = lightUniforms({ ...DEFAULT_LIGHT, ...c.light });
      const color = [200, 120, 60, 255];
      const orient = c.orient ?? [1, 0, 0, 1];
      const world = c.world ?? [0, 0];
      const got = await shade(color, c.normal, orient, world, u);
      const want = reference(color, c.normal, orient, world, u);
      got
        .slice(0, 3)
        .forEach((v, i) =>
          expect(Math.abs(v - want[i]!), `${got} vs ${want}`).toBeLessThanOrEqual(2),
        );
      expect(got[3]).toBe(255);
    });
  }
});
