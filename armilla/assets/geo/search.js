// Reference implementation of the offline birthplace search (WP-36). Spec: ./README.md §Search.
// Pure ESM, no platform APIs: the iOS (Swift), Android (Kotlin) and Web ports follow this file line by
// line and must pass ./search-vectors.json.
//
//   import { createPlaceSearch } from '@armilla/content/geo/search.mjs';
//   const geo = createPlaceSearch({ cities, admin, countries, fold });   // the four TSV files as text
//   geo.search('台北', { locale: 'zh-Hant', limit: 10 });                 // → [{ geonameId, label, lat, lon, tz, … }]

export const LOCALES = ['zh-Hans', 'zh-Hant', 'en'];

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

function pick(names, locale) {
  if (locale === 'zh-Hant') return names.zhHant || names.zhHans || names.en;
  if (locale === 'zh-Hans') return names.zhHans || names.en;
  return names.en;
}

/**
 * Build the searcher from the four dataset files (as text).
 * @param {{cities: string, admin: string, countries: string, fold: string}} files
 */
export function createPlaceSearch(files) {
  const fold = parseFold(files.fold);
  const norm = (s) => normalize(s, fold);
  const keySet = (...names) => [...new Set(names.filter(Boolean).map(norm).filter(Boolean).flatMap(withoutSuffix))];

  const named = (text, keyCol) => {
    const t = parseTsv(text);
    const [k, en, hans, hant] = [keyCol, 'en', 'zhHans', 'zhHant'].map(t.col);
    const map = new Map();
    for (const r of t.rows) {
      const names = { en: r[en], zhHans: r[hans], zhHant: r[hant] };
      map.set(r[k], { names, keys: keySet(names.en, names.zhHans, names.zhHant) });
    }
    return map;
  };
  const admins = named(files.admin, 'key');
  const countries = named(files.countries, 'cc');

  const t = parseTsv(files.cities);
  const c = Object.fromEntries(['id', 'name', 'ascii', 'alias', 'zhHans', 'zhHant', 'cc', 'adm', 'lat', 'lon', 'tz', 'pop'].map((n) => [n, t.col(n)]));
  const places = t.rows.map((r) => {
    const names = { en: r[c.name], zhHans: r[c.zhHans], zhHant: r[c.zhHant] };
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
      contextKeys: [cc.toLowerCase(), ...(admin?.keys ?? []), ...(country?.keys ?? [])],
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
      names: { en: p.names.en, 'zh-Hans': pick(p.names, 'zh-Hans'), 'zh-Hant': pick(p.names, 'zh-Hant') },
    };
  }

  /**
   * @param {string} query
   * @param {{locale?: 'zh-Hans'|'zh-Hant'|'en', limit?: number, preferCountries?: string[]}} [opts]
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

    const hits = [];
    for (const p of places) {
      const tier = tierOf(p.keys, variants);
      if (!tier) continue;
      if (!context.every((x) => p.contextKeys.some((k) => k.startsWith(x)))) continue;
      const pi = prefer.indexOf(p.cc);
      hits.push({ p, tier, pref: pi < 0 ? prefer.length : pi });
    }
    hits.sort((a, b) => b.tier - a.tier || a.pref - b.pref || b.p.population - a.p.population || a.p.geonameId - b.p.geonameId);
    const top = hits.slice(0, limit).map((h) => h.p);

    // Disambiguation: results sharing (display name, country) also show the first-level division.
    const seen = new Map();
    for (const p of top) {
      const k = `${pick(p.names, locale)}\u0000${p.cc}`;
      seen.set(k, (seen.get(k) ?? 0) + 1);
    }
    return top.map((p) => present(p, locale, seen.get(`${pick(p.names, locale)}\u0000${p.cc}`) > 1));
  }

  return {
    search,
    byId: (id, locale = 'en') => {
      const p = byId.get(Number(id));
      return p ? present(p, locale, true) : undefined;
    },
    normalize: norm,
    size: places.length,
  };
}
