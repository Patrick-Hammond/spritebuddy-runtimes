// Writes the Unity files that aren't code: a `.meta` beside every file and folder of the Unity
// package and the example project's Assets (Unity needs them, and a package installed from git
// can't make its own), and the example scenes, which point at those metas' GUIDs. GUIDs come
// from each file's path, so they never change. Run after adding, moving or removing a file
// under packages/unity/:
//
//   node scripts/unity-project.mjs            # adds missing metas and scenes, removes stale metas
//   node scripts/unity-project.mjs --scenes   # also writes the scenes over any saved in Unity
//   node scripts/unity-project.mjs --check    # fails if a meta or scene is missing or wrong
//
// Unity rewrites metas in its own newer format when it imports them; that's fine, so a meta is
// only rewritten (and only checked) for its GUID.
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PACKAGE = 'packages/unity/com.spritebuddy.runtime';
const ASSETS = 'packages/unity/examples/Assets';
const EXAMPLES = `${ASSETS}/SpriteBuddyExamples`;

/**
 * A stable GUID for a repository path. It hashes the path as it was before the Unity folder moved
 * into packages/ (unity/...), so the GUIDs, which games' scenes point at, never change.
 */
export const guid = (path) =>
  createHash('md5')
    .update(`spritebuddy-unity:${path.replace(/^packages\//, '')}`)
    .digest('hex');

// GUIDs of URP's own assets, the same in every URP version.
const URP_LIGHT_2D = '073797afb82c5a1438f328866b10b3f0';
const URP_SPRITE_UNLIT = '9dfc825aed78fcd4ba02077103263b40';

const tail = 'userData: \n  assetBundleName: \n  assetBundleVariant: \n';

function importer(path) {
  const name = path.split('/').pop();
  if (name.endsWith('.cs')) {
    return (
      'MonoImporter:\n  externalObjects: {}\n  serializedVersion: 2\n  defaultReferences: []\n' +
      `  executionOrder: 0\n  icon: {instanceID: 0}\n  ${tail}`
    );
  }
  if (name.endsWith('.asmdef'))
    return `AssemblyDefinitionImporter:\n  externalObjects: {}\n  ${tail}`;
  if (name === 'package.json') return `PackageManifestImporter:\n  externalObjects: {}\n  ${tail}`;
  if (/\.(json|md|txt)$/.test(name)) return `TextScriptImporter:\n  externalObjects: {}\n  ${tail}`;
  if (name.endsWith('.wav')) {
    return (
      'AudioImporter:\n  externalObjects: {}\n  serializedVersion: 7\n  defaultSettings:\n' +
      '    serializedVersion: 2\n    loadType: 0\n    sampleRateSetting: 0\n    sampleRateOverride: 44100\n' +
      '    compressionFormat: 0\n    quality: 1\n    conversionMode: 0\n    preloadAudioData: 1\n' +
      '  platformSettingOverrides: {}\n  forceToMono: 0\n  normalize: 0\n  preloadAudioData: 1\n' +
      `  loadInBackground: 0\n  ambisonic: 0\n  3D: 0\n  ${tail}`
    );
  }
  if (name.endsWith('.png')) return textureImporter(name.endsWith('_n.png'));
  return `DefaultImporter:\n  externalObjects: {}\n  ${tail}`;
}

/**
 * Pixel art: no filtering, mipmaps, resizing or compression, so every sheet pixel stays exact.
 * A normal map (`*_n.png`) is imported as one, which also turns sRGB off.
 */
function textureImporter(normal) {
  return `TextureImporter:
  internalIDToNameTable: []
  externalObjects: {}
  serializedVersion: 12
  mipmaps:
    mipMapMode: 0
    enableMipMap: 0
    sRGBTexture: ${normal ? 0 : 1}
    linearTexture: 0
    fadeOut: 0
    borderMipMap: 0
    mipMapsPreserveCoverage: 0
    alphaTestReferenceValue: 0.5
    mipMapFadeDistanceStart: 1
    mipMapFadeDistanceEnd: 3
  bumpmap:
    convertToNormalMap: 0
    externalNormalMap: 0
    heightScale: 0.25
    normalMapFilter: 0
    flipGreenChannel: 0
  isReadable: 0
  streamingMipmaps: 0
  streamingMipmapsPriority: 0
  vTOnly: 0
  ignoreMipmapLimit: 0
  grayScaleToAlpha: 0
  generateCubemap: 6
  cubemapConvolution: 0
  seamlessCubemap: 0
  textureFormat: 1
  maxTextureSize: 2048
  textureSettings:
    serializedVersion: 2
    filterMode: 0
    aniso: 1
    mipBias: 0
    wrapU: 1
    wrapV: 1
    wrapW: 1
  nPOTScale: 0
  lightmap: 0
  compressionQuality: 50
  spriteMode: 0
  spriteExtrude: 1
  spriteMeshType: 1
  alignment: 0
  spritePivot: {x: 0.5, y: 0.5}
  spritePixelsToUnits: 16
  spriteBorder: {x: 0, y: 0, z: 0, w: 0}
  spriteGenerateFallbackPhysicsShape: 1
  alphaUsage: 1
  alphaIsTransparency: ${normal ? 0 : 1}
  spriteTessellationDetail: -1
  textureType: ${normal ? 1 : 0}
  textureShape: 1
  singleChannelComponent: 0
  flipbookRows: 1
  flipbookColumns: 1
  maxTextureSizeSet: 0
  compressionQualitySet: 0
  textureFormatSet: 0
  ignorePngGamma: 0
  applyGammaDecoding: 0
  swizzle: 50462976
  cookieLightType: 0
  platformSettings:
  - serializedVersion: 3
    buildTarget: DefaultTexturePlatform
    maxTextureSize: 2048
    resizeAlgorithm: 0
    textureFormat: -1
    textureCompression: 0
    compressionQuality: 50
    crunchedCompression: 0
    allowsAlphaSplitting: 0
    overridden: 0
    ignorePlatformSupport: 0
    androidETC2FallbackOverride: 0
    forceMaximumCompressionQuality_BC6H_BC7: 0
  ${tail}`;
}

function meta(path, folder) {
  const body = folder
    ? `folderAsset: yes\nDefaultImporter:\n  externalObjects: {}\n  ${tail}`
    : importer(path);
  return `fileFormatVersion: 2\nguid: ${guid(path)}\n${body}`;
}

// --- Scenes ------------------------------------------------------------------------------------

const ref = (fileID, guidOf, type = 3) =>
  guidOf ? `{fileID: ${fileID}, guid: ${guidOf}, type: ${type}}` : `{fileID: ${fileID}}`;
const asset = {
  script: (path) => ref(11500000, guid(path)),
  text: (path) => ref(4900000, guid(path)),
  texture: (path) => ref(2800000, guid(path)),
  audio: (path) => ref(8300000, guid(path)),
};
const color = ([r, g, b, a = 1]) => `{r: ${r}, g: ${g}, b: ${b}, a: ${a}}`;
const head =
  '  m_ObjectHideFlags: 0\n  m_CorrespondingSourceObject: {fileID: 0}\n  m_PrefabInstance: {fileID: 0}\n  m_PrefabAsset: {fileID: 0}\n';

const ART = `${EXAMPLES}/Art`;
const SLIME = {
  file: asset.text(`${ART}/slime.anims.json`),
  sheet: asset.texture(`${ART}/slime.png`),
  normals: asset.texture(`${ART}/slime_n.png`),
};

/** Builds a scene from GameObjects, each a name, position and list of components. */
function scene(objects) {
  let next = 100;
  const blocks = [];
  const roots = [];
  // Give every object and component its file ID first, so components can point at each other.
  for (const object of objects) {
    object.id = next++;
    object.transformId = next++;
    for (const component of object.components) component.id = next++;
  }
  for (const object of objects) {
    roots.push(object.transformId);
    const ids = [object.transformId, ...object.components.map((c) => c.id)];
    blocks.push(
      `--- !u!1 &${object.id}\nGameObject:\n${head}  serializedVersion: 6\n  m_Component:\n` +
        ids.map((id) => `  - component: {fileID: ${id}}\n`).join('') +
        `  m_Layer: 0\n  m_Name: ${object.name}\n  m_TagString: ${object.tag ?? 'Untagged'}\n` +
        '  m_Icon: {fileID: 0}\n  m_NavMeshLayer: 0\n  m_StaticEditorFlags: 0\n  m_IsActive: 1\n',
    );
    const [x, y, z = 0] = object.at ?? [0, 0];
    blocks.push(
      `--- !u!4 &${object.transformId}\nTransform:\n${head}  m_GameObject: {fileID: ${object.id}}\n` +
        '  serializedVersion: 2\n  m_LocalRotation: {x: 0, y: 0, z: 0, w: 1}\n' +
        `  m_LocalPosition: {x: ${x}, y: ${y}, z: ${z}}\n  m_LocalScale: {x: 1, y: 1, z: 1}\n` +
        '  m_ConstrainProportionsScale: 0\n  m_Children: []\n  m_Father: {fileID: 0}\n' +
        '  m_LocalEulerAnglesHint: {x: 0, y: 0, z: 0}\n',
    );
    for (const component of object.components) {
      blocks.push(component.yaml(component.id, object.id));
    }
  }
  blocks.push(
    '--- !u!1660057539 &9223372036854775807\nSceneRoots:\n  m_ObjectHideFlags: 0\n  m_Roots:\n' +
      roots.map((id) => `  - {fileID: ${id}}\n`).join(''),
  );
  return '%YAML 1.1\n%TAG !u! tag:unity3d.com,2011:\n' + blocks.join('');
}

const camera = (size) => ({
  yaml: (id, go) =>
    `--- !u!20 &${id}\nCamera:\n${head}  m_GameObject: {fileID: ${go}}\n  m_Enabled: 1\n  serializedVersion: 2\n` +
    `  m_ClearFlags: 2\n  m_BackGroundColor: ${color([0.1, 0.1, 0.14])}\n  m_projectionMatrixMode: 1\n` +
    '  m_NormalizedViewPortRect:\n    serializedVersion: 2\n    x: 0\n    y: 0\n    width: 1\n    height: 1\n' +
    `  near clip plane: 0.3\n  far clip plane: 100\n  field of view: 60\n  orthographic: 1\n  orthographic size: ${size}\n` +
    '  m_Depth: -1\n  m_CullingMask:\n    serializedVersion: 2\n    m_Bits: 4294967295\n  m_RenderingPath: -1\n' +
    '  m_TargetTexture: {fileID: 0}\n  m_TargetDisplay: 0\n  m_TargetEye: 3\n  m_HDR: 1\n  m_AllowMSAA: 0\n' +
    '  m_AllowDynamicResolution: 0\n  m_ForceIntoRT: 0\n  m_OcclusionCulling: 0\n',
});

const mono = (script, fields) => ({
  yaml: (id, go) =>
    `--- !u!114 &${id}\nMonoBehaviour:\n${head}  m_GameObject: {fileID: ${go}}\n  m_Enabled: 1\n  m_EditorHideFlags: 0\n` +
    `  m_Script: ${script}\n  m_Name: \n  m_EditorClassIdentifier: \n` +
    (typeof fields === 'function' ? fields() : fields),
});

const sortingGroup = (order = 0) => ({
  yaml: (id, go) =>
    `--- !u!210 &${id}\nSortingGroup:\n${head}  m_GameObject: {fileID: ${go}}\n  m_Enabled: 1\n` +
    `  m_SortingLayerID: 0\n  m_SortingLayer: 0\n  m_SortingOrder: ${order}\n  m_SortAtRoot: 0\n`,
});

/** A SpriteBuddy Sprite playing the slime sheet. */
const slimeSprite = (animation, { normals = false, material = null, playOnStart = true } = {}) =>
  mono(
    asset.script(`${PACKAGE}/Runtime/SpriteBuddySprite.cs`),
    `  file: ${SLIME.file}\n  sheet: ${SLIME.sheet}\n  normalMap: ${normals ? SLIME.normals : '{fileID: 0}'}\n` +
      `  useNormalMap: ${normals ? 1 : 0}\n  animationName: ${animation}\n  playOnStart: ${playOnStart ? 1 : 0}\n` +
      `  speed: 1\n  pixelsPerUnit: 16\n  color: ${color([1, 1, 1])}\n  material: ${material ?? '{fileID: 0}'}\n`,
  );

/** URP's Light 2D: a global light, or a point light that lights through normal maps. */
const light2D = ({ type, intensity, rgb, inner = 0, outer = 1, height = 0.8 }) =>
  mono(
    ref(11500000, URP_LIGHT_2D),
    `  m_ComponentVersion: 1\n  m_LightType: ${type === 'global' ? 4 : 3}\n  m_BlendStyleIndex: 0\n` +
      `  m_FalloffIntensity: 0.5\n  m_Color: ${color(rgb)}\n  m_Intensity: ${intensity}\n` +
      '  m_LightVolumeIntensity: 0\n  m_LightVolumeEnabled: 0\n  m_LightOrder: 0\n  m_OverlapOperation: 0\n' +
      `  m_NormalMapDistance: ${height}\n  m_NormalMapQuality: ${type === 'global' ? 2 : 1}\n` +
      `  m_UseNormalMap: ${type === 'global' ? 0 : 1}\n  m_ShadowsEnabled: 0\n  m_ShadowIntensity: 0\n` +
      '  m_ShadowVolumeIntensityEnabled: 0\n  m_ShadowVolumeIntensity: 0\n' +
      '  m_PointLightInnerAngle: 360\n  m_PointLightOuterAngle: 360\n' +
      `  m_PointLightInnerRadius: ${inner}\n  m_PointLightOuterRadius: ${outer}\n`,
  );

const mainCamera = (size) => ({
  name: 'Main Camera',
  tag: 'MainCamera',
  at: [0, 0, -10],
  components: [camera(size)],
});
const daylight = () => ({
  name: 'Global Light 2D',
  components: [light2D({ type: 'global', intensity: 1, rgb: [1, 1, 1] })],
});

function slimesScene() {
  const idle = {
    name: 'Slime',
    at: [-1.6, -0.8],
    components: [sortingGroup(), slimeSprite('idle')],
  };
  const walk = {
    name: 'Walking slime',
    at: [0, -0.8],
    components: [sortingGroup(), slimeSprite('walk')],
  };
  const sprite = (o) => `{fileID: ${o.components[1].id}}`;
  const demo = {
    name: 'Slime Demo',
    components: [
      mono(
        asset.script(`${EXAMPLES}/Scripts/SlimeDemo.cs`),
        () =>
          `  slimes:\n  - ${sprite(idle)}\n  - ${sprite(walk)}\n  file: ${SLIME.file}\n  sheet: ${SLIME.sheet}\n` +
          '  partySlimeAt: {x: 1.6, y: -0.8}\n',
      ),
    ],
  };
  return scene([mainCamera(2), daylight(), idle, walk, demo]);
}

function candleScene() {
  const unlit = ref(2100000, URP_SPRITE_UNLIT, 2);
  const candle = {
    name: 'Candle',
    at: [0.8, -0.6],
    components: [sortingGroup(), slimeSprite('candle', { material: unlit })],
  };
  const slime = {
    name: 'Slime',
    at: [-2.2, -1.2],
    components: [sortingGroup(), slimeSprite('idle', { normals: true })],
  };
  const flame = {
    name: 'Candle Light',
    at: [0.8, 0.2],
    components: [
      light2D({
        type: 'point',
        intensity: 1.6,
        rgb: [1, 0.72, 0.42],
        inner: 0.2,
        outer: 4.5,
        height: 0.8,
      }),
    ],
  };
  const darkness = {
    name: 'Darkness (Global Light 2D)',
    components: [light2D({ type: 'global', intensity: 0.3, rgb: [0.55, 0.55, 0.85] })],
  };
  const demo = {
    name: 'Candle Demo',
    components: [
      mono(
        asset.script(`${EXAMPLES}/Scripts/CandleDemo.cs`),
        () =>
          `  slime: {fileID: ${slime.components[1].id}}\n  candle: {fileID: ${candle.components[1].id}}\n` +
          `  candleLight: {fileID: ${flame.components[0].id}}\n  speed: 1.4\n  flameHeight: 13\n` +
          `  floorColor: ${color([0.25, 0.25, 0.3])}\n`,
      ),
    ],
  };
  return scene([mainCamera(2), darkness, flame, candle, slime, demo]);
}

function frameEventsScene() {
  const sound = (name, volume) =>
    `  - eventName: ${name}\n    clip: ${asset.audio(`${EXAMPLES}/Audio/${name}.wav`)}\n    volume: ${volume}\n`;
  const slime = {
    name: 'Slime',
    at: [0, -0.6],
    components: [
      sortingGroup(),
      slimeSprite('walk'),
      mono(
        asset.script(`${EXAMPLES}/Scripts/FrameEventSounds.cs`),
        '  sounds:\n' +
          sound('squelch', 0.7) +
          sound('hop', 0.6) +
          sound('land', 0.9) +
          '  pitchVariation: 0.08\n',
      ),
    ],
  };
  const demo = {
    name: 'Frame Events Demo',
    components: [
      mono(
        asset.script(`${EXAMPLES}/Scripts/FrameEventsDemo.cs`),
        () =>
          `  slime: {fileID: ${slime.components[1].id}}\n  walkWidth: 2.5\n  speed: 1.2\n  jumpEvery: 3.5\n`,
      ),
    ],
  };
  return scene([mainCamera(2), daylight(), slime, demo]);
}

// --- Writing and checking ----------------------------------------------------------------------

const SCENES = () =>
  new Map([
    [`${EXAMPLES}/Scenes/Slimes.unity`, slimesScene()],
    [`${EXAMPLES}/Scenes/Candle.unity`, candleScene()],
    [`${EXAMPLES}/Scenes/FrameEvents.unity`, frameEventsScene()],
  ]);

// Unity makes these in the example project when it opens it (the URP assets ExampleSetup makes).
const SKIP = new Set([`${ASSETS}/Settings`]);

/** Every meta there should be: path → contents. */
function metas(scenes) {
  const files = new Map();
  // Scenes get metas even before they're first written.
  for (const path of scenes.keys()) files.set(`${path}.meta`, meta(path, false));
  const walk = (dir) => {
    for (const name of readdirSync(join(ROOT, dir)).sort()) {
      const path = `${dir}/${name}`;
      if (name.endsWith('.meta') || name.startsWith('.') || SKIP.has(path)) continue;
      const folder = statSync(join(ROOT, path)).isDirectory();
      files.set(`${path}.meta`, meta(path, folder));
      if (folder) walk(path);
    }
  };
  walk(PACKAGE);
  walk(ASSETS);
  return files;
}

/** Metas with nothing beside them: left over from a file that was moved or removed. */
function orphans(files) {
  const found = [];
  const walk = (dir) => {
    for (const name of readdirSync(join(ROOT, dir))) {
      const path = `${dir}/${name}`;
      if (SKIP.has(path) || SKIP.has(path.replace(/\.meta$/, ''))) continue;
      if (statSync(join(ROOT, path)).isDirectory()) walk(path);
      else if (name.endsWith('.meta') && !files.has(path)) found.push(path);
    }
  };
  walk(PACKAGE);
  walk(ASSETS);
  return found;
}

const guidIn = (text) => /^guid: ([0-9a-f]{32})$/m.exec(text)?.[1];

/** What's wrong with the Unity files, as a list of problems (empty when all is well). */
export function check() {
  const scenes = SCENES();
  const files = metas(scenes);
  const problems = [];
  for (const path of scenes.keys())
    if (!existsSync(join(ROOT, path))) problems.push(`missing: ${path}`);
  for (const [path, text] of files) {
    if (!existsSync(join(ROOT, path))) problems.push(`missing: ${path}`);
    else if (guidIn(readFileSync(join(ROOT, path), 'utf8')) !== guidIn(text))
      problems.push(`wrong GUID: ${path}`);
  }
  for (const path of orphans(files)) problems.push(`left over: ${path}`);
  return problems;
}

if (process.argv[1] && relative(process.argv[1], fileURLToPath(import.meta.url)) === '') {
  if (process.argv.includes('--check')) {
    const problems = check();
    for (const p of problems) console.error(p);
    if (problems.length) {
      console.error('Run: node scripts/unity-project.mjs');
      process.exit(1);
    }
    console.log('Unity metas and scenes are in place.');
  } else {
    const scenes = SCENES();
    let written = 0;
    for (const [path, text] of scenes) {
      if (existsSync(join(ROOT, path)) && !process.argv.includes('--scenes')) continue;
      writeFileSync(join(ROOT, path), text);
      written++;
    }
    const files = metas(scenes);
    for (const path of orphans(files)) rmSync(join(ROOT, path));
    for (const [path, text] of files) {
      const full = join(ROOT, path);
      if (existsSync(full) && guidIn(readFileSync(full, 'utf8')) === guidIn(text)) continue;
      writeFileSync(full, text);
      written++;
    }
    console.log(`Wrote ${written} Unity files.`);
  }
}
