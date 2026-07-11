const DEFAULT_API_ORIGIN = 'https://graphics-oc-api.graphicshcompiler.workers.dev';
const BYPASS_PREFIXES = [
  '/static/',
  '/compiler-assets/',
  '/libs/',
];
const BYPASS_PATHS = new Set([
  '/maintenance',
  '/maintenance.html',
  '/favicon.ico',
  '/robots.txt',
  '/sitemap.xml',
  '/ads.txt',
  '/sdk.js',
  '/565e878f197c4724801806808502c6f9.txt',
]);

function wantsHtml(request) {
  const accept = request.headers.get('Accept') || '';
  return accept.includes('text/html') || accept.includes('*/*');
}

function shouldBypass(pathname) {
  if (BYPASS_PATHS.has(pathname)) return true;
  return BYPASS_PREFIXES.some(prefix => pathname.startsWith(prefix));
}

async function maintenanceEnabled(env) {
  const apiOrigin = String(env.PUBLIC_API_URL || DEFAULT_API_ORIGIN).replace(/\/+$/, '');
  const response = await fetch(`${apiOrigin}/api/maintenance/status`, {
    headers: { Accept: 'application/json' },
    cf: { cacheTtl: 0, cacheEverything: false },
  });
  if (!response.ok) return false;
  const data = await response.json().catch(() => ({}));
  return data.enabled === true;
}

function fetchAsset(env, request) {
  return env.ASSETS.fetch(request);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (!['GET', 'HEAD'].includes(request.method) || shouldBypass(url.pathname) || !wantsHtml(request)) {
      return fetchAsset(env, request);
    }

    let enabled = false;
    try {
      enabled = await maintenanceEnabled(env);
    } catch (error) {
      console.error('Maintenance worker status check failed:', error);
    }

    if (!enabled) return fetchAsset(env, request);

    const maintenanceUrl = new URL('/maintenance', url);
    const assetResponse = await fetchAsset(env, new Request(maintenanceUrl, request));
    const headers = new Headers();
    headers.set('Content-Type', assetResponse.headers.get('Content-Type') || 'text/html; charset=utf-8');
    headers.set('Cache-Control', 'no-store, no-cache, must-revalidate');
    headers.set('Retry-After', '600');

    const response = new Response(request.method === 'HEAD' ? null : assetResponse.body, {
      status: 503,
      statusText: 'Service Unavailable',
      headers,
    });
    return response;
  },
};
