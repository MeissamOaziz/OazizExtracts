// Vercel Routing Middleware — geo-redirects French-speaking first-time
// visitors from English-root (/) to the French routes (/fr/...).
//
// Behavior:
// 1. Static assets, /fr/*, /api/*, Vercel internals → always pass through.
// 2. `oaziz_locale` cookie present (set by the lang toggle):
//      'fr' → redirect to /fr/<path>
//      'en' → stay on /<path>
// 3. No cookie → detect via Vercel geo headers + Accept-Language:
//      Quebec (CA-QC) OR Accept-Language starting with 'fr' → /fr/<path>
//      otherwise → stay on /<path>
// 4. The toggle in Header.astro sets the cookie on click, so a returning
//    visitor's choice always wins over geo detection.

const PASS_THROUGH = /^\/(fr|api|portail|_vercel|_next|images|favicon|robots|sitemap|apple-touch|icon-|site\.webmanifest)/;
const ASSET_EXT = /\.(png|jpg|jpeg|webp|svg|ico|json|xml|txt|css|js|woff2?|ttf|otf|map)$/i;

export default function middleware(request: Request): Response | void {
  const url = new URL(request.url);

  // 1. Pass-through paths
  if (PASS_THROUGH.test(url.pathname) || ASSET_EXT.test(url.pathname)) return;

  // 2. Cookie wins
  const cookie = request.headers.get('cookie') ?? '';
  const prefMatch = cookie.match(/(?:^|;\s*)oaziz_locale=(fr|en)/);
  if (prefMatch) {
    if (prefMatch[1] === 'fr') {
      return Response.redirect(buildFrUrl(url).toString(), 307);
    }
    return; // 'en' preference → stay on /
  }

  // 3. Geo + Accept-Language detection
  const country = request.headers.get('x-vercel-ip-country') ?? '';
  const region = request.headers.get('x-vercel-ip-country-region') ?? '';
  const acceptLang = request.headers.get('accept-language') ?? '';

  const isQuebec = country === 'CA' && region === 'QC';
  const isFrSpeaking = /^\s*fr\b/i.test(acceptLang);

  if (isQuebec || isFrSpeaking) {
    return Response.redirect(buildFrUrl(url).toString(), 307);
  }
  // Default: English at root — no redirect.
}

function buildFrUrl(url: URL): URL {
  const path = url.pathname === '/' ? '' : url.pathname;
  return new URL(`/fr${path}${url.search}`, url);
}
