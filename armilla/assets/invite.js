/* /armilla/invite/ — the invitee's page on arcturatech.com (WP-116), the static port of apps/web
 * InviteFillScreen (04 §4.3 item 4, §4.10; fixture docs/eng/04-fixtures/invite-public-get.json):
 *   GET invite-public → inviter, relation, three share levels (none preselected) → the birth form → consent + "18 or
 *   older" (+ the separate, unticked keep-a-copy consent) → POST complete → done page with the result link and
 *   "stop sharing" (same link). Same API, fields, consent wording (the apps' own strings) and share levels.
 * The token is the credential: read from the fragment, kept in memory only, removed from the address bar at once. */
import { completePublicInvite, getPublicInvite, revokePublicInvite } from './api.js';
import { SITE } from './config.js';
import {
  ApiError,
  BRANCHES,
  completeBody,
  draftProblems,
  draftYear,
  emptyDraft,
  engineRelation,
  HAN_BRANCH,
  hasTime,
  inviteTokenFrom,
  LEVEL_KEY,
  makeResultStore,
  reasonOf,
  SHICHEN_SPAN,
  TIME_MODES,
} from './invite-core.js';
import { mountPlaceField } from './place.js';
import { currentLang, h, inAppHint, loadT, onLangChange, openAppLink, siteFooter, storeBadges, withSearch } from './page.js';

const main = document.getElementById('app');
const foot = document.getElementById('site-foot');
const results = makeResultStore(window.localStorage);

// §13.1: read the token, then never keep it in the address bar or the history
const token = inviteTokenFrom(window.location.hash, window.location.pathname);
window.history.replaceState(null, '', withSearch(`${SITE.base}/invite/`));

const state = {
  view: token ? { kind: 'loading' } : { kind: 'gone', reason: 'noToken' },
  level: null,
  draft: emptyDraft(),
  consent: false,
  adult: false,
  keepCopy: false,
  hasResult: false,
  tried: false,
  busy: false,
  confirmRevoke: false,
};
let t = null;

const range = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i);
const pad = (n) => String(n).padStart(2, '0');

async function start() {
  t = await loadT('invite', currentLang());
  render();
  onLangChange(async (lang) => {
    t = await loadT('invite', lang);
    render();
  });
  if (token) load();
}

function load() {
  state.view = { kind: 'loading' };
  render();
  getPublicInvite(token).then(
    (meta) => {
      if (meta.status === 'revoked') state.view = { kind: 'gone', reason: 'revoked' };
      else if (meta.status === 'expired') state.view = { kind: 'gone', reason: 'expired' };
      else if (meta.status === 'completed') state.view = { kind: 'done', meta };
      else state.view = { kind: 'form', meta };
      render();
    },
    (e) => {
      state.view = { kind: 'gone', reason: reasonOf(e) };
      render();
    },
  );
}

function ready() {
  return !!state.level && draftProblems(state.draft).length === 0 && state.consent && state.adult;
}

async function submit() {
  state.tried = true;
  if (!ready() || state.view.kind !== 'form') {
    render();
    return;
  }
  state.busy = true;
  render();
  const meta = state.view.meta;
  try {
    const res = await completePublicInvite(completeBody(token, state.level, state.draft, state.keepCopy));
    // the result token stays in this browser (never in the address bar)
    if (res?.result_token) results.remember(res.result_token, res.result_expires_at ?? null);
    state.hasResult = !!res?.result_token;
    state.view = { kind: 'done', meta: { ...meta, status: 'completed', share_level: state.level } };
  } catch (e) {
    if (e instanceof ApiError && e.status === 409) state.view = { kind: 'done', meta };
    else state.view = { kind: 'gone', reason: reasonOf(e), retry: reasonOf(e) === 'error' || reasonOf(e) === 'offline' || reasonOf(e) === 'rateLimited' ? meta : null };
  } finally {
    state.busy = false;
    render();
  }
}

async function revoke() {
  if (state.view.kind !== 'done') return;
  state.busy = true;
  render();
  try {
    await revokePublicInvite(token);
    state.view = { kind: 'done', meta: state.view.meta, revoked: true };
  } catch (e) {
    state.view = { kind: 'gone', reason: reasonOf(e) };
  } finally {
    state.busy = false;
    render();
  }
}

// ---------------------------------------------------------------- views

function render() {
  if (!t) return;
  document.title = t('site.invitePageTitle');
  foot.replaceChildren(...siteFooter(t));
  const v = state.view;
  if (v.kind === 'loading') {
    main.replaceChildren(h('div', { class: 'card', 'aria-busy': 'true', 'data-testid': 'invite-loading' }, h('p', { class: 'muted', text: t('site.loading') })));
  } else if (v.kind === 'gone') main.replaceChildren(goneView(v));
  else if (v.kind === 'done') main.replaceChildren(doneView(v));
  else main.replaceChildren(...formView(v.meta));
}

function goneView(v) {
  const key = v.reason;
  const title =
    key === 'revoked' ? t('client.invite.revoked.title')
    : key === 'expired' ? t('client.invite.expired.title')
    : key === 'notFound' ? t('client.invite.notFound.title')
    : key === 'rateLimited' ? t('client.invite.rateLimited')
    : key === 'noToken' ? t('client.clip.noLink')
    : key === 'offline' ? t('site.offline')
    : t('client.invite.error');
  const body = ['revoked', 'expired', 'notFound'].includes(key) ? h('p', { text: t(`client.invite.${key}.body`) }) : null;
  const retry =
    key === 'offline' || key === 'rateLimited' || key === 'error'
      ? h('button', {
          type: 'button',
          class: 'btn outline',
          text: t('site.retry'),
          'data-testid': 'invite-retry',
          onclick: () => {
            if (v.retry) {
              state.view = { kind: 'form', meta: v.retry };
              render();
            } else if (token) load();
          },
        })
      : null;
  return h(
    'div',
    { class: 'card', role: 'alert', 'data-testid': `invite-${key}` },
    h('h1', { class: 'title', text: title }),
    body,
    retry ? h('div', { class: 'cta-row' }, retry) : null,
    key === 'noToken' || key === 'notFound' ? h('div', { class: 'cta-row' }, h('a', { class: 'btn ghost', href: withSearch(`${SITE.base}/`), text: t('site.learnMore') })) : null,
  );
}

function doneView(v) {
  const lang = currentLang();
  const card = h('div', { class: 'card', role: 'status', 'data-testid': v.revoked ? 'invite-withdrawn' : 'invite-done' }, h('p', { class: 'eyebrow', text: t('client.invite.eyebrow') }));
  card.append(h('h1', { class: 'title', text: v.revoked ? t('client.invite.revoke.done') : t('client.invite.done.title') }));
  if (v.revoked) return card;
  if (state.hasResult || results.saved()) {
    card.append(h('div', { class: 'cta-row' }, h('a', { class: 'btn solid', href: withSearch(`${SITE.base}/invite/result`), 'data-testid': 'invite-see-result', text: t('client.invite.seeResult') })));
  }
  card.append(h('p', { text: t('client.invite.done.app') }), storeBadges(t, lang, 'invite'));
  card.append(h('hr', { class: 'rule' }));
  if (state.confirmRevoke) {
    card.append(
      h('p', { text: t('client.invite.revoke.confirm') }),
      h('div', { class: 'cta-row' }, h('button', { type: 'button', class: 'btn outline', disabled: state.busy, 'data-testid': 'invite-revoke-confirm', text: t('client.invite.revoke.action'), onclick: () => void revoke() })),
    );
  } else {
    card.append(
      h('button', {
        type: 'button',
        class: 'btn ghost',
        'data-testid': 'invite-revoke',
        text: t('client.invite.revoke.action'),
        onclick: () => {
          state.confirmRevoke = true;
          render();
        },
      }),
    );
  }
  return card;
}

/** A segmented single choice (role=radiogroup), like the web's Segmented. */
function segmented(label, value, options, onPick, testPrefix) {
  return h(
    'div',
    { class: 'seg', role: 'radiogroup', 'aria-label': label },
    ...options.map((o) =>
      h('button', {
        type: 'button',
        role: 'radio',
        'aria-checked': String(o.value === value),
        'data-testid': testPrefix ? `${testPrefix}-${o.value}` : null,
        text: o.label,
        onclick: () => onPick(o.value),
      }),
    ),
  );
}

function numSelect(label, value, options, onPick, testId, fmt = String) {
  const sel = h('select', { class: 'input', 'data-testid': testId }, ...options.map((n) => h('option', { value: String(n), text: fmt(n), selected: n === value })));
  sel.addEventListener('change', () => onPick(Number(sel.value)));
  return h('label', { class: 'field' }, h('span', { text: label }), sel);
}

function yearInput(label, value, onPick, testId) {
  const input = h('input', { class: 'input year', type: 'number', inputmode: 'numeric', min: '1000', max: '3000', value: Number.isFinite(value) ? String(value) : '', 'data-testid': testId });
  input.addEventListener('input', () => onPick(input.value === '' ? NaN : Math.trunc(Number(input.value))));
  return h('label', { class: 'field' }, h('span', { text: label }), input);
}

function formView(meta) {
  const lang = currentLang();
  const inviter = meta.inviter_display_name;
  const relation = t(`systems.relationTypes.${engineRelation(meta.relation)}`);
  const d = state.draft;
  const tc = (k, vars) => t(`web.chartNew.${k}`, vars);

  const header = h(
    'header',
    { 'data-testid': 'invite-fill' },
    h('p', { class: 'eyebrow', text: t('client.invite.eyebrow') }),
    h('h1', { class: 'title', 'data-testid': 'invite-header', text: t('client.invite.header', { inviter }) }),
    h('p', { text: t('client.invite.relationLine', { inviter, relation }) }),
    h('p', { class: 'muted', text: t('client.invite.intro') }),
  );

  const openApp = openAppLink(t, `invite/${token}`);
  const appBox = openApp ? h('div', { class: 'card soft' }, openApp, h('p', { class: 'hint', text: t('site.orWeb') })) : null;

  const levels = h(
    'section',
    { 'aria-labelledby': 'lvl-h' },
    h('h2', { id: 'lvl-h', class: 'sub', text: t('client.invite.levelTitle') }),
    h(
      'div',
      { class: 'levels', role: 'radiogroup', 'aria-labelledby': 'lvl-h' },
      ...meta.share_level_options.map((l) =>
        h(
          'button',
          {
            type: 'button',
            role: 'radio',
            class: 'level',
            'aria-checked': String(state.level === l),
            'data-testid': `level-${l}`,
            onclick: () => {
              state.level = l;
              render();
            },
          },
          h('strong', { text: t(`client.invite.level.${LEVEL_KEY[l]}.name`) }),
          h('span', { text: t(`client.invite.level.${LEVEL_KEY[l]}.desc`) }),
        ),
      ),
    ),
  );

  // date
  const yearOnly = d.timeMode === 'yearOnly';
  const dateBox = h('div', { class: 'box' });
  if (yearOnly) {
    dateBox.append(
      h('div', { class: 'fields', 'data-testid': 'date-year-only' }, yearInput(tc('date.year'), draftYear(d), (year) => ((d.civil.year = year), (d.lunar.year = year), refresh()), 'date-year')),
    );
  } else {
    dateBox.append(
      segmented(tc('date.kind'), d.dateKind, [{ value: 'civil', label: tc('date.civil') }, { value: 'lunar', label: tc('date.lunar') }], (v) => ((d.dateKind = v), render()), 'date-kind'),
    );
    if (d.dateKind === 'civil') {
      dateBox.append(
        h(
          'div',
          { class: 'fields' },
          yearInput(tc('date.year'), d.civil.year, (year) => ((d.civil.year = year), refresh()), 'date-year'),
          numSelect(tc('date.month'), d.civil.month, range(1, 12), (month) => (d.civil.month = month), 'date-month'),
          numSelect(tc('date.day'), d.civil.day, range(1, 31), (day) => (d.civil.day = day), 'date-day'),
        ),
      );
    } else {
      const leap = h('input', { type: 'checkbox', checked: d.lunar.isLeap, 'data-testid': 'lunar-leap' });
      leap.addEventListener('change', () => (d.lunar.isLeap = leap.checked));
      dateBox.append(
        h(
          'div',
          { class: 'fields' },
          yearInput(tc('date.year'), d.lunar.year, (year) => ((d.lunar.year = year), refresh()), 'lunar-year'),
          numSelect(tc('date.month'), d.lunar.month, range(1, 12), (month) => (d.lunar.month = month), 'lunar-month'),
          h('label', { class: 'check inline' }, leap, h('span', { text: tc('date.leap') })),
          numSelect(tc('date.day'), d.lunar.day, range(1, 30), (day) => (d.lunar.day = day), 'lunar-day'),
        ),
        h('p', { class: 'hint', text: tc('date.leapHint') }),
      );
    }
    dateBox.append(h('p', { class: 'hint', text: t('site.dateKindNote') }));
  }

  // time
  const modeLabel = (m) => t(`systems.timeCertainty.${m === 'unknown' ? 'unknown' : m}`);
  const timeBox = h('div', { class: 'box' }, segmented(tc('time.certainty'), d.timeMode, TIME_MODES.map((m) => ({ value: m, label: modeLabel(m) })), (m) => ((d.timeMode = m), render()), 'certainty'));
  if (hasTime(d.timeMode)) {
    if (d.timeMode === 'shichenOnly') {
      const sel = h(
        'select',
        { class: 'input', 'data-testid': 'time-shichen' },
        ...BRANCHES.map((b) => h('option', { value: b, selected: b === d.shichen, text: tc('time.shichenOption', { branch: lang === 'en' ? t(`charts.branch.${b}`) : HAN_BRANCH[b], span: SHICHEN_SPAN[b] }) })),
      );
      sel.addEventListener('change', () => (d.shichen = sel.value));
      timeBox.append(h('div', { class: 'fields' }, h('label', { class: 'field' }, h('span', { text: tc('time.shichen') }), sel)));
    } else {
      timeBox.append(
        h(
          'div',
          { class: 'fields' },
          numSelect(tc('time.hour'), d.time.hour, range(0, 23), (hour) => (d.time.hour = hour), 'time-hour', pad),
          numSelect(tc('time.minute'), d.time.minute, range(0, 59), (minute) => (d.time.minute = minute), 'time-minute', pad),
        ),
      );
    }
  }
  timeBox.append(h('p', { class: hasTime(d.timeMode) ? 'hint' : 'note-box', 'data-testid': 'time-note', text: d.timeMode === 'yearOnly' ? t('client.birth.yearOnly.note') : tc(`time.notes.${d.timeMode}`) }));

  // place
  const placeHost = h('div', { 'data-testid': 'place-field' });
  const placeError = h('p', { class: 'error', role: 'alert', text: tc('place.required') });
  const placeProblem = () => state.tried && draftProblems(d).includes('place');
  placeError.hidden = !placeProblem();
  const field = mountPlaceField(placeHost, {
    t,
    lang,
    get: () => d.place,
    set: (p) => {
      d.place = p;
      field.render();
      refresh();
    },
    invalid: placeProblem,
  });

  // sex
  const sexBox = h(
    'div',
    { class: 'box' },
    segmented(tc('sex.label'), d.sex ?? 'skip', [{ value: 'female', label: tc('sex.female') }, { value: 'male', label: tc('sex.male') }, { value: 'skip', label: tc('sex.skip') }], (v) => ((d.sex = v === 'skip' ? null : v), render()), 'sex'),
    h('p', { class: 'hint', text: tc('sex.note') }),
  );

  const section = (eyebrow, title, ...body) => h('section', { class: 'form-sec' }, h('p', { class: 'eyebrow', text: eyebrow, 'aria-hidden': 'true' }), h('h2', { class: 'sub', text: title }), ...body);
  const birth = h(
    'section',
    { 'aria-labelledby': 'birth-h' },
    h('h2', { id: 'birth-h', class: 'sub', text: t('client.invite.birthTitle') }),
    section('DATE', tc('date.label'), dateBox),
    section('TIME', tc('time.label'), timeBox),
    section('PLACE', tc('place.label'), placeHost, placeError),
    section('FOR CALCULATION', tc('sex.label'), sexBox),
  );

  // consents + submit
  const check = (key, label, testId) => {
    const box = h('input', { type: 'checkbox', checked: state[key], 'data-testid': testId });
    box.addEventListener('change', () => {
      state[key] = box.checked;
      refresh();
    });
    return h('label', { class: 'check' }, box, h('span', { text: label }));
  };
  const submitBtn = h('button', { type: 'button', class: 'btn solid block', 'data-testid': 'invite-submit', text: t('client.invite.submit'), onclick: () => void submit() });
  const consents = h(
    'section',
    { class: 'stack' },
    check('consent', t('client.invite.consent', { inviter }), 'invite-consent'),
    check('adult', t('client.invite.adult'), 'invite-adult'),
    check('keepCopy', t('client.invite.keepCopy'), 'invite-keep-copy'),
    h('p', { class: 'hint', text: t('client.invite.privacy') }),
    submitBtn,
  );

  function refresh() {
    submitBtn.disabled = state.busy || !ready();
    placeError.hidden = !placeProblem();
  }
  refresh();

  return [header, inAppHint(t), appBox, levels, birth, consents].filter(Boolean);
}

start().catch(() => {
  main.replaceChildren(h('p', { class: 'muted', text: 'Armilla · 璇玑 — please reload the page.' }));
});
