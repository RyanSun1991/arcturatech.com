/* Armilla pages — store badges (WP-116; the pattern of /linnea/store-links.js).
 *
 * Every badge link is marked data-store="app-store" | "play"; its href comes from config.js, and a store whose listing
 * is not public yet (SITE.*.public = false) hides its badge and shows the matching [data-store-soon] note instead.
 * A campaign token (?ct=…, lower-case letters, digits and _, ≤ 30) replaces the default `site_armilla`: App Store links
 * get ct=<token> (with the provider token), Google Play links utm_source=<token>. No request is made, nothing stored.
 */
import { appStoreUrl, playUrl, SITE } from './config.js';

const match = /[?&]ct=([^&#]*)/.exec(window.location.search);
let campaign = null;
if (match) {
  try {
    const ct = decodeURIComponent(match[1]).toLowerCase();
    if (/^[a-z0-9_]{1,30}$/.test(ct)) campaign = ct;
  } catch {
    campaign = null;
  }
}

export function applyStoreLinks(root = document) {
  for (const a of root.querySelectorAll('a[data-store="app-store"]')) {
    a.href = appStoreUrl(campaign ?? SITE.appStore.campaign);
    a.hidden = !SITE.appStore.public;
  }
  for (const a of root.querySelectorAll('a[data-store="play"]')) {
    a.href = playUrl(campaign ?? SITE.play.campaign);
    a.hidden = !SITE.play.public;
  }
  for (const el of root.querySelectorAll('[data-store-soon="app-store"]')) el.hidden = SITE.appStore.public;
  for (const el of root.querySelectorAll('[data-store-soon="play"]')) el.hidden = SITE.play.public;
}

applyStoreLinks();
