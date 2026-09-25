export const apiCoverage = [
  {
    slug: 'game',
    file: 'api/game.md',
    href: '/docs/api/game/',
    sections: [
      'Game objects and components',
      'Transforms and hierarchy',
      'Scenes and lifecycle',
      'Native adapters',
      'Physics step',
      'Serialized worlds',
    ],
  },
  {
    slug: 'core',
    file: 'api/core.md',
    href: '/docs/api/core/',
    sections: ['Frame lifecycle', 'Input', 'Cameras and coordinates', 'Files and profiling'],
  },
  {
    slug: 'shapes',
    file: 'api/shapes.md',
    href: '/docs/api/shapes/',
    sections: ['Drawing', 'Collision helpers'],
  },
  {
    slug: 'textures',
    file: 'api/textures.md',
    href: '/docs/api/textures/',
    sections: ['Loading', 'Sampling', 'Render textures'],
  },
  {
    slug: 'text',
    file: 'api/text.md',
    href: '/docs/api/text/',
    sections: ['Default font', 'Font handles', 'Measurement'],
  },
  {
    slug: 'audio',
    file: 'api/audio.md',
    href: '/docs/api/audio/',
    sections: ['Device lifecycle', 'Sound', 'Music and spatial audio'],
  },
  {
    slug: 'models',
    file: 'api/models.md',
    href: '/docs/api/models/',
    sections: ['Loading', 'Primitives', 'Materials and animation'],
  },
  {
    slug: 'math',
    file: 'api/math.md',
    href: '/docs/api/math/',
    sections: ['Vectors', 'Transforms', 'Intersections'],
  },
  {
    slug: 'scene',
    file: 'api/scene.md',
    href: '/docs/api/scene/',
    sections: ['Nodes', 'Geometry and materials', 'Picking and lights'],
  },
  {
    slug: 'physics',
    file: 'api/physics.md',
    href: '/docs/api/physics/',
    sections: ['World stepping', 'Shapes and bodies', 'Queries and constraints', 'Characters'],
  },
  {
    slug: 'vfx',
    file: 'api/vfx.md',
    href: '/docs/api/vfx/',
    sections: ['Particles', 'Decals'],
  },
  {
    slug: 'world',
    file: 'api/world.md',
    href: '/docs/api/world/',
    sections: ['Schema', 'Loading and instantiation', 'Environment and ownership'],
  },
  {
    slug: 'mobile',
    file: 'api/mobile.md',
    href: '/docs/api/mobile/',
    sections: ['Joystick', 'Buttons', 'Touch claims'],
  },
  {
    slug: 'ui',
    file: 'api/ui.md',
    href: '/docs/api/ui/',
    sections: ['Player UI', 'Layout, input, and responses', 'Custom drawing and assets', 'Developer overlay', 'Platform support'],
  },
];

const recipeSections = ['Setup', 'Game loop', 'Complete example', 'Next steps'];

export const recipeCoverage = [
  { slug: '2d-game', file: 'guides/2d-game.md', href: '/docs/guides/2d-game/', sections: recipeSections },
  { slug: '3d-scene', file: 'guides/3d-scene.md', href: '/docs/guides/3d-scene/', sections: recipeSections },
  { slug: 'physics-gameplay', file: 'guides/physics-gameplay.md', href: '/docs/guides/physics-gameplay/', sections: recipeSections },
  { slug: 'assets-and-worlds', file: 'guides/assets-and-worlds.md', href: '/docs/guides/assets-and-worlds/', sections: recipeSections },
  { slug: 'audio-and-ui', file: 'guides/audio-and-ui.md', href: '/docs/guides/audio-and-ui/', sections: recipeSections },
];
