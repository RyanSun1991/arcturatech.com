/* Armilla pages — language (WP-116). Loaded in <head> before the body so the right language shows on first paint.
 *
 * Every static page carries its languages as blocks marked data-l="…" (zh-Hans, zh-Hant and en today) and names them in
 * data-title-<lang> on <html>; site.css hides the other blocks once <html data-lang> is set (without JavaScript all stay
 * visible). Choice: ?lang= → the visitor's last choice (localStorage, a convenience only) → the browser's languages → the
 * registry's default fallback (English). No request is made; nothing but the language code is stored.
 *
 * WP-392 · the languages come from the locale registry (packages/i18n/locales.json): the site offers the `live` ones
 * (and the `beta` ones in a development build — WP-368's rule), matches the browser against the live ones only, and
 * shows a page whose text is not written in the chosen language in the first language of its fallback chain that the
 * page holds (en) — never a blank. <html data-lang> / lang is the language the text is in; the switcher marks the choice.
 * GENERATED: deploy/site/build.mjs writes armilla/assets/lang.js from deploy/site/lang.src.js — edit the source.
 */
(function () {
  'use strict';
  var KEY = 'armilla.lang';
  /* { offered: [{ tag, chain, label }], live: [tag], fallback: tag } */
  var SITE = {"offered":[{"tag":"zh-Hans","chain":["zh-Hans","en"],"label":"简体中文"},{"tag":"zh-Hant","chain":["zh-Hant","zh-Hans","en"],"label":"繁體中文"},{"tag":"en","chain":["en"],"label":"English"},{"tag":"ja","chain":["ja","en"],"label":"日本語"},{"tag":"ko","chain":["ko","en"],"label":"한국어"},{"tag":"vi","chain":["vi","en"],"label":"Tiếng Việt"},{"tag":"fr","chain":["fr","en"],"label":"Français"},{"tag":"es","chain":["es","en"],"label":"Español"}],"live":["zh-Hans","zh-Hant","en","ja","ko","vi","fr","es"],"fallback":"en"};
  var CODES = {};
  var CHAINS = {};
  var LABELS = {};
  for (var o = 0; o < SITE.offered.length; o += 1) {
    CODES[SITE.offered[o].tag.toLowerCase()] = SITE.offered[o].tag;
    CHAINS[SITE.offered[o].tag] = SITE.offered[o].chain;
    LABELS[SITE.offered[o].tag] = SITE.offered[o].label;
  }
  /* CLDR likely scripts of the regions whose language the registry carries in two scripts (zh-TW → Hant). */
  var LIKELY = { tw: 'hant', hk: 'hant', mo: 'hant' };

  function fromParam(v) {
    return v ? CODES[String(v).toLowerCase()] || null : null;
  }
  /* A browser language → a live locale of the same language; where two share it (zh-Hans / zh-Hant) the script decides,
   * else the region's likely script, else the first in registry order. A beta locale is never matched (L3). */
  function fromBrowser(tag) {
    if (!tag) return null;
    var parts = String(tag).toLowerCase().split(/[-_]/);
    var same = [];
    for (var i = 0; i < SITE.live.length; i += 1) if (SITE.live[i].toLowerCase().split('-')[0] === parts[0]) same.push(SITE.live[i]);
    if (same.length <= 1) return same[0] || null;
    var script = parts[1] && parts[1].length === 4 ? parts[1] : LIKELY[parts[1]] || '';
    for (var j = 0; j < same.length; j += 1) if (script && same[j].toLowerCase().split('-')[1] === script) return same[j];
    return same[0];
  }

  var match = /[?&]lang=([^&#]*)/.exec(window.location.search);
  var lang = null;
  try {
    lang = match ? fromParam(decodeURIComponent(match[1])) : null;
  } catch (e) {
    lang = null;
  }
  if (!lang) {
    try {
      lang = fromParam(window.localStorage.getItem(KEY));
    } catch (e) {
      lang = null;
    }
  }
  if (!lang) {
    var tags = navigator.languages && navigator.languages.length ? navigator.languages : [navigator.language];
    for (var i = 0; i < tags.length && !lang; i += 1) lang = fromBrowser(tags[i]);
  }
  if (!lang) lang = SITE.fallback;

  /* The language the page's text is shown in: the choice when the page holds it, else the first of its chain it does. */
  function shownOf(choice) {
    var html = document.documentElement;
    var chain = CHAINS[choice] || [choice, SITE.fallback];
    for (var c = 0; c < chain.length; c += 1) if (html.hasAttribute('data-title-' + chain[c].toLowerCase())) return chain[c];
    return chain[chain.length - 1];
  }

  /* A switcher entry for every offered language the page's switcher does not list yet (the page's own three are in its
   * HTML). The label is the catalog's endonym, else the browser's name of the language, else its code. */
  function addSwitcherEntries() {
    var present = document.querySelectorAll('[data-set-lang]');
    if (!present.length) return;
    var groups = [];
    for (var p = 0; p < present.length; p += 1) if (groups.indexOf(present[p].parentNode) < 0) groups.push(present[p].parentNode);
    for (var g = 0; g < groups.length; g += 1) {
      for (var s = 0; s < SITE.offered.length; s += 1) {
        var tag = SITE.offered[s].tag;
        if (groups[g].querySelector('[data-set-lang="' + tag + '"]')) continue;
        var a = document.createElement('a');
        a.setAttribute('href', '?lang=' + tag.toLowerCase());
        a.setAttribute('data-set-lang', tag);
        a.setAttribute('lang', tag);
        a.setAttribute('hreflang', tag);
        var label = LABELS[tag];
        if (!label) {
          try {
            label = new Intl.DisplayNames([tag], { type: 'language' }).of(tag);
          } catch (e) {
            label = null;
          }
        }
        a.textContent = label || tag.toUpperCase();
        groups[g].appendChild(a);
      }
    }
  }

  var listeners = [];
  function apply(next) {
    var html = document.documentElement;
    var shown = shownOf(next);
    html.setAttribute('data-lang', shown);
    html.setAttribute('lang', shown);
    var title = html.getAttribute('data-title-' + shown.toLowerCase());
    if (title) document.title = title;
    var buttons = document.querySelectorAll('[data-set-lang]');
    for (var j = 0; j < buttons.length; j += 1) {
      var on = buttons[j].getAttribute('data-set-lang') === next;
      buttons[j].setAttribute('aria-current', on ? 'true' : 'false');
    }
  }

  window.ArmillaLang = {
    get: function () {
      return lang;
    },
    set: function (next, remember) {
      if (!CODES[String(next).toLowerCase()]) return;
      lang = CODES[String(next).toLowerCase()];
      if (remember) {
        try {
          window.localStorage.setItem(KEY, lang);
        } catch (e) {
          /* private mode: this page only */
        }
      }
      apply(lang);
      for (var k = 0; k < listeners.length; k += 1) listeners[k](lang);
    },
    onChange: function (fn) {
      listeners.push(fn);
    },
  };

  apply(lang);
  document.addEventListener('DOMContentLoaded', function () {
    addSwitcherEntries();
    apply(lang);
    document.addEventListener('click', function (event) {
      var target = event.target && event.target.closest ? event.target.closest('[data-set-lang]') : null;
      if (!target) return;
      event.preventDefault();
      window.ArmillaLang.set(target.getAttribute('data-set-lang'), true);
      try {
        var url = new URL(window.location.href);
        url.searchParams.set('lang', lang.toLowerCase());
        window.history.replaceState(window.history.state, '', url.pathname + url.search + url.hash);
      } catch (e) {
        /* leave the address as it is */
      }
    });
  });
})();
