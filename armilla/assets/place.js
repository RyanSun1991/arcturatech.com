/* Armilla invite page — birthplace field (WP-116), the static port of apps/web PlaceField: suggestion chips, the
 * offline place database (packages/content/geo, loaded only when the search box is used) searched with the shared
 * reference implementation, or coordinates + IANA zone by hand. The engine resolves historical offsets and DST. */
import { SITE } from './config.js';
import { fmtCoords, isSearchable, searchPlaces } from './invite-core.js';
import { h } from './page.js';

let geoPromise = null;
let suggestedPromise = null;

function loadGeo() {
  if (!geoPromise) {
    const base = `${SITE.base}/assets/geo`;
    const text = (f) =>
      fetch(`${base}/${f}.tsv`, { cache: 'force-cache' }).then((r) => {
        if (!r.ok) throw new Error(`place data ${r.status}`);
        return r.text();
      });
    geoPromise = Promise.all([import('./geo/search.js'), text('cities'), text('admin'), text('countries'), text('fold')]).then(
      ([mod, cities, admin, countries, fold]) => mod.createPlaceSearch({ cities, admin, countries, fold }),
    );
    geoPromise.catch(() => {
      geoPromise = null; // the next focus / query retries
    });
  }
  return geoPromise;
}

function loadSuggested() {
  suggestedPromise ??= fetch(`${SITE.base}/assets/geo/suggested.json`, { cache: 'force-cache' }).then((r) => (r.ok ? r.json() : {}));
  return suggestedPromise.catch(() => ({}));
}

function timeZones() {
  try {
    const zones = Intl.supportedValuesOf?.('timeZone');
    if (zones?.length) return zones.includes('UTC') ? zones : ['UTC', ...zones];
  } catch {
    /* fall through */
  }
  return ['UTC', 'Asia/Shanghai', 'Asia/Hong_Kong', 'Asia/Taipei', 'Asia/Singapore', 'Asia/Tokyo', 'Europe/London', 'America/New_York', 'America/Los_Angeles'];
}

let seq = 0;

/**
 * Mount the field into `host`. `get()` returns the current place, `set(p)` stores it (and re-renders the form's
 * dependent parts). Re-mount on a language change.
 */
export function mountPlaceField(host, { t, lang, get, set, invalid }) {
  const id = `place-${(seq += 1)}`;
  const state = { query: '', results: [], status: 'idle', active: 0, manual: false, lat: '', lon: '', tz: 'UTC' };
  host.replaceChildren();

  const render = () => {
    host.replaceChildren();
    const value = get();
    if (value && !state.manual) {
      const region = value.region?.[lang] && value.id !== 'manual' ? ` · ${value.region[lang]}` : '';
      host.append(
        h(
          'div',
          { class: 'box', 'data-testid': 'place-selected' },
          h(
            'div',
            { class: 'selected' },
            h('span', {}, h('b', { text: value.name[lang] }), h('span', { class: 'small', text: region }), h('br'), h('span', { class: 'mono', text: `${fmtCoords(value.lat, value.lon)} · ${value.tzId}` })),
            h('button', { type: 'button', class: 'linkbtn', text: t('web.chartNew.place.change'), onclick: () => set(null) }),
          ),
          h('p', { class: 'hint', text: t('web.chartNew.place.tzNote') }),
        ),
      );
      return;
    }
    const input = h('input', {
      class: 'input wide',
      type: 'search',
      role: 'combobox',
      'aria-expanded': String(state.results.length > 0),
      'aria-controls': `${id}-list`,
      'aria-autocomplete': 'list',
      'aria-label': t('web.chartNew.place.search'),
      'aria-invalid': invalid() ? 'true' : null,
      placeholder: t('web.chartNew.place.search'),
      value: state.query,
      autocomplete: 'off',
      'data-testid': 'place-search',
    });
    input.addEventListener('focus', warm);
    input.addEventListener('input', () => {
      state.query = input.value;
      warm();
      search();
    });
    input.addEventListener('keydown', (e) => {
      if (!state.results.length) return;
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        state.active = Math.max(0, Math.min(state.results.length - 1, state.active + (e.key === 'ArrowDown' ? 1 : -1)));
        renderList();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        pick(state.results[state.active]);
      }
    });
    const list = h('ul', { class: 'options', id: `${id}-list`, role: 'listbox', 'aria-label': t('web.chartNew.place.label') });
    const status = h('p', { class: 'hint', 'aria-live': 'polite', 'data-testid': 'place-status' });
    const chips = h('div', { class: 'chips', 'aria-label': t('web.chartNew.place.suggestions') });
    const box = h('div', { class: 'box' }, input, list, status, chips);

    function renderList() {
      list.replaceChildren(
        ...state.results.map((p, i) =>
          h(
            'li',
            { role: 'option', id: `${id}-${i}`, 'aria-selected': String(i === state.active) },
            h('button', { type: 'button', class: 'option', 'data-testid': 'place-option', onclick: () => pick(p) }, h('b', { text: p.name[lang] }), p.region?.[lang] ? h('span', { class: 'small', text: ` · ${p.region[lang]}` }) : null),
          ),
        ),
      );
      input.setAttribute('aria-expanded', String(state.results.length > 0));
      if (state.results.length) input.setAttribute('aria-activedescendant', `${id}-${state.active}`);
      else input.removeAttribute('aria-activedescendant');
      const q = state.query.trim();
      status.textContent =
        state.status === 'loading' && isSearchable(q)
          ? t('web.chartNew.place.loading')
          : state.status === 'failed'
            ? t('web.chartNew.place.loadFailed')
            : isSearchable(q) && state.status === 'ready' && !state.results.length
              ? t('site.placeNoResults', { query: q })
              : '';
      chips.hidden = isSearchable(q);
    }

    loadSuggested().then((all) => {
      const sug = all[lang] ?? [];
      chips.replaceChildren(...sug.map((p) => h('button', { type: 'button', class: 'chip', text: p.name[lang], onclick: () => pick(p) })));
    });

    const manualToggle = h('button', { type: 'button', class: 'linkbtn', 'aria-expanded': String(state.manual), text: state.manual ? t('web.chartNew.place.manualHide') : t('web.chartNew.place.manual') });
    manualToggle.addEventListener('click', () => {
      state.manual = !state.manual;
      render();
    });
    box.append(h('div', { class: 'row' }, manualToggle));
    if (state.manual) box.append(manualForm());
    box.append(h('p', { class: 'hint', text: t('web.chartNew.place.dataNote') }));
    host.append(box);
    renderList();

    async function search() {
      const q = state.query.trim();
      if (!isSearchable(q)) {
        state.results = [];
        renderList();
        return;
      }
      try {
        const geo = await loadGeo();
        state.status = 'ready';
        if (state.query.trim() !== q) return;
        state.results = searchPlaces(geo, q, lang, 8);
        state.active = 0;
      } catch {
        state.status = 'failed';
        state.results = [];
      }
      renderList();
    }

    function warm() {
      if (state.status === 'ready') return;
      state.status = 'loading';
      loadGeo().then(
        () => {
          state.status = 'ready';
          search();
        },
        () => {
          state.status = 'failed';
          renderList();
        },
      );
    }
  };

  function pick(p) {
    if (!p) return;
    state.query = '';
    state.results = [];
    state.manual = false;
    set(p);
  }

  function manualForm() {
    const lat = h('input', { class: 'input', inputmode: 'decimal', value: state.lat, 'aria-label': t('web.chartNew.place.lat'), 'data-testid': 'place-lat' });
    const lon = h('input', { class: 'input', inputmode: 'decimal', value: state.lon, 'aria-label': t('web.chartNew.place.lon'), 'data-testid': 'place-lon' });
    const tz = h('select', { class: 'input', 'aria-label': t('web.chartNew.place.tz'), 'data-testid': 'place-tz' }, ...timeZones().map((z) => h('option', { value: z, text: z, selected: z === state.tz })));
    const use = h('button', { type: 'button', class: 'btn outline', text: t('web.chartNew.place.useManual'), 'data-testid': 'place-use-manual' });
    const valid = () => {
      const a = Number(state.lat);
      const b = Number(state.lon);
      return state.lat.trim() !== '' && state.lon.trim() !== '' && Number.isFinite(a) && Number.isFinite(b) && Math.abs(a) <= 90 && Math.abs(b) <= 180 && !!state.tz;
    };
    const sync = () => {
      state.lat = lat.value;
      state.lon = lon.value;
      state.tz = tz.value;
      use.disabled = !valid();
    };
    for (const el of [lat, lon, tz]) el.addEventListener('input', sync);
    tz.addEventListener('change', sync);
    use.disabled = !valid();
    use.addEventListener('click', () => {
      if (!valid()) return;
      const a = Number(state.lat);
      const b = Number(state.lon);
      const name = t('web.chartNew.place.manualName', { lat: a.toFixed(2), lon: b.toFixed(2) });
      const coords = `${a.toFixed(4)}, ${b.toFixed(4)}`;
      state.manual = false;
      set({ id: 'manual', lat: a, lon: b, tzId: state.tz, name: { 'zh-Hans': name, 'zh-Hant': name, en: name }, region: { 'zh-Hans': coords, 'zh-Hant': coords, en: coords } });
    });
    return h(
      'div',
      { class: 'fields' },
      h('label', { class: 'field' }, h('span', { text: t('web.chartNew.place.lat') }), lat),
      h('label', { class: 'field' }, h('span', { text: t('web.chartNew.place.lon') }), lon),
      h('label', { class: 'field' }, h('span', { text: t('web.chartNew.place.tz') }), tz),
      use,
    );
  }

  render();
  return { render };
}
