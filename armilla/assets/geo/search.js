// Reference implementation of the offline birthplace search (WP-36). Spec: ./README.md §Search.
// Pure ESM, no platform APIs: the iOS (Swift), Android (Kotlin) and Web ports follow this file line by
// line and must pass ./search-vectors.json.
//
//   import { createPlaceSearch } from '@armilla/content/geo/search.mjs';
//   const geo = createPlaceSearch({ cities, admin, countries, fold });   // the four TSV files as text
//   geo.search('台北', { locale: 'zh-Hant', limit: 10 });                 // → [{ geonameId, label, lat, lon, tz, … }]
//
// The file is copied verbatim to the company site, so it imports nothing: the locale list below is generated from the
// registry (WP-374; `node packages/content/geo/gen-locales.mjs`, checked by scripts/main-content-checks.sh).

// <generated-locales> by packages/content/geo/gen-locales.mjs from packages/i18n/locales.json — do not edit

/** Every locale with a name column (README §1), in the order of packages/i18n/locales.json. */
export const LOCALES = ['zh-Hans', 'zh-Hant', 'en', 'ja', 'ko', 'vi', 'fr', 'es'];

/**
 * Each locale's name columns in fallback order — the registry's chain (README §4.4): its own column, its `fallback`
 * locales', then en. A column is the tag without hyphens; `en` is the `name` column of cities.tsv.
 */
export const NAME_CHAINS = {
  'zh-Hans': ['zhHans', 'en'],
  'zh-Hant': ['zhHant', 'zhHans', 'en'],
  en: ['en'],
  ja: ['ja', 'en'],
  ko: ['ko', 'en'],
  vi: ['vi', 'en'],
  fr: ['fr', 'en'],
  es: ['es', 'en'],
};

// </generated-locales>

/** The name columns: every locale's own (`en` = `name` in cities.tsv). A file without one of them reads it as empty. */
const NAME_COLUMNS = [...new Set(Object.values(NAME_CHAINS).map((c) => c[0]))];

/** Dataset v1's name columns: their names are search keys for every reader (README §4.2). */
const V1_COLUMNS = ['en', 'zhHans', 'zhHant'];

/** The columns added after v1 (WP-374): a reader's own chain ranks with the v1 keys, the others after them (§4.3). */
const MORE_COLUMNS = NAME_COLUMNS.filter((col) => !V1_COLUMNS.includes(col));

/** The result's `names` (README §4.4): these locales always carry a name (along their chain, as in dataset v1);
 * every other locale only where the dataset has its own name — never a copy of another locale's. */
const FILLED = ['en', 'zh-Hans', 'zh-Hant'];

/** Trailing administrative suffixes (after folding) that a query or a name may carry or omit. */
export const SUFFIXES = new Set(['市', '县', '区', '镇', '乡', '旗']);

/** Separators between the place name and optional context terms ("Springfield, Illinois"). */
const SEPARATORS = /[,，、·・|/]/u;

const MARK = /\p{Mn}/u;
const KEEP = /[\p{L}\p{Nd}]/u;
const ASCII = /^[\x00-\x7f]*$/;

/** Parse one of the dataset TSV files: first line = header, then one record per line. */
export function parseTsv(text) {
  const lines = text.split('\n');
  const header = lines[0].split('\t');
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    if (lines[i] === '') continue;
    const f = lines[i].split('\t');
    if (f.length !== header.length) throw new Error(`tsv line ${i + 1}: ${f.length} fields, header has ${header.length}`);
    rows.push(f);
  }
  return { header, rows, col: (name) => header.indexOf(name) };
}

/** fold.tsv → Map(code point → replacement string, possibly empty). */
export function parseFold(text) {
  const { rows } = parseTsv(text);
  return new Map(rows.map(([from, to]) => [from, to]));
}

/**
 * Search normalization (README §Normalization): lower-case → NFKD → drop non-spacing marks →
 * map through fold.tsv (special Latin letters, Traditional → Simplified characters) → keep only
 * letters and decimal digits. Full-width forms fold to half-width through NFKD.
 */
export function normalize(s, fold) {
  let out = '';
  for (const ch of s.toLowerCase().normalize('NFKD')) {
    if (MARK.test(ch)) continue;
    const mapped = fold.get(ch);
    for (const c of mapped === undefined ? ch : mapped) if (KEEP.test(c)) out += c;
  }
  return out;
}

/** The string plus, when it ends in an administrative suffix and keeps ≥ 2 characters, the stripped form. */
export function withoutSuffix(n) {
  const cps = [...n];
  if (cps.length >= 3 && SUFFIXES.has(cps[cps.length - 1])) return [n, cps.slice(0, -1).join('')];
  return [n];
}

function substringAllowed(q) {
  const len = [...q].length;
  return ASCII.test(q) ? len >= 3 : len >= 2;
}

/** 3 = exact, 2 = prefix, 1 = substring, 0 = no match. */
function tierOf(keys, variants) {
  let best = 0;
  for (const q of variants) {
    for (const k of keys) {
      if (k === q) return 3;
      if (best < 2 && k.startsWith(q)) best = 2;
      else if (best < 1 && k.includes(q) && substringAllowed(q)) best = 1;
    }
  }
  return best;
}

/** The name in `locale` along its chain (an unknown locale reads as en). */
function pick(names, locale) {
  for (const col of NAME_CHAINS[locale] ?? NAME_CHAINS.en) if (names[col]) return names[col];
  return names.en;
}

/** One row's names by column (`en` from `enCol`); a column the file lacks is empty. */
function namesOf(t, r, enCol) {
  const names = {};
  for (const col of NAME_COLUMNS) {
    const i = t.col(col === 'en' ? enCol : col);
    names[col] = i < 0 ? '' : r[i];
  }
  return names;
}

/** The result's `names` by locale tag. */
function namesByLocale(names) {
  const out = {};
  for (const l of LOCALES) {
    const own = names[NAME_CHAINS[l][0]];
    if (FILLED.includes(l)) out[l] = pick(names, l);
    else if (own) out[l] = own;
  }
  return out;
}

/**
 * Build the searcher from the four dataset files (as text).
 * @param {{cities: string, admin: string, countries: string, fold: string}} files
 */
export function createPlaceSearch(files) {
  const fold = parseFold(files.fold);
  const norm = (s) => normalize(s, fold);
  const keySet = (...names) => [...new Set(names.filter(Boolean).map(norm).filter(Boolean).flatMap(withoutSuffix))];
  const moreKeys = (names) => Object.fromEntries(MORE_COLUMNS.map((col) => [col, keySet(names[col])]));

  const named = (text, keyCol) => {
    const t = parseTsv(text);
    const k = t.col(keyCol);
    const map = new Map();
    for (const r of t.rows) {
      const names = namesOf(t, r, 'en');
      map.set(r[k], { names, keys: keySet(...V1_COLUMNS.map((col) => names[col])), more: moreKeys(names) });
    }
    return map;
  };
  const admins = named(files.admin, 'key');
  const countries = named(files.countries, 'cc');

  const t = parseTsv(files.cities);
  const c = Object.fromEntries(['id', 'ascii', 'alias', 'cc', 'adm', 'lat', 'lon', 'tz', 'pop'].map((n) => [n, t.col(n)]));
  const places = t.rows.map((r) => {
    const names = namesOf(t, r, 'name');
    const cc = r[c.cc];
    const admin = admins.get(`${cc}.${r[c.adm]}`);
    const country = countries.get(cc);
    return {
      geonameId: Number(r[c.id]),
      names,
      cc,
      admin,
      country,
      lat: Number(r[c.lat]),
      lon: Number(r[c.lon]),
      tz: r[c.tz],
      population: Number(r[c.pop]),
      keys: keySet(names.en, r[c.ascii], names.zhHans, names.zhHant, ...r[c.alias].split('|')),
      more: moreKeys(names),
      contextKeys: [cc.toLowerCase(), ...(admin?.keys ?? []), ...(country?.keys ?? [])],
      moreContext: Object.fromEntries(MORE_COLUMNS.map((col) => [col, [...(admin?.more[col] ?? []), ...(country?.more[col] ?? [])]])),
    };
  });
  const byId = new Map(places.map((p) => [p.geonameId, p]));

  function present(p, locale, withAdmin) {
    const name = pick(p.names, locale);
    const admin = p.admin ? pick(p.admin.names, locale) : '';
    const country = p.country ? pick(p.country.names, locale) : p.cc;
    // A part equal to the place name is dropped (香港 · 香港 → 香港, Singapore · Singapore → Singapore).
    const label = [name, withAdmin && admin !== name ? admin : '', country !== name ? country : ''].filter(Boolean).join(' · ');
    return {
      geonameId: p.geonameId,
      label,
      name,
      admin,
      country,
      cc: p.cc,
      lat: p.lat,
      lon: p.lon,
      tz: p.tz,
      population: p.population,
      names: namesByLocale(p.names),
    };
  }

  /**
   * @param {string} query
   * @param {{locale?: string, limit?: number, preferCountries?: string[]}} [opts]  locale: one of LOCALES (another reads as en)
   */
  function search(query, opts = {}) {
    const locale = opts.locale ?? 'en';
    const limit = opts.limit ?? 10;
    const prefer = (opts.preferCountries ?? []).map((x) => x.toUpperCase());
    const [head, ...rest] = query.split(SEPARATORS);
    const q = norm(head);
    if (!q) return [];
    const variants = withoutSuffix(q);
    const context = rest.map(norm).filter(Boolean);
    // The reader's own columns beyond v1 (ja for ja …) count like the v1 keys; the other locales' names still find a
    // place, ranked after every match of those (a zh-Hant reader typing 台东 gets 臺東 before Tokyo's 台東区).
    const own = (NAME_CHAINS[locale] ?? NAME_CHAINS.en).filter((col) => MORE_COLUMNS.includes(col));
    const others = MORE_COLUMNS.filter((col) => !own.includes(col));

    const hits = [];
    for (const p of places) {
      let tier = Math.max(tierOf(p.keys, variants), ...own.map((col) => tierOf(p.more[col], variants)));
      if (tier) tier += 3;
      else tier = Math.max(0, ...others.map((col) => tierOf(p.more[col], variants)));
      if (!tier) continue;
      const contextKeys = own.length ? [...p.contextKeys, ...own.flatMap((col) => p.moreContext[col])] : p.contextKeys;
      if (!context.every((x) => contextKeys.some((k) => k.startsWith(x)))) continue;
      const pi = prefer.indexOf(p.cc);
      hits.push({ p, tier, pref: pi < 0 ? prefer.length : pi });
    }
    hits.sort((a, b) => b.tier - a.tier || a.pref - b.pref || b.p.population - a.p.population || a.p.geonameId - b.p.geonameId);
    return presentAll(hits.slice(0, limit).map((h) => h.p), locale);
  }

  /** Disambiguation: results sharing (display name, country) also show the first-level division. */
  function presentAll(top, locale) {
    const seen = new Map();
    for (const p of top) {
      const k = `${pick(p.names, locale)}\u0000${p.cc}`;
      seen.set(k, (seen.get(k) ?? 0) + 1);
    }
    return top.map((p) => present(p, locale, seen.get(`${pick(p.names, locale)}\u0000${p.cc}`) > 1));
  }

  return {
    search,
    /** The same places (a result list's geonameIds, in order) labelled in another locale, disambiguated within the list. */
    relabel: (ids, locale = 'en') => presentAll(ids.map((id) => byId.get(Number(id))).filter(Boolean), locale),
    byId: (id, locale = 'en') => {
      const p = byId.get(Number(id));
      return p ? present(p, locale, true) : undefined;
    },
    normalize: norm,
    size: places.length,
  };
}
