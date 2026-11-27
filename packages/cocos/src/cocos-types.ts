/**
 * The parts of Cocos Creator 3.8 this package uses, typed loosely so that `import * as cc from
 * 'cc'` fits. Passing them in (rather than importing `'cc'`) keeps the package a plain npm
 * module that any Cocos Creator project can install.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
export interface CocosNamespace {
  readonly Node: any;
  readonly Component: any;
  readonly Sprite: any;
  readonly SpriteFrame: any;
  readonly UITransform: any;
  readonly Texture2D: any;
  readonly ImageAsset: any;
  readonly JsonAsset: any;
  readonly EffectAsset: any;
  readonly Material: any;
  readonly Rect: any;
  readonly Color: any;
  readonly Vec4: any;
  readonly resources: CocosBundle;
  readonly _decorator: { ccclass(name: string): (ctor: any) => any };
}

/** An asset bundle (`cc.resources`, or one from `assetManager.loadBundle`). */
export interface CocosBundle {
  load(path: string, type: any, done: (error: Error | null, asset: any) => void): void;
}

/** A `cc.Node`: the members this package uses, and the rest of the node untyped. */
export interface CocosNode {
  [member: string]: any;
  name: string;
  layer: number;
  active: boolean;
  angle: number;
  readonly parent: CocosNode | null;
  addChild(child: CocosNode): void;
  addComponent(type: any): any;
  getComponent(type: any): any;
  setPosition(x: number, y: number, z?: number): void;
  setScale(x: number, y: number, z?: number): void;
  emit(type: string, ...args: any[]): void;
  on(type: string, callback: (...args: any[]) => void, target?: unknown): void;
  off(type: string, callback?: (...args: any[]) => void, target?: unknown): void;
  destroy(): boolean;
}
