// PWA アイコン(PNG)の生成スクリプト。Node 標準(zlib)だけで書き出す。依存なし。
// 使い方: node tools/make-icons.mjs   → icons/ に PNG を出力する(同じ入力なら同じ出力)
// 図柄:ティール系の水のグラデーション + ネオンテトラ風の小さな魚(青いラインと赤い腹)。
// 魚は中央 80% の安全領域(maskable 用)に収めてあるので、どのアイコンも同じ図柄を使う。
import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const outDir = join(dirname(fileURLToPath(import.meta.url)), "..", "icons");

const mixc = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const hex = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const smooth = (e0, e1, x) => { const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };
const over = (dst, src, a) => mixc(dst, src, a);

// 単位正方形(0..1)上の1点の色
function shade(x, y) {
  // 水:上が明るいティール、下が深いティール。左上にやわらかな光。
  let c = mixc(hex("#7fd6c8"), hex("#1d6b78"), smooth(0, 1, y));
  const gx = x - 0.28, gy = y - 0.12;
  c = over(c, hex("#eafff6"), 0.32 * Math.exp(-(gx * gx + gy * gy) / 0.05));
  // 泡
  for (const [bx, by, br] of [[0.30, 0.27, 0.030], [0.22, 0.36, 0.018], [0.76, 0.24, 0.022]]) {
    const d = Math.hypot(x - bx, y - by);
    if (d < br) c = over(c, hex("#f2fffb"), 0.28 + 0.25 * smooth(br * 0.6, br, d));
  }
  // 魚(右向き)。体は楕円、尾は三角。
  const cx = 0.46, cy = 0.52, rx = 0.22, ry = 0.105;
  // 尾
  const tx0 = cx + rx * 0.82;
  if (x > tx0 && x < 0.79) {
    const k = (x - tx0) / (0.79 - tx0);
    const half = 0.014 + 0.085 * k;
    if (Math.abs(y - cy) < half * (1 - 0.18 * Math.sin(k * Math.PI))) c = over(c, hex("#c7ecf2"), 0.82);
  }
  const u = (x - cx) / rx, v = (y - cy) / ry;
  if (u * u + v * v < 1) {
    let b = mixc(hex("#f4fbfb"), hex("#bcd9e2"), smooth(-0.6, 1, v)); // 銀白色の体
    // 体の輪郭に沿う高さ(-1..1)。ラインは輪郭に沿ってやわらかく細る。
    const w = Math.sqrt(Math.max(0.02, 1 - u * u)), vn = v / w;
    // 青いライン(頭から尾へ)
    const bl = smooth(0.30, 0.16, Math.abs(vn + 0.30)) * smooth(-0.85, -0.6, u) * smooth(0.95, 0.75, u);
    b = mixc(b, mixc(hex("#3aa0ff"), hex("#1f5fe0"), smooth(-0.5, -0.1, vn)), bl);
    // 赤い腹(体の後ろ半分の下側)
    const rd = smooth(0.06, 0.24, vn) * smooth(-0.25, 0.1, u) * smooth(0.98, 0.85, u);
    b = mixc(b, mixc(hex("#ff6b62"), hex("#d92b3a"), smooth(0.1, 0.9, vn)), rd);
    // 輪郭をなだらかに
    const edge = smooth(1, 0.9, Math.sqrt(u * u + v * v));
    b = mixc(b, hex("#8ab6c4"), 1 - edge);
    c = over(c, b, 0.97);
  }
  // 目
  const ex = cx - rx * 0.66, ey = cy - ry * 0.28, er = 0.028;
  const de = Math.hypot(x - ex, y - ey);
  if (de < er) c = over(c, hex("#ffffff"), 1);
  if (de < er * 0.55) c = over(c, hex("#14303a"), 1);
  return c;
}

function render(size) {
  const ss = 4; // 4x4 スーパーサンプリング
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let py = 0; py < size; py++) {
    raw[py * (size * 4 + 1)] = 0; // フィルタなし
    for (let px = 0; px < size; px++) {
      let r = 0, g = 0, b = 0;
      for (let sy = 0; sy < ss; sy++) for (let sx = 0; sx < ss; sx++) {
        const c = shade((px + (sx + 0.5) / ss) / size, (py + (sy + 0.5) / ss) / size);
        r += c[0]; g += c[1]; b += c[2];
      }
      const n = ss * ss, o = py * (size * 4 + 1) + 1 + px * 4;
      raw[o] = Math.round(r / n); raw[o + 1] = Math.round(g / n); raw[o + 2] = Math.round(b / n); raw[o + 3] = 255;
    }
  }
  return raw;
}

const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc32 = buf => { let c = 0xffffffff; for (const byte of buf) c = crcTable[(c ^ byte) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
function chunk(type, data) {
  const t = Buffer.from(type, "ascii"), len = Buffer.alloc(4), crc = Buffer.alloc(4);
  len.writeUInt32BE(data.length); crc.writeUInt32BE(crc32(Buffer.concat([t, data])));
  return Buffer.concat([len, t, data, crc]);
}
function png(size) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 6; // 8bit RGBA
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(render(size), { level: 9 })), chunk("IEND", Buffer.alloc(0))]);
}

mkdirSync(outDir, { recursive: true });
const files = { "apple-touch-icon.png": 180, "icon-192.png": 192, "icon-512.png": 512, "icon-maskable-512.png": 512 };
for (const [name, size] of Object.entries(files)) {
  writeFileSync(join(outDir, name), png(size));
  console.log(`icons/${name} (${size}x${size})`);
}
