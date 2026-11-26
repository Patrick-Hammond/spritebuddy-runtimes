/**
 * The parts of Phaser this package uses, typed loosely so that `import Phaser from 'phaser'` fits
 * for Phaser 3.60+ and Phaser 4.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
export interface PhaserNamespace {
  readonly VERSION: string;
  readonly GameObjects: {
    readonly Container: any;
    readonly Image: any;
    readonly GameObjectFactory: { register(name: string, factory: (...args: any[]) => any): void };
  };
  readonly Loader: {
    readonly LoaderPlugin: any;
    readonly FileTypesManager?: { register(name: string, fn: (...args: any[]) => any): void };
  };
  readonly Textures: { readonly FilterMode: { readonly NEAREST: number } };
}

/** A Phaser scene, as far as this package needs one. */
export interface PhaserScene {
  readonly sys: any;
  readonly textures: any;
  readonly cache: { readonly json: { get(key: string): unknown; exists(key: string): boolean } };
  readonly lights: any;
  readonly cameras: any;
  readonly events: any;
  readonly load: any;
  readonly add: any;
}
