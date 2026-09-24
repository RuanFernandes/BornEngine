import mdx from '@astrojs/mdx';
import { unified } from '@astrojs/markdown-remark';
import sitemap from '@astrojs/sitemap';
import { defineConfig } from 'astro/config';
import rehypeCodeBlock from './src/plugins/rehype-code-block.mjs';

const site = process.env.SITE_URL ?? 'https://ruanfernandes.github.io';
const base = process.env.BASE_PATH ?? '/BornEngine';

export default defineConfig({
  site,
  base,
  output: 'static',
  trailingSlash: 'always',
  markdown: {
    processor: unified({ rehypePlugins: [rehypeCodeBlock] }),
  },
  integrations: [mdx(), sitemap()],
});
