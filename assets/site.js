/* Arctura Technologies — site behaviour */
(function () {
  "use strict";

  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---------- header ---------- */
  var header = document.querySelector(".site-header");
  function onScroll() {
    if (header) header.classList.toggle("scrolled", window.scrollY > 24);
  }
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  /* ---------- mobile menu ---------- */
  var toggle = document.getElementById("menuToggle");
  if (toggle) {
    toggle.addEventListener("click", function () {
      var open = document.body.classList.toggle("menu-open");
      toggle.setAttribute("aria-expanded", open ? "true" : "false");
    });
    document.querySelectorAll("#navLinks a").forEach(function (a) {
      a.addEventListener("click", function () {
        document.body.classList.remove("menu-open");
        toggle.setAttribute("aria-expanded", "false");
      });
    });
  }

  /* ---------- wordmark: measure real path lengths for draw-in ---------- */
  document.querySelectorAll(".hero-wordmark path").forEach(function (p) {
    try {
      var len = Math.ceil(p.getTotalLength()) + 2;
      p.style.setProperty("--len", len);
    } catch (e) { /* non-blocking */ }
  });

  /* ---------- reveal on scroll ---------- */
  var revealEls = document.querySelectorAll(".reveal");
  if ("IntersectionObserver" in window && !reduceMotion) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) {
          en.target.classList.add("in");
          io.unobserve(en.target);
        }
      });
    }, { threshold: 0.12, rootMargin: "0px 0px -40px 0px" });
    revealEls.forEach(function (el) { io.observe(el); });
  } else {
    revealEls.forEach(function (el) { el.classList.add("in"); });
  }

  /* ---------- active nav link ---------- */
  var sections = ["products", "principles", "company", "contact"]
    .map(function (id) { return document.getElementById(id); })
    .filter(Boolean);
  var navAnchors = Array.prototype.slice.call(document.querySelectorAll("#navLinks a"));
  if ("IntersectionObserver" in window && sections.length) {
    var navIO = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) {
          navAnchors.forEach(function (a) {
            a.classList.toggle("active", a.getAttribute("href") === "#" + en.target.id);
          });
        }
      });
    }, { rootMargin: "-40% 0px -55% 0px" });
    sections.forEach(function (s) { navIO.observe(s); });
  }

  /* ---------- copy email ---------- */
  var copyBtn = document.getElementById("copyEmail");
  var toast = document.getElementById("toast");
  if (copyBtn) {
    copyBtn.addEventListener("click", function () {
      var email = "hello@arcturatech.com";
      function done() {
        if (!toast) return;
        toast.classList.add("show");
        setTimeout(function () { toast.classList.remove("show"); }, 2200);
      }
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(email).then(done, done);
      } else {
        var ta = document.createElement("textarea");
        ta.value = email;
        document.body.appendChild(ta);
        ta.select();
        try { document.execCommand("copy"); } catch (e) {}
        document.body.removeChild(ta);
        done();
      }
    });
  }

  /* ---------- night sky: stars + aurora ---------- */
  var canvas = document.getElementById("sky");
  if (!canvas) return;
  var ctx = canvas.getContext("2d");
  var dpr = Math.min(window.devicePixelRatio || 1, 2);
  var W = 0, H = 0, stars = [], t0 = performance.now();

  function resize() {
    var rect = canvas.parentElement.getBoundingClientRect();
    W = rect.width; H = rect.height;
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    seedStars();
  }

  function seedStars() {
    var count = Math.floor((W * H) / 9000);
    stars = [];
    for (var i = 0; i < count; i++) {
      stars.push({
        x: Math.random() * W,
        y: Math.random() * H * 0.9,
        r: Math.random() * 1.1 + 0.25,
        p: Math.random() * Math.PI * 2,
        s: 0.4 + Math.random() * 0.9
      });
    }
  }

  function aurora(time) {
    var bands = [
      { hue: "55, 181, 160", yBase: 0.30, amp: 0.045, speed: 0.000045, alpha: 0.085, width: 0.16 },
      { hue: "55, 181, 160", yBase: 0.42, amp: 0.06,  speed: 0.00003,  alpha: 0.06,  width: 0.22 },
      { hue: "232, 200, 117", yBase: 0.24, amp: 0.035, speed: 0.00002, alpha: 0.028, width: 0.10 }
    ];
    bands.forEach(function (b, bi) {
      ctx.beginPath();
      var step = 14;
      for (var x = -40; x <= W + 40; x += step) {
        var y = H * b.yBase +
          Math.sin(x * 0.004 + time * b.speed * 1000 + bi * 2.1) * H * b.amp +
          Math.sin(x * 0.0016 + time * b.speed * 640 + bi) * H * b.amp * 0.7;
        if (x === -40) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      var g = ctx.createLinearGradient(0, H * (b.yBase - b.width), 0, H * (b.yBase + b.width));
      g.addColorStop(0, "rgba(" + b.hue + ", 0)");
      g.addColorStop(0.5, "rgba(" + b.hue + ", " + b.alpha + ")");
      g.addColorStop(1, "rgba(" + b.hue + ", 0)");
      ctx.strokeStyle = g;
      ctx.lineWidth = H * b.width;
      ctx.lineCap = "round";
      ctx.stroke();
    });
  }

  function frame(now) {
    ctx.clearRect(0, 0, W, H);
    var time = now - t0;
    aurora(time);
    ctx.fillStyle = "#EAEFF7";
    for (var i = 0; i < stars.length; i++) {
      var st = stars[i];
      var tw = 0.35 + 0.65 * Math.abs(Math.sin(st.p + time * 0.00045 * st.s));
      ctx.globalAlpha = tw * 0.5;
      ctx.beginPath();
      ctx.arc(st.x, st.y, st.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    if (!reduceMotion) requestAnimationFrame(frame);
  }

  window.addEventListener("resize", function () { resize(); }, { passive: true });
  resize();
  if (reduceMotion) {
    frame(t0 + 1);
  } else {
    requestAnimationFrame(frame);
  }
})();
