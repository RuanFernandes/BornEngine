export const siteName = 'BornEngine';
export const repoUrl = 'https://github.com/RuanFernandes/BornEngine';
export const cliRepoUrl = 'https://github.com/RuanFernandes/bornengine-cli';
export const defaultSiteUrl = 'https://ruanfernandes.github.io';
export const basePath = import.meta.env.BASE_URL;

export function withBase(path: string): string {
  const normalized = path.startsWith('/') ? path : `/${path}`;
  return `${basePath.replace(/\/$/, '')}${normalized}` || '/';
}
