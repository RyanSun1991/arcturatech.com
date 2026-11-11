/* Armilla invite pages — pure logic shared by invite.js and result.js (WP-116). No DOM, no fetch: unit-tested in Node
 * (deploy/site/tests/site.test.mjs). Ported from the web app so the static pages send exactly what /invite/<token> does:
 *   apps/web/src/lib/chart/input.ts      (form draft → engine BirthInput, draftProblems, 时辰 mid hours)
 *   apps/web/src/lib/sync/wire.ts        (canonicalBirth, engineRelation)
 *   apps/web/src/lib/sync/invites.ts     (result-token storage and hash parsing)
 *   apps/web/src/lib/place/format.ts     (isSearchable)
 *   apps/web/src/components/invite/InviteFillScreen.tsx (reasonOf)
 * The client computes nothing about the chart (CLAUDE.md): dates, zones and calendars are the engine's job on the server. */

export const LOCALES = ['zh-Hans', 'zh-Hant', 'en'];
export const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;

// ---------------------------------------------------------------- tokens (04 §13.1: never in history / the address bar)

/**
 * The invitation token of an invite link: `/armilla/invite/#<token>` (canonical; `#t=` / `#k=` / `#token=` accepted),
 * or a path link `/armilla/invite/<token>` (with an optional web locale prefix) that the site's 404 page forwards here.
 */
export function inviteTokenFrom(hash, pathname = '') {
  const h = String(hash ?? '').replace(/^#/, '');
  const fromHash = h.replace(/^(t|k|token)=/, '');
  if (TOKEN_RE.test(fromHash)) return fromHash;
  const m = /\/invite\/([A-Za-z0-9_-]{43})\/?$/.exec(String(pathname ?? ''));
  return m ? m[1] : null;
}

/** `#<token>` / `#r=<token>` from the result link (as resultTokenFromHash in apps/web). */
export function resultTokenFromHash(hash) {
  const t = String(hash ?? '').replace(/^#/, '').replace(/^r=/, '');
  return TOKEN_RE.test(t) ? t : null;
}

export const RESULT_KEY = 'armilla.inviteResult';

/** The result token stays in this browser only (localStorage until it expires), never in the address bar. */
export function makeResultStore(storage) {
  let memory = null;
  return {
    remember(token, expiresAt) {
      memory = token;
      try {
        storage?.setItem(RESULT_KEY, JSON.stringify({ token, expiresAt }));
      } catch {
        /* private mode: memory only */
      }
    },
    saved(now = Date.now()) {
      try {
        const raw = storage?.getItem(RESULT_KEY);
        if (raw) {
          const v = JSON.parse(raw);
          if (v?.token && TOKEN_RE.test(v.token) && (!v.expiresAt || Date.parse(v.expiresAt) > now)) return v.token;
          storage.removeItem(RESULT_KEY);
        }
      } catch {
        /* fall through */
      }
      return memory;
    },
    forget() {
      memory = null;
      try {
        storage?.removeItem(RESULT_KEY);
      } catch {
        /* ignore */
      }
    },
  };
}

// ---------------------------------------------------------------- birth form (05-UX §4.1, 04 §4.3)

export const TIME_MODES = ['exact', 'plusMinus15m', 'plusMinus1h', 'shichenOnly', 'unknown', 'yearOnly'];
export const BRANCHES = ['zi', 'chou', 'yin', 'mao', 'chen', 'si', 'wu', 'wei', 'shen', 'you', 'xu', 'hai'];
export const HAN_BRANCH = { zi: '子', chou: '丑', yin: '寅', mao: '卯', chen: '辰', si: '巳', wu: '午', wei: '未', shen: '申', you: '酉', xu: '戌', hai: '亥' };
/** Clock hour at the middle of each 时辰 — the fixed input convention of the "只知时辰" picker. */
export const SHICHEN_MID_HOUR = { zi: 0, chou: 2, yin: 4, mao: 6, chen: 8, si: 10, wu: 12, wei: 14, shen: 16, you: 18, xu: 20, hai: 22 };
export const SHICHEN_SPAN = { zi: '23–01', chou: '01–03', yin: '03–05', mao: '05–07', chen: '07–09', si: '09–11', wu: '11–13', wei: '13–15', shen: '15–17', you: '17–19', xu: '19–21', hai: '21–23' };
/** Year-only placeholder date: the engine reads only the year; 1 July keeps the stored value equal to what it uses. */
export const YEAR_ONLY_MONTH_DAY = { month: 7, day: 1 };

export function emptyDraft() {
  return {
    dateKind: 'civil',
    civil: { year: 1990, month: 1, day: 1 },
    lunar: { year: 1990, month: 1, isLeap: false, day: 1 },
    time: { hour: 12, minute: 0 },
    timeMode: 'exact',
    shichen: 'wu',
    place: null,
    sex: null,
  };
}

export const certaintyOf = (mode) => (mode === 'unknown' ? 'dateOnly' : mode);
export const hasTime = (mode) => mode !== 'unknown' && mode !== 'yearOnly';
export const draftYear = (d) => (d.dateKind === 'lunar' ? d.lunar.year : d.civil.year);

/** What still blocks submitting (the engine validates dates, zones and coordinates itself). */
export function draftProblems(d) {
  const out = [];
  if (!d.place || !Number.isFinite(d.place.lat) || !Number.isFinite(d.place.lon) || !d.place.tzId) out.push('place');
  if (!Number.isInteger(draftYear(d)) || draftYear(d) < 1000 || draftYear(d) > 3000) out.push('year');
  return out;
}

export function placeToEngine(p) {
  return { lat: p.lat, lon: p.lon, tzId: p.tzId, nameI18n: { zhHans: p.name['zh-Hans'], zhHant: p.name['zh-Hant'], en: p.name.en } };
}

/** Form → engine `BirthInput` (apps/web toBirthInput). */
export function toBirthInput(d) {
  if (!d.place) throw new Error('place required');
  const date =
    d.timeMode === 'yearOnly'
      ? { kind: 'civil', value: { year: draftYear(d), ...YEAR_ONLY_MONTH_DAY } }
      : d.dateKind === 'lunar'
        ? { kind: 'lunar', value: { year: d.lunar.year, month: d.lunar.month, isLeap: d.lunar.isLeap, day: d.lunar.day } }
        : { kind: 'civil', value: { ...d.civil } };
  const time =
    d.timeMode === 'unknown' || d.timeMode === 'yearOnly'
      ? undefined
      : d.timeMode === 'shichenOnly'
        ? { hour: SHICHEN_MID_HOUR[d.shichen], minute: 0, second: 0 }
        : { hour: d.time.hour, minute: d.time.minute, second: 0 };
  const out = { date, timeCertainty: certaintyOf(d.timeMode), place: placeToEngine(d.place) };
  if (time) out.time = time;
  if (d.sex) out.sexForCalc = d.sex;
  return canonicalBirth(out);
}

/** The canonical wire shape (apps/web canonicalBirth): null names dropped, optional keys only when set. */
export function canonicalBirth(b) {
  const place = b.place ?? {};
  const names = place.nameI18n ? Object.fromEntries(Object.entries(place.nameI18n).filter(([, v]) => v != null && v !== '')) : null;
  const out = { date: b.date, place: { lat: place.lat, lon: place.lon, tzId: place.tzId, ...(names ? { nameI18n: names } : {}) } };
  for (const k of ['time', 'timeCertainty', 'timeRange', 'sexForCalc', 'tzFold']) if (b[k] != null) out[k] = b[k];
  return out;
}

/** The invite-public POST body of a completed form — the same fields and consents as the web page. */
export function completeBody(token, shareLevel, draft, keepCopy) {
  return { token, action: 'complete', share_level: shareLevel, birth: toBirthInput(draft), consent: true, confirm_adult: true, keep_copy: !!keepCopy };
}

export const LEVEL_KEY = { full: 'full', results_only: 'resultsOnly', this_synastry_only: 'thisSynastryOnly' };
export const engineRelation = (r) => (r === 'business_partner' ? 'businessPartner' : r);

// ---------------------------------------------------------------- errors (apps/web reasonOf)

export class ApiError extends Error {
  constructor(status, code, details = []) {
    super(`${status} ${code}`);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
  get issue() {
    return this.details[0]?.issue;
  }
}

export function reasonOf(e) {
  if (!(e instanceof ApiError)) return e?.name === 'NetworkError' ? 'offline' : 'error';
  if (e.status === 404) return 'notFound';
  if (e.status === 410) return e.issue === 'expired' ? 'expired' : 'revoked';
  if (e.status === 429) return 'rateLimited';
  return 'error';
}

// ---------------------------------------------------------------- places (packages/content/geo README §4)

const SEPARATORS = /[,，、·・|/]/u;
const HAN = /\p{Script=Han}/u;
const WORD = /[\p{L}\p{Nd}]/gu;

/** At least one Chinese character, or two letters / digits, before any context separator. */
export function isSearchable(query) {
  const head = String(query ?? '').split(SEPARATORS)[0] ?? '';
  if (HAN.test(head)) return true;
  return (head.match(WORD)?.length ?? 0) >= 2;
}

/** The label after the name (`[division · ]country`); empty when the label is the name alone. */
export function regionOf(r) {
  const head = `${r.name} · `;
  return r.label.startsWith(head) ? r.label.slice(head.length) : '';
}

/** One reference search per locale gives every label exactly as specified (apps/web geo-core.ts). */
export function searchPlaces(geo, query, locale, limit = 8) {
  const per = Object.fromEntries(LOCALES.map((l) => [l, geo.search(query, { locale: l, limit })]));
  return per[locale].map((r, i) => {
    const at = (l) => (per[l][i]?.geonameId === r.geonameId ? per[l][i] : r);
    const en = at('en');
    return {
      id: `geo:${r.geonameId}`,
      lat: en.lat,
      lon: en.lon,
      tzId: en.tz,
      name: { 'zh-Hans': en.names['zh-Hans'], 'zh-Hant': en.names['zh-Hant'], en: en.names.en },
      region: { 'zh-Hans': regionOf(at('zh-Hans')), 'zh-Hant': regionOf(at('zh-Hant')), en: regionOf(en) },
      countryCode: en.cc,
    };
  });
}

/** 31.2304, 121.4737 → "31°13′N 121°28′E" (display only; minutes truncated). */
export function fmtCoords(lat, lon) {
  const dm = (x) => {
    const a = Math.abs(x);
    const d = Math.floor(a + 1e-9);
    const m = Math.floor((a - d) * 60 + 1e-9);
    return `${d}°${String(m).padStart(2, '0')}′`;
  };
  return `${dm(lat)}${lat >= 0 ? 'N' : 'S'} ${dm(lon)}${lon >= 0 ? 'E' : 'W'}`;
}

// ---------------------------------------------------------------- copy (ICU MessageFormat subset of packages/i18n)

/** Read a dotted key from a nested message object. */
export function lookup(messages, key) {
  let v = messages;
  for (const k of key.split('.')) {
    if (v == null || typeof v !== 'object') return undefined;
    v = v[k];
  }
  return typeof v === 'string' ? v : undefined;
}

/** Split `text` at its top-level `{…}` arguments (ICU quoting: '' → ', '{…}' literal). */
function tokens(text) {
  const out = [];
  let lit = '';
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i];
    if (c === "'" && text[i + 1] === "'") {
      lit += "'";
      i += 1;
    } else if (c === "'" && (text[i + 1] === '{' || text[i + 1] === '}')) {
      const end = text.indexOf("'", i + 1);
      lit += text.slice(i + 1, end < 0 ? text.length : end);
      i = end < 0 ? text.length : end;
    } else if (c === '{') {
      let depth = 1;
      let j = i + 1;
      while (j < text.length && depth > 0) {
        if (text[j] === '{') depth += 1;
        else if (text[j] === '}') depth -= 1;
        j += 1;
      }
      if (lit) out.push(lit);
      lit = '';
      out.push({ arg: text.slice(i + 1, j - 1) });
      i = j - 1;
    } else lit += c;
  }
  if (lit) out.push(lit);
  return out;
}

/** `{n, plural, =0 {…} one {…} other {…}}` / `{x, select, a {…} other {…}}` / `{name}`. */
export function formatMessage(text, vars = {}, locale = 'en', hash = null) {
  let out = '';
  for (const tk of tokens(text)) {
    if (typeof tk === 'string') {
      out += hash === null ? tk : tk.replaceAll('#', hash);
      continue;
    }
    const m = /^\s*(\w+)\s*(?:,\s*(plural|select|selectordinal)\s*,([\s\S]*))?$/.exec(tk.arg);
    if (!m) {
      out += `{${tk.arg}}`;
      continue;
    }
    const [, name, kind, rest] = m;
    const value = vars[name];
    if (!kind) {
      out += value === undefined || value === null ? '' : String(value);
      continue;
    }
    const cases = {};
    const re = /\s*(=?\w+)\s*\{/g;
    let pos = 0;
    while (pos < rest.length) {
      re.lastIndex = pos;
      const c = re.exec(rest);
      if (!c) break;
      let depth = 1;
      let j = re.lastIndex;
      while (j < rest.length && depth > 0) {
        if (rest[j] === '{') depth += 1;
        else if (rest[j] === '}') depth -= 1;
        j += 1;
      }
      cases[c[1]] = rest.slice(re.lastIndex, j - 1);
      pos = j;
    }
    let chosen;
    if (kind === 'select') chosen = cases[String(value)] ?? cases.other;
    else {
      const n = Number(value);
      chosen = cases[`=${n}`];
      if (chosen === undefined) {
        let cat = 'other';
        try {
          cat = new Intl.PluralRules(locale, { type: kind === 'selectordinal' ? 'ordinal' : 'cardinal' }).select(n);
        } catch {
          cat = n === 1 ? 'one' : 'other';
        }
        chosen = cases[cat] ?? cases.other;
      }
    }
    out += chosen === undefined ? '' : formatMessage(chosen, vars, locale, kind === 'select' ? hash : new Intl.NumberFormat(locale).format(Number(value)));
  }
  return out;
}

/** A translator over one page's message bundle; a missing key renders `—` (never invented copy). */
export function makeT(messages, locale) {
  const t = (key, vars) => {
    const s = lookup(messages, key);
    return s === undefined ? '—' : formatMessage(s, vars, locale);
  };
  t.has = (key) => lookup(messages, key) !== undefined;
  return t;
}

/**
 * Engine keys with FactVars (apps/web components/app/copy.ts): `facts.<phraseKey>` with vars localised through the
 * module's enum table (then `charts.<enum>`); literal numbers keep two decimals, truncated.
 */
export function makeCopy(t) {
  const sep = t.has('charts.ui.listSep') ? t('charts.ui.listSep') : ', ';
  const tr = (k, v) => (t.has(k) ? t(k, v) : '—');
  const enumValue = (enumName, code) => {
    for (const k of [`facts.enums.${enumName}.${code}`, `charts.${enumName}.${code}`]) if (t.has(k)) return t(k);
    return code;
  };
  const literal = (x) => (/^-?\d+\.\d{3,}$/.test(x) ? (Math.trunc(Number(x) * 100) / 100).toFixed(2) : x);
  const vars = (fv) => {
    const out = {};
    for (const v of fv ?? []) out[v.name] = v.enumName ? v.values.map((x) => enumValue(v.enumName, x)).join(sep) : v.values.map(literal).join(sep);
    return out;
  };
  return {
    sep,
    tr,
    system: (code) => tr(`insights.ontology.systems.${code}`),
    ring: (key, part = 'name') => tr(`insights.ontology.rings.${key}.${part}`),
    insight: (templateKey, part) => tr(`insights.${templateKey}.${part}`),
    hasInsight: (templateKey, part) => t.has(`insights.${templateKey}.${part}`),
    fact: (key, fv) => (key ? tr(`facts.${key}`, vars(fv)) : '—'),
  };
}

/** The six-ring arc path of apps/web PairScreen Rings (an 80 × 80 box; strength outer r = 32, friction inner r = 23). */
export function ringArc(r, frac) {
  const f = Math.max(0, Math.min(0.999, frac));
  const a = -Math.PI / 2 + f * 2 * Math.PI;
  const x = 40 + r * Math.cos(a);
  const y = 40 + r * Math.sin(a);
  return `M40 ${40 - r} A${r} ${r} 0 ${f > 0.5 ? 1 : 0} 1 ${x.toFixed(2)} ${y.toFixed(2)}`;
}

// ---------------------------------------------------------------- opening the app

/** In-app browsers that block store links and universal links (Linnea's list). */
export const BLOCKING_IN_APP = /MicroMessenger|Weibo|DingTalk|AlipayClient| QQ\//i;

export function platformOf(ua = '', maxTouchPoints = 0) {
  if (/Android/i.test(ua)) return 'android';
  if (/iPhone|iPad|iPod/i.test(ua) || (/Macintosh/.test(ua) && maxTouchPoints > 1)) return 'ios';
  return 'other';
}

/**
 * The app link for a route (04 §13: `armilla://<path>` shares the path table). On Android an intent URL falls back to
 * the store when the app is missing; on iOS the custom scheme opens the installed app (a universal link to the page's
 * own domain would stay in Safari).
 */
export function appLink(platform, route, fallbackUrl, pkg = 'com.arcturatech.armilla', scheme = 'armilla') {
  const clean = route.replace(/^\/+/, '');
  if (platform === 'android') {
    const hashAt = clean.indexOf('#');
    const path = hashAt < 0 ? clean : clean.slice(0, hashAt);
    const frag = hashAt < 0 ? '' : clean.slice(hashAt);
    return `intent://${path}${frag}#Intent;scheme=${scheme};package=${pkg};S.browser_fallback_url=${encodeURIComponent(fallbackUrl)};end`;
  }
  return `${scheme}://${clean}`;
}
