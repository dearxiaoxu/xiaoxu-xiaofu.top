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
    if (g.type === "image" && g.src) {
      return '<figure class="gallery-item reveal ' + extra + '" data-src="' + esc(g.src) + '" data-caption="' + esc(g.caption) + '">' +
        '<img src="' + esc(g.src) + '" alt="' + esc(g.caption) + '" loading="lazy" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;">' +
        '<figcaption>' + esc(g.caption) + '</figcaption></figure>';
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
  function renderIndex() {
    var h = DB.hero || {}, s = DB.site || {};

    var statsHTML = (h.stats || []).map(function (st) {
      if (st.kind === "together") {
        return '<div class="stat" title="在一起的日子从 ' + esc(s.togetherDate || "") + ' 起"><b data-together>0</b><span>' + esc(st.label || "") + '</span></div>';
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
