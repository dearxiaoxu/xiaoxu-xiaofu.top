// 从阿里云 DataV.GeoAtlas 拉取城市行政边界，并把 GCJ-02 转为 WGS84（CGCS2000）
// 生成 assets/boundaries/{adcode}.json，供前端在天地图上直接绘制“点亮轮廓”。
// 用法：node scripts/build-boundaries.mjs

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT_DIR = path.join(ROOT, "assets", "boundaries");

const CITY_ADCODES = {
  beijing: "110000",
  tianjin: "120000",
  shijiazhuang: "130100",
  taiyuan: "140100",
  hohhot: "150100",
  shenyang: "210100",
  dalian: "210200",
  changchun: "220100",
  harbin: "230100",
  shanghai: "310000",
  nanjing: "320100",
  suzhou: "320500",
  hangzhou: "330100",
  hefei: "340100",
  fuzhou: "350100",
  xiamen: "350200",
  jinan: "370100",
  qingdao: "370200",
  zhengzhou: "410100",
  wuhan: "420100",
  changsha: "430100",
  guangzhou: "440100",
  shenzhen: "440300",
  nanning: "450100",
  haikou: "460100",
  sanya: "460200",
  chengdu: "510100",
  chongqing: "500000",
  guiyang: "520100",
  kunming: "530100",
  lhasa: "540100",
  xian: "610100",
  lanzhou: "620100",
  xining: "630100",
  yinchuan: "640100",
  urumqi: "650100"
};

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

function convertRing(ring) {
  return ring.map((p) => {
    const wgs = gcjToWgs(p[0], p[1]);
    return [Number(wgs[0].toFixed(6)), Number(wgs[1].toFixed(6))];
  });
}

function convertGeometry(geometry) {
  if (!geometry || !Array.isArray(geometry.coordinates)) return geometry;
  if (geometry.type === "Polygon") {
    return { type: "Polygon", coordinates: geometry.coordinates.map(convertRing) };
  }
  if (geometry.type === "MultiPolygon") {
    return { type: "MultiPolygon", coordinates: geometry.coordinates.map((poly) => poly.map(convertRing)) };
  }
  return geometry;
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  const entries = Object.entries(CITY_ADCODES);
  let ok = 0;
  const errors = [];

  for (const [id, adcode] of entries) {
    const url = `https://geo.datav.aliyun.com/areas_v3/bound/${adcode}.json`;
    try {
      const res = await fetch(url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (xiaoxu-xiaofu.top boundary builder)",
          Accept: "application/json"
        }
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const feature = data && data.features && data.features[0];
      if (!feature || !feature.geometry) throw new Error("no geometry");
      const out = {
        id,
        adcode,
        geometry: convertGeometry(feature.geometry)
      };
      const file = path.join(OUT_DIR, `${adcode}.json`);
      await writeFile(file, JSON.stringify(out));
      ok += 1;
      console.log(`✓ ${id} ${adcode} -> ${file}`);
    } catch (err) {
      errors.push(`${id} ${adcode}: ${err.message}`);
      console.error(`✗ ${id} ${adcode}: ${err.message}`);
    }
  }

  console.log(`\n完成：${ok}/${entries.length}`);
  if (errors.length) {
    console.error("失败列表：");
    errors.forEach((e) => console.error("  " + e));
    process.exitCode = 1;
  }
}

main();
