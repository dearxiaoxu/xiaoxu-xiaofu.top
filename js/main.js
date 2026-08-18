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

  /* ---------- Q1 页面转场（View Transitions，渐进增强） ---------- */
  function shouldTransition(e, link) {
    if (e.defaultPrevented || e.button !== 0) return false;
    if (e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return false;
    var href = link.getAttribute("href");
    if (!href || href.charAt(0) === "#") return false;
    if (link.hasAttribute("download")) return false;
    if (link.target && link.target !== "_self") return false;
    if (link.closest(".stat-link")) return false;
    if (link.pathname && link.pathname.indexOf("/admin") === 0) return false;
    try {
      if (link.origin && link.origin !== location.origin) return false;
    } catch (err) { return false; }
    return true;
  }
  document.addEventListener("click", function (e) {
    var link = e.target && e.target.closest ? e.target.closest("a[href]") : null;
    if (!link || !shouldTransition(e, link)) return;
    e.preventDefault();
    var url = link.href;
    if (document.startViewTransition && !reducedMotion) {
      document.startViewTransition(function () { location.href = url; });
    } else {
      location.href = url;
    }
  });

  /* ---------- Q2 自定义光标系统 ---------- */
  var cursorDot = null, cursorRing = null;
  var cursorX = 0, cursorY = 0, ringX = 0, ringY = 0;
  function initCursor() {
    if (!finePointer || reducedMotion) return;
    if (cursorDot) return;
    cursorDot = document.createElement("div");
    cursorDot.className = "cursor-dot";
    cursorRing = document.createElement("div");
    cursorRing.className = "cursor-ring";
    var label = document.createElement("span");
    label.className = "cursor-ring-label";
    label.textContent = "OPEN \u2197";
    cursorRing.appendChild(label);
    document.body.appendChild(cursorDot);
    document.body.appendChild(cursorRing);
    root.classList.add("custom-cursor");

    document.addEventListener("mousemove", function (e) {
      cursorX = e.clientX;
      cursorY = e.clientY;
      if (cursorDot) {
        cursorDot.style.transform = "translate(" + cursorX + "px," + cursorY + "px)";
        cursorDot.classList.add("visible");
      }
      if (cursorRing) {
        var t = e.target && e.target.closest ? e.target.closest("a, button, .card, .gallery-item, .tilt, .magnetic, .stat-link") : null;
        cursorRing.classList.toggle("hover", !!t);
        cursorRing.classList.add("visible");
      }
    }, { passive: true });

    document.documentElement.addEventListener("mouseleave", function () {
      if (cursorDot) cursorDot.classList.remove("visible");
      if (cursorRing) cursorRing.classList.remove("visible");
    });
    window.addEventListener("touchstart", function () {
      if (cursorDot) cursorDot.classList.remove("visible");
      if (cursorRing) cursorRing.classList.remove("visible");
    }, { passive: true });

    function loop() {
      ringX += (cursorX - ringX) * 0.18;
      ringY += (cursorY - ringY) * 0.18;
      if (cursorRing) cursorRing.style.transform = "translate(" + ringX + "px," + ringY + "px)";
      requestAnimationFrame(loop);
    }
    loop();
  }
  initCursor();

  /* ---------- Q3 顶部滚动进度条 ---------- */
  var scrollBar = document.createElement("div");
  scrollBar.className = "scroll-progress";
  document.body.appendChild(scrollBar);
  var scrollTicking = false;
  function updateScrollProgress() {
    scrollTicking = false;
    var scroller = document.scrollingElement || document.documentElement;
    var max = scroller.scrollHeight - scroller.clientHeight;
    var top = scroller.scrollTop || 0;
    var p = max > 0 ? top / max : 0;
    if (p < 0) p = 0;
    if (p > 1) p = 1;
    scrollBar.style.transform = "scaleX(" + p + ")";
  }
  function requestScrollProgress() {
    if (scrollTicking) return;
    scrollTicking = true;
    requestAnimationFrame(updateScrollProgress);
  }
  window.addEventListener("scroll", requestScrollProgress, { passive: true });
  window.addEventListener("resize", requestScrollProgress, { passive: true });
  updateScrollProgress();

  /* ---------- Q4 Hero 入场动画序列 ---------- */
  function initHeroSeq() {
    var col = document.querySelector(".hero-inner > div:first-child");
    if (!col || col.getAttribute("data-seq-done")) return;
    col.setAttribute("data-seq-done", "1");
    var kids = Array.prototype.slice.call(col.children);
    kids.forEach(function (el, i) {
      el.classList.add("h-seq");
      el.style.setProperty("--d", (i * 0.1) + "s");
    });
  }

  /* ---------- Q5 终端状态块 ---------- */
  function togetherDays() {
    var DAY_MS = 86400000;
    var parts = (document.body.getAttribute("data-together-date") || "").split("-").map(Number);
    var START_MS = (parts.length === 3 && parts[0] && parts[1] && parts[2])
      ? new Date(parts[0], parts[1] - 1, parts[2]).getTime()
      : new Date(2024, 10, 29).getTime();
    var now = new Date();
    var today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    return Math.max(1, Math.round((today - START_MS) / DAY_MS) + 1);
  }
  function initTerminal() {
    var col = document.querySelector(".hero-inner > div:first-child");
    if (!col || col.querySelector(".term-chip")) return;
    var chip = document.createElement("div");
    chip.className = "term-chip";
    chip.innerHTML = '<span class="term-prompt">&gt;</span>' +
      '<span class="term-line">uptime: <b data-uptime>…</b> · visitors: <b class="term-visitors">…</b></span>' +
      '<span class="term-cursor">▌</span>';
    col.appendChild(chip);
    var uptimeEl = chip.querySelector("[data-uptime]");
    if (uptimeEl) uptimeEl.textContent = togetherDays() + "d";
    var visitorsEl = chip.querySelector(".term-visitors");
    fetch("/api/counter")
      .then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
      .then(function (data) {
        if (visitorsEl) visitorsEl.textContent = (data && typeof data.pv === "number") ? String(data.pv) : "—";
      })
      .catch(function () { if (visitorsEl) visitorsEl.textContent = "—"; });
  }

  /* ---------- 对外钩子：动态内容渲染后调用 ---------- */
  window.XXF = {
    refresh: function () {
      initReveal();
      initTyped();
      initCounters();
      initTogether();
      initGalleryMulti();
      initTerminal();
      initHeroSeq();
    }
  };
  window.XXF.refresh();
  initStatLinks();
})();
