/**
 * The parts of a PixiJS namespace this package uses, typed loosely so that `import * as PIXI
 * from 'pixi.js'` fits for PixiJS 5, 6, 7 and 8.
 */
export interface PixiTexture {
  /** PixiJS 8. */
  readonly source?: unknown;
  /** PixiJS 5 to 7. */
  readonly baseTexture?: unknown;
  destroy(destroyBase?: boolean): void;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
export interface PixiNamespace {
  readonly Container: any;
  readonly Sprite: any;
  readonly Texture: any;
  readonly Rectangle: any;
  readonly Ticker: any;
  /** PixiJS 8 only; used to tell versions apart. */
  readonly TextureSource?: any;
  /** PixiJS 7 and 8. */
  readonly Assets?: any;
  readonly ExtensionType?: any;
  /** PixiJS 5 to 7. */
  readonly SCALE_MODES?: any;
  /** PixiJS 8, for lit sprites. */
  readonly Mesh?: any;
  readonly MeshGeometry?: any;
  readonly Shader?: any;
  readonly GlProgram?: any;
  readonly UniformGroup?: any;
}
