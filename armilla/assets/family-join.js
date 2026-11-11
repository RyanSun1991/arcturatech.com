/* /armilla/family/join/ — a Family-plan invitation opened in a browser (WP-116). Joining needs an account, which this
 * static site does not have, so the page hands the link to the app (`armilla://family/join/<token>`, 04 §13.2) and
 * shows the stores. The token is read from the fragment (or a path link forwarded by the 404 page), kept in memory
 * and removed from the address bar at once (04 §13.1). No network request is made. */
import { SITE } from './config.js';
import { currentLang, h, inAppHint, loadT, onLangChange, openAppLink, siteFooter, storeBadges, withSearch } from './page.js';

const main = document.getElementById('app');
const foot = document.getElementById('site-foot');
const TOKEN = /^[A-Za-z0-9_-]{20,128}$/;
const raw = window.location.hash.replace(/^#/, '').replace(/^(t|k|token)=/, '');
const token = TOKEN.test(raw) ? raw : null;
window.history.replaceState(null, '', withSearch(`${SITE.base}/family/join/`));
let t = null;

function render() {
  document.title = t('site.familyPageTitle');
  foot.replaceChildren(...siteFooter(t));
  if (!token) {
    main.replaceChildren(h('div', { class: 'card', role: 'alert', 'data-testid': 'family-no-token' }, h('p', { text: t('client.clip.noLink') })));
    return;
  }
  main.replaceChildren(
    ...[
      h('header', { 'data-testid': 'family-join' }, h('p', { class: 'eyebrow', text: 'FAMILY' }), h('h1', { class: 'title', text: t('client.family.join.title') }), h('p', { text: t('client.family.join.confirmGeneric') })),
      inAppHint(t),
      h('div', { class: 'card' }, h('p', { text: t('site.familyJoinBody') }), openAppLink(t, `family/join/${token}`), storeBadges(t, currentLang(), 'family')),
    ].filter(Boolean),
  );
}

loadT('invite', currentLang()).then((tt) => {
  t = tt;
  render();
  onLangChange(async (lang) => {
    t = await loadT('invite', lang);
    render();
  });
});
