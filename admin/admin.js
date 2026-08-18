/* ============================================================
   xiaoxu & xiaofu · 内容管理后台
   纯原生 JavaScript，零依赖
   ============================================================ */
(function () {
  'use strict';

  var TOKEN_KEY = 'xxf-admin-token';
  var MD_HINT = '支持 ## 二级标题、> 引用、``` 代码块、**加粗**、`行内代码`，普通行会变为段落';

  /* ---------- 状态 ---------- */
  var state = {
    db: null,
    token: localStorage.getItem(TOKEN_KEY) || null,
    activeTab: 'site',
    editor: null,
    dirty: false
  };

  var TABS = [
    { key: 'site', label: '站点设置', icon: '⚙️' },
    { key: 'hero', label: '首页 Hero', icon: '🏠' },
    { key: 'about', label: '关于我们', icon: '💞' },
    { key: 'posts', label: '文章管理', icon: '📝' },
    { key: 'projects', label: '项目管理', icon: '🛠️' },
    { key: 'gallery', label: '相册管理', icon: '🖼️' },
    { key: 'trips', label: '城市与旅行', icon: '🗺️' },
    { key: 'contact', label: '联系与留言', icon: '✉️' },
    { key: 'data', label: '数据与安全', icon: '🔐' },
    { key: 'logs', label: '运行日志', icon: '📋' }
  ];

  var PAGE_TITLES = {
    site: '站点设置',
    hero: '首页 Hero',
    about: '关于我们',
    posts: '文章管理',
    projects: '项目管理',
    gallery: '相册管理',
    trips: '城市与旅行',
    contact: '联系与留言',
    data: '数据与安全',
    logs: '运行日志'
  };

  /* 中国城市库（名称 + 拼音 + 经纬度），用于城市下拉与坐标自动填充 */
  var CITY_LIST = [];
  var CITY_READY = false;
  function loadCities() {
    if (CITY_READY) return Promise.resolve(CITY_LIST);
    return fetch('/assets/cities.json')
      .then(function (r) { if (!r.ok) throw new Error('city-load-failed'); return r.json(); })
      .then(function (arr) {
        CITY_LIST = Array.isArray(arr) ? arr : [];
        CITY_READY = true;
        return CITY_LIST;
      })
      .catch(function () {
        CITY_READY = true;
        return CITY_LIST;
      });
  }

  /* ============================================================
     工具函数
     ============================================================ */
  function $(id) { return document.getElementById(id); }

  function esc(s) {
    if (s === null || s === undefined) return '';
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function getPath(obj, path) {
    var keys = path.split('.');
    var cur = obj;
    for (var i = 0; i < keys.length; i++) {
      if (cur == null) return undefined;
      cur = cur[keys[i]];
    }
    return cur;
  }

  function setPath(obj, path, value) {
    var keys = path.split('.');
    var cur = obj;
    for (var i = 0; i < keys.length - 1; i++) {
      cur = cur[keys[i]];
    }
    cur[keys[keys.length - 1]] = value;
  }

  function pad(n) { return n < 10 ? '0' + n : '' + n; }
  function todayStr() {
    var d = new Date();
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }

  /* ============================================================
     Toast
     ============================================================ */
  function toast(msg, type) {
    var box = $('toasts');
    var el = document.createElement('div');
    el.className = 'toast ' + (type || 'ok');
    el.textContent = msg;
    box.appendChild(el);
    requestAnimationFrame(function () { el.classList.add('show'); });
    setTimeout(function () {
      el.classList.remove('show');
      setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 300);
    }, 2600);
  }

  /* ============================================================
     API 封装
     ============================================================ */
  function api(path, options) {
    options = options || {};
    var method = options.method || 'GET';
    var headers = Object.assign({}, options.headers || {});
    if (state.token) headers['Authorization'] = 'Bearer ' + state.token;
    var body = options.body;
    if (body && typeof body === 'object') {
      headers['Content-Type'] = 'application/json';
      body = JSON.stringify(body);
    }
    return fetch(path, { method: method, headers: headers, body: body })
      .then(function (res) {
        if (res.status === 401) {
          state.token = null;
          localStorage.removeItem(TOKEN_KEY);
          showLogin();
          toast('登录已过期，请重新登录', 'err');
          var err = new Error('unauthorized');
          err.status = 401;
          throw err;
        }
        var ct = res.headers.get('content-type') || '';
        var dataPromise = ct.indexOf('application/json') !== -1
          ? res.json().catch(function () { return null; })
          : Promise.resolve(null);
        return dataPromise.then(function (data) {
          if (!res.ok) {
            var e = new Error((data && data.error) || ('HTTP ' + res.status));
            e.status = res.status;
            throw e;
          }
          return data;
        });
      });
  }

  /* ============================================================
     登录 / 退出
     ============================================================ */
  function showLogin() {
    $('login-view').hidden = false;
    $('app').hidden = true;
  }

  function showApp() {
    $('login-view').hidden = true;
    $('app').hidden = false;
    $('site-name').textContent = (state.db && state.db.site && state.db.site.name) || '管理后台';
  }

  function logout() {
    state.token = null;
    localStorage.removeItem(TOKEN_KEY);
    state.editor = null;
    showLogin();
  }

  function submitLogin(e) {
    e.preventDefault();
    var pw = $('login-password').value;
    if (!pw) { toast('请输入密码', 'warn'); return; }
    var btn = $('login-btn');
    btn.disabled = true;
    btn.textContent = '登录中…';
    $('login-msg').textContent = '';
    fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: pw })
    })
      .then(function (res) {
        if (res.status === 200) return res.json();
        var e = new Error('login-failed');
        e.status = res.status;
        throw e;
      })
      .then(function (data) {
        state.token = data.token;
        localStorage.setItem(TOKEN_KEY, data.token);
        $('login-password').value = '';
        if (state.db) {
          toast('登录成功', 'ok');
          showApp();
          renderTab(state.activeTab);
        } else {
          return api('/api/content').then(function (db) {
            state.db = db;
            toast('登录成功', 'ok');
            showApp();
            renderTab(state.activeTab);
          });
        }
      })
      .catch(function (err) {
        if (err.status === 401) {
          $('login-msg').textContent = '密码错误，请重试。';
        } else if (err.status) {
          $('login-msg').textContent = '登录失败（HTTP ' + err.status + '）。';
        } else {
          $('login-msg').textContent = '网络错误，请确认后端服务可用。';
        }
      })
      .then(function () {
        btn.disabled = false;
        btn.textContent = '登 录';
      });
  }

  /* ============================================================
     保存机制
     ============================================================ */
  function updateDirty() {
    var label = $('dirty-label');
    if (state.dirty) {
      label.textContent = '● 有未保存的修改';
      label.classList.add('on');
    } else {
      label.textContent = '所有修改已保存';
      label.classList.remove('on');
    }
  }

  function setSaving(on) {
    var btn = $('save-btn');
    btn.disabled = on;
    btn.textContent = on ? '保存中…' : '保存修改';
  }

  function saveAll() {
    if (!state.db) { toast('数据尚未加载', 'warn'); return; }
    setSaving(true);
    api('/api/content', { method: 'PUT', body: state.db })
      .then(function () {
        state.dirty = false;
        updateDirty();
        toast('已保存', 'ok');
      })
      .catch(function (err) {
        if (err.status !== 401) toast('保存失败：' + (err.message || '未知错误'), 'err');
      })
      .then(function () { setSaving(false); });
  }

  /* ============================================================
     表单渲染助手
     ============================================================ */
  function field(label, inner, opts) {
    opts = opts || {};
    var hint = opts.hint ? '<p class="f-hint">' + esc(opts.hint) + '</p>' : '';
    return '<div class="field"><label class="f-label">' + esc(label) + '</label>' + inner + hint + '</div>';
  }

  function input(bind, opts) {
    opts = opts || {};
    var v = getPath(state.db, bind);
    var type = opts.type || 'text';
    var attrs = ' data-bind="' + bind + '"';
    if (opts.dataType) attrs += ' data-type="' + opts.dataType + '"';
    if (opts.mono) attrs += ' class="mono"';
    var ph = opts.placeholder ? ' placeholder="' + esc(opts.placeholder) + '"' : '';
    if (type === 'checkbox') {
      attrs += v ? ' checked' : '';
      return '<input type="checkbox"' + attrs + '>';
    }
    var val = v == null ? '' : v;
    if (opts.dataType === 'csv') {
      val = Array.isArray(v) ? v.join(', ') : (v == null ? '' : v);
    } else if (opts.dataType === 'lines') {
      val = Array.isArray(v) ? v.join('\n') : (v == null ? '' : v);
    }
    if (opts.rows != null) {
      return '<textarea' + attrs + ' rows="' + opts.rows + '"' + ph + '>' + esc(val) + '</textarea>';
    }
    return '<input type="' + type + '"' + attrs + ' value="' + esc(val) + '"' + ph + '>';
  }

  function checkToggle(bind) {
    var v = getPath(state.db, bind);
    return '<label class="check"><input type="checkbox" data-bind="' + bind + '"' + (v ? ' checked' : '') + '><span class="track"></span></label>';
  }

  function select(bind, options, extra) {
    var v = getPath(state.db, bind);
    var opts = options.map(function (o) {
      var value = (o && o.value != null) ? o.value : o;
      var label = (o && o.label != null) ? o.label : value;
      return '<option value="' + esc(value) + '"' + (value === v ? ' selected' : '') + '>' + esc(label) + '</option>';
    }).join('');
    return '<select data-bind="' + bind + '"' + (extra || '') + '>' + opts + '</select>';
  }

  function section(title, inner, opts) {
    opts = opts || {};
    var actions = opts.actions || '';
    return '<section class="card"><div class="card-head"><h3 class="card-title">' + esc(title) + '</h3>' + actions + '</div><div class="card-body">' + inner + '</div></section>';
  }

  function emptyNote(text) {
    return '<div class="empty">' + esc(text) + '</div>';
  }

  function addBtn(list) {
    return '<button class="btn btn-sm" data-action="add" data-list="' + list + '">＋ 添加</button>';
  }

  /* ============================================================
     城市下拉（可搜索、A-Z 覆盖、自动带出经纬度）
     ============================================================ */
  function cityComboboxHtml(base, t) {
    var city = t && t.city ? t.city : '';
    var coord = (t && typeof t.lng === 'number' && typeof t.lat === 'number')
      ? '经度 ' + Number(t.lng).toFixed(2) + ' · 纬度 ' + Number(t.lat).toFixed(2)
      : '选择城市后自动获取经纬度';
    return '<div class="city-combobox" data-city-combobox data-base="' + esc(base) + '">' +
      '<div class="city-search-wrap">' +
      '<input type="text" class="city-search" data-city-search placeholder="搜索城市，如：南、成都、nan" autocomplete="off" value="' + esc(city) + '">' +
      '<button type="button" class="city-clear" data-city-clear aria-label="清空">×</button>' +
      '</div>' +
      '<div class="city-dropdown" data-city-dropdown></div>' +
      '<p class="f-hint city-coord" data-city-coord>' + esc(coord) + '</p>' +
      '</div>';
  }

  function filterCities(q) {
    q = (q || '').trim().toLowerCase();
    if (!q) return CITY_LIST;
    var isCjk = /[\u4e00-\u9fff]/.test(q);
    return CITY_LIST.filter(function (c) {
      if (isCjk) return c.n.indexOf(q) !== -1;
      return String(c.p || '').indexOf(q) === 0;
    });
  }

  function renderCityDropdown(box) {
    if (!CITY_READY) {
      loadCities().then(function () { renderCityDropdown(box); });
      return;
    }
    var dd = box.querySelector('[data-city-dropdown]');
    var q = box.querySelector('[data-city-search]').value;
    var list = filterCities(q).slice(0, 60);
    if (!list.length) {
      dd.innerHTML = '<div class="city-option city-empty">未找到匹配城市</div>';
    } else {
      dd.innerHTML = list.map(function (c) {
        return '<button type="button" class="city-option" data-city-value="' + esc(c.n) + '">' +
          '<span class="city-option-letter">' + esc(String(c.p || '').charAt(0).toUpperCase()) + '</span>' +
          '<span class="city-option-name">' + esc(c.n) + '</span>' +
          '<span class="city-option-prov">' + esc(c.prov || '') + '</span>' +
          '</button>';
      }).join('');
    }
    dd.classList.add('open');
  }

  function closeCityDropdown(box) {
    var dd = box.querySelector('[data-city-dropdown]');
    if (dd) dd.classList.remove('open');
  }

  function selectCity(box, name) {
    var city = CITY_LIST.find(function (c) { return c.n === name; });
    if (!city) return;
    var base = box.dataset.base;
    setPath(state.db, base + '.city', city.n);
    setPath(state.db, base + '.cityId', city.p);
    setPath(state.db, base + '.lng', city.lng);
    setPath(state.db, base + '.lat', city.lat);
    box.querySelector('[data-city-search]').value = city.n;
    box.querySelector('[data-city-coord]').textContent =
      '经度 ' + Number(city.lng).toFixed(2) + ' · 纬度 ' + Number(city.lat).toFixed(2);
    state.dirty = true;
    updateDirty();
    closeCityDropdown(box);
  }

  function clearCity(box) {
    var base = box.dataset.base;
    setPath(state.db, base + '.city', '');
    setPath(state.db, base + '.cityId', '');
    setPath(state.db, base + '.lng', null);
    setPath(state.db, base + '.lat', null);
    box.querySelector('[data-city-search]').value = '';
    box.querySelector('[data-city-coord]').textContent = '选择城市后自动获取经纬度';
    state.dirty = true;
    updateDirty();
    closeCityDropdown(box);
    box.querySelector('[data-city-search]').focus();
  }

  function initCityCombobox(box) {
    var search = box.querySelector('[data-city-search]');
    var clearBtn = box.querySelector('[data-city-clear]');

    search.addEventListener('input', function () {
      renderCityDropdown(box);
      if (!search.value) clearCity(box);
    });
    search.addEventListener('focus', function () {
      if (!CITY_READY) loadCities().then(function () { renderCityDropdown(box); });
      else renderCityDropdown(box);
    });
    search.addEventListener('keydown', function (e) {
      var dd = box.querySelector('[data-city-dropdown]');
      var opts = Array.prototype.slice.call(dd.querySelectorAll('.city-option[data-city-value]'));
      var active = dd.querySelector('.city-option.active');
      var idx = active ? opts.indexOf(active) : -1;
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (opts.length) {
          opts.forEach(function (o) { o.classList.remove('active'); });
          idx = (idx + 1) % opts.length;
          opts[idx].classList.add('active');
          opts[idx].scrollIntoView({ block: 'nearest' });
        }
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (opts.length) {
          opts.forEach(function (o) { o.classList.remove('active'); });
          idx = idx <= 0 ? opts.length - 1 : idx - 1;
          opts[idx].classList.add('active');
          opts[idx].scrollIntoView({ block: 'nearest' });
        }
      } else if (e.key === 'Enter') {
        e.preventDefault();
        var chosen = active || opts[0];
        if (chosen) selectCity(box, chosen.dataset.cityValue);
      } else if (e.key === 'Escape') {
        closeCityDropdown(box);
      }
    });

    clearBtn.addEventListener('click', function () { clearCity(box); });

    box.querySelector('[data-city-dropdown]').addEventListener('click', function (e) {
      var opt = e.target.closest('.city-option[data-city-value]');
      if (opt) selectCity(box, opt.dataset.cityValue);
    });
  }

  function initCityComboboxes() {
    document.querySelectorAll('[data-city-combobox]').forEach(initCityCombobox);
    if (!CITY_READY) loadCities();
  }

  /* ============================================================
     标签页渲染
     ============================================================ */
  var TILE_OPTIONS = ['tile-1', 'tile-2', 'tile-3', 'tile-4', 'tile-5', 'tile-6', 'tile-7', 'tile-8'].map(function (t) {
    return { value: t, label: t };
  });

  var KIND_OPTIONS = [
    { value: 'together', label: 'together · 在一起天数' },
    { value: 'count', label: 'count · 数字' },
    { value: 'text', label: 'text · 纯文本' }
  ];

  /* --- 站点设置 --- */
  function renderSite() {
    return section('站点信息', [
      '<div class="grid-2">',
      field('站点名', input('site.name')),
      field('标题后缀', input('site.title')),
      field('域名', input('site.domain')),
      field('邮箱', input('site.email')),
      field('在一起日期', input('site.togetherDate', { type: 'date' }), { hint: '用于前台计算「在一起天数」' }),
      '</div>',
      field('SEO 描述', input('site.description', { rows: 2 })),
      field('页脚标语 tagline', input('site.tagline', { rows: 2 })),
      field('页脚小字 footerNote', input('site.footerNote'))
    ].join('')) +
    section('页脚 CTA', [
      '<div class="grid-2">',
      field('标题', input('site.cta.title')),
      field('按钮文字', input('site.cta.button')),
      field('链接', input('site.cta.link')),
      '</div>',
      field('描述', input('site.cta.text', { rows: 2 }))
    ].join(''));
  }

  /* --- 首页 Hero --- */
  function renderHero() {
    return section('基础文案', [
      '<div class="grid-2">',
      field('问候语 greeting', input('hero.greeting')),
      field('眉题 eyebrow', input('hero.eyebrow')),
      field('标题前句 titleTop', input('hero.titleTop')),
      field('名字一 name1', input('hero.name1')),
      field('名字二 name2', input('hero.name2')),
      '</div>',
      field('描述（打字词之前）', input('hero.descBefore', { rows: 2 })),
      field('打字词（每行一个词）', input('hero.typedWords', { rows: 3, dataType: 'lines' }), { hint: '每行一个词，前台会依次打字显示' }),
      field('描述（打字词之后）', input('hero.descAfter'))
    ].join('')) +
    section('按钮', listButtons(), { actions: addBtn('hero.buttons') }) +
    section('数据统计', listStats(), { actions: addBtn('hero.stats') }) +
    section('两人卡片', [
      '<div class="grid-2">',
      personCard('p1', 'hero.p1'),
      personCard('p2', 'hero.p2'),
      '</div>'
    ].join(''));
  }

  function listButtons() {
    var arr = state.db.hero.buttons;
    if (!arr.length) return emptyNote('还没有按钮，点击右上角「＋ 添加」');
    return arr.map(function (b, i) {
      return '<div class="list-row"><div class="list-row-fields">' +
        field('文字', input('hero.buttons.' + i + '.text')) +
        field('链接', input('hero.buttons.' + i + '.link')) +
        field('主按钮', checkToggle('hero.buttons.' + i + '.primary')) +
        '</div><button class="icon-btn" data-action="remove" data-list="hero.buttons" data-index="' + i + '" title="删除">✕</button></div>';
    }).join('');
  }

  function listStats() {
    var arr = state.db.hero.stats;
    if (!arr.length) return emptyNote('还没有统计项，点击右上角「＋ 添加」');
    return arr.map(function (st, i) {
      return '<div class="list-row"><div class="list-row-fields">' +
        field('类型', select('hero.stats.' + i + '.kind', KIND_OPTIONS)) +
        field('数值', input('hero.stats.' + i + '.value', { dataType: 'number' }), { hint: 'count/text 用' }) +
        field('后缀', input('hero.stats.' + i + '.suffix')) +
        field('标签', input('hero.stats.' + i + '.label')) +
        '</div><button class="icon-btn" data-action="remove" data-list="hero.stats" data-index="' + i + '" title="删除">✕</button></div>';
    }).join('');
  }

  function personCard(label, path) {
    return '<div class="subcard"><h4 class="subcard-title">' + esc(label) + '</h4>' +
      '<div class="grid-2">' +
      field('名字', input(path + '.name')) +
      field('角色', input(path + '.role')) +
      '</div>' +
      field('备注', input(path + '.note')) +
      '</div>';
  }

  /* --- 关于我们 --- */
  function renderAbout() {
    return section('基础文案', [
      '<div class="grid-2">',
      field('眉题 eyebrow', input('about.eyebrow')),
      field('标题 title', input('about.title')),
      '</div>',
      field('介绍 intro', input('about.intro', { rows: 2 }))
    ].join('')) +
    section('成员简介', listProfiles(), { actions: addBtn('about.profiles') }) +
    section('我们的故事', [
      '<div class="grid-2">',
      field('标题', input('about.story.title')),
      field('副标题', input('about.story.sub')),
      '</div>',
      listTimeline()
    ].join(''), { actions: addBtn('about.story.timeline') }) +
    section('计数器', [
      '<div class="grid-2">',
      field('主文案（{n} 为占位符）', input('about.counter.main'), { hint: '{n} 会在前台替换为实时天数' }),
      field('副文案', input('about.counter.sub')),
      '</div>'
    ].join('')) +
    section('爱好', listHobbies(), { actions: addBtn('about.hobbies') }) +
    section('关于页 CTA', [
      '<div class="grid-2">',
      field('标题', input('about.cta.title')),
      field('按钮文字', input('about.cta.button')),
      field('链接', input('about.cta.link')),
      '</div>',
      field('描述', input('about.cta.text', { rows: 2 }))
    ].join(''));
  }

  function listProfiles() {
    var arr = state.db.about.profiles;
    if (!arr.length) return emptyNote('还没有成员简介');
    return arr.map(function (p, i) {
      var name = p.name || ('成员 ' + (i + 1));
      return '<div class="list-card"><div class="list-card-head"><span class="mono-tag">' + esc(name) + '</span>' +
        '<button class="icon-btn" data-action="remove" data-list="about.profiles" data-index="' + i + '" title="删除">✕</button></div>' +
        '<div class="grid-2">' +
        field('名字', input('about.profiles.' + i + '.name')) +
        field('角色', input('about.profiles.' + i + '.role')) +
        '</div>' +
        field('简介', input('about.profiles.' + i + '.bio', { rows: 2 })) +
        field('技能（逗号分隔）', input('about.profiles.' + i + '.skills', { dataType: 'csv' })) +
        '</div>';
    }).join('');
  }

  function listTimeline() {
    var arr = state.db.about.story.timeline;
    if (!arr.length) return emptyNote('还没有时间线节点');
    return arr.map(function (t, i) {
      return '<div class="list-card"><div class="list-card-head"><span class="mono-tag">' + esc(t.time || '') + '</span>' +
        '<button class="icon-btn" data-action="remove" data-list="about.story.timeline" data-index="' + i + '" title="删除">✕</button></div>' +
        '<div class="grid-2">' +
        field('时间', input('about.story.timeline.' + i + '.time')) +
        field('标题', input('about.story.timeline.' + i + '.title')) +
        '</div>' +
        field('描述', input('about.story.timeline.' + i + '.text', { rows: 2 })) +
        '</div>';
    }).join('');
  }

  function listHobbies() {
    var arr = state.db.about.hobbies;
    if (!arr.length) return emptyNote('还没有爱好');
    return arr.map(function (h, i) {
      return '<div class="list-card"><div class="list-card-head"><span class="mono-tag">' + esc(h.title || ('爱好 ' + (i + 1))) + '</span>' +
        '<button class="icon-btn" data-action="remove" data-list="about.hobbies" data-index="' + i + '" title="删除">✕</button></div>' +
        '<div class="grid-2">' +
        field('emoji', input('about.hobbies.' + i + '.emoji')) +
        field('标题', input('about.hobbies.' + i + '.title')) +
        '</div>' +
        field('描述', input('about.hobbies.' + i + '.text', { rows: 2 })) +
        '</div>';
    }).join('');
  }

  /* --- 文章管理 --- */
  function renderPosts() {
    if (state.editor && state.editor.type === 'posts') return renderPostsEditor();
    return listPosts();
  }

  function listPosts() {
    var arr = state.db.posts;
    var head = '<div class="list-toolbar"><p class="muted">共 ' + arr.length + ' 篇文章</p>' +
      '<button class="btn" data-action="new-post">＋ 新建文章</button></div>';
    if (!arr.length) return head + emptyNote('还没有文章，点击「新建文章」开始');
    var rows = arr.map(function (p) {
      var pill = p.featured ? '<span class="pill">推荐</span>' : '';
      return '<div class="row-item"><div class="row-main">' +
        '<div class="row-title">' + esc(p.title || '（无标题）') + pill + '</div>' +
        '<div class="row-meta mono-tag">' + esc(p.date || '') + ' · ' + esc(p.author || '') + ' · ' + esc(p.category || '未分类') + '</div>' +
        '</div><div class="row-actions">' +
        '<button class="btn btn-sm" data-action="edit-post" data-id="' + esc(p.id) + '">编辑</button>' +
        '<button class="btn btn-sm btn-ghost" data-action="del-post" data-id="' + esc(p.id) + '">删除</button>' +
        '</div></div>';
    }).join('');
    return head + '<div class="rows">' + rows + '</div>';
  }

  function renderPostsEditor() {
    var idx = state.db.posts.findIndex(function (p) { return p.id === state.editor.id; });
    var p = state.db.posts[idx];
    if (!p) { state.editor = null; return renderPosts(); }
    var base = 'posts.' + idx;
    return '<div class="editor-head">' +
      '<button class="btn btn-ghost" data-action="back-list">← 返回文章列表</button>' +
      '<span class="mono-tag">ID：' + esc(p.id) + '（自动生成，不可修改）</span></div>' +
      section('文章信息', [
        '<div class="grid-2">',
        field('标题', input(base + '.title')),
        field('作者', input(base + '.author')),
        field('日期', input(base + '.date', { type: 'date' })),
        field('分类', input(base + '.category')),
        '</div>',
        field('摘要', input(base + '.excerpt', { rows: 2 })),
        field('推荐到首页', checkToggle(base + '.featured'))
      ].join('')) +
      section('正文', field('正文（支持迷你 Markdown）', input(base + '.body', { rows: 16, mono: true }), { hint: MD_HINT }));
  }

  /* --- 项目管理 --- */
  function renderProjects() {
    if (state.editor && state.editor.type === 'projects') return renderProjectsEditor();
    return listProjects();
  }

  function listProjects() {
    var arr = state.db.projects;
    var head = '<div class="list-toolbar"><p class="muted">共 ' + arr.length + ' 个项目</p>' +
      '<button class="btn" data-action="new-project">＋ 新建项目</button></div>';
    if (!arr.length) return head + emptyNote('还没有项目');
    var rows = arr.map(function (p) {
      return '<div class="row-item"><div class="row-main">' +
        '<div class="row-title">' + esc(p.icon || '') + ' ' + esc(p.title || '（无标题）') + '</div>' +
        '<div class="row-meta mono-tag">' + esc(p.status || '') + (p.tags && p.tags.length ? ' · ' + esc(p.tags.join(', ')) : '') + '</div>' +
        '</div><div class="row-actions">' +
        '<button class="btn btn-sm" data-action="edit-project" data-id="' + esc(p.id) + '">编辑</button>' +
        '<button class="btn btn-sm btn-ghost" data-action="del-project" data-id="' + esc(p.id) + '">删除</button>' +
        '</div></div>';
    }).join('');
    return head + '<div class="rows">' + rows + '</div>';
  }

  function renderProjectsEditor() {
    var idx = state.db.projects.findIndex(function (p) { return p.id === state.editor.id; });
    var p = state.db.projects[idx];
    if (!p) { state.editor = null; return renderProjects(); }
    var base = 'projects.' + idx;
    return '<div class="editor-head">' +
      '<button class="btn btn-ghost" data-action="back-list">← 返回项目列表</button>' +
      '<span class="mono-tag">ID：' + esc(p.id) + '（自动生成，不可修改）</span></div>' +
      section('项目信息', [
        '<div class="grid-2">',
        field('图标（单个 emoji）', input(base + '.icon'), { hint: '只填一个 emoji 字符' }),
        field('标题', input(base + '.title')),
        field('状态', input(base + '.status')),
        '</div>',
        field('描述', input(base + '.desc', { rows: 3 })),
        field('标签（逗号分隔）', input(base + '.tags', { dataType: 'csv' }))
      ].join(''));
  }

  /* --- 相册管理 --- */
  function renderGallery() {
    if (state.editor && state.editor.type === 'gallery') return renderGalleryEditor();
    return listGallery();
  }

  function listGallery() {
    var arr = state.db.gallery;
    var head = '<div class="list-toolbar"><p class="muted">共 ' + arr.length + ' 张</p>' +
      '<button class="btn" data-action="new-gallery">＋ 新增</button></div>';
    if (!arr.length) return head + emptyNote('相册还是空的，点击「＋ 新增」');
    var cards = arr.map(function (g) {
      var media;
      if (g.type === 'image') {
        var first = (Array.isArray(g.photos) && g.photos[0] && g.photos[0].src) || g.src || '';
        var count = (Array.isArray(g.photos) && g.photos.length) ? g.photos.length : (g.src ? 1 : 0);
        if (first) {
          media = '<div class="g-thumb"><img src="' + esc(first) + '" alt="">' +
            (count > 1 ? '<span class="g-count">' + count + '</span>' : '') + '</div>';
        } else {
          media = '<div class="g-thumb g-thumb-empty">🖼️</div>';
        }
      } else {
        media = '<div class="g-thumb ' + esc(g.tile || 'tile-1') + '">' + esc(g.emoji || '') + '</div>';
      }
      return '<div class="g-card">' + media +
        '<div class="g-card-body">' +
        '<div class="g-caption">' + esc(g.caption || '（无说明）') + '</div>' +
        '<div class="row-actions">' +
        '<button class="btn btn-sm" data-action="edit-gallery" data-id="' + esc(g.id) + '">编辑</button>' +
        '<button class="btn btn-sm btn-ghost" data-action="del-gallery" data-id="' + esc(g.id) + '">删除</button>' +
        '</div></div></div>';
    }).join('');
    return head + '<div class="g-grid">' + cards + '</div>';
  }

  function renderGalleryEditor() {
    var idx = state.db.gallery.findIndex(function (g) { return g.id === state.editor.id; });
    var g = state.db.gallery[idx];
    if (!g) { state.editor = null; return renderGallery(); }
    var base = 'gallery.' + idx;
    var isImage = g.type === 'image';
    var typeField = select(base + '.type', [
      { value: 'tile', label: 'tile · 色块 + emoji' },
      { value: 'image', label: 'image · 上传图片' }
    ], ' data-rerender="1"');

    var tileRow = isImage ? '' :
      '<div class="grid-2">' +
      field('色块', select(base + '.tile', TILE_OPTIONS)) +
      field('emoji', input(base + '.emoji')) +
      '</div>';

    if (isImage && !Array.isArray(g.photos)) {
      g.photos = g.src ? [{ src: g.src, caption: g.caption || '' }] : [{ src: '', caption: '' }];
    }

    var imageBlock = '';
    if (isImage) {
      var photos = g.photos || [{ src: '', caption: '' }];
      var photoRows = photos.map(function (p, j) {
        return '<div class="photo-editor-row">' +
          '<div class="grid-2">' +
          field('图片 URL', input(base + '.photos.' + j + '.src')) +
          field('说明', input(base + '.photos.' + j + '.caption')) +
          '</div>' +
          '<div class="photo-editor-actions">' +
          '<label class="btn btn-sm btn-ghost">上传<input type="file" accept="image/*" data-upload-bind="' + base + '.photos.' + j + '.src" class="hidden-file"></label>' +
          '<button class="btn btn-sm btn-ghost" data-action="remove-photo" data-base="' + base + '" data-index="' + j + '">删除</button>' +
          '</div>' +
          (p.src ? '<div class="upload-preview"><img src="' + esc(p.src) + '" alt=""></div>' : '') +
          '</div>';
      }).join('');
      imageBlock = section('照片（同一事件可传多张）', photoRows +
        '<button class="btn btn-sm" data-action="add-photo" data-base="' + base + '">＋ 添加照片</button>');
    }

    return '<div class="editor-head">' +
      '<button class="btn btn-ghost" data-action="back-list">← 返回相册</button>' +
      '<span class="mono-tag">ID：' + esc(g.id) + '</span></div>' +
      section('图片信息', [
        field('类型', typeField),
        tileRow,
        imageBlock,
        field('说明 caption', input(base + '.caption'))
      ].join(''));
  }

  /* --- 城市记忆 --- */
  /* --- 城市与旅行 --- */
  function renderTrips() {
    if (state.editor && state.editor.type === 'trips') return renderTripEditor();
    return listTrips();
  }

  function listTrips() {
    var arr = state.db.trips || [];
    var head = '<div class="list-toolbar"><p class="muted">共 ' + arr.length + ' 段旅行</p>' +
      '<button class="btn" data-action="new-trip">＋ 添加旅行</button></div>';
    if (!arr.length) return head + emptyNote('还没有旅行记录');
    var rows = arr.map(function (t) {
      return '<div class="row-item"><div class="row-main">' +
        '<div class="row-title">' + esc(t.city || '（未命名）') + '</div>' +
        '<div class="row-meta mono-tag">' + esc((t.start || '') + (t.end ? ' → ' + t.end : '')) +
        (t.tags && t.tags.length ? ' · ' + esc(t.tags.join(' / ')) : '') + '</div>' +
        '</div><div class="row-actions">' +
        '<button class="btn btn-sm" data-action="edit-trip" data-id="' + esc(t.id) + '">编辑</button>' +
        '<button class="btn btn-sm btn-ghost" data-action="del-trip" data-id="' + esc(t.id) + '">删除</button>' +
        '</div></div>';
    }).join('');
    return head + '<div class="rows">' + rows + '</div>';
  }

  function renderTripEditor() {
    var idx = state.db.trips.findIndex(function (t) { return t.id === state.editor.id; });
    var t = state.db.trips[idx];
    if (!t) { state.editor = null; return listTrips(); }
    var base = 'trips.' + idx;
    if (!Array.isArray(t.photos)) t.photos = [{ src: '', caption: '' }];
    if (!t.rating) t.rating = { atmosphere: 5, food: 5, scenery: 4, again: 5 };
    if (!Array.isArray(t.tags)) t.tags = [];
    if (!Array.isArray(t.spots)) t.spots = [];

    var photoRows = t.photos.map(function (p, j) {
      return '<div class="photo-editor-row">' +
        '<div class="grid-2">' +
        field('图片 URL', input(base + '.photos.' + j + '.src')) +
        field('说明', input(base + '.photos.' + j + '.caption')) +
        '</div>' +
        '<div class="photo-editor-actions">' +
        '<label class="btn btn-sm btn-ghost">上传<input type="file" accept="image/*" data-upload-bind="' + base + '.photos.' + j + '.src" class="hidden-file"></label>' +
        '<button class="btn btn-sm btn-ghost" data-action="remove-photo" data-base="' + base + '" data-index="' + j + '">删除</button>' +
        '</div>' +
        (p.src ? '<div class="upload-preview"><img src="' + esc(p.src) + '" alt=""></div>' : '') +
        '</div>';
    }).join('');

    return '<div class="editor-head">' +
      '<button class="btn btn-ghost" data-action="back-list">← 返回旅行记录</button>' +
      '<span class="mono-tag">ID：' + esc(t.id) + '</span></div>' +
      section('基本信息', [
        field('城市', cityComboboxHtml(base, t), { hint: '支持输入城市名或拼音模糊检索（如输入“南”会带出南京、南通、南昌等），选中后自动填充城市 ID 与经纬度。' }),
        '<div class="grid-2">',
        field('开始日期', input(base + '.start', { type: 'date' })),
        field('结束日期', input(base + '.end', { type: 'date' })),
        '</div>'
      ].join('')) +
      section('故事内容', [
        field('城市记忆（一句话 quote）', input(base + '.quote', { rows: 2 })),
        field('旅行故事 story', input(base + '.story', { rows: 4 })),
        field('标签（逗号分隔）', input(base + '.tags', { dataType: 'csv' })),
        field('去过的地点（逗号分隔）', input(base + '.spots', { dataType: 'csv' })),
        '<div class="grid-2">',
        field('同行的人', input(base + '.companions')),
        field('天气', input(base + '.weather')),
        field('心情（如 ★★★★★）', input(base + '.mood')),
        '</div>'
      ].join('')) +
      section('我的评分（1-5）', [
        '<div class="grid-2">',
        field('氛围感', input(base + '.rating.atmosphere', { dataType: 'number' })),
        field('美食', input(base + '.rating.food', { dataType: 'number' })),
        field('风景', input(base + '.rating.scenery', { dataType: 'number' })),
        field('再来一次', input(base + '.rating.again', { dataType: 'number' })),
        '</div>'
      ].join('')) +
      section('照片（可传多张）',
        '<label class="btn btn-sm">批量上传多张<input type="file" accept="image/*" multiple data-upload-multi="' + base + '" class="hidden-file"></label>' +
        photoRows +
        '<button class="btn btn-sm" data-action="add-photo" data-base="' + base + '">＋ 手动添加一行</button>');
  }

  function newTrip() {
    var id = 't-' + Date.now();
    state.db.trips.push({
      id: id, cityId: '', city: '', lng: null, lat: null, start: '', end: '',
      quote: '', story: '', tags: [], spots: [], companions: '', mood: '', weather: '',
      rating: { atmosphere: 5, food: 5, scenery: 4, again: 5 },
      photos: [{ src: '', caption: '' }]
    });
    state.editor = { type: 'trips', id: id };
    state.dirty = true;
    updateDirty();
    renderTab('trips');
  }

  function delTrip(id) {
    var t = state.db.trips.find(function (x) { return x.id === id; });
    if (!t) return;
    if (!confirm('确定删除「' + (t.city || id) + '」这段旅行吗？')) return;
    state.db.trips = state.db.trips.filter(function (x) { return x.id !== id; });
    state.dirty = true;
    updateDirty();
    renderTab('trips');
  }

  /* --- 联系与留言 --- */
  function renderContact() {
    return section('联系页基础', [
      '<div class="grid-2">',
      field('眉题 eyebrow', input('contact.eyebrow')),
      field('标题 title', input('contact.title')),
      '</div>',
      field('介绍 intro', input('contact.intro', { rows: 2 })),
      '<div class="grid-2">',
      field('表单标题', input('contact.form.title')),
      '</div>',
      field('表单说明', input('contact.form.note', { rows: 2 }))
    ].join('')) +
    section('联系卡片', listCards(), { actions: addBtn('contact.cards') }) +
    section('访客留言', listMessages());
  }

  function listCards() {
    var arr = state.db.contact.cards;
    if (!arr.length) return emptyNote('还没有联系卡片');
    return arr.map(function (c, i) {
      return '<div class="list-card"><div class="list-card-head"><span class="mono-tag">' + esc(c.title || ('卡片 ' + (i + 1))) + '</span>' +
        '<button class="icon-btn" data-action="remove" data-list="contact.cards" data-index="' + i + '" title="删除">✕</button></div>' +
        '<div class="grid-2">' +
        field('图标 emoji', input('contact.cards.' + i + '.icon')) +
        field('标题', input('contact.cards.' + i + '.title')) +
        field('文字', input('contact.cards.' + i + '.text')) +
        field('链接', input('contact.cards.' + i + '.link')) +
        '</div>' +
        field('备注', input('contact.cards.' + i + '.note')) +
        '</div>';
    }).join('');
  }

  function listMessages() {
    var arr = state.db.messages;
    if (!arr.length) return emptyNote('还没有留言');
    return arr.map(function (m, i) {
      var d = new Date(m.time);
      var ts = isNaN(d.getTime()) ? '' :
        d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
      return '<div class="row-item"><div class="row-main">' +
        '<div class="row-title">' + esc(m.name || '匿名') + '</div>' +
        '<div class="row-meta">' + esc(m.text || '') + '</div>' +
        '<div class="row-meta mono-tag">' + esc(ts) + '</div>' +
        '</div><div class="row-actions">' +
        '<button class="btn btn-sm btn-ghost" data-action="remove" data-list="messages" data-index="' + i + '">删除</button>' +
        '</div></div>';
    }).join('');
  }

  /* --- 数据与安全 --- */
  function renderData() {
    return section('数据导出 / 导入', [
      '<p class="f-hint">导出当前数据库为 db.json 文件，或从本地导入一份 db.json 覆盖当前内容。</p>',
      '<div class="data-actions">',
      '<button class="btn" data-action="export">⬇ 导出数据（db.json）</button>',
      '<label class="btn btn-ghost">⬆ 导入数据<input type="file" accept=".json,application/json" class="hidden-file" data-action="import"></label>',
      '</div>'
    ].join('')) +
    section('修改密码', [
      '<p class="f-hint">修改后，旧 token 会失效，需要重新登录。</p>',
      '<div class="pw-row">',
      '<input type="password" id="new-password" placeholder="输入新密码" autocomplete="new-password">',
      '<button class="btn" data-action="change-password">修改密码</button>',
      '</div>'
    ].join('')) +
    section('说明', '<p class="f-hint">所有内容保存在服务端 db.json。每个标签页底部的「保存修改」都会把整份数据库提交到服务端。</p>');
  }

  function loadLogs() {
    api('/api/logs?lines=200').then(function (r) {
      var box = $('log-view');
      if (!box) return;
      box.textContent = r.lines && r.lines.length ? r.lines.join('\n') : '（暂无日志）';
    }).catch(function (err) {
      if (err.status !== 401) toast('日志加载失败：' + (err.message || ''), 'err');
    });
  }

  function renderLogs() {
    setTimeout(loadLogs, 0);
    return section('操作日志（最近 200 条）', [
      '<p class="f-hint">记录所有 API 请求与关键操作（登录、保存、上传、留言等）。日志保存在服务器 data/logs/site.log，超过 2MB 自动轮转。</p>',
      '<div class="log-toolbar"><button class="btn" data-action="refresh-logs">🔄 刷新日志</button></div>',
      '<pre id="log-view" class="log-view">加载中…</pre>'
    ].join(''));
  }

  var renderers = {
    site: renderSite,
    hero: renderHero,
    about: renderAbout,
    posts: renderPosts,
    projects: renderProjects,
    gallery: renderGallery,
    trips: renderTrips,
    contact: renderContact,
    data: renderData,
    logs: renderLogs
  };

  /* ============================================================
     标签页切换
     ============================================================ */
  function renderTab(key) {
    state.activeTab = key;
    document.querySelectorAll('.nav-item').forEach(function (n) {
      n.classList.toggle('active', n.dataset.tab === key);
    });
    $('page-title').textContent = PAGE_TITLES[key] || '管理后台';
    $('view').innerHTML = renderers[key] ? renderers[key]() : '';
    initCityComboboxes();
    if (key === 'logs') setTimeout(loadLogs, 0);
    closeSidebar();
    window.scrollTo(0, 0);
  }

  function switchTab(key) {
    state.editor = null;
    renderTab(key);
  }

  /* ============================================================
     侧栏（移动端）
     ============================================================ */
  function openSidebar() {
    $('sidebar').classList.add('open');
    $('backdrop').classList.add('show');
  }
  function closeSidebar() {
    $('sidebar').classList.remove('open');
    $('backdrop').classList.remove('show');
  }

  /* ============================================================
     字段同步
     ============================================================ */
  function handleFieldChange(el) {
    var bind = el.dataset.bind;
    if (!bind) return;
    var value;
    if (el.type === 'checkbox') {
      value = el.checked;
    } else if (el.dataset.type === 'number') {
      var raw = el.value.trim();
      value = raw === '' ? 0 : (isNaN(Number(raw)) ? el.value : Number(raw));
    } else if (el.dataset.type === 'csv') {
      value = el.value.split(/[,，]/).map(function (s) { return s.trim(); }).filter(Boolean);
    } else if (el.dataset.type === 'lines') {
      value = el.value.split('\n').map(function (s) { return s.trim(); }).filter(Boolean);
    } else {
      value = el.value;
    }
    setPath(state.db, bind, value);
    state.dirty = true;
    updateDirty();
    enforceTripDateRange(bind);
    if (el.dataset.rerender) renderTab(state.activeTab);
  }

  function enforceTripDateRange(bind) {
    var m = bind.match(/^(.+)\.(start|end)$/);
    if (!m) return;
    var base = m[1];
    var t = getPath(state.db, base);
    if (!t || typeof t !== 'object') return;
    var start = typeof t.start === 'string' ? t.start : '';
    var end = typeof t.end === 'string' ? t.end : '';
    if (!start || !end || end >= start) return;
    // 结束日期不能早于开始日期：统一把结束日期拉回到开始日期
    setPath(state.db, base + '.end', start);
    var el = document.querySelector('[data-bind="' + base + '.end"]');
    if (el) el.value = start;
    toast('结束日期不能早于开始日期，已自动调整', 'warn');
  }

  function onInput(e) {
    var el = e.target;
    if (el && el.dataset && el.dataset.bind) handleFieldChange(el);
  }

  function onChange(e) {
    var el = e.target;
    if (!el || !el.dataset) return;
    if (el.dataset.bind) { handleFieldChange(el); return; }
    if (el.dataset.uploadMulti) {
      onUploadImages(el.files, el.dataset.uploadMulti);
      el.value = '';
      return;
    }
    if (el.dataset.uploadBind) {
      onUploadImage(el.files && el.files[0], el.dataset.uploadBind);
      el.value = '';
      return;
    }
    if (el.dataset.action === 'import') {
      onImportFile(el.files && el.files[0]);
      el.value = '';
      return;
    }
  }

  /* ============================================================
     列表操作（增删）
     ============================================================ */
  var LIST_DEFAULTS = {
    'hero.buttons': { text: '', link: '', primary: false },
    'hero.stats': { kind: 'count', value: 0, suffix: '', label: '' },
    'about.profiles': { name: '', role: '', bio: '', skills: [] },
    'about.story.timeline': { time: '', title: '', text: '' },
    'about.hobbies': { emoji: '', title: '', text: '' },
    'contact.cards': { icon: '', title: '', text: '', link: '', note: '' },
    'trips': { id: '', cityId: '', city: '', lng: null, lat: null, start: '', end: '', quote: '', story: '', tags: [], spots: [], companions: '', mood: '', weather: '', rating: { atmosphere: 5, food: 5, scenery: 4, again: 5 }, photos: [{ src: '', caption: '' }] }
  };

  function addItem(list) {
    var arr = getPath(state.db, list);
    if (!Array.isArray(arr)) return;
    var dflt = LIST_DEFAULTS[list] || {};
    arr.push(Object.assign({}, dflt));
    state.dirty = true;
    updateDirty();
    renderTab(state.activeTab);
  }

  function removeItem(list, index) {
    var arr = getPath(state.db, list);
    if (!Array.isArray(arr) || index < 0 || index >= arr.length) return;
    if (!confirm('确定删除这一项吗？')) return;
    arr.splice(index, 1);
    state.dirty = true;
    updateDirty();
    renderTab(state.activeTab);
  }

  function newPost() {
    var id = 'p-' + Date.now();
    state.db.posts.unshift({ id: id, title: '', author: 'xiaoxu', date: todayStr(), category: '', excerpt: '', featured: false, body: '' });
    state.editor = { type: 'posts', id: id };
    state.dirty = true;
    updateDirty();
    renderTab('posts');
  }

  function delPost(id) {
    var p = state.db.posts.find(function (x) { return x.id === id; });
    if (!p) return;
    if (!confirm('确定删除文章「' + (p.title || id) + '」吗？')) return;
    state.db.posts = state.db.posts.filter(function (x) { return x.id !== id; });
    state.dirty = true;
    updateDirty();
    renderTab('posts');
  }

  function newProject() {
    var id = 'proj-' + Date.now();
    state.db.projects.push({ id: id, icon: '', title: '', desc: '', tags: [], status: '' });
    state.editor = { type: 'projects', id: id };
    state.dirty = true;
    updateDirty();
    renderTab('projects');
  }

  function delProject(id) {
    var p = state.db.projects.find(function (x) { return x.id === id; });
    if (!p) return;
    if (!confirm('确定删除项目「' + (p.title || id) + '」吗？')) return;
    state.db.projects = state.db.projects.filter(function (x) { return x.id !== id; });
    state.dirty = true;
    updateDirty();
    renderTab('projects');
  }

  function newGallery() {
    var id = 'g-' + Date.now();
    state.db.gallery.push({ id: id, type: 'tile', tile: 'tile-1', emoji: '', caption: '', src: '' });
    state.editor = { type: 'gallery', id: id };
    state.dirty = true;
    updateDirty();
    renderTab('gallery');
  }

  function delGallery(id) {
    var g = state.db.gallery.find(function (x) { return x.id === id; });
    if (!g) return;
    if (!confirm('确定删除这张图（' + (g.caption || id) + '）吗？')) return;
    state.db.gallery = state.db.gallery.filter(function (x) { return x.id !== id; });
    state.dirty = true;
    updateDirty();
    renderTab('gallery');
  }

  function addPhoto(base) {
    var arr = getPath(state.db, base + '.photos');
    if (!Array.isArray(arr)) return;
    arr.push({ src: '', caption: '' });
    state.dirty = true;
    updateDirty();
    renderTab(state.activeTab);
  }

  function removePhoto(base, index) {
    var arr = getPath(state.db, base + '.photos');
    if (!Array.isArray(arr) || index < 0 || index >= arr.length) return;
    arr.splice(index, 1);
    if (!arr.length) arr.push({ src: '', caption: '' });
    state.dirty = true;
    updateDirty();
    renderTab(state.activeTab);
  }

  /* ============================================================
     图片上传
     ============================================================ */
  function uploadImageFile(file) {
    // 返回 Promise，resolve 为上传后的 URL；内部做小图直传 / 大图压缩。
    if (!file) return Promise.reject(new Error('no-file'));
    if (file.type.indexOf('image/') !== 0) return Promise.reject(new Error('not-image'));

    var readAsBase64 = function (blob) {
      return new Promise(function (resolve, reject) {
        var reader = new FileReader();
        reader.onload = function () { resolve(String(reader.result).split(',')[1]); };
        reader.onerror = function () { reject(new Error('read-failed')); };
        reader.readAsDataURL(blob);
      });
    };

    var upload = function (name, data) {
      return api('/api/upload', { method: 'POST', body: { name: name, data: data } })
        .then(function (r) { return r.url; });
    };

    // 小图直接原样上传（避免破坏 GIF 动图、透明 PNG）
    if (file.size < 800 * 1024) {
      return readAsBase64(file).then(function (b) { return upload(file.name, b); });
    }

    // 大图自动压缩：最长边 1920px、JPEG 质量 0.82
    return new Promise(function (resolve, reject) {
      var objectUrl = URL.createObjectURL(file);
      var img = new Image();
      var finish = function (blob, name) {
        if (!blob) {
          readAsBase64(file)
            .then(function (b) { return upload(file.name, b); })
            .then(resolve, reject);
          return;
        }
        readAsBase64(blob)
          .then(function (b) { return upload(name, b); })
          .then(resolve, reject);
      };
      img.onload = function () {
        URL.revokeObjectURL(objectUrl);
        var maxEdge = 1920;
        var scale = Math.min(1, maxEdge / Math.max(img.width, img.height));
        var w = Math.max(1, Math.round(img.width * scale));
        var h = Math.max(1, Math.round(img.height * scale));
        var canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        canvas.getContext('2d').drawImage(img, 0, 0, w, h);
        try {
          canvas.toBlob(function (blob) {
            finish(blob, file.name.replace(/\.[^.]+$/, '') + '.jpg');
          }, 'image/jpeg', 0.82);
        } catch (e) {
          readAsBase64(file).then(function (b) { return upload(file.name, b); }).then(resolve, reject);
        }
      };
      img.onerror = function () {
        URL.revokeObjectURL(objectUrl);
        readAsBase64(file).then(function (b) { return upload(file.name, b); }).then(resolve, reject);
      };
      img.src = objectUrl;
    });
  }

  function onUploadImage(file, bind) {
    if (!file) return;
    if (file.type.indexOf('image/') !== 0) { toast('请选择图片文件', 'warn'); return; }
    toast('正在上传…', 'ok');
    uploadImageFile(file)
      .then(function (url) {
        setPath(state.db, bind, url);
        state.dirty = true;
        updateDirty();
        renderTab(state.activeTab);
        toast('上传成功', 'ok');
      })
      .catch(function (err) {
        if (err && err.status !== 401) toast('上传失败：' + (err.message || '未知错误'), 'err');
      });
  }

  function onUploadImages(files, base) {
    var list = Array.prototype.slice.call(files || []).filter(function (f) {
      return f && f.type && f.type.indexOf('image/') === 0;
    });
    if (!list.length) { toast('请选择图片文件', 'warn'); return; }

    var arr = getPath(state.db, base + '.photos');
    if (!Array.isArray(arr)) arr = [];
    // 去掉尚未上传的空占位行，避免批量上传后残留空白条目
    arr = arr.filter(function (p) { return p && (p.src || p.caption); });
    setPath(state.db, base + '.photos', arr);

    var start = arr.length;
    list.forEach(function () { arr.push({ src: '', caption: '' }); });
    state.dirty = true;
    updateDirty();
    toast('正在上传 ' + list.length + ' 张图片…', 'ok');

    var jobs = list.map(function (f, i) {
      return uploadImageFile(f).then(function (url) {
        arr[start + i].src = url;
      });
    });

    Promise.allSettled(jobs)
      .then(function (results) {
        var ok = results.filter(function (r) { return r.status === 'fulfilled'; }).length;
        state.dirty = true;
        updateDirty();
        renderTab(state.activeTab);
        if (ok === list.length) {
          toast('已上传 ' + list.length + ' 张图片', 'ok');
        } else {
          toast('上传完成：成功 ' + ok + ' 张，失败 ' + (list.length - ok) + ' 张', 'err');
        }
      })
      .catch(function () {
        state.dirty = true;
        updateDirty();
        renderTab(state.activeTab);
        toast('图片上传中断', 'err');
      });
  }

  /* ============================================================
     数据导出 / 导入 / 修改密码
     ============================================================ */
  function exportData() {
    if (!state.db) return;
    var blob = new Blob([JSON.stringify(state.db, null, 2)], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'db.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 500);
    toast('已导出 db.json', 'ok');
  }

  function validateDb(o) {
    return !!o && typeof o === 'object' && !Array.isArray(o) &&
      typeof o.site === 'object' &&
      typeof o.hero === 'object' &&
      typeof o.about === 'object' &&
      Array.isArray(o.posts) &&
      Array.isArray(o.projects) &&
      Array.isArray(o.gallery) &&
      Array.isArray(o.cities) &&
      Array.isArray(o.trips) &&
      typeof o.contact === 'object' &&
      Array.isArray(o.messages);
  }

  function onImportFile(file) {
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function () {
      var obj;
      try {
        obj = JSON.parse(String(reader.result));
      } catch (err) {
        toast('JSON 解析失败', 'err');
        return;
      }
      if (!validateDb(obj)) {
        toast('数据结构校验失败，请确认是完整的 db.json', 'err');
        return;
      }
      if (!confirm('导入将覆盖当前全部内容，确定继续吗？')) return;
      setSaving(true);
      api('/api/content', { method: 'PUT', body: obj })
        .then(function () {
          state.db = obj;
          state.dirty = false;
          updateDirty();
          toast('导入成功', 'ok');
          renderTab('data');
        })
        .catch(function (err) {
          if (err.status !== 401) toast('导入失败：' + (err.message || '未知错误'), 'err');
        })
        .then(function () { setSaving(false); });
    };
    reader.readAsText(file);
  }

  function changePassword() {
    var input = $('new-password');
    var pw = input.value;
    if (!pw) { toast('请输入新密码', 'warn'); return; }
    setSaving(true);
    api('/api/password', { method: 'PUT', body: { password: pw } })
      .then(function () {
        input.value = '';
        toast('密码已更新', 'ok');
        if (confirm('密码修改成功。是否现在重新登录？')) {
          logout();
        }
      })
      .catch(function (err) {
        if (err.status !== 401) toast('修改失败：' + (err.message || '未知错误'), 'err');
      })
      .then(function () { setSaving(false); });
  }

  /* ============================================================
     点击分发
     ============================================================ */
  function onClick(e) {
    var el = e.target.closest('[data-action]');
    if (!el) return;
    var action = el.dataset.action;
    switch (action) {
      case 'add':
        addItem(el.dataset.list);
        break;
      case 'remove':
        removeItem(el.dataset.list, Number(el.dataset.index));
        break;
      case 'new-post':
        newPost();
        break;
      case 'edit-post':
        state.editor = { type: 'posts', id: el.dataset.id };
        renderTab('posts');
        break;
      case 'del-post':
        delPost(el.dataset.id);
        break;
      case 'new-project':
        newProject();
        break;
      case 'edit-project':
        state.editor = { type: 'projects', id: el.dataset.id };
        renderTab('projects');
        break;
      case 'del-project':
        delProject(el.dataset.id);
        break;
      case 'new-gallery':
        newGallery();
        break;
      case 'edit-gallery':
        state.editor = { type: 'gallery', id: el.dataset.id };
        renderTab('gallery');
        break;
      case 'del-gallery':
        delGallery(el.dataset.id);
        break;
      case 'new-trip':
        newTrip();
        break;
      case 'edit-trip':
        state.editor = { type: 'trips', id: el.dataset.id };
        renderTab('trips');
        break;
      case 'del-trip':
        delTrip(el.dataset.id);
        break;
      case 'add-photo':
        addPhoto(el.dataset.base);
        break;
      case 'remove-photo':
        removePhoto(el.dataset.base, Number(el.dataset.index));
        break;
      case 'back-list':
        state.editor = null;
        renderTab(state.activeTab);
        break;
      case 'export':
        exportData();
        break;
      case 'change-password':
        changePassword();
        break;
      case 'refresh-logs':
        loadLogs();
        break;
      /* import 走 change 事件，不在此处理 */
    }
  }

  /* ============================================================
     初始化
     ============================================================ */
  function renderNav() {
    var nav = $('nav');
    nav.innerHTML = TABS.map(function (t) {
      return '<button class="nav-item" data-tab="' + t.key + '"><span class="nav-icon">' + t.icon + '</span>' + t.label + '</button>';
    }).join('');
  }

  function bindEvents() {
    $('login-form').addEventListener('submit', submitLogin);
    $('logout-btn').addEventListener('click', logout);
    $('hamburger').addEventListener('click', openSidebar);
    $('backdrop').addEventListener('click', closeSidebar);
    $('save-btn').addEventListener('click', saveAll);
    $('nav').addEventListener('click', function (e) {
      var item = e.target.closest('.nav-item');
      if (item) switchTab(item.dataset.tab);
    });
    $('view').addEventListener('input', onInput);
    $('view').addEventListener('change', onChange);
    $('view').addEventListener('click', onClick);
    document.addEventListener('click', function (e) {
      if (!e.target.closest('[data-city-combobox]')) {
        document.querySelectorAll('[data-city-dropdown].open').forEach(function (dd) {
          dd.classList.remove('open');
        });
      }
    });
  }

  function init() {
    renderNav();
    bindEvents();
    showLogin();
    state.token = localStorage.getItem(TOKEN_KEY) || null;
    api('/api/content')
      .then(function (db) {
        state.db = db;
        if (state.token) {
          showApp();
          renderTab('site');
        } else {
          $('login-msg').textContent = '请输入管理密码登录。';
        }
      })
      .catch(function (err) {
        if (err.status === 401) {
          $('login-msg').textContent = '请输入管理密码登录。';
        } else {
          $('login-msg').textContent = '无法加载站点数据，请确认后端服务已启动。';
        }
      });
  }

  init();
})();
