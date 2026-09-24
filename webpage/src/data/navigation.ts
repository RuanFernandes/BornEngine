export interface NavigationItem {
  title: string;
  href: string;
  children?: NavigationItem[];
}

export interface NavigationGroup {
  title: string;
  href?: string;
  children: NavigationItem[];
}

export const navigation: NavigationGroup[] = [
  {
    title: 'Getting Started',
    children: [
      { title: 'Overview', href: '/docs/getting-started/' },
      { title: 'Installation', href: '/docs/getting-started/installation/' },
      { title: 'Quickstart', href: '/docs/getting-started/quickstart/' },
      { title: 'Project structure', href: '/docs/getting-started/project-structure/' },
    ],
  },
  {
    title: 'Concepts',
    children: [
      { title: 'Game loop', href: '/docs/concepts/game-loop/' },
      { title: 'API shape', href: '/docs/concepts/api-shape/' },
      { title: 'Assets', href: '/docs/concepts/assets/' },
    ],
  },
  {
    title: 'CLI',
    children: [
      { title: 'CLI overview', href: '/docs/cli/' },
      { title: 'Project commands', href: '/docs/cli/project/' },
      { title: 'Build and run', href: '/docs/cli/build/' },
      { title: 'Diagnostics', href: '/docs/cli/diagnostics/' },
      { title: 'Engine versions', href: '/docs/cli/engine/' },
      { title: 'Configuration', href: '/docs/cli/configuration/' },
    ],
  },
  {
    title: 'API',
    children: [
      { title: 'API overview', href: '/docs/api/' },
      { title: 'Core', href: '/docs/api/core/' },
      { title: 'Shapes', href: '/docs/api/shapes/' },
      { title: 'Textures', href: '/docs/api/textures/' },
      { title: 'Text', href: '/docs/api/text/' },
      { title: 'Audio', href: '/docs/api/audio/' },
      { title: 'Models', href: '/docs/api/models/' },
      { title: 'Math', href: '/docs/api/math/' },
      { title: 'Scene', href: '/docs/api/scene/' },
      { title: 'Physics', href: '/docs/api/physics/' },
      { title: 'VFX', href: '/docs/api/vfx/' },
      { title: 'World', href: '/docs/api/world/' },
      { title: 'Mobile', href: '/docs/api/mobile/' },
    ],
  },
  {
    title: 'Platforms',
    children: [
      { title: 'Platform overview', href: '/docs/platforms/' },
      { title: 'Desktop', href: '/docs/platforms/desktop/' },
      { title: 'Apple', href: '/docs/platforms/apple/' },
      { title: 'Mobile', href: '/docs/platforms/mobile/' },
      { title: 'Web and WASM', href: '/docs/platforms/web-wasm/' },
    ],
  },
  {
    title: 'Guides',
    children: [
      { title: 'Physics', href: '/docs/guides/physics/' },
      { title: 'Skeletal animation', href: '/docs/guides/skeletal-animation/' },
      { title: 'World format', href: '/docs/guides/world-format/' },
      { title: 'Assets', href: '/docs/guides/assets/' },
      { title: '2D game', href: '/docs/guides/2d-game/' },
      { title: '3D scene', href: '/docs/guides/3d-scene/' },
      { title: 'Physics gameplay', href: '/docs/guides/physics-gameplay/' },
      { title: 'Assets and worlds', href: '/docs/guides/assets-and-worlds/' },
      { title: 'Audio and UI', href: '/docs/guides/audio-and-ui/' },
    ],
  },
  {
    title: 'Troubleshooting',
    children: [{ title: 'Troubleshooting', href: '/docs/troubleshooting/' }],
  },
  {
    title: 'Reference',
    children: [
      { title: 'Architecture', href: '/docs/reference/architecture/' },
      { title: 'Migration', href: '/docs/reference/migration/' },
    ],
  },
];

export default navigation;
