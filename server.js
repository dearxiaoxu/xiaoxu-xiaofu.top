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

const ROOT = __dirname;
const DATA_DIR = path.join(ROOT, "data");
const DB_FILE = path.join(DATA_DIR, "db.json");
const ADMIN_FILE = path.join(DATA_DIR, "admin.json");
const UPLOAD_DIR = path.join(DATA_DIR, "uploads");
const PORT = process.env.PORT || 3000;
const DEFAULT_PASSWORD = process.env.ADMIN_PASSWORD || "admin123";

const TOKEN_TTL = 7 * 24 * 3600 * 1000; // 7 天
const BODY_LIMIT = 16 * 1024 * 1024;    // 16MB（含 base64 图片）

/* ---------- 初始化 ---------- */
for (const dir of [DATA_DIR, UPLOAD_DIR]) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}
if (!fs.existsSync(DB_FILE)) {
  fs.writeFileSync(DB_FILE, JSON.stringify({ site: {}, hero: {}, about: {}, posts: [], projects: [], gallery: [], contact: {}, messages: [] }, null, 2));
}

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
function loadDB() {
  return JSON.parse(fs.readFileSync(DB_FILE, "utf-8"));
}
function saveDB(db) {
  const tmp = DB_FILE + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2));
  fs.renameSync(tmp, DB_FILE); // 原子替换，避免写坏
}

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

/* ---------- 静态文件 ---------- */
function serveStatic(req, res, pathname) {
  let urlPath = decodeURIComponent(pathname);
  if (urlPath === "/" ) urlPath = "/index.html";
  if (urlPath === "/admin") {
    res.writeHead(301, { "Location": "/admin/" });
    res.end();
    return;
  }
  if (urlPath === "/admin/") urlPath = "/admin/index.html";
  if (urlPath === "/post") urlPath = "/post.html";

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
    res.writeHead(200, {
      "Content-Type": MIME[ext] || "application/octet-stream",
      "Cache-Control": (ext === ".html" || ext === ".js" || ext === ".css" || ext === ".svg" || ext === ".json") ? "no-cache" : "public, max-age=86400",
    });
    fs.createReadStream(filePath).pipe(res);
  });
}

/* ---------- API ---------- */
async function handleAPI(req, res, pathname) {
  if (pathname === "/api/content" && req.method === "GET") {
    try { return sendJSON(res, 200, loadDB()); }
    catch (e) { return sendJSON(res, 500, { error: "db read failed" }); }
  }

  if (pathname === "/api/login" && req.method === "POST") {
    const ip = req.socket.remoteAddress || "unknown";
    if (!rateCheck(loginFails, ip, 5, 60 * 1000)) {
      return sendJSON(res, 429, { error: "尝试次数过多，请一分钟后再试" });
    }
    let body;
    try { body = JSON.parse(await readBody(req, 1024)); } catch (e) { body = {}; }
    const given = hashPassword(body.password || "", admin.salt);
    const ok = crypto.timingSafeEqual(Buffer.from(given, "hex"), Buffer.from(admin.hash, "hex"));
    if (!ok) return sendJSON(res, 401, { error: "密码错误" });
    return sendJSON(res, 200, { ok: true, token: newToken() });
  }

  if (pathname === "/api/content" && req.method === "PUT") {
    if (!authOk(req)) return sendJSON(res, 401, { error: "unauthorized" });
    let body;
    try { body = JSON.parse(await readBody(req, BODY_LIMIT)); } catch (e) {
      return sendJSON(res, 400, { error: "无效的 JSON" });
    }
    if (typeof body !== "object" || body === null || Array.isArray(body)) {
      return sendJSON(res, 400, { error: "数据必须是对象" });
    }
    for (const key of ["site", "hero", "about", "posts", "projects", "gallery", "contact", "messages"]) {
      if (!(key in body)) body[key] = body[key] || (key === "messages" ? [] : {});
    }
    if (!Array.isArray(body.posts)) body.posts = [];
    if (!Array.isArray(body.projects)) body.projects = [];
    if (!Array.isArray(body.gallery)) body.gallery = [];
    if (!Array.isArray(body.messages)) body.messages = [];
    try { saveDB(body); } catch (e) { return sendJSON(res, 500, { error: "保存失败：" + e.message }); }
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
    fs.writeFileSync(ADMIN_FILE, JSON.stringify(admin, null, 2));
    tokens.clear(); // 修改密码后所有会话失效
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
    const allowed = [".jpg", ".jpeg", ".png", ".gif", ".webp", ".avif", ".svg", ".ico"];
    if (!allowed.includes(ext)) return sendJSON(res, 400, { error: "仅支持 jpg/png/gif/webp/avif/svg 图片" });
    const data = String(body.data || "");
    if (data.length < 10 || data.length > 12 * 1024 * 1024) {
      return sendJSON(res, 400, { error: "图片数据缺失或过大（≤8MB）" });
    }
    const buf = Buffer.from(data, "base64");
    if (buf.length === 0) return sendJSON(res, 400, { error: "base64 解码失败" });
    const finalName = Date.now() + "-" + name;
    fs.writeFileSync(path.join(UPLOAD_DIR, finalName), buf);
    return sendJSON(res, 200, { ok: true, url: "/uploads/" + finalName });
  }

  if (pathname === "/api/messages" && req.method === "POST") {
    const ip = req.socket.remoteAddress || "unknown";
    if (!rateCheck(msgRate, ip, 3, 10 * 60 * 1000)) {
      return sendJSON(res, 429, { error: "留言太频繁啦，休息一下再来～" });
    }
    let body;
    try { body = JSON.parse(await readBody(req, 8 * 1024)); } catch (e) { body = {}; }
    if (body.hp) return sendJSON(res, 200, { ok: true }); // 蜜罐：机器人直接丢弃
    const name = String(body.name || "匿名").trim().slice(0, 40);
    const text = String(body.text || "").trim().slice(0, 1000);
    if (!text) return sendJSON(res, 400, { error: "留言内容不能为空" });
    const db = loadDB();
    db.messages = Array.isArray(db.messages) ? db.messages : [];
    db.messages.unshift({ id: "m-" + Date.now(), name, text, time: Date.now() });
    db.messages = db.messages.slice(0, 200); // 最多保留 200 条
    saveDB(db);
    return sendJSON(res, 200, { ok: true });
  }

  return sendJSON(res, 404, { error: "not found" });
}

/* ---------- 主服务 ---------- */
const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, "http://localhost");
  const pathname = u.pathname;

  if (pathname.startsWith("/api/")) {
    try { await handleAPI(req, res, pathname); }
    catch (e) {
      console.error("[api]", e);
      try { sendJSON(res, 500, { error: "server error" }); } catch (_) { /* 连接已断 */ }
    }
    return;
  }
  serveStatic(req, res, pathname);
});

server.listen(PORT, () => {
  console.log("==============================================");
  console.log("  小徐小福 · 小站已启动");
  console.log("  前台:      http://localhost:" + PORT);
  console.log("  管理后台:  http://localhost:" + PORT + "/admin/");
  console.log("  默认密码:  " + DEFAULT_PASSWORD + "（请登录后立即修改）");
  console.log("==============================================");
});
