import type { APIRoute } from 'astro';
import { defaultSiteUrl, withBase } from '../data/site';

export const GET: APIRoute = ({ site }) => {
  const origin = site ?? new URL(defaultSiteUrl);
  const sitemapUrl = new URL(withBase('/sitemap-index.xml'), origin).href;

  return new Response(`User-agent: *\nAllow: /\n\nSitemap: ${sitemapUrl}\n`, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
    },
  });
};
