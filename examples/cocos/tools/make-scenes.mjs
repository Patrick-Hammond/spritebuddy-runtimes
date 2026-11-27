// Writes the Cocos example's scenes and the .meta files that tie them to their scripts, so the
// project opens with each demo ready to run: node examples/cocos/tools/make-scenes.mjs
//
// Each scene is the least Cocos Creator needs for a 2D game: a Canvas, its camera, and one
// node with the demo's component. The demos make everything else in code. Cocos Creator fills
// in the rest of each scene's settings with its defaults, and rewrites the file in its own
// layout the first time it is saved.
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ASSETS = join(import.meta.dirname, '..', 'assets');

/** Fixed ids, so a scene always finds its script. */
export const DEMOS = [
  {
    scene: 'slime',
    script: 'SlimeDemo',
    sceneUuid: '0a5dae77-9434-49e2-920c-ab45c5018944',
    scriptUuid: '5855da81-8660-4570-8caf-df55e8fd2ef4',
    background: [29, 34, 48],
  },
  {
    scene: 'candle',
    script: 'CandleDemo',
    sceneUuid: '602a2353-a283-464b-8ef3-cd5543952b05',
    scriptUuid: '431e7468-96e7-4c26-be20-5dc265a0a071',
    background: [11, 13, 20],
  },
  {
    scene: 'events',
    script: 'EventsDemo',
    sceneUuid: 'e6ef8379-551c-49c4-a6bb-c48daaf4bd41',
    scriptUuid: '89887192-6fe2-4edc-9878-cfabf73e310c',
    background: [29, 34, 48],
  },
];
export const HELPERS = [{ script: 'status', scriptUuid: 'a709ecdb-ef34-40dc-9e98-16a74c868a78' }];

/** Design size (Cocos Creator's default project setting). */
const WIDTH = 1280;
const HEIGHT = 720;
const LAYER_DEFAULT = 1 << 30;
const LAYER_UI_2D = 1 << 25;
const LAYER_UI_3D = 1 << 23;

const BASE64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/**
 * A script's class id in a scene: its uuid compressed as Cocos Creator does (the first `keep` hex
 * digits kept, every three after that as two base-64 digits).
 */
export function compressUuid(uuid, keep = 5) {
  const hex = uuid.replace(/-/g, '');
  let out = hex.slice(0, keep);
  for (let i = keep; i < 32; i += 3) {
    const [a, b, c] = [hex[i], hex[i + 1], hex[i + 2]].map((h) => parseInt(h, 16));
    out += BASE64[(a << 2) | (b >> 2)] + BASE64[((b & 3) << 4) | c];
  }
  return out;
}

const vec3 = (x, y, z) => ({ __type__: 'cc.Vec3', x, y, z });
const quat = () => ({ __type__: 'cc.Quat', x: 0, y: 0, z: 0, w: 1 });
const ref = (id) => ({ __id__: id });

function node(name, parent, children, components, position, layer, id) {
  return {
    __type__: 'cc.Node',
    _name: name,
    _objFlags: 0,
    __editorExtras__: {},
    _parent: parent === null ? null : ref(parent),
    _children: children.map(ref),
    _active: true,
    _components: components.map(ref),
    _prefab: null,
    _lpos: vec3(...position),
    _lrot: quat(),
    _lscale: vec3(1, 1, 1),
    _mobility: 0,
    _layer: layer,
    _euler: vec3(0, 0, 0),
    _id: id,
  };
}

function component(type, nodeId, fields, id) {
  return {
    __type__: type,
    _name: '',
    _objFlags: 0,
    __editorExtras__: {},
    node: ref(nodeId),
    _enabled: true,
    __prefab: null,
    ...fields,
    _id: id,
  };
}

function uiTransform(nodeId, id) {
  return component(
    'cc.UITransform',
    nodeId,
    {
      _contentSize: { __type__: 'cc.Size', width: WIDTH, height: HEIGHT },
      _anchorPoint: { __type__: 'cc.Vec2', x: 0.5, y: 0.5 },
    },
    id,
  );
}

export function scene(demo) {
  const short = demo.sceneUuid.slice(0, 8);
  const [r, g, b] = demo.background;
  // Indexes into the list below.
  const SCENE = 1;
  const CANVAS = 2;
  const CAMERA_NODE = 3;
  const CAMERA = 4;
  const DEMO_NODE = 5;
  const DEMO = 6;
  const DEMO_UI = 7;
  const CANVAS_UI = 8;
  const CANVAS_COMPONENT = 9;
  const GLOBALS = 10;
  return [
    {
      __type__: 'cc.SceneAsset',
      _name: demo.scene,
      _objFlags: 0,
      __editorExtras__: {},
      _native: '',
      scene: ref(SCENE),
    },
    {
      __type__: 'cc.Scene',
      _name: demo.scene,
      _objFlags: 0,
      __editorExtras__: {},
      _parent: null,
      _children: [ref(CANVAS)],
      _active: true,
      _components: [],
      _prefab: null,
      _lpos: vec3(0, 0, 0),
      _lrot: quat(),
      _lscale: vec3(1, 1, 1),
      _mobility: 0,
      _layer: LAYER_DEFAULT,
      _euler: vec3(0, 0, 0),
      autoReleaseAssets: false,
      _globals: ref(GLOBALS),
      _id: demo.sceneUuid,
    },
    node(
      'Canvas',
      SCENE,
      [CAMERA_NODE, DEMO_NODE],
      [CANVAS_UI, CANVAS_COMPONENT],
      [WIDTH / 2, HEIGHT / 2, 0],
      LAYER_UI_2D,
      `${short}canvas`,
    ),
    node('Camera', CANVAS, [], [CAMERA], [0, 0, 1000], LAYER_DEFAULT, `${short}cameranode`),
    component(
      'cc.Camera',
      CAMERA_NODE,
      {
        _projection: 0,
        _priority: 0,
        _fov: 45,
        _fovAxis: 0,
        _orthoHeight: HEIGHT / 2,
        _near: 0,
        _far: 2000,
        _color: { __type__: 'cc.Color', r, g, b, a: 255 },
        _depth: 1,
        _stencil: 0,
        _clearFlags: 7,
        _rect: { __type__: 'cc.Rect', x: 0, y: 0, width: 1, height: 1 },
        _aperture: 19,
        _shutter: 7,
        _iso: 0,
        _screenScale: 1,
        _visibility: LAYER_UI_2D | LAYER_UI_3D,
        _targetTexture: null,
        _postProcess: null,
        _usePostProcess: false,
        _cameraType: -1,
        _trackingType: 0,
      },
      `${short}camera`,
    ),
    node(demo.script, CANVAS, [], [DEMO, DEMO_UI], [0, 0, 0], LAYER_UI_2D, `${short}demonode`),
    component(compressUuid(demo.scriptUuid), DEMO_NODE, {}, `${short}demo`),
    uiTransform(DEMO_NODE, `${short}demoui`),
    uiTransform(CANVAS, `${short}canvasui`),
    component(
      'cc.Canvas',
      CANVAS,
      { _cameraComponent: ref(CAMERA), _alignCanvasWithScreen: true },
      `${short}canvascomp`,
    ),
    { __type__: 'cc.SceneGlobals' },
  ];
}

const json = (value) => `${JSON.stringify(value, null, 2)}\n`;
const meta = (importer, uuid, extra = {}) =>
  json({
    ver: '1.0.0',
    importer,
    imported: true,
    uuid,
    files: [],
    subMetas: {},
    userData: {},
    ...extra,
  });

/** Writes every scene and script .meta file. */
export function writeAll() {
  for (const demo of DEMOS) {
    writeFileSync(join(ASSETS, 'scenes', `${demo.scene}.scene`), json(scene(demo)));
    writeFileSync(
      join(ASSETS, 'scenes', `${demo.scene}.scene.meta`),
      meta('scene', demo.sceneUuid, { ver: '1.1.50', files: ['.json'] }),
    );
  }
  for (const script of [...DEMOS, ...HELPERS]) {
    writeFileSync(
      join(ASSETS, 'scripts', `${script.script}.ts.meta`),
      meta('typescript', script.scriptUuid, { ver: '4.0.24' }),
    );
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) writeAll();
