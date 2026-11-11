/* Armilla pages on arcturatech.com (WP-116) — the one place for endpoints, store flags and app identifiers.
 *
 * anonKey: the production anon (publishable) key is public by design — the gateway needs it and the invite functions
 * never read a user. Git keeps the placeholder; `node deploy/site/build.mjs --out <site>/armilla` fills it from
 * ARMILLA_ANON_KEY and refuses to publish without it.
 *
 * region: Edge Functions run in the database's region. Browsers send it as the documented `forceFunctionRegion`
 * query parameter (Supabase "Regional invocations": for CORS requests), the equivalent of the apps' `x-region` header —
 * a custom header would need the function's CORS allow-list to name it.
 *
 * Store flags: set `appStore.public` / `play.public` to true once the listing is live; a hidden store shows
 * "coming soon" instead of a badge that leads nowhere.
 */
export const SITE = Object.freeze({
  api: 'https://ulocmjdqsebeuloaxxzk.supabase.co',
  anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVsb2NtamRxc2ViZXVsb2F4eHprIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTQyNjcyMDIsImV4cCI6MjEwOTg0MzIwMn0.vXEw8-x_P2fpyKiUi37TqOFB2JFiK9nf8gUHtWhfD5M',
  region: 'ap-southeast-1',
  base: '/armilla',
  scheme: 'armilla',
  appStore: Object.freeze({ public: false, id: '6832763947', providerToken: '128850178', campaign: 'site_armilla' }),
  play: Object.freeze({ public: false, package: 'com.arcturatech.armilla', campaign: 'site_armilla' }),
  clipBundleId: 'com.arcturatech.armilla.Clip',
});

const LOOPBACK = /^http:\/\/(127\.0\.0\.1|localhost):\d{2,5}$/;

/**
 * The API base and key. Tests only: a page served from a loopback host may point at a local Supabase stack with
 * `?api=http://127.0.0.1:<port>&key=<local anon key>`. Anywhere else the flag is ignored (and the page's
 * Content-Security-Policy would block any other host anyway).
 */
export function apiConfig(loc = window.location) {
  if (loc.hostname === '127.0.0.1' || loc.hostname === 'localhost') {
    const q = new URLSearchParams(loc.search);
    const api = q.get('api');
    const key = q.get('key');
    if (api && key && LOOPBACK.test(api)) return { api, anonKey: key, region: SITE.region, test: true };
  }
  return { api: SITE.api, anonKey: SITE.anonKey, region: SITE.region, test: false };
}

export function appStoreUrl(campaign = SITE.appStore.campaign) {
  const s = SITE.appStore;
  return `https://apps.apple.com/app/apple-store/id${s.id}?pt=${s.providerToken}&ct=${encodeURIComponent(campaign)}&mt=8`;
}

export function playUrl(campaign = SITE.play.campaign) {
  return `https://play.google.com/store/apps/details?id=${SITE.play.package}&utm_source=${encodeURIComponent(campaign)}`;
}
