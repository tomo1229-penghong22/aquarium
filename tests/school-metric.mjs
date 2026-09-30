// 群れの形(一列に見えるか)の計測ハーネス。js/ は変更せず、モジュールの export だけを使う。
//
//   node tests/school-metric.mjs                 既定のシード 5 個(1..5)で S1・S2 を計測
//   node tests/school-metric.mjs --seeds=1,2,3   シードを指定
//   node tests/school-metric.mjs --seconds=180 --warmup=20   時間を変える
//
// 描画はしない(main.js の loop / draw は呼ばず、loop と同じ順序で updateSchools → (updateHealth, updateFish) を直接回す)。
// 時刻は 1/60 秒刻み、Math.random はシード付き。水温は 25℃固定、昼。
//
// 指標(種ごと・フレームごと。座標は画面 2D の (x, y) を体長 L0 = S.len * U で割る。z は無視):
//   σ1 ≥ σ2   位置の共分散行列の固有値の平方根(長軸・短軸の標準偏差)
//   e = σ2/σ1 細長さ(0 に近いほど一列)
//   θ         長軸方向と群れの平均速度ベクトルの方向のなす角(0〜90°。180°対称)。
//             平均速度の大きさが 0.05 * S.speed * U 未満のフレームでは定義せず、「n/a」に数える
//   nn        各魚の同種最近傍への距離(L0 単位)。フレームごとに最小値(nnMin)と中央値(nnMed)
//   補助指標 inline(前後方向の数珠つなぎ):
//             各魚(速さ ≥ 0.1 * S.speed * U のもの)について、最近傍への方向ベクトルと、その魚の進行方向(速度)の
//             なす角 φ を 0〜90° に折り返したもの(0° = 最近傍が真正面または真後ろ)。
//             等方に散らばっているなら φ は 0〜90° で一様(φ<20° になる割合は約 22%)。
//             inline20 = φ < 20° の魚の割合、chain = φ < 20° かつ 最近傍距離 < 2 L0 の魚の割合。
import { pathToFileURL, fileURLToPath } from "node:url";
import { join, dirname } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const arg = (k, d) => { const a = process.argv.find(s => s.startsWith(`--${k}=`)); return a ? a.split("=")[1] : d; };
const SEEDS = arg("seeds", "1,2,3,4,5").split(",").map(Number);
const SECONDS = Number(arg("seconds", 180));
const WARMUP = Number(arg("warmup", 20));
const DT = 1 / 60;
const hostNow = Date.now.bind(Date);

/* ---------- モック(描画は記録せず捨てる) ---------- */
function mulberry32(a) {
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const noop = () => {};
class Path2D { moveTo() {} lineTo() {} bezierCurveTo() {} quadraticCurveTo() {} closePath() {} arc() {} arcTo() {} ellipse() {} rect() {} roundRect() {} addPath() {} }
function mkctx() {
  const st = {}, m = {};
  return new Proxy(st, {
    get(o, k) {
      if (typeof k === "symbol" || k in o) return o[k];
      if (k === "createLinearGradient" || k === "createRadialGradient") return () => ({ addColorStop: noop });
      if (k === "createImageData") return (w, h) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) });
      return m[k] ??= noop;
    },
    set(o, k, v) { o[k] = v; return true; },
  });
}
function mkel(extra = {}) {
  const s = new Set();
  return { children: [], style: {}, dataset: { v: "1" }, value: 25, textContent: "", innerHTML: "", title: "",
    classList: { add: c => s.add(c), remove: c => s.delete(c), contains: c => s.has(c), toggle: (c, v) => ((v ?? !s.has(c)) ? s.add(c) : s.delete(c)) },
    appendChild(c) { this.children.push(c); }, addEventListener: noop, setAttribute: noop, querySelector: () => null, matches: () => false,
    getBoundingClientRect: () => ({ left: 0, top: 0, right: 304, bottom: 190, width: 304, height: 190 }), offsetWidth: 320, offsetHeight: 260, ...extra };
}
function mkcanvas() {
  const c = mkel({ clientHeight: 0, width: 0, height: 0 });
  let ctx2d = null; c.getContext = () => (ctx2d ??= mkctx()); c.parentElement = mkel(); return c;
}
const ids = {};
const install = o => { for (const [k, v] of Object.entries(o)) Object.defineProperty(globalThis, k, { value: v, writable: true, configurable: true, enumerable: true }); };
const win = { devicePixelRatio: 2, addEventListener: noop };
install({
  Path2D,
  document: {
    getElementById: id => (ids[id] ??= (id === "tank" || id === "popcv") ? mkcanvas() : mkel()),
    createElement: t => { if (t === "canvas") return mkcanvas(); const d = mkel(); Object.defineProperty(d, "innerHTML", { set() { d.children = [mkel(), mkel(), mkel()]; }, get() { return ""; } }); return d; },
    querySelectorAll: () => [], addEventListener: noop, documentElement: mkel(), fullscreenElement: null,
  },
  window: win, localStorage: { getItem: () => null, setItem: noop }, performance: { now: () => 0 },
  requestAnimationFrame: () => 1, setTimeout: () => 1, clearTimeout: noop, innerWidth: 1280, innerHeight: 800,
});
Math.random = mulberry32(1);
{ const tank = mkcanvas(); ids.tank = tank;
  Object.defineProperty(tank, "clientWidth", { get: () => Math.round(globalThis.innerWidth * 0.7), enumerable: true });
  Object.defineProperty(tank, "clientHeight", { get: () => globalThis.innerHeight, enumerable: true }); }

const imp = n => import(pathToFileURL(join(root, "js", n)).href);
await imp("main.js"); // 起動(resize・syncFish。rAF は呼ばれないのでループは走らない)
const core = await imp("core.js"), sp = await imp("species.js"), beh = await imp("fish-behavior.js");
const { ORDER, SPECIES } = sp, { fishes, schools, syncFish, updateFish, updateHealth, updateSchools } = beh;
const U = core.U;
if (core.Tw !== 25) throw new Error("水温が 25℃ ではありません: " + core.Tw);

/* ---------- 計測 ---------- */
const SPS = ["neon", "rummy"];
const SCEN = {
  S1: { neon: 12, rummy: 0 },
  S2: { neon: 30, rummy: 20 },
};
const E_BINS = 20, TH_BINS = 6; // e: 0.05 刻み、θ: 15° 刻み
const DEG = 180 / Math.PI;

function frameMetrics(list, S) {
  const L0 = S.len * U, n = list.length;
  let mx = 0, my = 0, mvx = 0, mvy = 0;
  for (const f of list) { mx += f.x / L0; my += f.y / L0; mvx += f.vx; mvy += f.vy; }
  mx /= n; my /= n; mvx /= n; mvy /= n;
  let sxx = 0, syy = 0, sxy = 0;
  for (const f of list) { const dx = f.x / L0 - mx, dy = f.y / L0 - my; sxx += dx * dx; syy += dy * dy; sxy += dx * dy; }
  sxx /= n; syy /= n; sxy /= n;
  const tr = sxx + syy, det = Math.sqrt(Math.max(0, ((sxx - syy) / 2) ** 2 + sxy * sxy));
  const l1 = tr / 2 + det, l2 = Math.max(0, tr / 2 - det);
  const s1 = Math.sqrt(l1), s2 = Math.sqrt(l2);
  const e = s1 > 0 ? s2 / s1 : 1;
  const axis = 0.5 * Math.atan2(2 * sxy, sxx - syy); // 長軸の角
  let theta = null;
  if (Math.hypot(mvx, mvy) >= 0.05 * S.speed * U) {
    let d = Math.abs(Math.atan2(mvy, mvx) - axis) % Math.PI; if (d > Math.PI / 2) d = Math.PI - d; theta = d * DEG;
  }
  // 最近傍と補助指標
  const nn = [], sp0 = 0.1 * S.speed * U; let nIn = 0, nCh = 0, nV = 0; const phis = [];
  for (const f of list) {
    let best = Infinity, bo = null;
    for (const o of list) { if (o === f) continue; const d = Math.hypot(f.x - o.x, f.y - o.y); if (d < best) { best = d; bo = o; } }
    nn.push(best / L0);
    if (Math.hypot(f.vx, f.vy) >= sp0) {
      let d = Math.abs(Math.atan2(bo.y - f.y, bo.x - f.x) - Math.atan2(f.vy, f.vx)) % Math.PI; if (d > Math.PI / 2) d = Math.PI - d;
      const phi = d * DEG; phis.push(phi); nV++; if (phi < 20) { nIn++; if (best / L0 < 2) nCh++; }
    }
  }
  nn.sort((a, b) => a - b);
  return { e, theta, s1, s2, nnMin: nn[0], nnMed: nn[n >> 1], nV, nIn, nCh, phis };
}

const pct = (arr, p) => { if (!arr.length) return NaN; const a = arr.slice().sort((x, y) => x - y); const i = (a.length - 1) * p / 100, lo = Math.floor(i); return a[lo] + (a[Math.min(a.length - 1, lo + 1)] - a[lo]) * (i - lo); };
const PS = [5, 25, 50, 75, 95];
const fmtP = (arr, w = 6, d = 2) => PS.map(p => pct(arr, p).toFixed(d).padStart(w)).join(" ");

function runSeed(scen, seed) {
  Math.random = mulberry32(seed);
  fishes.length = 0;
  ORDER.forEach(k => { schools[k].x = schools[k].y = schools[k].cx = schools[k].cy = 0; schools[k].timer = 0; });
  for (const k of ORDER) core.counts[k] = SPECIES[k].def;
  Object.assign(core.counts, SCEN[scen]);
  syncFish();
  const total = Math.round(SECONDS / DT), warm = Math.round(WARMUP / DT);
  const res = {};
  for (const k of SPS) if (core.counts[k] >= 3) res[k] = { e: [], theta: [], s1: [], nnMin: [], nnMed: [], hist: new Float64Array(E_BINS * (TH_BINS + 1)), phis: [], nV: 0, nIn: 0, nCh: 0, frames: 0, nTop: 0, nBot: 0, nFish: 0, snaps: [], mets: [] };
  for (let i = 0; i < total; i++) {
    updateSchools(DT);
    fishes.forEach(f => { updateHealth(f, DT); updateFish(f, DT); });
    if (i < warm) continue;
    for (const k of Object.keys(res)) {
      const list = fishes.filter(f => f.sp === k), S = SPECIES[k], r = res[k];
      const m = frameMetrics(list, S);
      r.e.push(m.e); r.s1.push(m.s1); r.nnMin.push(m.nnMin); r.nnMed.push(m.nnMed);
      if (m.theta !== null) r.theta.push(m.theta);
      const eb = Math.min(E_BINS - 1, Math.floor(m.e / 0.05)), tb = m.theta === null ? TH_BINS : Math.min(TH_BINS - 1, Math.floor(m.theta / 15));
      r.hist[eb * (TH_BINS + 1) + tb]++;
      for (const p of m.phis) r.phis.push(p); // 魚×フレームの分布(フレームごとの平均化はしない)
      r.nV += m.nV; r.nIn += m.nIn; r.nCh += m.nCh; r.frames++;
      for (const f of list) { const L = S.len * U * f.scale; if (f.y <= core.waterTop + L * 0.35 + 1e-6) r.nTop++; else if (f.y >= core.bottomY(f.x, f.z) - L * 0.22 - 1e-6) r.nBot++; r.nFish++; } // 上下のクランプに張り付いた魚
      r.mets.push({ e: m.e, theta: m.theta, s1: m.s1 });
      // 目視用のスナップショット(位置・速度)
      const a = new Float32Array(list.length * 4); list.forEach((f, j) => { a[j * 4] = f.x; a[j * 4 + 1] = f.y; a[j * 4 + 2] = f.vx; a[j * 4 + 3] = f.vy; });
      r.snaps.push(a);
    }
  }
  return res;
}

/* ---------- ASCII 散布図 ---------- */
function ascii(snap, k, m, title) {
  const S = SPECIES[k], L0 = S.len * U, n = snap.length / 4;
  const xs = [], ys = [];
  for (let j = 0; j < n; j++) { xs.push(snap[j * 4] / L0); ys.push(snap[j * 4 + 1] / L0); }
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  const COLS = 78, ROWS = 22;
  const s = Math.max((x1 - x0) / (COLS - 1), (y1 - y0) / ((ROWS - 1) * 2), 0.05); // 1 桁 = s L0、1 行 = 2s L0(文字の縦横比 約 2:1)
  const w = Math.floor((x1 - x0) / s) + 1, h = Math.floor((y1 - y0) / (2 * s)) + 1;
  const g = Array.from({ length: h }, () => Array(w).fill(" "));
  for (let j = 0; j < n; j++) {
    const cx = Math.min(w - 1, Math.floor((xs[j] - x0) / s)), cy = Math.min(h - 1, Math.floor((ys[j] - y0) / (2 * s)));
    const vx = snap[j * 4 + 2], vy = snap[j * 4 + 3], sp = Math.hypot(vx, vy);
    let ch = sp < 0.1 * S.speed * U ? "o" : Math.abs(vx) >= Math.abs(vy) ? (vx > 0 ? ">" : "<") : (vy > 0 ? "v" : "^");
    g[cy][cx] = g[cy][cx] === " " ? ch : "*";
  }
  const out = [`  ${title}: e=${m.e.toFixed(3)} θ=${m.theta === null ? "n/a" : m.theta.toFixed(0) + "°"} σ1=${m.s1.toFixed(2)}L  (n=${n}, 1桁=${s.toFixed(2)}L 横 / 1行=${(2 * s).toFixed(2)}L 縦, 縦は画面下向き, ><^v=向き, o=ほぼ静止, *=同じ升に重なり)`];
  out.push("  +" + "-".repeat(w) + "+");
  for (const r of g) out.push("  |" + r.join("") + "|");
  out.push("  +" + "-".repeat(w) + "+");
  return out.join("\n");
}

/* ---------- 実行と出力 ---------- */
const t0 = hostNow();
console.log(`school-metric: seeds=[${SEEDS}] 各 ${SECONDS}s(助走 ${WARMUP}s を除く)、dt=1/60、水温 25℃、昼、U=${U.toFixed(4)}, W=${core.W}`);
for (const scen of Object.keys(SCEN)) {
  console.log(`\n${"=".repeat(100)}\nシナリオ ${scen}: ${JSON.stringify(SCEN[scen])}(ほかの種は既定)`);
  const runs = SEEDS.map(seed => ({ seed, res: runSeed(scen, seed) }));
  for (const k of Object.keys(runs[0].res)) {
    const A = { e: [], theta: [], s1: [], nnMin: [], nnMed: [], phis: [], nV: 0, nIn: 0, nCh: 0, frames: 0, nTop: 0, nBot: 0, nFish: 0 };
    const hist = new Float64Array(E_BINS * (TH_BINS + 1));
    for (const { res } of runs) { const r = res[k]; for (const q of ["e", "theta", "s1", "nnMin", "nnMed"]) for (const v of r[q]) A[q].push(v); for (const v of r.phis) A.phis.push(v); A.nV += r.nV; A.nIn += r.nIn; A.nCh += r.nCh; A.frames += r.frames; A.nTop += r.nTop; A.nBot += r.nBot; A.nFish += r.nFish; r.hist.forEach((v, i) => hist[i] += v); }
    console.log(`\n--- ${scen} / ${k}(${SPECIES[k].name}, n=${core.counts[k]}, 全 ${A.frames} フレーム, θ 定義外 ${A.frames - A.theta.length}) ---`);
    console.log("                     " + PS.map(p => ("p" + p).padStart(6)).join(" "));
    console.log("e   (細長さ)       " + fmtP(A.e, 6, 3));
    console.log("θ   (度)           " + fmtP(A.theta, 6, 1));
    console.log("σ1  (L0)           " + fmtP(A.s1));
    console.log("nnMin(L0)          " + fmtP(A.nnMin, 6, 3));
    console.log("nnMed(L0)          " + fmtP(A.nnMed, 6, 3));
    console.log(`補助 φ(度, 魚×フレーム, 速い魚のみ n=${A.phis.length}) ` + fmtP(A.phis, 6, 1));
    console.log(`補助 inline20(φ<20°)=${(A.nIn / A.nV * 100).toFixed(1)}%(等方なら約22%)  chain(φ<20° かつ nn<2L0)=${(A.nCh / A.nV * 100).toFixed(1)}%`);
    { let low = 0; for (let i = 0; i < 9; i++) low += hist[i * (TH_BINS + 1)]; // e<0.45 かつ θ<15°
      console.log(`判定用: e中央値=${pct(A.e, 50).toFixed(3)}  「e<0.45 かつ θ<15°」=${(low / A.frames * 100).toFixed(2)}%  nnMin p5=${pct(A.nnMin, 5).toFixed(3)}  σ1中央値=${pct(A.s1, 50).toFixed(2)}  inline20=${(A.nIn / A.nV * 100).toFixed(1)}%`); }
    console.log(`張り付き(魚×フレーム): 水面側クランプ ${(A.nTop / A.nFish * 100).toFixed(2)}%  底側クランプ ${(A.nBot / A.nFish * 100).toFixed(2)}%`);
    console.log("\n(e, θ) 2次元ヒストグラム(全シード合計、フレーム数の割合 %。行=e、列=θ。空白=0)");
    console.log("  e \\ θ      " + Array.from({ length: TH_BINS }, (_, i) => `${i * 15}-${i * 15 + 15}`.padStart(7)).join("") + "    n/a    行計  累積");
    let cum = 0;
    for (let i = 0; i < E_BINS; i++) {
      const row = Array.from({ length: TH_BINS + 1 }, (_, j) => hist[i * (TH_BINS + 1) + j]), sum = row.reduce((a, b) => a + b, 0);
      if (!sum && cum >= A.frames) continue; cum += sum;
      console.log(`  ${(i * 0.05).toFixed(2)}-${(i * 0.05 + 0.05).toFixed(2)}  ` + row.map(v => (v ? (v / A.frames * 100).toFixed(2) : "").padStart(7)).join("") + `  ${(sum / A.frames * 100).toFixed(2).padStart(6)} ${(cum / A.frames * 100).toFixed(1).padStart(5)}`);
    }
    console.log("\nシードごと(各シード内のフレーム分布)");
    console.log("  seed |  e p5   p50   p95 |  θ p50 | σ1 p50 | nnMin p5  p50 | nnMed p50 | inline20  chain");
    for (const { seed, res } of runs) {
      const r = res[k];
      console.log(`  ${String(seed).padStart(4)} | ${pct(r.e, 5).toFixed(3)} ${pct(r.e, 50).toFixed(3)} ${pct(r.e, 95).toFixed(3)} | ${pct(r.theta, 50).toFixed(1).padStart(6)} | ${pct(r.s1, 50).toFixed(2).padStart(6)} | ${pct(r.nnMin, 5).toFixed(3)} ${pct(r.nnMin, 50).toFixed(3)} | ${pct(r.nnMed, 50).toFixed(3).padStart(9)} | ${(r.nIn / r.nV * 100).toFixed(1).padStart(7)}% ${(r.nCh / r.nV * 100).toFixed(1).padStart(5)}%`);
    }
    // 目視用:シード先頭 3 個ずつ、e が最小付近(各シードの e 1 パーセンタイル)と中央値付近のフレーム
    console.log("\n目視用スナップショット(シード先頭 3 個。最小付近=e の p1、中央値付近=p50、最大付近=p99 のフレーム)");
    for (const which of [["最小付近", 1], ["中央値付近", 50], ["最大付近", 99]]) {
      for (const { seed, res } of runs.slice(0, 3)) {
        const r = res[k], target = pct(r.e, which[1]);
        let bi = 0, bd = Infinity; r.e.forEach((v, i) => { const d = Math.abs(v - target); if (d < bd) { bd = d; bi = i; } });
        console.log(ascii(r.snaps[bi], k, r.mets[bi], `${scen}/${k} ${which[0]} seed=${seed} t=${(WARMUP + bi * DT).toFixed(1)}s`));
      }
    }
  }
}
console.log(`\n実行時間: ${((hostNow() - t0) / 1000).toFixed(1)} 秒`);
