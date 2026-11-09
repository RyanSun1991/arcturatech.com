/* Linnea landing pages — carries a registered campaign token (?ct=…) into the store links (docs/43 §7.8, F-1616e).
   The family-link, invite and food pages send people to /linnea/?ct=table (referral, household, web_food …); without
   this, the App Store badge would report them as site_linnea. Only tokens registered in company
   15-运营矩阵/06 §3 (and ads/campaign-links.md) are copied; anything else leaves the links as they are.
   App Store links get ct=<token> (pt stays); Google Play links get utm_source=<token>; the language switch keeps
   ?ct= so the token survives a change of language. No request is made and nothing is stored. */
(function () {
  "use strict";
  var REGISTERED = [
    "site_linnea", "site_qr", "xhs_founder", "xhs_linnea", "wechat_group", "meta_tw", "social_threads", "social_ig",
    "social_x", "linkedin_company", "reddit", "producthunt", "press", "outreach_dm", "threads_zht", "threads_en",
    "ig_zht", "ig_en", "fbgroup_zh", "fbgroup_en", "table", "referral", "household", "web_food"
  ];
  var PATTERN = /^(workshop|partner)_[a-z0-9]{1,20}$/;
  var match = /[?&]ct=([^&#]*)/.exec(window.location.search);
  if (!match) return;
  var ct;
  try { ct = decodeURIComponent(match[1]).toLowerCase(); } catch (e) { return; }
  if (REGISTERED.indexOf(ct) < 0 && !PATTERN.test(ct)) return;
  var links = document.querySelectorAll('a[href^="https://apps.apple.com/"], a[href^="https://play.google.com/"], .lnn-lang a');
  for (var i = 0; i < links.length; i += 1) {
    var a = links[i];
    try {
      var url = new URL(a.getAttribute("href"), window.location.href);
      if (url.hostname === "apps.apple.com") url.searchParams.set("ct", ct);
      else if (url.hostname === "play.google.com") url.searchParams.set("utm_source", ct);
      else if (url.origin === window.location.origin) url.searchParams.set("ct", ct);
      else continue;
      a.setAttribute("href", url.toString());
    } catch (e) { /* leave the link as it is */ }
  }
})();
