/* ============================================================
   小站服务端 · xiaoxu & xiaofu
   零依赖 Node.js 服务器：静态页面 + 内容 API + 管理后台 + 存储
   启动：node server.js（默认端口 3000，可用 PORT 环境变量修改）
   ============================================================ */
"use strict";

const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const store = require("./store");

const ROOT = __dirname;
const DATA_DIR = path.join(ROOT, "data");
const ADMIN_FILE = path.join(DATA_DIR, "admin.json");
const UPLOAD_DIR = path.join(DATA_DIR, "uploads");
const LOG_DIR = path.join(DATA_DIR, "logs");
const LOG_FILE = path.join(LOG_DIR, "site.log");
const STATS_FILE = path.join(DATA_DIR, "stats.json");
const BOUNDARY_DIR = path.join(ROOT, "assets", "boundaries");
const CHINA_MAP_FILE = path.join(ROOT, "assets", "china-provinces.json");
const PORT = process.env.PORT || 3000;
const DEFAULT_PASSWORD = process.env.ADMIN_PASSWORD || "admin123";

const TOKEN_TTL = 7 * 24 * 3600 * 1000; // 7 天
const BODY_LIMIT = 16 * 1024 * 1024;    // 16MB（含 base64 图片）

/* ---------- 初始化 ---------- */
for (const dir of [DATA_DIR, UPLOAD_DIR, LOG_DIR]) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}
store.open();

// 管理员凭据：首次启动用默认密码，登录后可修改
let admin = null;
if (fs.existsSync(ADMIN_FILE)) {
  try { admin = JSON.parse(fs.readFileSync(ADMIN_FILE, "utf-8")); } catch (e) { admin = null; }
}
if (!admin || !admin.salt || !admin.hash) {
  const salt = crypto.randomBytes(16).toString("hex");
  admin = { salt, hash: hashPassword(DEFAULT_PASSWORD, salt) };
  fs.writeFileSync(ADMIN_FILE, JSON.stringify(admin, null, 2));
  console.log(`[init] 已初始化管理员账户，默认密码：${DEFAULT_PASSWORD}（登录后请在后台修改）`);
}

function hashPassword(pw, salt) {
  return crypto.scryptSync(String(pw), salt, 64).toString("hex");
}

/* ---------- 会话与限流 ---------- */
const tokens = new Map();   // token -> 过期时间戳
const loginFails = new Map(); // ip -> { count, until }
const msgRate = new Map();  // ip -> { count, until }

function newToken() {
  const t = crypto.randomBytes(32).toString("hex");
  tokens.set(t, Date.now() + TOKEN_TTL);
  return t;
}
function authOk(req) {
  const h = req.headers.authorization || "";
  const m = h.match(/^Bearer\s+(.+)$/i);
  if (!m) return false;
  const exp = tokens.get(m[1]);
  if (!exp) return false;
  if (Date.now() > exp) { tokens.delete(m[1]); return false; }
  return true;
}
function rateCheck(map, key, max, windowMs) {
  const now = Date.now();
  const rec = map.get(key);
  if (rec && rec.until > now && rec.count >= max) return false;
  if (!rec || rec.until <= now) map.set(key, { count: 1, until: now + windowMs });
  else rec.count++;
  return true;
}

// 取客户端真实 IP：仅在直连对端是本机回环时信任反向代理传来的 X-Forwarded-For，
// 避免直接暴露时被伪造；生产环境按部署指南用 Nginx 反代时也能按真实访客限流。
function clientIp(req) {
  const direct = req.socket.remoteAddress || "";
  const loopback = direct === "127.0.0.1" || direct === "::1" || direct === "::ffff:127.0.0.1";
  if (loopback) {
    const xff = req.headers["x-forwarded-for"];
    if (typeof xff === "string" && xff.trim()) {
      return xff.split(",")[0].trim() || "unknown";
    }
  }
  return direct || "unknown";
}

/* ---------- 工具 ---------- */
function sendJSON(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  res.end(body);
}
function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on("data", (c) => {
      size += c.length;
      if (size > limit) { reject(new Error("body too large")); req.destroy(); return; }
      chunks.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf-8")));
    req.on("error", reject);
  });
}
function safeDecode(s) {
  try { return decodeURIComponent(s); } catch (e) { return String(s); }
}

/* ---------- 操作日志：控制台(journald) + data/logs/site.log ---------- */
function rotateLogs() {
  try { if (fs.existsSync(LOG_FILE + ".2")) fs.unlinkSync(LOG_FILE + ".2"); } catch (e) {}
  try { if (fs.existsSync(LOG_FILE + ".1")) fs.renameSync(LOG_FILE + ".1", LOG_FILE + ".2"); } catch (e) {}
  try { if (fs.existsSync(LOG_FILE)) fs.renameSync(LOG_FILE, LOG_FILE + ".1"); } catch (e) {}
}
function log(level, msg) {
  const line = "[" + new Date().toISOString() + "] [" + level + "] " + msg;
  console.log(line);
  try {
    if (fs.existsSync(LOG_FILE) && fs.statSync(LOG_FILE).size > 2 * 1024 * 1024) rotateLogs();
    fs.appendFileSync(LOG_FILE, line + "\n");
  } catch (e) { /* 日志写盘失败不影响服务 */ }
}
function tailLogs(maxLines) {
  const files = [LOG_FILE, LOG_FILE + ".1", LOG_FILE + ".2"].filter(function (f) {
    try { return fs.existsSync(f) && fs.statSync(f).size > 0; } catch (e) { return false; }
  });
  const lines = [];
  // 从最旧轮转文件到最新文件依次追加，最后统一截取末尾 maxLines，保证顺序为“旧 → 新”。
  for (let i = files.length - 1; i >= 0; i--) {
    let content = "";
    try {
      const st = fs.statSync(files[i]);
      const start = Math.max(0, st.size - 512 * 1024);
      content = fs.readFileSync(files[i], "utf-8").slice(start);
      // 非最新文件被截断的首行是残缺行，丢弃；最新文件末尾截断的残缺首行会在最终截取时自然丢弃。
      if (st.size > 512 * 1024 && i !== 0) {
        const nl = content.indexOf("\n");
        if (nl >= 0) content = content.slice(nl + 1);
      }
    } catch (e) { continue; }
    const part = content.split("\n").filter(Boolean);
    lines.push.apply(lines, part);
  }
  return lines.slice(-maxLines);
}

/* ---------- 访问统计：内存计数 + 60s 落盘 data/stats.json ---------- */
let stats = { totalPv: 0, days: {}, posts: {} }; // days: {"YYYY-MM-DD": {pv, uv}}
let uvSet = new Set();
let uvDay = "";
function todayStr(d) {
  const x = d || new Date();
  return x.getFullYear() + "-" + String(x.getMonth() + 1).padStart(2, "0") + "-" + String(x.getDate()).padStart(2, "0");
}
function loadStats() {
  try {
    if (fs.existsSync(STATS_FILE)) {
      const s = JSON.parse(fs.readFileSync(STATS_FILE, "utf-8"));
      if (s && typeof s === "object") {
        stats.totalPv = Number(s.totalPv) || 0;
        stats.days = (s.days && typeof s.days === "object") ? s.days : {};
        stats.posts = (s.posts && typeof s.posts === "object") ? s.posts : {};
      }
    }
  } catch (e) { /* 统计文件损坏则从头计数 */ }
  uvDay = todayStr();
}
function flushStats() {
  // 只保留最近 90 天明细
  const days = {};
  Object.keys(stats.days).sort().slice(-90).forEach(function (k) { days[k] = stats.days[k]; });
  stats.days = days;
  try {
    fs.writeFileSync(STATS_FILE + ".tmp", JSON.stringify(stats));
    fs.renameSync(STATS_FILE + ".tmp", STATS_FILE);
  } catch (e) { /* 忽略 */ }
}
function recordView(pathname, postId, ip) {
  if (pathname.startsWith("/api/") || pathname.startsWith("/admin")) return;
  stats.totalPv++;
  const day = todayStr();
  if (!stats.days[day]) stats.days[day] = { pv: 0, uv: 0 };
  stats.days[day].pv++;
  if (day !== uvDay) { uvSet.clear(); uvDay = day; }
  if (!uvSet.has(ip)) {
    uvSet.add(ip);
    stats.days[day].uv++;
    if (uvSet.size > 200000) uvSet.clear(); // 极端情况下防内存膨胀
  }
  if (postId) {
    if (!stats.posts[postId]) stats.posts[postId] = { views: 0 };
    stats.posts[postId].views++;
  }
}
loadStats();
setInterval(flushStats, 60 * 1000).unref();

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".avif": "image/avif",
  ".woff2": "font/woff2",
  ".txt": "text/plain; charset=utf-8",
  ".md": "text/plain; charset=utf-8",
};

// 仅通过静态服务对外暴露页面与前端资源，屏蔽数据目录、部署脚本与源码等敏感文件。
function isForbiddenPath(p) {
  const q = p.toLowerCase();
  if (q.startsWith("/.")) return true; // .git/.env/.DS_Store 等隐藏文件与目录
  const blocked = [
    "/data",
    "/deploy",
    "/node_modules",
    "/server.js",
    "/package.json",
    "/package-lock.json",
    "/readme.md"
  ];
  for (let i = 0; i < blocked.length; i++) {
    if (q === blocked[i] || q.startsWith(blocked[i] + "/")) return true;
  }
  return false;
}

/* ---------- SEO：服务端往 HTML 注入 title/description/og 元信息（爬虫不执行 JS） ---------- */
function attr(s) {
  return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
function replaceAttr(html, re, name, value) {
  if (value === undefined || value === null) return html;
  return html.replace(re, function (m) {
    return m.replace(new RegExp(name + '="[^"]*"'), name + '="' + attr(value) + '"');
  });
}
function replaceMeta(html, re, content) {
  return replaceAttr(html, re, "content", content);
}
function injectMeta(html, meta) {
  let out = html;
  if (meta.title) out = out.replace(/<title>[\s\S]*?<\/title>/, "<title>" + attr(meta.title) + "</title>");
  out = replaceMeta(out, /<meta name="description"[^>]*>/, meta.description);
  out = replaceMeta(out, /<meta property="og:title"[^>]*>/, meta.ogTitle);
  out = replaceMeta(out, /<meta property="og:description"[^>]*>/, meta.ogDescription);
  out = replaceMeta(out, /<meta property="og:url"[^>]*>/, meta.ogUrl);
  out = replaceAttr(out, /<link rel="canonical"[^>]*>/, "href", meta.canonical);
  if (meta.ogImage) {
    out = out.replace(/<meta property="og:image"[^>]*>\s*/g, "");
    out = out.replace(/<meta property="og:image:(width|height)"[^>]*>\s*/g, "");
    out = out.replace("</head>",
      '<meta property="og:image" content="' + attr(meta.ogImage) + '">\n  ' +
      '<meta property="og:image:width" content="1200">\n  ' +
      '<meta property="og:image:height" content="630">\n</head>');
  }
  return out;
}
function routeMeta(req, pathname) {
  const content = store.getContent();
  const site = content.site || {};
  const domain = "https://" + (site.domain || "www.xiaoxu-xiaofu.top");
  const defaultImage = site.shareImage || "/assets/og-default.png";
  const abs = function (img) {
    img = String(img || defaultImage);
    return /^https?:/.test(img) ? img : domain + img;
  };
  const isPost = pathname === "/post.html" || pathname === "/post";
  const meta = { ogImage: abs(defaultImage) };
  if (isPost) {
    const id = new URL(req.url, "http://x").searchParams.get("id");
    const p = (content.posts || []).find(function (x) { return x.id === id; });
    if (p) {
      meta.title = p.title + " · " + (site.name || "");
      meta.description = p.excerpt || site.description || "";
      meta.ogTitle = p.title;
      meta.ogDescription = p.excerpt || site.description || "";
      meta.ogImage = abs(p.cover);
      meta.ogUrl = domain + "/post.html?id=" + encodeURIComponent(p.id);
      meta.canonical = meta.ogUrl;
    } else {
      meta.title = "文章 · " + (site.name || "");
      meta.ogTitle = meta.title;
      meta.description = site.description || "";
      meta.ogDescription = site.description || "";
    }
  } else {
    const pageTitles = {
      "/": "", "/index.html": "",
      "/about.html": "关于我们", "/blog.html": "博客", "/projects.html": "项目作品",
      "/gallery.html": "生活瞬间", "/contact.html": "联系我们", "/cities.html": "城市足迹"
    };
    const pt = Object.prototype.hasOwnProperty.call(pageTitles, pathname) ? pageTitles[pathname] : null;
    if (pt !== null) {
      meta.title = pt ? pt + " · " + (site.name || "") : (site.name || "") + " · " + (site.title || "");
      meta.ogTitle = pt || (site.name || "");
      meta.description = site.description || "";
      meta.ogDescription = site.description || "";
    }
    meta.ogUrl = domain + (pathname === "/" ? "/" : pathname);
    meta.canonical = meta.ogUrl;
  }
  return meta;
}

function imageHeaderMatches(ext, buf) {
  if (!buf || buf.length < 4) return false;
  if (ext === ".jpg" || ext === ".jpeg") {
    return buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
  }
  if (ext === ".png") {
    return buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  }
  if (ext === ".gif") {
    return buf.toString("ascii", 0, 6) === "GIF87a" || buf.toString("ascii", 0, 6) === "GIF89a";
  }
  if (ext === ".webp") {
    return buf.length >= 12 && buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WEBP";
  }
  if (ext === ".avif") {
    return buf.length >= 12 && buf.toString("ascii", 4, 8) === "ftyp" && /avif|avis/.test(buf.toString("ascii", 8, Math.min(buf.length, 64)));
  }
  if (ext === ".ico") {
    return buf[0] === 0 && buf[1] === 0 && buf[2] === 1 && buf[3] === 0;
  }
  return false;
}

/* ---------- 静态文件 ---------- */
function serveStatic(req, res, pathname) {
  let urlPath;
  try {
    urlPath = decodeURIComponent(pathname);
  } catch (e) {
    res.writeHead(400, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Bad Request");
    return;
  }
  if (urlPath === "/" ) urlPath = "/index.html";
  if (urlPath === "/admin") {
    res.writeHead(301, { "Location": "/admin/" });
    res.end();
    return;
  }
  if (urlPath === "/admin/") urlPath = "/admin/index.html";
  if (urlPath === "/post") urlPath = "/post.html";
  if (isForbiddenPath(urlPath)) {
    res.writeHead(404);
    return res.end("Not Found");
  }

  // 上传的图片存在 data/uploads/，映射到 /uploads/**
  let baseDir = ROOT;
  if (urlPath.startsWith("/uploads/")) {
    baseDir = UPLOAD_DIR;
    urlPath = urlPath.slice("/uploads".length);
  }

  const filePath = path.normalize(path.join(baseDir, urlPath));
  if (!filePath.startsWith(baseDir + path.sep) && filePath !== baseDir) {
    res.writeHead(403); return res.end("Forbidden");
  }
  fs.stat(filePath, (err, st) => {
    if (err || !st.isFile()) {
      const ext = path.extname(filePath).toLowerCase();
      // 资源文件直接 404；HTML 路由回退首页（保留直接访问子页面的体验）
      if (ext && MIME[ext] !== MIME[".html"]) {
        res.writeHead(404); return res.end("Not Found");
      }
      fs.readFile(path.join(ROOT, "index.html"), (e2, data) => {
        if (e2) { res.writeHead(404); return res.end("Not Found"); }
        res.writeHead(200, { "Content-Type": MIME[".html"] });
        res.end(data);
      });
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    const cacheControl = filePath.startsWith(BOUNDARY_DIR + path.sep) || filePath === CHINA_MAP_FILE
      ? "public, max-age=31536000, immutable"
      : (ext === ".html" || ext === ".js" || ext === ".css" || ext === ".svg" || ext === ".json") ? "no-store" : "public, max-age=86400";
    res.writeHead(200, {
      "Content-Type": MIME[ext] || "application/octet-stream",
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": cacheControl,
    });
    // HTML：服务端注入 SEO 元信息（爬虫/分享卡片不执行 JS）
    if (ext === ".html") {
      fs.readFile(filePath, "utf-8", function (rerr, html) {
        if (rerr) { res.end("Not Found"); return; }
        res.end(injectMeta(html, routeMeta(req, urlPath)));
      });
      return;
    }
    fs.createReadStream(filePath).pipe(res);
  });
}

/* ---------- API ---------- */
async function handleAPI(req, res, pathname) {
  if (pathname === "/api/content" && req.method === "GET") {
    try { return sendJSON(res, 200, store.getContent()); }
    catch (e) { return sendJSON(res, 500, { error: "db read failed" }); }
  }

  if (pathname === "/api/login" && req.method === "POST") {
    const ip = clientIp(req);
    if (!rateCheck(loginFails, ip, 5, 60 * 1000)) {
      log("AUTH", "登录尝试过多被限流 ip=" + ip);
      return sendJSON(res, 429, { error: "尝试次数过多，请一分钟后再试" });
    }
    let body;
    try { body = JSON.parse(await readBody(req, 1024)); } catch (e) { body = {}; }
    const given = hashPassword(body.password || "", admin.salt);
    const ok = crypto.timingSafeEqual(Buffer.from(given, "hex"), Buffer.from(admin.hash, "hex"));
    if (!ok) {
      log("AUTH", "登录失败 ip=" + ip);
      return sendJSON(res, 401, { error: "密码错误" });
    }
    const token = newToken();
    log("AUTH", "登录成功 ip=" + ip + " token=" + token.slice(0, 8) + "…");
    return sendJSON(res, 200, { ok: true, token: token });
  }

  if (pathname === "/api/content" && req.method === "PUT") {
    const ip = clientIp(req);
    if (!authOk(req)) {
      log("ADMIN", "内容保存被拒绝（未授权） ip=" + ip);
      return sendJSON(res, 401, { error: "unauthorized" });
    }
    let body;
    try { body = JSON.parse(await readBody(req, BODY_LIMIT)); } catch (e) {
      log("ADMIN", "内容保存被拒绝（JSON 无效） ip=" + ip);
      return sendJSON(res, 400, { error: "无效的 JSON" });
    }
    if (typeof body !== "object" || body === null || Array.isArray(body)) {
      log("ADMIN", "内容保存被拒绝（数据格式错误） ip=" + ip);
      return sendJSON(res, 400, { error: "数据必须是对象" });
    }
    for (const key of ["site", "hero", "about", "posts", "projects", "gallery", "contact", "messages"]) {
      if (!(key in body)) body[key] = body[key] || (key === "messages" ? [] : {});
    }
    if (!Array.isArray(body.posts)) body.posts = [];
    if (!Array.isArray(body.projects)) body.projects = [];
    if (!Array.isArray(body.gallery)) body.gallery = [];
    if (!Array.isArray(body.messages)) body.messages = [];
    for (const key of ["site", "hero", "about", "contact"]) {
      if (!body[key] || typeof body[key] !== "object" || Array.isArray(body[key])) body[key] = {};
    }
    try { store.saveContent(body); } catch (e) {
      log("ADMIN", "内容保存失败 ip=" + ip + " 原因=" + e.message);
      return sendJSON(res, 500, { error: "保存失败：" + e.message });
    }
    log("ADMIN", "内容已保存 ip=" + ip + " 文章=" + body.posts.length + " 项目=" + body.projects.length + " 相册=" + body.gallery.length);
    return sendJSON(res, 200, { ok: true });
  }

  if (pathname === "/api/password" && req.method === "PUT") {
    if (!authOk(req)) return sendJSON(res, 401, { error: "unauthorized" });
    let body;
    try { body = JSON.parse(await readBody(req, 1024)); } catch (e) { body = {}; }
    const pw = String(body.password || "");
    if (pw.length < 6) return sendJSON(res, 400, { error: "密码至少 6 位" });
    const salt = crypto.randomBytes(16).toString("hex");
    admin = { salt, hash: hashPassword(pw, salt) };
    const tmp = ADMIN_FILE + ".tmp";
    fs.writeFileSync(tmp, JSON.stringify(admin, null, 2));
    fs.renameSync(tmp, ADMIN_FILE); // 原子替换，避免写坏
    tokens.clear(); // 修改密码后所有会话失效
    log("ADMIN", "管理员密码已修改 ip=" + clientIp(req));
    return sendJSON(res, 200, { ok: true });
  }

  if (pathname === "/api/upload" && req.method === "POST") {
    if (!authOk(req)) return sendJSON(res, 401, { error: "unauthorized" });
    let body;
    try { body = JSON.parse(await readBody(req, BODY_LIMIT)); } catch (e) {
      return sendJSON(res, 400, { error: "无效的请求" });
    }
    const name = String(body.name || "image.jpg").replace(/[^\w.\-\u4e00-\u9fa5]/g, "_");
    const ext = path.extname(name).toLowerCase();
    const allowed = [".jpg", ".jpeg", ".png", ".gif", ".webp", ".avif", ".ico"];
    const ip = clientIp(req);
    if (!allowed.includes(ext)) {
      log("ADMIN", "图片上传被拒绝（扩展名不合法） ip=" + ip + " 文件=" + name);
      return sendJSON(res, 400, { error: "仅支持 jpg/png/gif/webp/avif/ico 图片" });
    }
    const data = String(body.data || "");
    if (data.length < 10 || data.length > 12 * 1024 * 1024) {
      log("ADMIN", "图片上传被拒绝（数据缺失或过大） ip=" + ip);
      return sendJSON(res, 400, { error: "图片数据缺失或过大（≤8MB）" });
    }
    const buf = Buffer.from(data, "base64");
    if (buf.length === 0) return sendJSON(res, 400, { error: "base64 解码失败" });
    if (buf.length > 8 * 1024 * 1024) {
      log("ADMIN", "图片上传被拒绝（实际大小超限） ip=" + ip + " 文件=" + name);
      return sendJSON(res, 400, { error: "图片数据过大（≤8MB）" });
    }
    if (!imageHeaderMatches(ext, buf)) {
      log("ADMIN", "图片上传被拒绝（文件头与扩展名不匹配） ip=" + ip + " 文件=" + name);
      return sendJSON(res, 400, { error: "图片内容与扩展名不匹配" });
    }
    const finalName = Date.now() + "-" + name;
    fs.writeFileSync(path.join(UPLOAD_DIR, finalName), buf);
    log("ADMIN", "图片上传成功 ip=" + ip + " 文件=" + finalName + " 大小=" + (buf.length / 1024).toFixed(0) + "KB");
    return sendJSON(res, 200, { ok: true, url: "/uploads/" + finalName });
  }

  if (pathname === "/api/messages" && req.method === "POST") {
    const ip = clientIp(req);
    if (!rateCheck(msgRate, ip, 3, 10 * 60 * 1000)) {
      log("MSG", "留言被限流 ip=" + ip);
      return sendJSON(res, 429, { error: "留言太频繁啦，休息一下再来～" });
    }
    let body;
    try { body = JSON.parse(await readBody(req, 8 * 1024)); } catch (e) { body = {}; }
    if (body.hp) return sendJSON(res, 200, { ok: true }); // 蜜罐：机器人直接丢弃
    const name = String(body.name || "匿名").replace(/[\r\n\t]+/g, " ").trim().slice(0, 40);
    const text = String(body.text || "").trim().slice(0, 1000);
    if (!text) return sendJSON(res, 400, { error: "留言内容不能为空" });
    store.addMessage({
      id: "m-" + Date.now() + "-" + crypto.randomBytes(6).toString("hex"),
      name,
      text,
      time: Date.now()
    });
    log("MSG", "新留言 ip=" + ip + " 昵称=" + name + " 长度=" + text.length);
    return sendJSON(res, 200, { ok: true });
  }

  // 访问统计（仅后台可见）
  if (pathname === "/api/stats" && req.method === "GET") {
    if (!authOk(req)) return sendJSON(res, 401, { error: "unauthorized" });
    const content = store.getContent();
    const days = Object.keys(stats.days).sort().slice(-7).map(function (k) {
      return { date: k, pv: stats.days[k].pv, uv: stats.days[k].uv };
    });
    const topPosts = Object.keys(stats.posts)
      .map(function (id) { return { id: id, views: stats.posts[id].views }; })
      .sort(function (a, b) { return b.views - a.views; })
      .slice(0, 5)
      .map(function (e) {
        const p = (content.posts || []).find(function (x) { return x.id === e.id; });
        return { id: e.id, title: p ? p.title : "（已删除）", views: e.views };
      });
    return sendJSON(res, 200, {
      totalPv: stats.totalPv,
      today: stats.days[todayStr()] || { pv: 0, uv: 0 },
      days: days,
      topPosts: topPosts
    });
  }

  // 公开总访问量（供前台终端状态块显示，不暴露任何明细）
  if (pathname === "/api/counter" && req.method === "GET") {
    return sendJSON(res, 200, { pv: stats.totalPv });
  }

  // 文章级评论
  if (pathname === "/api/comments" && req.method === "GET") {
    const postId = new URL(req.url, "http://x").searchParams.get("postId");
    if (!postId) {
      if (!authOk(req)) return sendJSON(res, 401, { error: "unauthorized" });
      return sendJSON(res, 200, { comments: store.getComments() });
    }
    return sendJSON(res, 200, { comments: store.getComments(postId) });
  }

  if (pathname === "/api/comments" && req.method === "POST") {
    const ip = clientIp(req);
    if (!rateCheck(msgRate, ip, 3, 10 * 60 * 1000)) {
      log("MSG", "评论被限流 ip=" + ip);
      return sendJSON(res, 429, { error: "评论太频繁啦，休息一下再来～" });
    }
    let body;
    try { body = JSON.parse(await readBody(req, 8 * 1024)); } catch (e) { body = {}; }
    if (body.hp) return sendJSON(res, 200, { ok: true }); // 蜜罐
    const postId = String(body.postId || "");
    const name = String(body.name || "匿名").replace(/[\r\n\t]+/g, " ").trim().slice(0, 20);
    const text = String(body.text || "").trim().slice(0, 500);
    if (!text) return sendJSON(res, 400, { error: "评论内容不能为空" });
    const content = store.getContent();
    const post = (content.posts || []).find(function (x) { return x.id === postId; });
    if (!post) return sendJSON(res, 400, { error: "文章不存在" });
    store.addComment({
      id: "c-" + Date.now() + "-" + crypto.randomBytes(6).toString("hex"),
      postId: postId, name: name, text: text, time: Date.now()
    });
    log("MSG", "新评论 ip=" + ip + " 文章=" + postId + " 昵称=" + name + " 长度=" + text.length);
    return sendJSON(res, 200, { ok: true, pending: true });
  }

  if (pathname === "/api/comments" && req.method === "PUT") {
    if (!authOk(req)) return sendJSON(res, 401, { error: "unauthorized" });
    const id = new URL(req.url, "http://x").searchParams.get("id");
    if (!id) return sendJSON(res, 400, { error: "缺少评论 id" });
    let body;
    try { body = JSON.parse(await readBody(req, 1024)); } catch (e) { body = {}; }
    const status = ["pending", "approved", "rejected"].includes(String(body.status)) ? String(body.status) : "";
    if (!status) return sendJSON(res, 400, { error: "无效的评论状态" });
    if (!store.setCommentStatus(id, status)) return sendJSON(res, 404, { error: "评论不存在" });
    log("ADMIN", "评论状态已更新 id=" + id + " status=" + status + " ip=" + clientIp(req));
    return sendJSON(res, 200, { ok: true });
  }

  if (pathname === "/api/comments" && req.method === "DELETE") {
    if (!authOk(req)) return sendJSON(res, 401, { error: "unauthorized" });
    const id = new URL(req.url, "http://x").searchParams.get("id");
    if (!id) return sendJSON(res, 400, { error: "缺少评论 id" });
    store.deleteComment(id);
    log("ADMIN", "评论已删除 id=" + id + " ip=" + clientIp(req));
    return sendJSON(res, 200, { ok: true });
  }

  if (pathname === "/api/logs" && req.method === "GET") {
    if (!authOk(req)) return sendJSON(res, 401, { error: "unauthorized" });
    const n = Math.min(Math.max(parseInt(String((new URL(req.url, "http://x")).searchParams.get("lines")) || "200", 10) || 200, 1), 1000);
    return sendJSON(res, 200, { lines: tailLogs(n), file: "data/logs/site.log", note: "单文件超过 2MB 自动轮转为 site.log.1/.2" });
  }

  return sendJSON(res, 404, { error: "not found" });
}

/* ---------- 主服务 ---------- */
const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, "http://localhost");
  const pathname = u.pathname;
  const start = Date.now();
  const ip = clientIp(req);
  const ext = path.extname(pathname).toLowerCase();
  const isAsset = [".css", ".js", ".svg", ".png", ".jpg", ".jpeg", ".gif", ".webp", ".ico", ".avif", ".woff2", ".map"].includes(ext);

  // 请求日志：记录所有 API 与页面访问（静态资源太吵，跳过）
  res.on("finish", function () {
    if (isAsset && !pathname.startsWith("/api/")) return;
    log("REQ", req.method + " " + safeDecode(u.pathname + u.search).slice(0, 140) + " → " + res.statusCode + " " + (Date.now() - start) + "ms ip=" + ip);
  });

  // robots.txt 与 sitemap.xml（动态生成）
  if (pathname === "/robots.txt") {
    res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" });
    return res.end("User-agent: *\nAllow: /\n\nSitemap: https://www.xiaoxu-xiaofu.top/sitemap.xml\n");
  }
  if (pathname === "/sitemap.xml") {
    try {
      const content = store.getContent();
      const base = "https://" + (content.site && content.site.domain ? content.site.domain : "www.xiaoxu-xiaofu.top");
      const esc = function (s) {
        return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
      };
      const urls = [
        [base + "/", ""],
        [base + "/about.html", ""],
        [base + "/blog.html", ""],
        [base + "/projects.html", ""],
        [base + "/gallery.html", ""],
        [base + "/cities.html", ""],
        [base + "/contact.html", ""]
      ];
      (content.posts || []).forEach(function (p) {
        urls.push([base + "/post.html?id=" + encodeURIComponent(p.id), String(p.date || "")]);
      });
      const xml = '<?xml version="1.0" encoding="UTF-8"?>\n' +
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
        urls.map(function (u) {
          return "  <url><loc>" + esc(u[0]) + "</loc>" + (u[1] ? "<lastmod>" + esc(u[1]) + "</lastmod>" : "") + "</url>";
        }).join("\n") +
        "\n</urlset>\n";
      res.writeHead(200, { "Content-Type": "application/xml; charset=utf-8", "Cache-Control": "no-store" });
      return res.end(xml);
    } catch (e) {
      res.writeHead(500); return res.end("sitemap error");
    }
  }

  // 访问计数（页面与文章阅读；静态资源与后台不计入）
  if (!isAsset) {
    const isPostPage = pathname === "/post.html" || pathname === "/post";
    const postId = isPostPage ? u.searchParams.get("id") : null;
    recordView(pathname, postId, ip);
  }

  if (pathname.startsWith("/api/")) {
    try { await handleAPI(req, res, pathname); }
    catch (e) {
      log("ERR", pathname + " 异常: " + (e && e.message ? e.message : e));
      try { sendJSON(res, 500, { error: "server error" }); } catch (_) { /* 连接已断 */ }
    }
    return;
  }
  serveStatic(req, res, pathname);
});

["SIGINT", "SIGTERM"].forEach(function (sig) {
  process.on(sig, function () {
    try { flushStats(); } catch (e) {}
    try { store.close(); } catch (e) {}
    process.exit(0);
  });
});

server.listen(PORT, () => {
  log("INFO", "服务启动 端口=" + PORT + " 日志目录=" + LOG_DIR);
  console.log("==============================================");
  console.log("  小xu小fu · 小站已启动");
  console.log("  前台:      http://localhost:" + PORT);
  console.log("  管理后台:  http://localhost:" + PORT + "/admin/");
  console.log("  默认密码:  " + DEFAULT_PASSWORD + "（请登录后立即修改）");
  console.log("==============================================");
});
