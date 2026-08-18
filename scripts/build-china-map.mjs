// 拉取中国省级行政边界（阿里云 DataV.GeoAtlas），转成 WGS84，
// 生成 assets/china-provinces.json，供“我的足迹”页的静态浅色底图使用。
// 用法：node scripts/build-china-map.mjs

import { writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "assets", "china-provinces.json");
const URL_SRC = "https://geo.datav.aliyun.com/areas_v3/bound/100000_full.json";

const PI = 3.14159265358979324;
const A = 6378245.0;
const EE = 0.00669342162296594323;

function outOfChina(lng, lat) {
  return lng < 72.004 || lng > 137.8347 || lat < 0.8293 || lat > 55.8271;
}
function transformLat(x, y) {
  let ret = -100.0 + 2.0 * x + 3.0 * y + 0.2 * y * y + 0.1 * x * y + 0.2 * Math.sqrt(Math.abs(x));
  ret += (20.0 * Math.sin(6.0 * x * PI) + 20.0 * Math.sin(2.0 * x * PI)) * 2.0 / 3.0;
  ret += (20.0 * Math.sin(y * PI) + 40.0 * Math.sin(y / 3.0 * PI)) * 2.0 / 3.0;
  ret += (160.0 * Math.sin(y / 12.0 * PI) + 320.0 * Math.sin(y * PI / 30.0)) * 2.0 / 3.0;
  return ret;
}
function transformLng(x, y) {
  let ret = 300.0 + x + 2.0 * y + 0.1 * x * x + 0.1 * x * y + 0.1 * Math.sqrt(Math.abs(x));
  ret += (20.0 * Math.sin(6.0 * x * PI) + 20.0 * Math.sin(2.0 * x * PI)) * 2.0 / 3.0;
  ret += (20.0 * Math.sin(x * PI) + 40.0 * Math.sin(x / 3.0 * PI)) * 2.0 / 3.0;
  ret += (150.0 * Math.sin(x / 12.0 * PI) + 300.0 * Math.sin(x / 30.0 * PI)) * 2.0 / 3.0;
  return ret;
}
function gcjToWgs(lng, lat) {
  if (outOfChina(lng, lat)) return [lng, lat];
  let dLat = transformLat(lng - 105.0, lat - 35.0);
  let dLng = transformLng(lng - 105.0, lat - 35.0);
  const radLat = lat / 180.0 * PI;
  let magic = Math.sin(radLat);
  magic = 1 - EE * magic * magic;
  const sqrtMagic = Math.sqrt(magic);
  dLat = (dLat * 180.0) / ((A * (1 - EE)) / (magic * sqrtMagic) * PI);
  dLng = (dLng * 180.0) / (A / sqrtMagic * Math.cos(radLat) * PI);
  return [lng - dLng, lat - dLat];
}

function convRing(ring) {
  return ring.map((p) => {
    const w = gcjToWgs(p[0], p[1]);
    return [Number(w[0].toFixed(6)), Number(w[1].toFixed(6))];
  });
}
function convGeometry(g) {
  if (!g || !Array.isArray(g.coordinates)) return g;
  if (g.type === "Polygon") return { type: "Polygon", coordinates: g.coordinates.map(convRing) };
  if (g.type === "MultiPolygon") return { type: "MultiPolygon", coordinates: g.coordinates.map((p) => p.map(convRing)) };
  return g;
}

async function main() {
  const res = await fetch(URL_SRC, {
    headers: { "User-Agent": "Mozilla/5.0 (xiaoxu-xiaofu.top map builder)", Accept: "application/json" }
  });
  if (!res.ok) throw new Error("HTTP " + res.status);
  const data = await res.json();
  const features = (data.features || [])
    .filter((f) => f && f.geometry && f.properties)
    .map((f) => ({
      type: "Feature",
      properties: { adcode: f.properties.adcode, name: f.properties.name },
      geometry: convGeometry(f.geometry)
    }));

  const out = { type: "FeatureCollection", features };
  await writeFile(OUT, JSON.stringify(out));
  console.log(`${OUT} (${features.length} 个省级区域)`);
}

main();
