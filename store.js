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
const CONTENT_ARRAY_KEYS = ["posts", "projects", "gallery", "cities", "trips"];

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

function defaultTrips() {
  // 旅行记录种子（示例/占位数据，可在后台自由编辑）。
  // 坐标与 cities 种子保持一致，便于地图轨迹与城市节点对齐。
  const raw = [
    ["t1", "beijing", "北京", 116.4074, 39.9042, "2024-03-15", "2024-03-18", "第一次两个人一起看升旗，北京比想象中更庄重。", ["故宫", "长城", "胡同"], "第一次凌晨起来看升旗，风很大，人很多，但国旗升起那一刻什么都值了。", ["故宫", "长城", "南锣鼓巷"], "朋友", "★★★★★", "晴"],
    ["t2", "xian", "西安", 108.9398, 34.3416, "2024-04-02", "2024-04-05", "在城墙上骑了一下午车，忽然觉得时间可以很慢。", ["兵马俑", "城墙", "回民街"], "兵马俑比课本上壮观太多，回民街从街头吃到街尾。", ["兵马俑", "西安城墙", "回民街"], "朋友", "★★★★☆", "多云"],
    ["t3", "chengdu", "成都", 104.0668, 30.5728, "2024-04-10", "2024-04-13", "第一次真正感受到一座城市的松弛感。", ["火锅", "太古里", "宽窄巷子"], "在成都的几天，每天都不知道该去哪，但又觉得哪里都值得去。第一次一个人在凌晨吃火锅，也第一次真正理解什么叫慢下来。", ["春熙路", "太古里", "宽窄巷子", "锦江夜游"], "独自", "★★★★★", "小雨"],
    ["t4", "changsha", "长沙", 112.9388, 28.2282, "2024-04-20", "2024-04-22", "为了茶颜悦色排的队，最后被湘菜彻底征服。", ["橘子洲", "岳麓山", "文和友"], "橘子洲头的风很舒服，岳麓山的台阶比想象中长，湘菜辣得让人上瘾。", ["橘子洲", "岳麓山", "超级文和友"], "朋友", "★★★★☆", "晴"],
    ["t5", "shanghai", "上海", 121.4737, 31.2304, "2024-05-01", "2024-05-03", "外滩的灯亮起来的时候，觉得这座城市真的很大。", ["外滩", "迪士尼", "陆家嘴"], "在外滩吹着风看对岸陆家嘴，第二天在迪士尼排队排到腿软，但烟花亮起来的时候一切都值了。", ["外滩", "迪士尼", "陆家嘴"], "朋友", "★★★★☆", "晴"],
    ["t6", "xiamen", "厦门", 118.0894, 24.4798, "2024-05-20", "2024-05-23", "在海边骑单车，空气里都是咸咸的夏天。", ["鼓浪屿", "环岛路", "沙坡尾"], "鼓浪屿的小巷怎么走都好看，环岛路一路都是海风，沙坡尾藏着很多小惊喜。", ["鼓浪屿", "环岛路", "沙坡尾"], "独自", "★★★★☆", "晴"],
    ["t7", "guangzhou", "广州", 113.2644, 23.1291, "2024-06-05", "2024-06-08", "从早茶到夜宵，一天可以吃八顿。", ["早茶", "珠江夜游", "沙面"], "早茶的虾饺和肠粉让人想定居，夜晚的珠江两岸亮得像一幅画。", ["点都德", "珠江夜游", "沙面"], "朋友", "★★★★★", "阵雨"],
    ["t8", "sanya", "三亚", 109.5119, 18.2528, "2024-06-18", "2024-06-22", "第一次见到那么蓝的海，像把整个夏天都装进了眼睛里。", ["亚龙湾", "蜈支洲岛", "椰梦长廊"], "在海边住了几天，每天就是看海、踩水、吃椰子，什么都不用想。", ["亚龙湾", "蜈支洲岛", "椰梦长廊"], "朋友", "★★★★★", "晴"]
  ];
  return raw.map(function (c) {
    return {
      id: c[0],
      cityId: c[1],
      city: c[2],
      lng: c[3],
      lat: c[4],
      start: c[5],
      end: c[6],
      quote: c[7],
      tags: c[8],
      story: c[9],
      spots: c[10],
      companions: c[11],
      mood: c[12],
      weather: c[13],
      rating: { atmosphere: 5, food: 5, scenery: 4, again: 5 },
      photos: [
        { src: "", caption: c[10][0] },
        { src: "", caption: c[10][1] },
        { src: "", caption: c[10][2] }
      ]
    };
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
    CREATE TABLE IF NOT EXISTS comments (
      id TEXT PRIMARY KEY,
      post_id TEXT NOT NULL,
      name TEXT NOT NULL,
      text TEXT NOT NULL,
      time INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'approved'
    );
    CREATE INDEX IF NOT EXISTS idx_comments_post ON comments (post_id, time);
  `);
  const commentColumns = db.prepare("PRAGMA table_info(comments)").all();
  if (!commentColumns.some(function (c) { return c.name === "status"; })) {
    // 旧版本评论没有审核字段，历史内容保持可见；新写入评论由 addComment 标为 pending。
    db.exec("ALTER TABLE comments ADD COLUMN status TEXT NOT NULL DEFAULT 'approved'");
  }
  migrate();
  ensureCities();
  ensureTrips();
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

function ensureTrips() {
  const row = db.prepare("SELECT data FROM content WHERE id = 1").get();
  if (!row) return;
  let content;
  try { content = JSON.parse(row.data); } catch (e) { return; }
  if (!Array.isArray(content.trips) || content.trips.length === 0) {
    content.trips = defaultTrips();
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

function healthCheck() {
  const row = db.prepare("SELECT 1 AS ok").get();
  return !!row && row.ok === 1;
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
  if (!Array.isArray(obj.trips)) content.trips = readExistingTrips();
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

function readExistingTrips() {
  try {
    const row = db.prepare("SELECT data FROM content WHERE id = 1").get();
    if (row) {
      const old = JSON.parse(row.data);
      if (Array.isArray(old.trips) && old.trips.length) return old.trips;
    }
  } catch (e) { /* 忽略 */ }
  return defaultTrips();
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

// ---------- 文章级评论 ----------
// postId 传入时返回该文章评论（旧 → 新）；不传时返回全部（新 → 旧，供后台管理）。
function getComments(postId) {
  if (postId) {
    return db.prepare(
      "SELECT id, post_id AS postId, name, text, time FROM comments WHERE post_id = ? AND status = 'approved' ORDER BY time ASC, rowid ASC"
    ).all(String(postId));
  }
  return db.prepare(
    "SELECT id, post_id AS postId, name, text, time, status FROM comments ORDER BY time DESC, rowid DESC"
  ).all();
}

function addComment(c) {
  const postId = String(c.postId);
  db.exec("BEGIN");
  try {
    db.prepare("INSERT INTO comments (id, post_id, name, text, time, status) VALUES (?, ?, ?, ?, ?, 'pending')")
      .run(String(c.id), postId, String(c.name), String(c.text), Number(c.time));
    // 每篇文章最多保留 200 条评论（与留言板策略一致）
    const del = db.prepare(
      "DELETE FROM comments WHERE post_id = ? AND rowid NOT IN (SELECT rowid FROM comments WHERE post_id = ? ORDER BY time DESC, rowid DESC LIMIT 200)"
    );
    del.run(postId, postId);
    db.exec("COMMIT");
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
}

function deleteComment(id) {
  db.prepare("DELETE FROM comments WHERE id = ?").run(String(id));
}

function setCommentStatus(id, status) {
  const row = db.prepare("SELECT id FROM comments WHERE id = ?").get(String(id));
  if (!row) return false;
  db.prepare("UPDATE comments SET status = ? WHERE id = ?").run(String(status), String(id));
  return true;
}

function close() {
  if (db) {
    try { db.close(); } catch (e) { /* 忽略 */ }
    db = null;
  }
}

module.exports = { open, getContent, healthCheck, saveContent, addMessage, getComments, addComment, setCommentStatus, deleteComment, close };
