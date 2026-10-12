// Same-origin web deployment needs no setting. Bundled Android builds can set
// VITE_API_BASE_URL to the HTTPS origin of the shared Express server.
const viteEnv = import.meta.env || { VITE_API_BASE_URL: '', DEV: false };
const configuredOrigin = String(viteEnv.VITE_API_BASE_URL || '').trim().replace(/\/$/, '');

export function apiUrl(path: string): string {
  if (!path.startsWith('/api/') || !configuredOrigin) return path;
  const parsed = new URL(configuredOrigin);
  if (parsed.pathname !== '/' || parsed.search || parsed.hash ||
      (parsed.protocol !== 'https:' && !(viteEnv.DEV && parsed.hostname === 'localhost'))) {
    throw new Error('VITE_API_BASE_URL must be an HTTPS origin without a path.');
  }
  return `${parsed.origin}${path}`;
}
