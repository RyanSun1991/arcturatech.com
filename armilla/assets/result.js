/* /armilla/invite/result — the invitee's pair result on arcturatech.com (WP-116), the static port of apps/web
 * InviteResultScreen / InviteResultView (04 §4.10; fixture docs/eng/04-fixtures/invite-result.json): six rings (no
 * total), the free findings, a locked count without any locked content, the systems present, the note that chart
 * details need full sharing — the inviter's birth data never appears. Viewer frame: a = you, b = the inviter.
 * The token comes from the completion response (kept in this browser) or the link's fragment `#<token>`; it is removed
 * from the address bar at once and kept in localStorage until it expires. "Keep it" needs an account, which this static
 * site does not have: the page hands the result to the app (same link) instead. */
import { getInviteResult } from './api.js';
import { SITE } from './config.js';
import { ApiError, engineRelation, makeCopy, makeResultStore, resultTokenFromHash, ringArc } from './invite-core.js';
import { currentLang, h, inAppHint, loadT, onLangChange, openAppLink, siteFooter, storeBadges, withSearch } from './page.js';

const POLL_MS = 4000;
const POLL_MAX = 45;

const main = document.getElementById('app');
const foot = document.getElementById('site-foot');
const store = makeResultStore(window.localStorage);

const fromHash = resultTokenFromHash(window.location.hash);
if (fromHash) store.remember(fromHash, null);
const token = fromHash ?? store.saved();
// §13.1: the token never stays in the address bar or the history
window.history.replaceState(null, '', withSearch(`${SITE.base}/invite/result`));

let state = token ? { kind: 'loading' } : { kind: 'noToken' };
let attempts = 0;
let openRing = null;
let copied = false;
let t = null;

async function start() {
  t = await loadT('result', currentLang());
  render();
  onLangChange(async (lang) => {
    t = await loadT('result', lang);
    render();
  });
  if (token) fetchView();
}

function fetchView() {
  getInviteResult(token).then(
    (view) => {
      if (view.result_expires_at) store.remember(token, view.result_expires_at);
      state = { kind: 'view', view };
      render();
      if (view.status === 'computing' && attempts < POLL_MAX) {
        attempts += 1;
        setTimeout(fetchView, POLL_MS);
      }
    },
    (e) => {
      state = { kind: e instanceof ApiError && e.status === 404 ? 'notFound' : e?.name === 'NetworkError' ? 'offline' : 'error' };
      render();
    },
  );
}

function render() {
  if (!t) return;
  document.title = t('site.resultPageTitle');
  foot.replaceChildren(...siteFooter(t));
  if (state.kind === 'loading') {
    main.replaceChildren(h('div', { class: 'card', 'aria-busy': 'true', 'data-testid': 'invite-result-loading' }, h('p', { class: 'muted', text: t('site.loading') })));
    return;
  }
  if (state.kind !== 'view') {
    const msg = state.kind === 'offline' ? t('site.offline') : t(`client.inviteResult.${state.kind}`);
    const retry =
      state.kind === 'offline' || state.kind === 'error'
        ? h('button', {
            type: 'button',
            class: 'btn outline',
            text: t('site.retry'),
            onclick: () => {
              state = { kind: 'loading' };
              render();
              fetchView();
            },
          })
        : null;
    main.replaceChildren(h('div', { class: 'card', role: 'alert', 'data-testid': `invite-result-${state.kind}` }, h('p', { text: msg }), retry ? h('div', { class: 'cta-row' }, retry) : null));
    return;
  }
  const { view } = state;
  const inviter = view.inviter_display_name ?? '';
  if (view.status !== 'ready') {
    const key = view.status === 'pending_inviter' ? 'pendingInviter' : view.status;
    main.replaceChildren(
      h('div', { class: 'card', role: view.status === 'computing' ? 'status' : 'alert', 'aria-busy': String(view.status === 'computing'), 'data-testid': `invite-result-${view.status}` }, h('p', { text: t(`client.inviteResult.${key}`, { inviter }) })),
    );
    return;
  }
  main.replaceChildren(...readyView(view, inviter));
}

function readyView(view, inviter) {
  const lang = currentLang();
  const copy = makeCopy(t);
  const you = t('client.inviteResult.you');
  const dir = (o) =>
    o === 'ab' ? t('client.pair.findings.direction', { from: you, to: inviter }) : o === 'ba' ? t('client.pair.findings.direction', { from: inviter, to: you }) : t('client.pair.findings.mutual');
  const findings = view.findings ?? [];
  const rings = view.rings ?? [];
  const locked = view.locked_count ?? 0;

  const header = h(
    'header',
    { 'data-testid': 'invite-result' },
    h('p', { class: 'eyebrow', text: t('client.inviteResult.eyebrow') }),
    h('h1', { class: 'title', 'data-testid': 'invite-result-title', text: t('client.inviteResult.title', { inviter }) }),
    view.relation ? h('p', { text: t('client.inviteResult.relationLine', { inviter, relation: t(`systems.relationTypes.${engineRelation(view.relation)}`) }) }) : null,
    h('p', { class: 'muted', text: t('client.inviteResult.intro') }),
  );

  // six rings — arcs only (strength outer, friction inner), never a number or a total
  const ringList = h(
    'ul',
    { class: 'rings', 'data-testid': 'rings' },
    ...rings.map((r) => {
      const svg = h(
        'svg',
        { viewBox: '0 0 80 80', width: '64', height: '64', 'aria-hidden': 'true' },
        h('circle', { cx: '40', cy: '40', r: '32', fill: 'none', stroke: 'var(--line-2)', 'stroke-width': '5' }),
        h('circle', { cx: '40', cy: '40', r: '23', fill: 'none', stroke: 'var(--line)', 'stroke-width': '4' }),
        r.strength > 0.01 ? h('path', { d: ringArc(32, r.strength), fill: 'none', stroke: 'var(--brass-2)', 'stroke-width': '5', 'stroke-linecap': 'round' }) : null,
        r.friction > 0.01 ? h('path', { d: ringArc(23, r.friction), fill: 'none', stroke: 'var(--s-bazi)', 'stroke-width': '4', 'stroke-linecap': 'round' }) : null,
      );
      const character = t(`client.pair.rings.character.${r.character ?? 'quiet'}`);
      return h(
        'li',
        {},
        h(
          'button',
          {
            type: 'button',
            class: `ring${r.friction_dominant ? ' friction-dominant' : ''}`,
            'aria-expanded': String(openRing === r.key),
            'aria-label': t('client.pair.rings.a11y', { ring: copy.ring(r.key), character }),
            'data-testid': `ring-${r.key}`,
            onclick: () => {
              openRing = openRing === r.key ? null : r.key;
              render();
            },
          },
          svg,
          h('span', { text: copy.ring(r.key) }),
          h('small', { text: `${character}${r.thin_evidence ? ` · ${t('client.pair.rings.thinEvidence')}` : ''}` }),
        ),
      );
    }),
  );
  const ring = rings.find((r) => r.key === openRing);
  const ringDetail = ring
    ? h(
        'div',
        { class: 'card', 'data-testid': 'ring-detail' },
        ring.template_key ? h('p', { class: 'quote', text: copy.insight(ring.template_key, 'quote') }) : null,
        ring.template_key ? h('p', { text: copy.insight(ring.template_key, 'body') }) : null,
        h('p', { class: 'small', text: copy.ring(ring.key, 'describes') }),
        ring.template_key && copy.hasInsight(ring.template_key, 'practice') ? h('p', { class: 'small' }, h('strong', { text: t('client.pair.practice') }), ` · ${copy.insight(ring.template_key, 'practice')}`) : null,
        h('p', { class: 'small', text: `${t('client.pair.rings.evidence')}: ${findings.filter((f) => f.free && (f.rings ?? []).some((x) => x.key === ring.key)).map((f) => copy.fact(f.phrase_key, f.vars)).join(copy.sep) || '—'}` }),
      )
    : null;
  const ringsSec = h(
    'section',
    { 'aria-labelledby': 'rings-h' },
    h('p', { class: 'eyebrow', 'aria-hidden': 'true', text: 'SIX RINGS' }),
    h('h2', { id: 'rings-h', class: 'sub', text: t('client.pair.title') }),
    h(
      'div',
      { class: 'card' },
      ringList,
      h(
        'p',
        { class: 'legend' },
        h('span', {}, h('i', { class: 'swatch', 'aria-hidden': 'true' }), t('client.pair.rings.legendStrength')),
        h('span', {}, h('i', { class: 'swatch friction', 'aria-hidden': 'true' }), t('client.pair.rings.legendFriction')),
        h('span', { text: t('client.pair.rings.footnote') }),
      ),
    ),
    ringDetail,
  );

  const findingsSec = h(
    'section',
    { 'aria-labelledby': 'ir-find-h' },
    h('p', { class: 'eyebrow', 'aria-hidden': 'true', text: t('client.pair.findings.eyebrow') }),
    h('h2', { id: 'ir-find-h', class: 'sub', text: t('client.inviteResult.findingsTitle') }),
    h(
      'ul',
      { class: 'findings', 'data-testid': 'findings' },
      ...findings.map((f) =>
        h(
          'li',
          { class: 'card finding', 'data-testid': 'finding', 'data-system': f.system },
          h('div', { class: 'meta-row' }, h('span', { text: copy.system(f.system) }), h('span', { class: 'dir', text: dir(f.orientation) })),
          h('p', { class: 'phrase', text: copy.fact(f.phrase_key, f.vars) }),
          h('p', { class: 'small', text: copy.fact(f.detail_key, f.vars) }),
        ),
      ),
      locked > 0
        ? h(
            'li',
            { class: 'card locked', 'data-testid': 'invite-result-locked' },
            h('p', { text: t('client.inviteResult.locked', { count: locked }) }),
            // no locked content is ever sent to the invitee: the preview is the systems line only
            h('p', { class: 'small', text: (view.systems ?? []).map((x) => copy.system(x.system)).join(' · ') }),
          )
        : null,
    ),
  );

  const systemsSec =
    (view.systems?.length ?? 0) > 0
      ? h(
          'section',
          { 'aria-labelledby': 'ir-sys-h' },
          h('p', { class: 'eyebrow', 'aria-hidden': 'true', text: 'SYSTEMS' }),
          h('h2', { id: 'ir-sys-h', class: 'sub', text: t('client.inviteResult.systemsTitle') }),
          h('ul', { class: 'card ticks', 'data-testid': 'invite-result-systems' }, ...view.systems.map((x) => h('li', { text: t('client.inviteResult.systemsLine', { system: copy.system(x.system), count: x.findings }) }))),
        )
      : null;

  const note = h('p', { class: 'small', 'data-testid': 'invite-result-note', text: t('client.inviteResult.systemsNote', { inviter }) });

  const copyBtn = h('button', {
    type: 'button',
    class: 'btn ghost',
    'data-testid': 'invite-result-copy',
    text: copied ? t('client.inviteResult.copied') : t('client.inviteResult.copyLink'),
    onclick: () => {
      const link = `${window.location.origin}${SITE.base}/invite/result#${token}`;
      navigator.clipboard?.writeText(link).then(() => {
        copied = true;
        render();
      });
    },
  });
  const keep = h(
    'div',
    { class: 'card', 'data-testid': 'invite-result-keep' },
    h('h2', { class: 'sub', text: t('site.keepInAppTitle') }),
    h('p', { text: t('client.inviteResult.keepBody', { inviter }) }),
    h('p', { class: 'small', text: t('site.keepInAppBody') }),
    openAppLink(t, `invite/result#${token}`),
    storeBadges(t, lang, 'invite_result'),
    h('div', { class: 'row' }, copyBtn),
  );

  return [header, inAppHint(t), ringsSec, findingsSec, systemsSec, note, keep].filter(Boolean);
}

start().catch(() => {
  main.replaceChildren(h('p', { class: 'muted', text: 'Armilla · 璇玑 — please reload the page.' }));
});
