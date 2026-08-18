/* ============================================================
   小站交互脚本 · xiaoxu & xiaofu
   全部采用事件委托：site.js 动态渲染的内容同样生效
   ============================================================ */
(function () {
  "use strict";

  var finePointer = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
  var reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---------- 主题切换（默认跟随系统，手动选择后 localStorage 记忆） ---------- */
  var themeKey = "xxf-theme";
  var root = document.documentElement;
  var toggle = document.querySelector(".theme-toggle");
  var sysMedia = window.matchMedia("(prefers-color-scheme: dark)");

  function applyTheme(theme) {
    root.setAttribute("data-theme", theme);
    if (toggle) {
      toggle.textContent = theme === "dark" ? "☀️" : "🌙";
      toggle.setAttribute("aria-label", theme === "dark" ? "切换到亮色模式" : "切换到暗色模式");
    }
  }
  function savedTheme() {
    try { return localStorage.getItem(themeKey); } catch (e) { return null; }
  }
  function systemTheme() {
    return sysMedia.matches ? "dark" : "light";
  }

  // 初始：有手动记忆就用记忆，否则跟随系统
  applyTheme(savedTheme() || systemTheme());

  // 系统深浅色变化时实时跟随（用户手动选过之后则尊重用户选择，不覆盖）
  function onSystemThemeChange() {
    if (!savedTheme()) applyTheme(systemTheme());
  }
  if (sysMedia.addEventListener) {
    sysMedia.addEventListener("change", onSystemThemeChange);
  } else if (sysMedia.addListener) {
    sysMedia.addListener(onSystemThemeChange);
  }

  if (toggle) {
    toggle.addEventListener("click", function () {
      var next = root.getAttribute("data-theme") === "dark" ? "light" : "dark";
      applyTheme(next);
      try { localStorage.setItem(themeKey, next); } catch (e) { /* 忽略 */ }
    });
  }

  /* ---------- 移动端菜单 ---------- */
  var menuBtn = document.querySelector(".menu-btn");
  var navLinks = document.querySelector(".nav-links");
  if (menuBtn && navLinks) {
    menuBtn.addEventListener("click", function () {
      var open = navLinks.classList.toggle("open");
      menuBtn.classList.toggle("open", open);
      menuBtn.setAttribute("aria-expanded", String(open));
    });
    navLinks.addEventListener("click", function (e) {
      if (e.target.closest("a")) {
        navLinks.classList.remove("open");
        menuBtn.classList.remove("open");
      }
    });
  }

  /* ---------- 卡片聚光灯（委托） ---------- */
  if (finePointer) {
    document.addEventListener("pointermove", function (e) {
      var card = e.target.closest(".card");
      if (!card) return;
      var r = card.getBoundingClientRect();
      card.style.setProperty("--mx", (e.clientX - r.left) + "px");
      card.style.setProperty("--my", (e.clientY - r.top) + "px");
    });
  }

  /* ---------- 3D 倾斜（委托） ---------- */
  if (finePointer && !reducedMotion) {
    var curTilt = null;
    document.addEventListener("pointermove", function (e) {
      var t = e.target.closest(".tilt");
      if (t !== curTilt) {
        if (curTilt) curTilt.style.transform = "";
        curTilt = t;
      }
      if (!t) return;
      var r = t.getBoundingClientRect();
      var px = (e.clientX - r.left) / r.width - 0.5;
      var py = (e.clientY - r.top) / r.height - 0.5;
      t.style.transform = "perspective(700px) rotateX(" + (-py * 8).toFixed(2) + "deg) rotateY(" + (px * 10).toFixed(2) + "deg)";
    });
    document.addEventListener("pointerleave", function () {
      if (curTilt) { curTilt.style.transform = ""; curTilt = null; }
    });
  }

  /* ---------- 磁性按钮（委托） ---------- */
  if (finePointer && !reducedMotion) {
    var curMag = null;
    document.addEventListener("pointermove", function (e) {
      var b = e.target.closest(".magnetic");
      if (b !== curMag) {
        if (curMag) curMag.style.translate = "0 0";
        curMag = b;
      }
      if (!b) return;
      var r = b.getBoundingClientRect();
      var dx = e.clientX - (r.left + r.width / 2);
      var dy = e.clientY - (r.top + r.height / 2);
      b.style.translate = (dx * 0.14).toFixed(1) + "px " + (dy * 0.14).toFixed(1) + "px";
    });
    document.addEventListener("pointerleave", function () {
      if (curMag) { curMag.style.translate = "0 0"; curMag = null; }
    });
  }

  /* ---------- 打字机轮播（可重复初始化） ---------- */
  function initTyped() {
    var typed = document.querySelector(".typed");
    if (!typed) return;
    if (typed.getAttribute("data-done")) return;
    typed.setAttribute("data-done", "1");
    var words = (typed.getAttribute("data-words") || "").split(",").filter(Boolean);
    if (!reducedMotion && words.length) {
      var wi = 0, ci = 0, deleting = false;
      (function tick() {
        var word = words[wi];
        typed.textContent = word.slice(0, ci);
        var delay = 85;
        if (!deleting) {
          ci++;
          if (ci > word.length) { deleting = true; delay = 1700; }
        } else {
          ci--;
          if (ci === 0) { deleting = false; wi = (wi + 1) % words.length; delay = 320; }
        }
        setTimeout(tick, delay);
      })();
    } else if (words.length) {
      typed.textContent = words[0];
    }
  }

  /* ---------- 数字滚动计数（可重复初始化） ---------- */
  var counterObs = null;
  function initCounters() {
    var counters = document.querySelectorAll("[data-count]:not([data-done])");
    counters.forEach(function (el) {
      el.setAttribute("data-done", "1");
      var run = function () {
        var target = parseFloat(el.getAttribute("data-count")) || 0;
        var suffix = el.getAttribute("data-suffix") || "";
        var t0 = null;
        function step(ts) {
          if (!t0) t0 = ts;
          var p = Math.min((ts - t0) / 1200, 1);
          var eased = 1 - Math.pow(1 - p, 3);
          el.textContent = Math.round(target * eased) + (p === 1 ? suffix : "");
          if (p < 1) requestAnimationFrame(step);
        }
        requestAnimationFrame(step);
      };
      if ("IntersectionObserver" in window && !reducedMotion) {
        if (!counterObs) counterObs = new IntersectionObserver(function (entries) {
          entries.forEach(function (en) {
            if (en.isIntersecting) { run(); counterObs.unobserve(en.target); }
          });
        }, { threshold: 0.5 });
        counterObs.observe(el);
      } else {
        run();
      }
    });
  }

  /* ---------- 在一起天数实时计时（可重复初始化） ---------- */
  var togetherTimer = null;
  function initTogether() {
    var els = document.querySelectorAll("[data-together]:not([data-done])");
    if (!els.length) return;
    els.forEach(function (el) { el.setAttribute("data-done", "1"); });
    var DAY_MS = 86400000;
    var START_MS = (function () {
      var d = (document.body.getAttribute("data-together-date") || "").split("-").map(Number);
      return (d.length === 3 && d[0] && d[1] && d[2]) ? new Date(d[0], d[1] - 1, d[2]).getTime() : new Date(2024, 10, 29).getTime();
    })();
    function render() {
      var now = new Date();
      var today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
      var days = Math.max(1, Math.round((today - START_MS) / DAY_MS) + 1);
      document.querySelectorAll("[data-together]").forEach(function (el) { el.textContent = days; });
    }
    render();
    if (!togetherTimer) togetherTimer = setInterval(render, 60 * 1000);
  }

  /* ---------- 滚动显现动画（可重复初始化） ---------- */
  var revealObs = null;
  function initReveal() {
    var els = document.querySelectorAll(".reveal:not(.visible):not([data-reveal-done])");
    els.forEach(function (el) { el.setAttribute("data-reveal-done", "1"); });
    if (!els.length) return;
    if ("IntersectionObserver" in window) {
      if (!revealObs) revealObs = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            entry.target.classList.add("visible");
            revealObs.unobserve(entry.target);
          }
        });
      }, { threshold: 0.12 });
      els.forEach(function (el) { revealObs.observe(el); });
    } else {
      els.forEach(function (el) { el.classList.add("visible"); });
    }
  }

  /* ---------- 图集灯箱（委托，支持图片） ---------- */
  var lightbox = document.querySelector(".lightbox");
  if (lightbox) {
    var lbBox = lightbox.querySelector(".lightbox-box");
    var lbCaption = lightbox.querySelector("p");
    function openLightbox(item) {
      var src = item.getAttribute("data-src");
      lbBox.innerHTML = "";
      if (src) {
        var img = document.createElement("img");
        img.src = src;
        img.alt = item.getAttribute("data-caption") || "";
        img.style.cssText = "width:100%;height:100%;object-fit:cover;border-radius:20px;";
        lbBox.appendChild(img);
        lbBox.className = "lightbox-box";
      } else {
        lbBox.className = "lightbox-box " + (item.getAttribute("data-tile") || "tile-1");
        lbBox.textContent = item.getAttribute("data-emoji") || "📷";
      }
      lbCaption.textContent = item.getAttribute("data-caption") || "";
      lightbox.classList.add("open");
      document.body.style.overflow = "hidden";
    }
    function closeLightbox() {
      lightbox.classList.remove("open");
      document.body.style.overflow = "";
    }
    document.addEventListener("click", function (e) {
      var item = e.target.closest(".gallery-item");
      if (item) { openLightbox(item); return; }
      if (e.target.closest(".lightbox-close") || e.target === lightbox) closeLightbox();
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") closeLightbox();
    });
  }

  /* ---------- Hero 粒子背景 ---------- */
  var canvas = document.querySelector(".hero-particles");
  if (canvas && !reducedMotion) {
    var ctx = canvas.getContext("2d");
    var W = 0, H = 0, parts = [];
    var accent = getComputedStyle(document.documentElement).getPropertyValue("--accent").trim() || "#FA8952";
    function resizeParticles() {
      var r = canvas.parentElement.getBoundingClientRect();
      var dpr = Math.min(window.devicePixelRatio || 1, 2);
      W = r.width; H = r.height;
      canvas.width = W * dpr; canvas.height = H * dpr;
      canvas.style.width = W + "px"; canvas.style.height = H + "px";
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      parts = [];
      var n = Math.min(46, Math.round(W / 26));
      for (var i = 0; i < n; i++) {
        parts.push({
          x: Math.random() * W, y: Math.random() * H,
          r: Math.random() * 1.6 + 0.5,
          vx: (Math.random() - 0.5) * 0.25,
          vy: (Math.random() - 0.5) * 0.25,
          a: Math.random() * 0.5 + 0.15,
          tw: Math.random() * Math.PI * 2
        });
      }
    }
    function drawParticles() {
      ctx.clearRect(0, 0, W, H);
      for (var i = 0; i < parts.length; i++) {
        var pt = parts[i];
        pt.x += pt.vx; pt.y += pt.vy;
        if (pt.x < -10) pt.x = W + 10;
        if (pt.x > W + 10) pt.x = -10;
        if (pt.y < -10) pt.y = H + 10;
        if (pt.y > H + 10) pt.y = -10;
        pt.tw += 0.02;
        ctx.globalAlpha = pt.a * (0.6 + 0.4 * Math.sin(pt.tw));
        ctx.fillStyle = accent;
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, pt.r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      requestAnimationFrame(drawParticles);
    }
    resizeParticles();
    drawParticles();
    var rt = null;
    window.addEventListener("resize", function () {
      clearTimeout(rt);
      rt = setTimeout(resizeParticles, 200);
    });
  }

  /* ---------- 页脚年份 ---------- */
  var yearEl = document.querySelector("[data-year]");
  if (yearEl) yearEl.textContent = String(new Date().getFullYear());

  /* ---------- 多图相册动效（同一事件多张照片轮播淡入） ---------- */
  function initGalleryMulti() {
    document.querySelectorAll(".gallery-multi:not([data-multi-done])").forEach(function (fig) {
      fig.setAttribute("data-multi-done", "1");
      var imgs = Array.prototype.slice.call(fig.querySelectorAll("img"));
      if (imgs.length < 2) return;
      var i = 0;
      function next() {
        imgs.forEach(function (img, idx) {
          img.style.opacity = idx === i ? "1" : "0";
        });
        i = (i + 1) % imgs.length;
      }
      setInterval(next, 2600);
    });
  }

  /* ---------- 城市地图：点击点亮城市查看记忆 ---------- */
  function initCityDots() {
    var map = document.querySelector("#city-map");
    var panel = document.getElementById("city-memory");
    if (!map || map.getAttribute("data-city-done")) return;
    map.setAttribute("data-city-done", "1");
    map.addEventListener("click", function (e) {
      var dot = e.target.closest(".city-dot");
      if (!dot || !panel) return;
      var name = dot.getAttribute("data-name") || "";
      var memory = dot.getAttribute("data-memory") || "";
      var visited = dot.getAttribute("data-visited") === "1";
      if (!visited) {
        panel.innerHTML = '<div class="city-memory-empty"><b></b><p>这里还没留下脚印，期待下一次出发。</p></div>';
        panel.querySelector("b").textContent = name;
        return;
      }
      panel.innerHTML = '<h3></h3><p class="city-memory-text"></p>';
      panel.querySelector("h3").textContent = name;
      panel.querySelector(".city-memory-text").textContent = memory || "关于这座城市的记忆还在路上……";
    });
  }

  /* ---------- 首页统计卡片：点击有个小动效后再跳转 ---------- */
  function initStatLinks() {
    document.addEventListener("click", function (e) {
      var link = e.target.closest(".stat-link");
      if (!link) return;
      var href = link.getAttribute("href");
      if (!href || link.getAttribute("data-going")) return;
      e.preventDefault();
      link.setAttribute("data-going", "1");
      link.classList.add("stat-go");
      setTimeout(function () { window.location.href = href; }, 320);
    });
  }

  /* ---------- 对外钩子：动态内容渲染后调用 ---------- */
  window.XXF = {
    refresh: function () {
      initReveal();
      initTyped();
      initCounters();
      initTogether();
      initGalleryMulti();
      initCityDots();
    }
  };
  window.XXF.refresh();
  initStatLinks();
})();
