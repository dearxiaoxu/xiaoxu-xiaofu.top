/* ============================================================
   小站前端渲染器 · xiaoxu & xiaofu
   从 GET /api/content 读取数据并渲染所有页面内容
   （页面 HTML 只是骨架，内容全部来自 data/db.json）
   ============================================================ */
(function () {
  "use strict";

  function $(id) { return document.getElementById(id); }

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  /* 行内样式：`代码` 与 **加粗**（在转义之后处理，安全） */
  function inline(s) {
    return s.replace(/`([^`]+)`/g, "<code>$1</code>").replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  }

  /* 迷你 Markdown：## 标题 / > 引用 / ``` 代码块 / 普通行变段落 */
  function md(src) {
    src = String(src || "");
    var out = "", inCode = false;
    src.split("\n").forEach(function (line) {
      var t = line.trim();
      if (t.startsWith("```")) {
        if (inCode) { out += "</pre>\n"; inCode = false; }
        else { out += "<pre>"; inCode = true; }
        return;
      }
      if (inCode) { out += esc(line) + "\n"; return; }
      if (!t) return;
      if (t.startsWith("## ")) out += "<h2>" + inline(esc(t.slice(3))) + "</h2>\n";
      else if (t.startsWith("> ")) out += "<blockquote>" + inline(esc(t.slice(2))) + "</blockquote>\n";
      else out += "<p>" + inline(esc(t)) + "</p>\n";
    });
    if (inCode) out += "</pre>";
    return out;
  }

  var DB = null;
  var PAGE = document.body.getAttribute("data-page") || "index";

  /* ---------- 公共片段 ---------- */
  function galleryItemHTML(g, extra) {
    extra = extra || "";
    if (g.type === "image") {
      var photos = [];
      if (Array.isArray(g.photos) && g.photos.length) {
        photos = g.photos.filter(function (p) { return p && p.src; });
      } else if (g.src) {
        photos = [{ src: g.src, caption: g.caption || "" }];
      }
      if (photos.length > 1) {
        var imgs = photos.map(function (p, i) {
          return '<img src="' + esc(p.src) + '" alt="' + esc(p.caption || g.caption || "") + '" loading="lazy" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;' + (i === 0 ? 'opacity:1' : 'opacity:0') + '">';
        }).join("");
        return '<figure class="gallery-item gallery-multi reveal ' + extra + '" data-src="' + esc(photos[0].src) + '" data-caption="' + esc(g.caption || "") + '">' +
          imgs + '<span class="photo-count">' + photos.length + '</span>' +
          '<figcaption>' + esc(g.caption || "") + '</figcaption></figure>';
      }
      if (photos.length === 1) {
        return '<figure class="gallery-item reveal ' + extra + '" data-src="' + esc(photos[0].src) + '" data-caption="' + esc(g.caption || "") + '">' +
          '<img src="' + esc(photos[0].src) + '" alt="' + esc(g.caption || "") + '" loading="lazy" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;">' +
          '<figcaption>' + esc(g.caption || "") + '</figcaption></figure>';
      }
      return '<figure class="gallery-item reveal ' + extra + '"><span class="tile tile-1">🖼️</span><figcaption>' + esc(g.caption || "") + '</figcaption></figure>';
    }
    return '<figure class="gallery-item reveal ' + extra + '" data-tile="' + esc(g.tile || "tile-1") + '" data-emoji="' + esc(g.emoji || "📷") + '" data-caption="' + esc(g.caption) + '">' +
      '<span class="tile ' + esc(g.tile || "tile-1") + '">' + esc(g.emoji || "📷") + '</span>' +
      '<figcaption>' + esc(g.caption) + '</figcaption></figure>';
  }

  function postCardHTML(p) {
    return '<article class="card post-card reveal">' +
      '<time datetime="' + esc(p.date) + '">' + esc(p.date) + '</time>' +
      '<h3><a href="post.html?id=' + encodeURIComponent(p.id) + '">' + esc(p.title) + '</a></h3>' +
      '<p>' + esc(p.excerpt || "") + '</p>' +
      '<div class="card-foot"><span class="chip">' + esc(p.category || "") + '</span>' +
      '<span class="chip gold">' + esc(p.author || "") + '</span>' +
      '<a href="post.html?id=' + encodeURIComponent(p.id) + '">阅读全文 →</a></div></article>';
  }

  function blogListItemHTML(p) {
    var d = String(p.date || "").split("-");
    var day = d[2] || "", ym = d[0] && d[1] ? d[0] + "." + d[1] : "";
    return '<article class="card post-card reveal">' +
      '<div class="post-date"><b>' + esc(day) + '</b>' + esc(ym) + '</div>' +
      '<div class="post-body">' +
      '<div class="post-meta"><span class="chip">' + esc(p.category || "") + '</span> ' +
      '<span class="chip gold">' + esc(p.author || "") + '</span></div>' +
      '<h3><a href="post.html?id=' + encodeURIComponent(p.id) + '">' + esc(p.title) + '</a></h3>' +
      '<p>' + esc(p.excerpt || "") + '</p>' +
      '<a class="card-foot" href="post.html?id=' + encodeURIComponent(p.id) + '">阅读全文 →</a></div></article>';
  }

  function projectCardHTML(p) {
    var statusClass = /长期/.test(p.status || "") ? "gold" : "green";
    var tags = (p.tags || []).map(function (t) { return '<span class="chip">' + esc(t) + '</span>'; }).join("");
    return '<article class="card project-card reveal">' +
      '<div class="project-icon">' + esc(p.icon || "🛠️") + '</div>' +
      '<h3>' + esc(p.title) + '</h3><p>' + esc(p.desc) + '</p>' +
      '<div class="project-tags">' + tags + '<span class="chip ' + statusClass + '">' + esc(p.status || "") + '</span></div></article>';
  }

  function ctaHTML(c, fallback) {
    c = c || fallback || {};
    return '<div class="card reveal" style="padding: 44px 40px; text-align: center; background: linear-gradient(120deg, var(--accent-soft), var(--green-soft));">' +
      '<h2 style="font-family: var(--font-serif); font-size: 1.7rem; margin-bottom: 10px;">' + esc(c.title || "") + '</h2>' +
      '<p style="color: var(--ink-2); margin-bottom: 24px;">' + esc(c.text || "") + '</p>' +
      '<a class="btn btn-primary magnetic" href="' + esc(c.link || "#") + '">' + esc(c.button || "") + '</a></div>';
  }

  /* ---------- 头部/页脚公共填充 ---------- */
  function fillChrome() {
    var name = DB.site.name || "";
    if (DB.site.togetherDate) document.body.setAttribute("data-together-date", DB.site.togetherDate);
    document.querySelectorAll(".js-site-name").forEach(function (e) { e.textContent = name; });
    var tag = $("footer-tagline"); if (tag) tag.textContent = DB.site.tagline || "";
    var fn = $("footer-note"); if (fn) fn.textContent = DB.site.footerNote || "";
    var fbn = $("footer-brand-name"); if (fbn) fbn.textContent = name;
    var m = document.querySelector('meta[name="description"]');
    if (m && DB.site.description) m.setAttribute("content", DB.site.description);
    var em = $("contact-email");
    if (em) { em.textContent = DB.site.email || ""; em.setAttribute("href", "mailto:" + (DB.site.email || "")); }
  }

  /* ---------- 各页面渲染 ---------- */
  function countPhotos(gallery) {
    return (gallery || []).reduce(function (n, g) {
      if (g.type !== "image") return n;
      if (Array.isArray(g.photos) && g.photos.length) return n + g.photos.filter(function (p) { return p && p.src; }).length;
      if (g.src) return n + 1;
      return n;
    }, 0);
  }

  function renderIndex() {
    var h = DB.hero || {}, s = DB.site || {};
    var tripCities = {};
    (DB.trips || []).forEach(function (t) { if (t.city || t.cityId) tripCities[t.city || t.cityId] = 1; });
    var visitedCities = Object.keys(tripCities).length ||
      (DB.cities || []).filter(function (c) { return c.visited; }).length;
    var totalPhotos = countPhotos(DB.gallery || []);

    var statsHTML = (h.stats || []).map(function (st) {
      if (st.kind === "together") {
        return '<div class="stat" title="在一起的日子从 ' + esc(s.togetherDate || "") + ' 起"><b data-together>0</b><span>' + esc(st.label || "") + '</span></div>';
      }
      if (st.kind === "cities") {
        return '<a class="stat stat-link" href="cities.html"><b data-count="' + visitedCities + '">' + visitedCities + '</b><span>' + esc(st.label || "") + '</span></a>';
      }
      if (st.kind === "photos") {
        return '<a class="stat stat-link" href="gallery.html"><b data-count="' + totalPhotos + '" data-suffix="' + esc(st.suffix || "") + '">' + totalPhotos + esc(st.suffix || "") + '</b><span>' + esc(st.label || "") + '</span></a>';
      }
      if (st.kind === "count") {
        return '<div class="stat"><b data-count="' + esc(st.value || 0) + '" data-suffix="' + esc(st.suffix || "") + '">' + esc(st.value) + esc(st.suffix || "") + '</b><span>' + esc(st.label || "") + '</span></div>';
      }
      return '<div class="stat"><b>' + esc(st.value || "") + '</b><span>' + esc(st.label || "") + '</span></div>';
    }).join("");

    var btns = (h.buttons || []).map(function (b) {
      return '<a class="btn ' + (b.primary ? "btn-primary magnetic" : "btn-ghost") + '" href="' + esc(b.link || "#") + '">' + esc(b.text || "") + '</a>';
    }).join("");

    $("hero").innerHTML =
      '<div class="container hero-inner"><div>' +
      '<p class="eyebrow">' + esc(h.eyebrow || "") + '</p>' +
      '<h1>' + esc(h.titleTop || "") + '<br><span class="grad-text">' + esc(h.name1 || "") + '</span> 与 <span class="grad-text">' + esc(h.name2 || "") + '</span></h1>' +
      '<p class="hero-desc">' + esc(h.descBefore || "") +
      '<span class="typed grad-text" data-words="' + esc((h.typedWords || []).join(",")) + '"></span><span class="type-cursor"></span>' +
      esc(h.descAfter || "") + '</p>' +
      '<div class="hero-actions">' + btns + '</div>' +
      '<div class="hero-stats">' + statsHTML + '</div></div>' +
      '<div class="hero-portrait"><div class="couple-cards">' +
      '<div class="avatar-card tilt"><div class="avatar-blob">' + esc((h.p1 && h.p1.name || "x").charAt(0).toLowerCase()) + '</div><b>' + esc(h.p1 && h.p1.name || "") + '</b><span class="avatar-role">' + esc(h.p1 && h.p1.role || "") + '</span></div>' +
      '<div class="love-badge" aria-hidden="true">♥</div>' +
      '<div class="avatar-card tilt"><div class="avatar-blob">' + esc((h.p2 && h.p2.name || "f").charAt(0).toLowerCase()) + '</div><b>' + esc(h.p2 && h.p2.name || "") + '</b><span class="avatar-role">' + esc(h.p2 && h.p2.role || "") + '</span></div>' +
      '</div>' +
      '<span class="portrait-note n1">' + esc(h.p1 && h.p1.note || "") + '</span>' +
      '<span class="portrait-note n2">' + esc(h.p2 && h.p2.note || "") + '</span></div></div>';

    $("index-posts").innerHTML = DB.posts.slice(0, 3).map(postCardHTML).join("");
    $("index-projects").innerHTML = DB.projects.slice(0, 2).map(projectCardHTML).join("");
    $("index-gallery").innerHTML = DB.gallery.slice(0, 4).map(function (g) { return galleryItemHTML(g); }).join("");
    $("index-cta").innerHTML = ctaHTML(DB.site.cta);
  }

  function renderAbout() {
    var a = DB.about || {};
    $("about-banner").innerHTML =
      '<p class="eyebrow">' + esc(a.eyebrow || "") + '</p>' +
      '<h1>' + esc(a.title || "") + '</h1>' +
      '<p>' + esc(a.intro || "") + '</p>';

    $("about-profiles").innerHTML = (a.profiles || []).map(function (pf) {
      return '<article class="card profile-card reveal">' +
        '<div class="avatar-blob">' + esc((pf.name || "?").charAt(0).toLowerCase()) + '</div>' +
        '<h2>' + esc(pf.name) + '</h2>' +
        '<p class="avatar-role">' + esc(pf.role || "") + '</p>' +
        '<p>' + esc(pf.bio || "") + '</p>' +
        '<div class="skill-list">' + (pf.skills || []).map(function (sk) { return '<span class="chip">' + esc(sk) + '</span>'; }).join("") + '</div>' +
        '</article>';
    }).join("");

    var st = a.story || {};
    var counterMain = String(a.counter && a.counter.main || "在一起第 {n} 天").split("{n}").join('<b data-together>0</b>');
    var counterSub = a.counter && a.counter.sub || "";
    var counterDate = (DB.site.togetherDate || "").replace(/-/g, ".");
    if (counterSub.indexOf("{d}") >= 0) counterSub = counterSub.split("{d}").join(counterDate);

    $("about-story").innerHTML =
      '<div class="love-counter reveal"><span class="heart">♥</span>' +
      '<div class="lc-main">' + counterMain + '</div>' +
      '<div class="lc-sub">' + esc(counterSub) + '</div></div>' +
      '<div class="timeline reveal">' + (st.timeline || []).map(function (t) {
        return '<div class="timeline-item"><time>' + esc(t.time) + '</time><h3>' + esc(t.title) + '</h3><p>' + esc(t.text) + '</p></div>';
      }).join("") + '</div>';

    $("about-hobbies").innerHTML = (a.hobbies || []).map(function (hb) {
      return '<div class="card hobby-card reveal"><span class="emoji">' + esc(hb.emoji) + '</span><h3>' + esc(hb.title) + '</h3><p>' + esc(hb.text) + '</p></div>';
    }).join("");

    $("about-cta").innerHTML = ctaHTML(a.cta);
  }

  function renderBlog() {
    var list = DB.posts.slice().sort(function (x, y) { return String(y.date).localeCompare(String(x.date)); });
    $("blog-list").innerHTML = list.map(blogListItemHTML).join("") ||
      '<div class="card" style="padding:26px 28px;text-align:center;color:var(--ink-2);">还没有文章，去后台写一篇吧～</div>';
  }

  function renderPost() {
    var id = new URLSearchParams(location.search).get("id");
    var p = DB.posts.find(function (x) { return x.id === id; });
    var box = $("post");
    if (!p) {
      box.innerHTML = '<div class="card" style="padding:32px;text-align:center;color:var(--ink-2);">没有找到这篇文章 🤔<br><br><a class="btn btn-ghost" href="blog.html">← 返回博客列表</a></div>';
      return;
    }
    document.title = p.title + " · " + (DB.site.name || "");
    var m = document.querySelector('meta[name="description"]');
    if (m) m.setAttribute("content", p.excerpt || "");
    box.innerHTML =
      '<header class="article-header">' +
      '<p class="breadcrumb"><a href="blog.html">博客</a> / ' + esc(p.category || "") + '</p>' +
      '<h1>' + esc(p.title) + '</h1>' +
      '<div class="article-meta"><span>✍️ ' + esc(p.author || "") + '</span><time datetime="' + esc(p.date) + '">' + esc(p.date) + '</time><span class="chip">' + esc(p.category || "") + '</span></div>' +
      '</header>' +
      '<div class="article-body">' + md(p.body) + '</div>' +
      '<div class="article-back"><a class="btn btn-ghost" href="blog.html">← 返回博客列表</a></div>';
  }

  function renderProjects() {
    $("projects-grid").innerHTML = DB.projects.map(projectCardHTML).join("") ||
      '<div class="card" style="padding:26px 28px;text-align:center;color:var(--ink-2);">还没有项目，去后台添加吧～</div>';
  }

  function renderGallery() {
    $("gallery-grid").innerHTML = DB.gallery.map(function (g) { return galleryItemHTML(g); }).join("") ||
      '<div class="card" style="padding:26px 28px;text-align:center;color:var(--ink-2);">相册还空着，去后台添加照片吧～</div>';
  }

  function renderTrips() {
    var mapEl = $("trip-map");
    var timelineEl = $("trip-timeline");
    var detailEl = $("trip-detail");
    var filtersEl = $("trip-filters");
    var statsEl = $("trip-stats");
    var playBtn = $("trip-play");
    if (!mapEl) return;

    var trips = (DB.trips || []).filter(function (t) {
      return t && typeof t.lng === "number" && typeof t.lat === "number";
    }).slice().sort(function (a, b) {
      return String(a.start || "").localeCompare(String(b.start || ""));
    });

    var year = "all";
    var activeId = null;
    var playing = false;
    var playTimer = null;
    var provinces = null;

    var popEl = document.createElement("div");
    popEl.className = "trip-map-pop";
    mapEl.appendChild(popEl);

    /* 左右面板：手动收起 / 展开（移动端为抽屉） */
    var pageEl = mapEl.closest(".trip-page");
    var leftToggle = $("trip-toggle-left");
    var rightToggle = $("trip-toggle-right");
    var timelineClose = $("trip-timeline-close");
    var detailClose = $("trip-detail-close");
    var backdrop = $("trip-backdrop");
    var mobileMQ = window.matchMedia("(max-width: 900px)");

    function isPanelCollapsed(side) {
      return pageEl.classList.contains(side === "left" ? "left-collapsed" : "right-collapsed");
    }
    function setPanelCollapsed(side, collapsed) {
      var cls = side === "left" ? "left-collapsed" : "right-collapsed";
      pageEl.classList.toggle(cls, collapsed);
      if (side === "left") {
        leftToggle.textContent = collapsed ? "›" : "‹";
        leftToggle.setAttribute("aria-label", collapsed ? "展开时间轴" : "收起时间轴");
      } else {
        rightToggle.textContent = collapsed ? "‹" : "›";
        rightToggle.setAttribute("aria-label", collapsed ? "展开详情" : "收起详情");
      }
      pageEl.classList.toggle("drawer-open", !isPanelCollapsed("left") || !isPanelCollapsed("right"));
    }

    /* 投影：中国陆地范围 → SVG viewBox */
    var VIEW_W = 900, VIEW_H = 700, PAD = 48;
    var MIN_LNG = 73.5, MAX_LNG = 135.1, MIN_LAT = 18.2, MAX_LAT = 53.6;
    function mercY(lat) { return Math.log(Math.tan(Math.PI / 4 + lat * Math.PI / 360)) * (180 / Math.PI); }
    var MIN_Y = mercY(MIN_LAT), MAX_Y = mercY(MAX_LAT);
    function project(lng, lat) {
      var x = (lng - MIN_LNG) / (MAX_LNG - MIN_LNG);
      var y = (mercY(lat) - MIN_Y) / (MAX_Y - MIN_Y);
      return [PAD + x * (VIEW_W - PAD * 2), PAD + (1 - y) * (VIEW_H - PAD * 2)];
    }

    function getYear(t) { return String((t.start || "").slice(0, 4) || ""); }
    function tripDays(t) {
      if (!t.start) return 0;
      var a = new Date(t.start), b = t.end ? new Date(t.end) : new Date(t.start);
      if (isNaN(a.getTime()) || isNaN(b.getTime())) return 0;
      return Math.max(1, Math.round((b - a) / 86400000) + 1);
    }
    function fmtRange(t) {
      if (!t.start) return "";
      var s = t.start.slice(5).replace(/-/g, ".");
      var e = t.end ? t.end.slice(5).replace(/-/g, ".") : "";
      return s + (e ? " — " + e : "");
    }
    function fullDate(t) {
      if (!t.start) return "";
      return t.start.replace(/-/g, ".") + (t.end ? "—" + t.end.replace(/-/g, ".") : "");
    }
    function haversine(a, b) {
      var R = 6371;
      function rad(v) { return v * Math.PI / 180; }
      var dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
      var h = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
      return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
    }
    function filtered() {
      if (year === "all") return trips;
      return trips.filter(function (t) { return getYear(t) === year; });
    }
    function findTrip(id) {
      for (var i = 0; i < trips.length; i++) if (trips[i].id === id) return trips[i];
      return null;
    }
    function stars(n) {
      n = Math.max(0, Math.min(5, Number(n) || 0));
      var s = "";
      for (var i = 0; i < 5; i++) s += i < n ? "★" : "☆";
      return s;
    }

    function computeStats(list) {
      var seen = {}, photos = 0, days = 0;
      list.forEach(function (t) {
        seen[t.city || t.cityId] = 1;
        photos += (t.photos || []).length;
        days += tripDays(t);
      });
      var km = 0;
      for (var i = 1; i < list.length; i++) km += haversine(list[i - 1], list[i]);
      return { cities: Object.keys(seen).length, trips: list.length, days: days, photos: photos, km: Math.round(km) };
    }

    function renderStats() {
      var s = computeStats(filtered());
      statsEl.innerHTML = '<div class="trip-stats-inner">' +
        '<span class="trip-stat"><b class="blue">' + s.cities + '</b>去过城市</span>' +
        '<span class="trip-stat"><b>' + s.trips + '</b>次旅行</span>' +
        '<span class="trip-stat"><b>' + s.days + '</b>天在路上</span>' +
        '<span class="trip-stat"><b>' + s.photos + '</b>张照片</span>' +
        '<span class="trip-stat"><b>' + s.km.toLocaleString() + '</b>km 旅行距离</span>' +
        '</div>';
    }

    function renderFilters() {
      var years = {};
      trips.forEach(function (t) { var y = getYear(t); if (y) years[y] = 1; });
      var html = '<button class="trip-filter' + (year === "all" ? " active" : "") + '" data-year="all" role="tab" aria-selected="' + (year === "all") + '">全部</button>';
      Object.keys(years).sort().forEach(function (y) {
        html += '<button class="trip-filter' + (year === y ? " active" : "") + '" data-year="' + esc(y) + '" role="tab" aria-selected="' + (year === y) + '">' + esc(y) + '</button>';
      });
      filtersEl.innerHTML = html;
    }

    function timelineItem(t) {
      return '<div class="trip-item' + (t.id === activeId ? " active" : "") + '" data-trip="' + esc(t.id) + '" role="button" tabindex="0">' +
        '<div class="trip-item-date">' + esc(fmtRange(t)) + '</div>' +
        '<div class="trip-item-city">' + esc(t.city || "") + '</div>' +
        '<div class="trip-item-tags">' + esc((t.tags || []).join(" · ")) + '</div></div>';
    }

    function renderTimeline() {
      var list = filtered();
      if (!list.length) {
        timelineEl.innerHTML = '<div class="trip-detail-empty">这个年份还没有旅行记录。</div>';
        return;
      }
      var byYear = {};
      list.forEach(function (t) {
        var y = getYear(t) || "未标注";
        (byYear[y] = byYear[y] || []).push(t);
      });
      var html = "";
      Object.keys(byYear).sort().forEach(function (y) {
        html += '<div class="trip-year"><div class="trip-year-label">' + esc(y) + '</div>' + byYear[y].map(timelineItem).join("") + '</div>';
      });
      timelineEl.innerHTML = html;
    }

    function ringPath(ring) {
      if (!ring || ring.length < 3) return "";
      var d = "";
      for (var i = 0; i < ring.length; i++) {
        var p = project(ring[i][0], ring[i][1]);
        d += (i ? " L" : "M") + p[0].toFixed(1) + " " + p[1].toFixed(1);
      }
      return d + " Z";
    }
    function geometryPaths(g) {
      if (!g || !Array.isArray(g.coordinates)) return "";
      var out = "";
      if (g.type === "Polygon") g.coordinates.forEach(function (r) { out += ringPath(r); });
      else if (g.type === "MultiPolygon") g.coordinates.forEach(function (poly) { poly.forEach(function (r) { out += ringPath(r); }); });
      return out;
    }

    function nodeHTML(t) {
      var p = project(t.lng, t.lat);
      return '<g class="trip-node' + (t.id === activeId ? " active" : "") + '" data-trip="' + esc(t.id) + '" tabindex="0" role="button">' +
        '<circle class="node-ring" cx="' + p[0].toFixed(1) + '" cy="' + p[1].toFixed(1) + '" r="14"/>' +
        '<circle class="node-dot" cx="' + p[0].toFixed(1) + '" cy="' + p[1].toFixed(1) + '" r="5"/>' +
        '<text class="node-label" x="' + p[0].toFixed(1) + '" y="' + (p[1] - 16).toFixed(1) + '">' + esc(t.city || "") + '</text></g>';
    }

    /* 自由缩放 / 平移 / 城市聚焦 */
    var view = { scale: 1, tx: 0, ty: 0 };
    var MIN_SCALE = 1, MAX_SCALE = 8;
    function layerEl() { return mapEl.querySelector(".trip-map-layer"); }
    function applyView(instant) {
      var layer = layerEl();
      if (!layer) return;
      if (instant) layer.classList.add("instant");
      else layer.classList.remove("instant");
      layer.style.transform = "translate(" + view.tx + "px, " + view.ty + "px) scale(" + view.scale + ")";
    }
    function clampView() {
      view.scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, view.scale));
      view.tx = Math.min(0, Math.max(VIEW_W - VIEW_W * view.scale, view.tx));
      view.ty = Math.min(0, Math.max(VIEW_H - VIEW_H * view.scale, view.ty));
    }
    function focusTrip(t) {
      if (!t) {
        view = { scale: 1, tx: 0, ty: 0 };
        applyView(false);
        return;
      }
      var p = project(t.lng, t.lat);
      view.scale = Math.max(view.scale, 1.75);
      view.tx = VIEW_W / 2 - view.scale * p[0];
      view.ty = VIEW_H / 2 - view.scale * p[1];
      clampView();
      applyView(false);
    }
    function svgPoint(clientX, clientY) {
      var svg = mapEl.querySelector("svg");
      if (!svg || !svg.createSVGPoint) return null;
      var pt = svg.createSVGPoint();
      pt.x = clientX; pt.y = clientY;
      try { return pt.matrixTransform(svg.getScreenCTM().inverse()); }
      catch (e) { return null; }
    }
    function zoomAt(clientX, clientY, factor) {
      var v = svgPoint(clientX, clientY);
      if (!v) return;
      var ns = Math.min(MAX_SCALE, Math.max(MIN_SCALE, view.scale * factor));
      var cx = (v.x - view.tx) / view.scale;
      var cy = (v.y - view.ty) / view.scale;
      view.tx = v.x - ns * cx;
      view.ty = v.y - ns * cy;
      view.scale = ns;
      clampView();
      applyView(true);
    }

    var panState = null;
    function startPan(clientX, clientY) {
      panState = { x: clientX, y: clientY, tx: view.tx, ty: view.ty, moved: false };
    }
    function movePan(clientX, clientY) {
      if (!panState) return;
      var dx = clientX - panState.x;
      var dy = clientY - panState.y;
      if (Math.abs(dx) + Math.abs(dy) > 3) panState.moved = true;
      var svg = mapEl.querySelector("svg");
      var rect = svg && svg.getBoundingClientRect ? svg.getBoundingClientRect() : null;
      var k = rect && rect.width ? VIEW_W / rect.width : 1;
      view.tx = panState.tx + dx * k;
      view.ty = panState.ty + dy * k;
      clampView();
      applyView(true);
    }
    function endPan() { panState = null; }

    var pinchPrev = null;
    function touchDist(touches) {
      if (touches.length < 2) return 0;
      var a = touches[0], b = touches[1];
      return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
    }
    function touchMid(touches) {
      var a = touches[0], b = touches[1];
      return { x: (a.clientX + b.clientX) / 2, y: (a.clientY + b.clientY) / 2 };
    }

    function drawMap() {
      var list = filtered();
      var provincePaths = provinces ? provinces.map(function (f) { return '<path class="trip-province" d="' + geometryPaths(f.geometry) + '"/>'; }).join("") : "";
      var route = "";
      if (list.length > 1) {
        var d = "M";
        for (var i = 0; i < list.length; i++) {
          var p = project(list[i].lng, list[i].lat);
          d += (i ? " L" : "") + p[0].toFixed(1) + " " + p[1].toFixed(1);
        }
        route = '<path class="trip-route" d="' + d + '"/>';
      }
      var nodes = list.map(nodeHTML).join("");
      mapEl.innerHTML = '<svg viewBox="0 0 ' + VIEW_W + ' ' + VIEW_H + '" preserveAspectRatio="xMidYMid meet" aria-label="旅行轨迹地图">' +
        '<g class="trip-map-layer">' + provincePaths + route + nodes + '</g></svg>';
      mapEl.appendChild(popEl);
      var active = activeId ? findTrip(activeId) : null;
      if (list.indexOf(active) === -1) active = null;
      focusTrip(active);
    }

    function updateDetail() {
      var t = activeId ? findTrip(activeId) : null;
      if (!t) {
        detailEl.innerHTML = '<div class="trip-detail-empty">点击地图上的城市，或选择左侧时间轴，查看城市故事。</div>';
        return;
      }
      var photos = (t.photos || []).slice(0, 3).map(function (p) {
        return '<div class="trip-photo">' + (p && p.src ? '<img src="' + esc(p.src) + '" alt="' + esc(p.caption || "") + '">' : "📷") + '</div>';
      }).join("");
      var tags = (t.tags || []).map(function (x) { return '<span class="trip-tag">' + esc(x) + '</span>'; }).join("");
      var rating = t.rating || {};
      var rateRows = [
        ["氛围感", rating.atmosphere], ["美食", rating.food], ["风景", rating.scenery], ["再来一次", rating.again]
      ].map(function (r) { return '<div class="trip-rate-row"><span>' + r[0] + '</span><b>' + stars(r[1]) + '</b></div>'; }).join("");
      var spots = (t.spots || []).join(" · ");
      var meta = [
        t.companions ? "同行：" + t.companions : "",
        t.weather ? "天气：" + t.weather : "",
        t.mood ? "心情：" + t.mood : ""
      ].filter(Boolean).map(function (x) { return '<span>' + esc(x) + '</span>'; }).join("");

      detailEl.innerHTML =
        '<h2 class="trip-detail-city">' + esc(t.city || "") + '</h2>' +
        '<p class="trip-detail-date">' + esc(fullDate(t)) + '</p>' +
        '<blockquote class="trip-detail-quote">' + esc(t.quote || "") + '</blockquote>' +
        '<p class="trip-detail-story">' + esc(t.story || "") + '</p>' +
        '<div class="trip-detail-section"><h4>照片</h4><div class="trip-photos">' + (photos || "暂无照片") + '</div></div>' +
        '<div class="trip-detail-section"><h4>标签</h4><div class="trip-detail-tags">' + (tags || "—") + '</div></div>' +
        (spots ? '<div class="trip-detail-section"><h4>这次去过</h4><p class="trip-detail-story">' + esc(spots) + '</p></div>' : "") +
        '<div class="trip-detail-section"><h4>我的评分</h4><div class="trip-rating">' + rateRows + '</div></div>' +
        (meta ? '<div class="trip-detail-section"><div class="trip-meta">' + meta + '</div></div>' : "");
    }

    function syncActive() {
      var list = filtered();
      var active = activeId ? findTrip(activeId) : null;
      if (list.indexOf(active) === -1) { activeId = null; active = null; }
      timelineEl.querySelectorAll(".trip-item").forEach(function (el) {
        el.classList.toggle("active", el.getAttribute("data-trip") === activeId);
      });
      mapEl.querySelectorAll(".trip-node").forEach(function (el) {
        el.classList.toggle("active", el.getAttribute("data-trip") === activeId);
      });
      focusTrip(active);
      updateDetail();
    }

    function selectTrip(id) {
      if (playing) return;
      activeId = id;
      syncActive();
      if (mobileMQ.matches) {
        setPanelCollapsed("left", true);
        setPanelCollapsed("right", false);
      }
      var item = timelineEl.querySelector('.trip-item[data-trip="' + id + '"]');
      if (item && item.scrollIntoView) item.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }

    function selectYear(y) {
      if (playing) togglePlay();
      year = y;
      activeId = null;
      renderFilters();
      renderTimeline();
      renderStats();
      drawMap();
      updateDetail();
    }

    function togglePlay() {
      if (playing) {
        playing = false;
        clearInterval(playTimer);
        playBtn.textContent = "▶ 播放我的旅程";
        playBtn.classList.remove("playing");
        playBtn.setAttribute("aria-pressed", "false");
        return;
      }
      var list = filtered();
      if (!list.length) return;
      playing = true;
      playBtn.textContent = "⏸ 暂停";
      playBtn.classList.add("playing");
      playBtn.setAttribute("aria-pressed", "true");
      var i = list.findIndex(function (t) { return t.id === activeId; });
      if (i < 0) i = -1;
      playTimer = setInterval(function () {
        i = (i + 1) % list.length;
        activeId = list[i].id;
        syncActive();
        var item = timelineEl.querySelector('.trip-item[data-trip="' + activeId + '"]');
        if (item && item.scrollIntoView) item.scrollIntoView({ block: "nearest", behavior: "smooth" });
      }, 1600);
    }

    timelineEl.addEventListener("click", function (e) {
      var item = e.target.closest(".trip-item");
      if (item) selectTrip(item.getAttribute("data-trip"));
    });
    filtersEl.addEventListener("click", function (e) {
      var btn = e.target.closest(".trip-filter");
      if (btn) selectYear(btn.getAttribute("data-year"));
    });
    playBtn.addEventListener("click", togglePlay);
    mapEl.addEventListener("click", function (e) {
      var node = e.target.closest(".trip-node");
      if (node) selectTrip(node.getAttribute("data-trip"));
    });
    mapEl.addEventListener("mouseover", function (e) {
      if (panState) return;
      var node = e.target.closest(".trip-node");
      if (!node) return;
      var t = findTrip(node.getAttribute("data-trip"));
      if (!t) return;
      var dot = node.querySelector(".node-dot");
      if (!dot) return;
      var r = dot.getBoundingClientRect();
      var mr = mapEl.getBoundingClientRect();
      popEl.innerHTML = '<b>' + esc(t.city || "") + '</b><time>' + esc(fullDate(t)) + '</time><p>' + esc(t.quote || "") + '</p>';
      popEl.style.left = Math.min(r.left - mr.left + 14, mapEl.clientWidth - 224) + "px";
      popEl.style.top = Math.max(r.top - mr.top - 12, 8) + "px";
      popEl.classList.add("show");
    });
    mapEl.addEventListener("mouseout", function (e) {
      var node = e.target.closest(".trip-node");
      if (node && !node.contains(e.relatedTarget)) popEl.classList.remove("show");
    });

    /* 滚轮自由缩放 */
    mapEl.addEventListener("wheel", function (e) {
      e.preventDefault();
      zoomAt(e.clientX, e.clientY, e.deltaY < 0 ? 1.15 : 1 / 1.15);
    }, { passive: false });

    /* 鼠标拖拽平移 */
    mapEl.addEventListener("mousedown", function (e) {
      if (e.target.closest(".trip-node")) return;
      startPan(e.clientX, e.clientY);
      e.preventDefault();
    });
    document.addEventListener("mousemove", function (e) {
      if (panState) movePan(e.clientX, e.clientY);
    });
    document.addEventListener("mouseup", function () { endPan(); });

    /* 触摸：单指平移、双指缩放 */
    mapEl.addEventListener("touchstart", function (e) {
      if (e.touches.length === 1 && !e.target.closest(".trip-node")) {
        startPan(e.touches[0].clientX, e.touches[0].clientY);
      } else if (e.touches.length === 2) {
        endPan();
        pinchPrev = touchDist(e.touches);
      }
    }, { passive: true });
    mapEl.addEventListener("touchmove", function (e) {
      if (e.touches.length === 2) {
        e.preventDefault();
        var d = touchDist(e.touches);
        var mid = touchMid(e.touches);
        if (pinchPrev && d > 0) zoomAt(mid.x, mid.y, d / pinchPrev);
        pinchPrev = d;
      } else if (e.touches.length === 1 && panState) {
        e.preventDefault();
        movePan(e.touches[0].clientX, e.touches[0].clientY);
      }
    }, { passive: false });
    mapEl.addEventListener("touchend", function (e) {
      if (e.touches.length < 2) pinchPrev = null;
      if (e.touches.length === 0) endPan();
    });

    /* 左右面板收起/展开控制 */
    leftToggle.addEventListener("click", function () { setPanelCollapsed("left", !isPanelCollapsed("left")); });
    rightToggle.addEventListener("click", function () { setPanelCollapsed("right", !isPanelCollapsed("right")); });
    if (timelineClose) timelineClose.addEventListener("click", function () { setPanelCollapsed("left", true); });
    if (detailClose) detailClose.addEventListener("click", function () { setPanelCollapsed("right", true); });
    if (backdrop) backdrop.addEventListener("click", function () {
      setPanelCollapsed("left", true);
      setPanelCollapsed("right", true);
    });
    setPanelCollapsed("left", mobileMQ.matches);
    setPanelCollapsed("right", mobileMQ.matches);

    renderFilters();
    renderTimeline();
    renderStats();
    drawMap();
    updateDetail();

    fetch("assets/china-provinces.json", { cache: "default" })
      .then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
      .then(function (geo) {
        provinces = (geo && geo.features) || [];
        drawMap();
      })
      .catch(function () { /* 底图加载失败则只显示轨迹与节点 */ });
  }

  function renderMessages() {
    var box = $("messages");
    if (!box) return;
    var list = DB.messages || [];
    box.innerHTML = list.map(function (msg) {
      var d = new Date(msg.time || Date.now());
      var ts = d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
      return '<div class="card msg-card"><div class="msg-head"><b>' + esc(msg.name || "匿名") + '</b><time>' + ts + '</time></div><p>' + esc(msg.text) + '</p></div>';
    }).join("") || '<p style="color:var(--ink-3);text-align:center;padding:10px;">还没有留言，来做第一个打招呼的人吧 👋</p>';
  }

  function renderContact() {
    var c = DB.contact || {};
    $("contact-banner").innerHTML =
      '<p class="eyebrow">' + esc(c.eyebrow || "") + '</p>' +
      '<h1>' + esc(c.title || "联系我们") + '</h1>' +
      '<p>' + esc(c.intro || "") + '</p>';

    $("contact-cards").innerHTML = (c.cards || []).map(function (card) {
      return '<div class="card contact-card reveal"><div class="c-icon">' + esc(card.icon) + '</div><div>' +
        '<h3>' + esc(card.title) + '</h3>' +
        '<p><a href="' + esc(card.link || "#") + '" target="_blank" rel="noopener">' + esc(card.text) + '</a></p>' +
        '<p>' + esc(card.note || "") + '</p></div></div>';
    }).join("");

    $("contact-form-wrap").innerHTML =
      '<h3>' + esc((c.form && c.form.title) || "✉️ 给我们留言") + '</h3>' +
      '<form>' +
      '<div class="form-field"><label for="msg-name">怎么称呼你</label>' +
      '<input type="text" id="msg-name" name="name" placeholder="比如：路过的朋友"></div>' +
      '<div class="form-field"><label for="msg-text">想说的话</label>' +
      '<textarea id="msg-text" name="message" rows="5" placeholder="写下你想对我们说的话吧～"></textarea></div>' +
      '<input type="text" name="hp" tabindex="-1" autocomplete="off" style="position:absolute;left:-9999px;" aria-hidden="true">' +
      '<button type="submit" class="btn btn-primary magnetic">发送留言 →</button>' +
      '<p class="form-note">' + esc((c.form && c.form.note) || "") + '</p></form>';

    var form = document.querySelector(".contact-form form");
    if (form) {
      form.addEventListener("submit", function (e) {
        e.preventDefault();
        var name = form.querySelector('[name="name"]').value.trim();
        var text = form.querySelector('[name="message"]').value.trim();
        var note = form.querySelector(".form-note");
        if (!text) { if (note) note.textContent = "留言内容不能为空～"; return; }
        fetch("/api/messages", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: name || "匿名", text: text })
        }).then(function (r) { return r.json(); }).then(function (d) {
          if (d.ok) {
            form.reset();
            if (note) note.textContent = "留言成功！已经存进小站的留言板 🎉";
            DB.messages = (DB.messages || []).concat([{ id: "m-" + Date.now(), name: name || "匿名", text: text, time: Date.now() }]);
            renderMessages();
          } else if (d.error) {
            if (note) note.textContent = d.error;
          }
        }).catch(function () {
          window.location.href = "mailto:" + (DB.site.email || "") +
            "?subject=" + encodeURIComponent("来自网站的留言") +
            "&body=" + encodeURIComponent(text + "\n\n—— " + name);
        });
      });
    }

    renderMessages();
  }

  /* ---------- 启动 ---------- */
  function render() {
    fillChrome();
    if (PAGE === "index") renderIndex();
    else if (PAGE === "about") renderAbout();
    else if (PAGE === "blog") renderBlog();
    else if (PAGE === "post") renderPost();
    else if (PAGE === "projects") renderProjects();
    else if (PAGE === "gallery") renderGallery();
    else if (PAGE === "contact") renderContact();
    else if (PAGE === "cities") renderTrips();

    var pageTitle;
    if (PAGE === "index") {
      pageTitle = (DB.site.name || "") + " · " + (DB.site.title || "");
    } else if (PAGE === "post") {
      pageTitle = document.title; // renderPost 已设置“文章标题 · 站点名”
    } else {
      var base = "首页";
      if (PAGE === "about") base = (DB.about.title || "关于我们");
      else if (PAGE === "blog") base = "博客";
      else if (PAGE === "projects") base = "项目作品";
      else if (PAGE === "gallery") base = "生活瞬间";
      else if (PAGE === "contact") base = (DB.contact.title || "联系我们");
      else if (PAGE === "cities") base = "我的足迹";
      pageTitle = base + " · " + (DB.site.name || "");
    }
    document.title = pageTitle;

    if (window.XXF && XXF.refresh) XXF.refresh();
  }

  fetch("/api/content", { cache: "no-store" })
    .then(function (r) {
      if (!r.ok) throw new Error("HTTP " + r.status);
      return r.json();
    })
    .then(function (db) {
      DB = db;
      render();
    })
    .catch(function (err) {
      console.error("内容加载失败:", err);
      var banner = document.createElement("div");
      banner.style.cssText = "background:#FA8952;color:#fff;text-align:center;padding:10px 16px;font-size:.9rem;position:fixed;top:0;left:0;right:0;z-index:999;";
      banner.textContent = "⚠️ 内容加载失败：请确认已通过 node server.js 启动服务（而不是直接打开文件）";
      document.body.appendChild(banner);
    });
})();
