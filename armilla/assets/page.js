/* Armilla invite pages — DOM helpers shared by invite.js and result.js (WP-116). Every string is set as text (never
 * innerHTML), so a name or a label from the server cannot inject markup. */
import { appStoreUrl, playUrl, SITE } from './config.js';
import { appLink, BLOCKING_IN_APP, makeT, platformOf } from './invite-core.js';

export function h(tag, props = {}, ...children) {
  const isSvg = ['svg', 'path', 'circle'].includes(tag);
  const el = isSvg ? document.createElementNS('http://www.w3.org/2000/svg', tag) : document.createElement(tag);
  for (const [k, v] of Object.entries(props ?? {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') el.setAttribute('class', v);
    else if (k === 'text') el.textContent = v;
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (k === 'checked' || k === 'disabled' || k === 'value' || k === 'selected' || k === 'hidden') el[k] = v;
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  for (const c of children.flat()) {
    if (c === null || c === undefined || c === false) continue;
    el.append(typeof c === 'string' || typeof c === 'number' ? document.createTextNode(String(c)) : c);
  }
  return el;
}

const cache = new Map();

/** The page's message bundle for a language (generated from packages/i18n by deploy/site/build.mjs). */
export async function loadT(page, lang) {
  const key = `${page}.${lang}`;
  if (!cache.has(key)) {
    cache.set(
      key,
      fetch(`${SITE.base}/assets/i18n/${key}.json`, { cache: 'force-cache' }).then((r) => {
        if (!r.ok) throw new Error(`i18n ${r.status}`);
        return r.json();
      }),
    );
  }
  try {
    return makeT(await cache.get(key), lang);
  } catch (e) {
    cache.delete(key);
    throw e;
  }
}

export const currentLang = () => window.ArmillaLang?.get() ?? 'zh-Hans';
export const onLangChange = (fn) => window.ArmillaLang?.onChange(fn);

/** An internal link that keeps this page's query (language; the loopback API flag in tests). */
export function withSearch(path) {
  return `${path}${window.location.search}`;
}

export const platform = () => platformOf(navigator.userAgent, navigator.maxTouchPoints ?? 0);
export const blockedInApp = () => BLOCKING_IN_APP.test(navigator.userAgent);

const BADGE = { 'zh-Hans': 'zh-hans', 'zh-Hant': 'zh-hant', en: 'en' };

/** App Store / Google Play badges (store flags in config.js), or "coming soon" for a store that is not public yet. */
export function storeBadges(t, lang, campaign) {
  const b = BADGE[lang] ?? 'en';
  const wrap = h('div', { class: 'badges' });
  if (SITE.appStore.public) {
    wrap.append(
      h('a', { href: appStoreUrl(campaign ?? SITE.appStore.campaign), 'data-store': 'app-store' }, h('img', { src: `${SITE.base}/img/badge-app-store-${b}.svg`, width: 138, height: 46, alt: 'App Store' })),
    );
  } else wrap.append(h('span', { class: 'soon', text: `${t('web.landing.download.ios')} · ${t('web.landing.download.iosStatus')}` }));
  if (SITE.play.public) {
    wrap.append(h('a', { href: playUrl(campaign ?? SITE.play.campaign), 'data-store': 'play' }, h('img', { src: `${SITE.base}/img/badge-google-play-${b}.svg`, width: 155, height: 46, alt: 'Google Play' })));
  } else wrap.append(h('span', { class: 'soon', text: `${t('web.landing.download.android')} · ${t('web.landing.download.androidStatus')}` }));
  return wrap;
}

/** "Have Armilla? Open in the App" for phones (a custom-scheme / intent link to the same route). */
export function openAppLink(t, route) {
  const p = platform();
  if (p === 'other') return null;
  const fallback = p === 'android' ? playUrl() : appStoreUrl();
  return h('a', { class: 'btn outline block', href: appLink(p, route, fallback, SITE.play.package, SITE.scheme), 'data-testid': 'open-app', text: t('site.openApp') });
}

/** The WeChat-style in-app browser hint (those browsers block universal links and store links). */
export function inAppHint(t) {
  return blockedInApp() ? h('p', { class: 'note-box', role: 'note', 'data-testid': 'in-app-hint', text: t('site.inApp') }) : null;
}

export function siteFooter(t) {
  const reportHref = `mailto:support@arcturatech.com?subject=${encodeURIComponent(t('site.reportSubject'))}`;
  return [
    h('p', { class: 'small', text: t('site.footerNote') }),
    h(
      'nav',
      { 'aria-label': t('site.brand') },
      h('a', { href: withSearch(`${SITE.base}/`), text: t('site.learnMore') }),
      h('a', { href: withSearch(`${SITE.base}/privacy`), text: t('site.privacy') }),
      h('a', { href: withSearch(`${SITE.base}/terms`), text: t('site.terms') }),
      h('a', { href: withSearch(`${SITE.base}/support`), text: t('site.support') }),
      h('a', { href: reportHref, text: t('site.report') }),
    ),
    h('p', { text: '© 2026 Arctura Technologies Inc.' }),
  ];
}
