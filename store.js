/* ============================================================
   小站数据层 · xiaoxu & xiaofu
   使用 Node 内置 node:sqlite（零依赖、内嵌、低资源）。
   - content 表存一份站点内容文档（不含留言）
   - messages 表单独存留言，避免每次留言都整份重写
   首次启动自动从 data/db.json 迁移，迁移后 db.json 仅作为种子/备份。
   ============================================================ */
"use strict";

const fs = require("fs");
const path = require("path");

let DatabaseSync;
try {
  ({ DatabaseSync } = require("node:sqlite"));
} catch (e) {
  console.error(
    "[store] 本版本需要 Node.js ≥22.13.0（内置 node:sqlite），当前为 " + process.version
  );
  throw e;
}

const DATA_DIR = path.join(__dirname, "data");
const DB_FILE = path.join(DATA_DIR, "site.db");
const LEGACY_FILE = path.join(DATA_DIR, "db.json");

const CONTENT_OBJECT_KEYS = ["site", "hero", "about", "contact"];
const CONTENT_ARRAY_KEYS = ["posts", "projects", "gallery", "cities"];

function defaultContent() {
  const obj = {};
  CONTENT_OBJECT_KEYS.forEach((k) => { obj[k] = {}; });
  CONTENT_ARRAY_KEYS.forEach((k) => { obj[k] = []; });
  return obj;
}

function defaultCities() {
  // 主要城市经纬度（用于点阵地图）；visited 表示“已走过”。这是初始种子，可在后台自由修改。
  const visited = new Set([
    "beijing", "shanghai", "guangzhou", "shenzhen", "hangzhou", "chengdu",
    "chongqing", "xian", "xiamen", "qingdao", "changsha", "wuhan"
  ]);
  const raw = [
    ["beijing", "北京", 39.9042, 116.4074],
    ["tianjin", "天津", 39.3434, 117.3616],
    ["shijiazhuang", "石家庄", 38.0428, 114.5149],
    ["taiyuan", "太原", 37.8706, 112.5489],
    ["hohhot", "呼和浩特", 40.8426, 111.7492],
    ["shenyang", "沈阳", 41.8057, 123.4315],
    ["dalian", "大连", 38.9140, 121.6147],
    ["changchun", "长春", 43.8171, 125.3235],
    ["harbin", "哈尔滨", 45.8038, 126.5349],
    ["shanghai", "上海", 31.2304, 121.4737],
    ["nanjing", "南京", 32.0603, 118.7969],
    ["suzhou", "苏州", 31.2989, 120.5853],
    ["hangzhou", "杭州", 30.2741, 120.1551],
    ["hefei", "合肥", 31.8206, 117.2272],
    ["fuzhou", "福州", 26.0745, 119.2965],
    ["xiamen", "厦门", 24.4798, 118.0894],
    ["jinan", "济南", 36.6512, 117.1201],
    ["qingdao", "青岛", 36.0671, 120.3826],
    ["zhengzhou", "郑州", 34.7466, 113.6254],
    ["wuhan", "武汉", 30.5928, 114.3055],
    ["changsha", "长沙", 28.2282, 112.9388],
    ["guangzhou", "广州", 23.1291, 113.2644],
    ["shenzhen", "深圳", 22.5431, 114.0579],
    ["nanning", "南宁", 22.8170, 108.3665],
    ["haikou", "海口", 20.0442, 110.1999],
    ["sanya", "三亚", 18.2528, 109.5119],
    ["chengdu", "成都", 30.5728, 104.0668],
    ["chongqing", "重庆", 29.5630, 106.5516],
    ["guiyang", "贵阳", 26.6470, 106.6302],
    ["kunming", "昆明", 24.8801, 102.8329],
    ["lhasa", "拉萨", 29.6520, 91.1721],
    ["xian", "西安", 34.3416, 108.9398],
    ["lanzhou", "兰州", 36.0611, 103.8343],
    ["xining", "西宁", 36.6171, 101.7782],
    ["yinchuan", "银川", 38.4872, 106.2309],
    ["urumqi", "乌鲁木齐", 43.8256, 87.6168]
  ];
  return raw.map(function (c) {
    return { id: c[0], name: c[1], lat: c[2], lng: c[3], visited: visited.has(c[0]), memory: "" };
  });
}

let db = null;

function open() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  db = new DatabaseSync(DB_FILE);
  db.exec("PRAGMA journal_mode = WAL;");
  db.exec("PRAGMA synchronous = NORMAL;");
  db.exec("PRAGMA busy_timeout = 5000;");
  db.exec(`
    CREATE TABLE IF NOT EXISTS content (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      data TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      text TEXT NOT NULL,
      time INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_messages_time ON messages (time);
  `);
  migrate();
  ensureCities();
  return db;
}

// 兼容已有 site.db（旧数据没有 cities 字段）：缺省时补入城市种子。
function ensureCities() {
  const row = db.prepare("SELECT data FROM content WHERE id = 1").get();
  if (!row) return;
  let content;
  try { content = JSON.parse(row.data); } catch (e) { return; }
  if (!Array.isArray(content.cities) || content.cities.length === 0) {
    content.cities = defaultCities();
    db.prepare("UPDATE content SET data = ? WHERE id = 1").run(JSON.stringify(content));
  }
}

function migrate() {
  const exists = db.prepare("SELECT id FROM content WHERE id = 1").get();
  if (exists) return;

  let legacy = null;
  if (fs.existsSync(LEGACY_FILE)) {
    try {
      legacy = JSON.parse(fs.readFileSync(LEGACY_FILE, "utf-8"));
    } catch (e) {
      console.warn("[store] db.json 解析失败，将使用空数据：", e.message);
      legacy = null;
    }
  }

  const base = (legacy && typeof legacy === "object" && !Array.isArray(legacy)) ? legacy : {};
  const content = defaultContent();
  CONTENT_OBJECT_KEYS.forEach((k) => {
    if (base[k] && typeof base[k] === "object" && !Array.isArray(base[k])) content[k] = base[k];
  });
  CONTENT_ARRAY_KEYS.forEach((k) => {
    if (Array.isArray(base[k])) content[k] = base[k];
  });

  const msgs = Array.isArray(base.messages) ? base.messages : [];

  db.exec("BEGIN");
  try {
    db.prepare("INSERT INTO content (id, data) VALUES (1, ?)").run(JSON.stringify(content));
    const ins = db.prepare("INSERT OR IGNORE INTO messages (id, name, text, time) VALUES (?, ?, ?, ?)");
    for (const m of msgs) {
      ins.run(
        String((m && m.id) || ("m-" + Date.now())),
        String((m && m.name) || "匿名"),
        String((m && m.text) || ""),
        Number((m && m.time) || Date.now())
      );
    }
    db.exec("COMMIT");
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
  console.log("[store] 已从 db.json 迁移内容到 SQLite（content + messages），后续以 site.db 为准");
}

function getContent() {
  const row = db.prepare("SELECT data FROM content WHERE id = 1").get();
  let content;
  try {
    content = row ? JSON.parse(row.data) : defaultContent();
  } catch (e) {
    content = defaultContent();
  }
  content.messages = db.prepare(
    "SELECT id, name, text, time FROM messages ORDER BY time DESC, rowid DESC"
  ).all();
  return content;
}

function saveContent(obj) {
  const content = defaultContent();
  CONTENT_OBJECT_KEYS.forEach((k) => {
    if (obj[k] && typeof obj[k] === "object" && !Array.isArray(obj[k])) content[k] = obj[k];
  });
  CONTENT_ARRAY_KEYS.forEach((k) => {
    if (Array.isArray(obj[k])) content[k] = obj[k];
  });
  // 城市列表是种子数据，缺省时保留已有内容，避免旧备份/部分保存把它清空。
  if (!Array.isArray(obj.cities)) content.cities = readExistingCities();
  const messages = Array.isArray(obj.messages) ? obj.messages : [];

  db.exec("BEGIN");
  try {
    db.prepare(
      "INSERT INTO content (id, data) VALUES (1, ?) ON CONFLICT(id) DO UPDATE SET data = excluded.data"
    ).run(JSON.stringify(content));
    db.exec("DELETE FROM messages");
    const ins = db.prepare("INSERT OR REPLACE INTO messages (id, name, text, time) VALUES (?, ?, ?, ?)");
    for (const m of messages) {
      ins.run(
        String((m && m.id) || ("m-" + Date.now())),
        String((m && m.name) || "匿名"),
        String((m && m.text) || ""),
        Number((m && m.time) || Date.now())
      );
    }
    db.exec("COMMIT");
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
}

function readExistingCities() {
  try {
    const row = db.prepare("SELECT data FROM content WHERE id = 1").get();
    if (row) {
      const old = JSON.parse(row.data);
      if (Array.isArray(old.cities) && old.cities.length) return old.cities;
    }
  } catch (e) { /* 忽略 */ }
  return defaultCities();
}

function addMessage(msg) {
  db.exec("BEGIN");
  try {
    db.prepare("INSERT INTO messages (id, name, text, time) VALUES (?, ?, ?, ?)")
      .run(String(msg.id), String(msg.name), String(msg.text), Number(msg.time));
    // 与旧逻辑一致：留言最多保留 200 条
    db.exec("DELETE FROM messages WHERE rowid NOT IN (SELECT rowid FROM messages ORDER BY time DESC, rowid DESC LIMIT 200)");
    db.exec("COMMIT");
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
}

function close() {
  if (db) {
    try { db.close(); } catch (e) { /* 忽略 */ }
    db = null;
  }
}

module.exports = { open, getContent, saveContent, addMessage, close };
