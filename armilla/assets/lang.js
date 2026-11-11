/* Armilla pages — language (WP-116). Loaded in <head> before the body so the right language shows on first paint.
 *
 * Every static page carries zh-Hans, zh-Hant and en; blocks are marked data-l="…" and site.css hides the other two
 * once <html data-lang> is set (without JavaScript all three stay visible). Choice: ?lang= → the visitor's last choice
 * (localStorage, a convenience only) → the browser's languages → English. Titles come from data-title-<lang> on <html>.
 * No request is made; nothing but the language code is stored.
 */
(function () {
  'use strict';
  var KEY = 'armilla.lang';
  var CODES = { 'zh-hans': 'zh-Hans', 'zh-hant': 'zh-Hant', en: 'en' };

  function fromParam(v) {
    return v ? CODES[String(v).toLowerCase()] || null : null;
  }
  function fromBrowser(tag) {
    if (!tag) return null;
    if (/^zh[-_](tw|hk|mo|hant)/i.test(tag)) return 'zh-Hant';
    if (/^zh/i.test(tag)) return 'zh-Hans';
    if (/^en/i.test(tag)) return 'en';
    return null;
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
  if (!lang) lang = 'en';

  var listeners = [];
  function apply(next) {
    var html = document.documentElement;
    html.setAttribute('data-lang', next);
    html.setAttribute('lang', next);
    var title = html.getAttribute('data-title-' + next.toLowerCase());
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
