/* Armilla links on the company site's 404 page (WP-116; fragment deploy/site/fragments/404.armilla.html).
 * GitHub Pages has no rewrites, so a path-form app link that reaches a browser — /armilla/invite/<token>,
 * /armilla/family/join/<token>, with or without a web locale prefix — is forwarded to the static page with the token
 * moved into the fragment (location.replace: the token-bearing address leaves the history). Any other missing
 * /armilla/… address goes to the Armilla home page. Paths outside /armilla/ are left to the company 404 page. */
(function () {
  'use strict';
  var p = window.location.pathname;
  if (!/^\/armilla(\/|$)/.test(p)) return;
  var q = window.location.search;
  var invite = /^\/armilla\/(?:(?:zh-hans|zh-hant|en)\/)?invite\/([A-Za-z0-9_-]{43})\/?$/.exec(p);
  if (invite) {
    window.location.replace('/armilla/invite/' + q + '#' + invite[1]);
    return;
  }
  if (/^\/armilla\/(?:zh-hans|zh-hant|en)\/invite\/result\/?$/.test(p)) {
    window.location.replace('/armilla/invite/result' + q + window.location.hash);
    return;
  }
  var family = /^\/armilla\/(?:(?:zh-hans|zh-hant|en)\/)?family\/join\/([A-Za-z0-9_-]{20,128})\/?$/.exec(p);
  if (family) {
    window.location.replace('/armilla/family/join/' + q + '#' + family[1]);
    return;
  }
  window.location.replace('/armilla/');
})();
