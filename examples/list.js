// Every example in the playground, in the order the sidebar lists them. Each `id` is a file in
// `src/` (`src/<id>.js`) that runs on its own in `run.html?example=<id>`. To add an example,
// write the file and add a line here.
export const groups = [
  {
    name: 'Plain canvas',
    uses: '@spritebuddy/core',
    examples: [
      {
        id: 'canvas/drawing',
        title: 'Drawing by hand',
        about: 'No engine at all: the core package says what to draw and where, the page draws it.',
      },
    ],
  },
  {
    name: 'PixiJS 8',
    uses: '@spritebuddy/pixi',
    examples: [
      {
        id: 'pixi/sprites',
        title: 'Sprites and clicks',
        about:
          'Three slimes from one sheet, one wearing a live-layer hat. Click one to make it jump.',
      },
      {
        id: 'pixi/sounds',
        title: 'Sounds on frame events',
        about:
          'The jump has frame events, "jump" on take-off and "land" on landing, and each plays a sound. Click the slime or press Space.',
      },
      {
        id: 'pixi/lighting',
        title: 'Candle lighting',
        about:
          "A candle's point light lights the slime through its normal map. Click the preview, then move with the cursor keys; Space jumps.",
      },
      {
        id: 'pixi/stress',
        title: 'Lighting stress test',
        about:
          'Many moving point lights and lit slimes, with sliders for both and a frames-per-second readout. Each sprite is lit by one light.',
      },
    ],
  },
  {
    name: 'Phaser 4',
    uses: '@spritebuddy/phaser',
    examples: [
      {
        id: 'phaser/sprites',
        title: 'Sprites and clicks',
        about: 'Three slimes made with this.add.spritebuddy. Click one to make it jump.',
      },
      {
        id: 'phaser/sounds',
        title: 'Sounds on frame events',
        about:
          'The jump has frame events, "jump" on take-off and "land" on landing, and each plays a sound with this.sound. Click the slime or press Space.',
      },
      {
        id: 'phaser/lighting',
        title: 'Candle lighting',
        about:
          "A candle's point light, using Phaser's own lights. Click the preview, then move with the cursor keys; Space jumps.",
      },
      {
        id: 'phaser/stress',
        title: 'Lighting stress test',
        about:
          'Many moving point lights and lit slimes, with sliders for both and a frames-per-second readout. Every sprite is lit by all the lights (up to 64).',
      },
    ],
  },
  {
    name: 'Godot 4',
    uses: 'the Godot addon',
    examples: [
      {
        id: 'godot/scenes',
        title: 'Slime, candle and sound scenes',
        about:
          'The Godot examples are scenes in an editor project, so they run in Godot rather than here.',
        link: 'https://github.com/Patrick-Hammond/spritebuddy-runtimes/tree/main/godot/examples',
      },
    ],
  },
  {
    name: 'Cocos Creator 3.8',
    uses: '@spritebuddy/cocos',
    examples: [
      {
        id: 'cocos/scenes',
        title: 'Slime, candle and sound scenes',
        about:
          'The Cocos examples are scenes in an editor project: three slimes, a candle-lit slime, and footstep sounds played by frame events. They run in Cocos Creator rather than here.',
        link: 'https://github.com/Patrick-Hammond/spritebuddy-runtimes/tree/main/examples/cocos',
      },
    ],
  },
  {
    name: 'Defold',
    uses: 'the Defold library',
    examples: [
      {
        id: 'defold/collections',
        title: 'Slimes, candle and frame events',
        about:
          'The Defold examples are collections in an editor project, so they run in Defold rather than here.',
        link: 'https://github.com/Patrick-Hammond/spritebuddy-runtimes/tree/main/defold/examples',
      },
    ],
  },
];

/** Every example, in sidebar order. */
export const examples = groups.flatMap((group) =>
  group.examples.map((example) => ({ ...example, group: group.name, uses: group.uses })),
);
