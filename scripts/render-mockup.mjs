// 生成城市地图页的全屏无边框效果图 HTML（不含真实天地图瓦片，
// 用真实城市边界 + 简化中国轮廓示意布局），再交给 WebKit 截图为 PNG。
// 用法：node scripts/render-mockup.mjs

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BOUNDARY_DIR = path.join(ROOT, "assets", "boundaries");
const OUT = path.join(ROOT, "assets", "mockup-city-map-fullbleed.html");

const W = 1280;
const H = 900;
const HEADER = 64;
const MAP_W = W;
const MAP_H = H - HEADER;

const VISITED = [
  { id: "beijing", name: "北京", lat: 39.9042, lng: 116.4074 },
  { id: "shanghai", name: "上海", lat: 31.2304, lng: 121.4737 },
  { id: "hangzhou", name: "杭州", lat: 30.2741, lng: 120.1551 },
  { id: "xiamen", name: "厦门", lat: 24.4798, lng: 118.0894 },
  { id: "qingdao", name: "青岛", lat: 36.0671, lng: 120.3826 },
  { id: "wuhan", name: "武汉", lat: 30.5928, lng: 114.3055 },
  { id: "changsha", name: "长沙", lat: 28.2282, lng: 112.9388 },
  { id: "guangzhou", name: "广州", lat: 23.1291, lng: 113.2644 },
  { id: "shenzhen", name: "深圳", lat: 22.5431, lng: 114.0579 },
  { id: "chengdu", name: "成都", lat: 30.5728, lng: 104.0668 },
  { id: "chongqing", name: "重庆", lat: 29.563, lng: 106.5516 },
  { id: "xian", name: "西安", lat: 34.3416, lng: 108.9398 }
];

const ADCODES = {
  beijing: "110000", shanghai: "310000", hangzhou: "330100", xiamen: "350200",
  qingdao: "370200", wuhan: "420100", changsha: "430100", guangzhou: "440100",
  shenzhen: "440300", chengdu: "510100", chongqing: "500000", xian: "610100"
};

// 简化中国轮廓（仅用于效果图底图示意）
const CHINA = [
  [122.0, 39.0], [124.5, 40.5], [127.0, 43.0], [131.0, 45.0], [134.5, 48.0],
  [130.0, 50.0], [122.0, 53.0], [119.0, 50.0], [115.0, 47.0], [111.0, 45.0],
  [106.0, 42.0], [100.0, 41.0], [95.0, 44.0], [90.0, 47.0], [85.0, 46.0],
  [80.0, 43.0], [74.0, 39.5], [76.0, 36.0], [80.0, 33.0], [85.0, 29.0],
  [90.0, 27.5], [95.0, 28.0], [98.0, 26.0], [101.0, 23.5], [105.0, 22.0],
  [108.0, 21.0], [112.0, 21.5], [114.5, 23.0], [117.0, 24.0], [119.5, 26.5],
  [121.5, 29.0], [122.5, 31.5], [122.0, 34.5], [121.0, 37.0], [122.0, 39.0]
];

function mercY(lat) {
  return Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360)) * (180 / Math.PI);
}

function proj(p) {
  return [p[0], mercY(p[1])];
}

function collectRings(geometry) {
  const rings = [];
  if (!geometry || !Array.isArray(geometry.coordinates)) return rings;
  if (geometry.type === "Polygon") geometry.coordinates.forEach((r) => rings.push(r));
  else if (geometry.type === "MultiPolygon") {
    geometry.coordinates.forEach((poly) => poly.forEach((r) => rings.push(r)));
  }
  return rings;
}

function simplify(ring, minDist) {
  const out = [];
  let last = null;
  for (const p of ring) {
    if (!last || Math.hypot(p[0] - last[0], p[1] - last[1]) >= minDist) {
      out.push(p);
      last = p;
    }
  }
  if (out.length && Math.hypot(out[0][0] - last[0], out[0][1] - last[1]) < minDist) {
    out.pop();
  }
  return out;
}

function pathForRing(ring, t) {
  const pts = ring.map((p) => {
    const xy = t(p);
    return xy[0].toFixed(1) + "," + xy[1].toFixed(1);
  });
  return "M" + pts.join(" L") + " Z";
}

async function main() {
  const cities = [];
  for (const c of VISITED) {
    const raw = JSON.parse(await readFile(path.join(BOUNDARY_DIR, `${ADCODES[c.id]}.json`), "utf-8"));
    cities.push({ ...c, rings: collectRings(raw.geometry) });
  }

  const allPts = CHINA.map(proj);
  cities.forEach((c) => c.rings.forEach((r) => r.forEach((p) => allPts.push(proj(p)))));

  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  allPts.forEach(([x, y]) => {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  });

  const pad = 0.08;
  const spanX = maxX - minX;
  const spanY = maxY - minY;
  const scale = Math.min((MAP_W * (1 - pad * 2)) / spanX, (MAP_H * (1 - pad * 2)) / spanY);
  const offX = (MAP_W - spanX * scale) / 2 - minX * scale;
  const offY = (MAP_H - spanY * scale) / 2 + maxY * scale;

  const t = (p) => {
    const xy = proj(p);
    return [offX + xy[0] * scale, offY - xy[1] * scale];
  };

  const chinaPath = pathForRing(CHINA, t);
  const cityPaths = cities.map((c) =>
    c.rings.map((r) => pathForRing(simplify(r, 4 / scale), t)).join("")
  ).join("");

  const dots = cities.map((c) => {
    const xy = t([c.lng, c.lat]);
    return `<g class="dot"><circle cx="${xy[0].toFixed(1)}" cy="${xy[1].toFixed(1)}" r="4"/><text x="${xy[0].toFixed(1)}" y="${(xy[1] - 10).toFixed(1)}">${c.name}</text></g>`;
  }).join("");

  const svg = `<svg viewBox="0 0 ${MAP_W} ${MAP_H}" width="${MAP_W}" height="${MAP_H}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <pattern id="grid" width="56" height="56" patternUnits="userSpaceOnUse">
      <path d="M56 0H0V56" fill="none" stroke="rgba(255,255,255,0.05)" stroke-width="1"/>
    </pattern>
    <radialGradient id="ocean" cx="50%" cy="42%" r="75%">
      <stop offset="0" stop-color="#17222d"/>
      <stop offset="1" stop-color="#0b1118"/>
    </radialGradient>
    <filter id="glow" x="-30%" y="-30%" width="160%" height="160%">
      <feGaussianBlur stdDeviation="3" result="b"/>
      <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
  </defs>
  <rect width="${MAP_W}" height="${MAP_H}" fill="url(#ocean)"/>
  <rect width="${MAP_W}" height="${MAP_H}" fill="url(#grid)"/>
  <path d="${chinaPath}" fill="#1d2936" stroke="rgba(255,255,255,0.10)" stroke-width="1"/>
  <path d="${cityPaths}" fill="rgba(250,137,82,0.30)" stroke="#FFD9A8" stroke-width="1.5" stroke-linejoin="round" filter="url(#glow)"/>
  ${dots}
</svg>`;

  const html = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<style>
  :root{color-scheme:dark}
  *{box-sizing:border-box}
  html,body{margin:0;padding:0;width:${W}px;height:${H}px;overflow:hidden}
  body{background:#0b1118;color:#fff;font-family:-apple-system,"PingFang SC","Helvetica Neue",sans-serif}
  .header{height:${HEADER}px;display:flex;align-items:center;justify-content:space-between;padding:0 36px;background:rgba(15,13,11,0.86);border-bottom:1px solid rgba(255,255,255,0.07)}
  .logo{display:flex;align-items:center;gap:10px;font-weight:700;font-size:17px;letter-spacing:.01em}
  .logo .mark{width:30px;height:30px;border-radius:9px;background:linear-gradient(135deg,#FA8952,#FAD352);display:flex;align-items:center;justify-content:center;color:#1a120c;font-weight:800;font-size:15px}
  nav{display:flex;gap:26px;font-size:14px;color:#cfc7b9}
  nav span{opacity:.82}
  .theme{font-size:18px}
  .map{position:relative;width:${MAP_W}px;height:${MAP_H}px}
  .map-title{position:absolute;top:22px;left:28px;pointer-events:none}
  .map-title .kicker{font-size:12px;letter-spacing:.16em;color:#FAD352;opacity:.85;text-transform:uppercase}
  .map-title h1{margin:6px 0 0;font-size:30px;font-weight:700;letter-spacing:.01em}
  .map-title p{margin:8px 0 0;font-size:14px;color:#cfc7b9}
  .dot{fill:#FA8952;stroke:#FFE0B0;stroke-width:1}
  .dot text{fill:#fff;font-size:12px;text-anchor:middle;fill-opacity:.9;font-weight:500}
</style>
</head>
<body>
  <header class="header">
    <div class="logo"><span class="mark">xf</span><span>xiaoxu &amp; xiaofu</span></div>
    <nav><span>首页</span><span>关于</span><span>博客</span><span>项目</span><span>瞬间</span><span>联系</span></nav>
    <div class="theme">🌙</div>
  </header>
  <main class="map">
    ${svg}
    <div class="map-title">
      <div class="kicker">cities we have been</div>
      <h1>走过的城市</h1>
      <p>已点亮 12 座城市 · 点击轮廓查看记忆</p>
    </div>
  </main>
</body>
</html>`;

  await writeFile(OUT, html);
  console.log(OUT);
}

main();
