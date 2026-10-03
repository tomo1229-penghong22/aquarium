// 水槽の情景(配置・水草・光・水面・温度計・ガラス・エアストーン・泡)の生成と描画。
import { DPR, H, TAU, counts, Tw, U, W, clamp, ctx, current, lerp, mix, mulberry, nightT, noise1, sandY, setCtx, waterTop } from "./core.js";
import { DO, RATE, agingOn, algaeGlass, algaeHard, clog, dirt, glassMult, growth, hardMult, sinceClean } from "./aging.js";

/* 水草・岩・流木は不透明に描く(層ごとの globalAlpha はやめた。後ろの物が透けて見えない)。
   かわりに、葉の色を水の澄んだ色(WATER_LT)へ少し寄せて、明るく澄んだ(透過光を受けた)印象を保つ(lt)。奥行きの淡さは、描画順で重なる霞の層(main.js の draw)が受け持つ。 */
const WATER_LT = "#86cfc3";
// c は "#rrggbb" か "rgb(r,g,b)"(core.mix の戻り値)のどちらでもよい。(core.mix は "#rrggbb" しか受け付けないので、rgb() を渡すと黒になる)
const ltRgb = c => c[0] === "#" ? [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)] : c.match(/[\d.]+/g).slice(0, 3).map(Number);
const lt = (c, k) => { const a = ltRgb(c), b = ltRgb(WATER_LT); return `rgb(${a.map((v, i) => Math.round(v + (b[i] - v) * k)).join(",")})`; };

/* ---- 情景の状態(buildScene が作り直す) ---- */
export let staticNight = null, staticLayer = null, plants = { back: [], mid: [], front: [] }, rocks = [];
let rays = [], motes = [];
export const bubbles = [];
export const FX = { puff: true, shadow: true, gradeDay: true, gradeNight: true }; // puff:コリドラスの砂煙(false で無効。描画ログの照合用・テスト用)。shadow・gradeDay・gradeNight:?perf&skip= の計測専用(通常は常に true)
const puffs = [];
export const puffCount = () => puffs.length;
export const getWood = () => wood; // 流木の枝(各枝は [x, y, 太さ] の点列)。お掃除生体の「這える面」の読み取り用
let wood = [], moss = [], floats = [], glints = [], orbs = [];

/* ---------------- 配置 ---------------- */
export function buildScene(){
  const r = mulberry(20260929);
  const depth = x => sandY(x) - waterTop;
  plants = { back: [], mid: [], front: [] };

  // バリスネリア(奥の細長い葉)
  [[0.07, 11], [0.30, 8], [0.87, 12], [0.50, 6]].forEach(([fx, n]) => {
    for (let i = 0; i < n; i++) {
      const x = W * fx + (r() - 0.5) * 70 * U;
      const y = sandY(x) + (2 + r() * 8) * U;
      plants.back.push({ type: "ribbon", x, y, h: depth(x) * (0.55 + r() * 0.33), w: (7 + r() * 4) * U,
        lean: (r() - 0.5) * 0.35, phase: r() * 10, flex: 0.45 + r() * 0.25, n: 16,
        c1: mix("#3f6f2c", "#557f33", r()), c2: mix("#8fc25a", "#b3d773", r()), tw: r() * 6 });
    }
  });
  // 有茎草(ロタラ風:先端が赤みを帯びる)
  [[0.19, 7, "#4c8a3a", "#c8674a"], [0.73, 6, "#4a8a3c", "#d0794f"], [0.95, 4, "#4f8f3e", "#9fcf62"]].forEach(([fx, n, c1, c2]) => {
    for (let i = 0; i < n; i++) {
      const x = W * fx + (r() - 0.5) * 60 * U;
      const y = sandY(x) + (6 + r() * 10) * U;
      plants.back.push({ type: "stem", x, y, h: depth(x) * (0.38 + r() * 0.3), lean: (r() - 0.5) * 0.25,
        phase: r() * 10, flex: 0.22 + r() * 0.1, n: 18, leaf: (13 + r() * 5) * U, c1, c2, stemC: "#5c7d3a" });
    }
  });
  // 岩
  rocks = [];
  [[0.43, 95, 62], [0.585, 70, 48], [0.35, 42, 28]].forEach(([fx, w, h]) => {
    const x = W * fx, base = sandY(x) + 18 * U, pts = [];
    const k = 11;
    for (let i = 0; i <= k; i++) {
      const a = Math.PI + i / k * Math.PI;
      const rr = 1 + (r() - 0.5) * 0.22;
      pts.push([x + Math.cos(a) * w * U * rr, base + Math.sin(a) * h * U * rr * (0.9 + 0.2 * Math.sin(i))]);
    }
    rocks.push({ x, base, w: w * U, h: h * U, pts });
  });
  // アマゾンソード(ロゼット)
  [[0.53, 15, 1], [0.255, 9, 0.7]].forEach(([fx, n, s]) => {
    const x = W * fx, y = sandY(x) + 24 * U, leaves = [];
    for (let i = 0; i < n; i++) {
      leaves.push({ ang: (r() - 0.5) * 1.9, len: depth(x) * (0.22 + r() * 0.16) * s, w: (16 + r() * 8) * U * s,
        phase: r() * 10, c: lt(mix("#3c7a31", "#5c9a3f", r()), 0.08) });
    }
    leaves.sort((a, b) => Math.abs(b.ang) - Math.abs(a.ang));
    plants.mid.push({ type: "sword", x, y, leaves });
  });
  // 手前:ヘアーグラスの株と小さな葉の絨毯
  for (let i = 0; i < 22; i++) {
    const cx = W * (0.03 + r() * 0.94), blades = [];
    const baseY = sandY(cx) + (40 + r() * 30) * U;
    const nb = 5 + Math.floor(r() * 5);
    for (let j = 0; j < nb; j++) blades.push({ type: "ribbon", x: cx + (r() - 0.5) * 18 * U, y: baseY + r() * 4 * U,
      h: (22 + r() * 34) * U, w: 2.4 * U, lean: (r() - 0.5) * 0.7, phase: r() * 10, flex: 0.35, n: 6,
      c1: lt("#4f8a38", 0.12), c2: lt("#a6d46a", 0.12), tw: 0, flat: true });
    plants.front.push({ type: "tuft", blades });
  }
  for (let i = 0; i < 16; i++) {
    const cx = W * (0.02 + r() * 0.96), baseY = sandY(cx) + (48 + r() * 30) * U, leaves = [];
    for (let j = 0; j < 14; j++) leaves.push([(r() - 0.5) * 48 * U, -r() * 12 * U, (3.5 + r() * 2.5) * U, r() * TAU, lt(mix("#4f9a3c", "#8fcf5a", r()), 0.12)]);
    plants.front.push({ type: "carpet", x: cx, y: baseY, leaves, phase: r() * 10 });
  }
  // 流木(枝分かれする)
  wood = [];
  const branch = (x, y, ang, len, w, dep) => {
    const pts = [[x, y, w]], n = 7;
    let a = ang;
    for (let i = 1; i <= n; i++) {
      a += (r() - 0.5) * 0.32;
      x += Math.cos(a) * len / n; y += Math.sin(a) * len / n;
      y = Math.max(y, waterTop + 70 * U);
      pts.push([x, y, w * (1 - i / n * 0.8)]);
      if (dep > 0 && i > 2 && r() < 0.32) branch(x, y, a + (r() < 0.5 ? -0.7 : 0.6), len * 0.5, w * (1 - i / n * 0.8) * 0.7, dep - 1);
    }
    wood.push(pts);
  };
  const wx = W * 0.66, wy = sandY(W * 0.66) + 22 * U, dh = depth(wx);
  branch(wx, wy, -2.15, dh * 0.95, 26 * U, 2);
  branch(wx + 10 * U, wy, -1.2, dh * 0.6, 18 * U, 1);
  branch(wx - 20 * U, wy + 4 * U, -0.25, 120 * U, 16 * U, 0);
  // 流木に付いたシダ(ミクロソリウム風)
  const fern = { type: "fern", leaves: [] };
  for (let i = 0; i < 16; i++) {
    const br = wood[Math.floor(r() * wood.length)], pt = br[1 + Math.floor(r() * (br.length - 2))];
    fern.leaves.push({ bx: pt[0], by: pt[1], ang: (r() - 0.5) * 2.4, len: (45 + r() * 50) * U, w: (10 + r() * 5) * U,
      phase: r() * 10, c: lt(mix("#2e6a33", "#4d8d3f", r()), 0.08) });
  }
  // こけ
  moss = [];
  const addMoss = (x, y, k) => { const bits = []; for (let j = 0; j < 14; j++) bits.push([(r() - 0.5) * 34 * U * k, (r() - 0.6) * 12 * U * k, (3 + r() * 5) * U * k, mix("#3f7a33", "#8cc25a", r())]); moss.push({ x, y, bits }); };
  wood.forEach(br => { if (r() < 0.8) { const pt = br[Math.floor(br.length / 2)]; addMoss(pt[0], pt[1] - pt[2] * 0.4, 0.8); } });
  rocks.forEach(rk => addMoss(rk.x - rk.w * 0.15, rk.base - rk.h * 0.9, rk.w / (80 * U)));
  // タイガーロータス(赤い葉)
  const lotus = { type: "lotus", x: W * 0.37, y: sandY(W * 0.37) + 30 * U, leaves: [] };
  for (let i = 0; i < 7; i++) {
    const spots = []; for (let j = 0; j < 9; j++) spots.push([0.15 + r() * 0.75, (r() - 0.5) * 0.9, 1 + r() * 2]);
    lotus.leaves.push({ ang: (r() - 0.5) * 1.3, len: depth(W * 0.37) * (0.14 + r() * 0.22), w: (26 + r() * 12) * U, tilt: (r() - 0.5) * 1.2, phase: r() * 10, spots });
  }
  plants.mid.unshift(lotus);
  plants.mid.unshift(fern);
  // 浮草
  floats = [];
  for (let i = 0; i < 6; i++) {
    const x = W * (0.16 + r() * 0.78), leaves = [], roots = [];
    const nl = 4 + Math.floor(r() * 4);
    for (let j = 0; j < nl; j++) leaves.push([(r() - 0.5) * 50 * U, (7 + r() * 6) * U, lt(mix("#5d9e3c", "#9fd062", r()), 0.1)]);
    for (let j = 0; j < 7; j++) roots.push({ dx: (r() - 0.5) * 40 * U, h: (25 + r() * 55) * U, phase: r() * 10 });
    floats.push({ x, leaves, roots, k: r() * 10 });
  }
  glints = [];
  for (let i = 0; i < 46; i++) { const gl = { x: r() * W, k: r() * 50, s: 0.8 + r() * 1.6, f: 0.8 + r() * 1.5 }; if (i < 20) glints.push(gl); } // 採用は 20 個。以降の配置(玉ボケ・筋・粒)を動かさないため、乱数は 46 個ぶん消費する
  orbs = [];
  for (let i = 0; i < 9; i++) orbs.push({ x: r() * W, y: waterTop + r() * H * 0.5, rad: (18 + r() * 40) * U, k: r() * 50 });
  // 光の筋(やや左上からの自然光)
  rays = [];
  for (let i = 0; i < 7; i++) { const ry = { x: W * (0.05 + i * 0.15 + r() * 0.06), w: (40 + r() * 70) * U, slant: -H * (0.12 + r() * 0.08), k: r() * 50 }; if (i % 3 !== 2) rays.push(ry); } // 採用は 5 本(i=0,1,3,4,6)。乱数は 7 本ぶん消費する
  motes = [];
  for (let i = 0; i < 60; i++) motes.push({ x: r() * W, y: waterTop + r() * (H * 0.78 - waterTop), s: 0.6 + r() * 1.3, a: 0.12 + r() * 0.25, k: r() * 100 });
  buildStatic();
  buildLight();
  liteRelease(); // 軽量モードの作り置きは resize で捨てる(必要になったとき作り直す)
  buildAging();
  buildMeter();
  buildObstacles();
}

/* ---- 魚の層の入れ替えの判定用:流木・岩・中景の草の「塗られる輪郭」(buildScene のたびに作り置き。毎フレームは作らない) ----
   drawWood / drawRock / drawSword / drawFern / drawLotus を、塗る多角形を記録するだけの ctx で実際に呼んで集める(描画の式と食い違わない)。
   中景の草は水流で揺れるので、揺れの位相 4 つ(OBST_T)の輪郭をすべて入れる(和)。fish-behavior.js の layerBlocked が読む。 */
export const obstacles = []; // { pts: [[x, y], ...], bb: [x0, y0, x1, y1] }
const OBST_T = [0, 7.3, 15.1, 23.9];
export function buildObstacles(){
  obstacles.length = 0;
  const origCtx = ctx, origP2D = globalThis.Path2D;
  let m = [1, 0, 0, 1, 0, 0]; const stack = [];
  const tp = (x, y) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
  class Rec { // パスの記録。tf があれば追加時に変換(ctx のパス)、なければ素の座標のまま持つ(Path2D。fill の時に変換)
    constructor(tf){ this.tf = tf; this.subs = []; this.last = null; }
    add(x, y){ if (!this.subs.length) this.subs.push([]); this.subs.at(-1).push(this.tf ? this.tf(x, y) : [x, y]); this.last = [x, y]; }
    moveTo(x, y){ this.subs.push([]); this.add(x, y); }
    lineTo(x, y){ this.add(x, y); }
    bezierCurveTo(a, b, c, d, e, f){ const [x0, y0] = this.last || [a, b]; for (let i = 1; i <= 8; i++) { const t = i / 8, u = 1 - t; this.add(u * u * u * x0 + 3 * u * u * t * a + 3 * u * t * t * c + t * t * t * e, u * u * u * y0 + 3 * u * u * t * b + 3 * u * t * t * d + t * t * t * f); } }
    quadraticCurveTo(a, b, c, d){ const [x0, y0] = this.last || [a, b]; for (let i = 1; i <= 8; i++) { const t = i / 8, u = 1 - t; this.add(u * u * x0 + 2 * u * t * a + t * t * c, u * u * y0 + 2 * u * t * b + t * t * d); } }
    arc(x, y, r, a0, a1){ this.subs.push([]); for (let i = 0; i <= 12; i++) { const a = a0 + (a1 - a0) * i / 12; this.add(x + Math.cos(a) * r, y + Math.sin(a) * r); } }
    ellipse(x, y, rx, ry, rot, a0, a1){ this.subs.push([]); for (let i = 0; i <= 12; i++) { const a = a0 + (a1 - a0) * i / 12, ex = Math.cos(a) * rx, ey = Math.sin(a) * ry; this.add(x + ex * Math.cos(rot) - ey * Math.sin(rot), y + ex * Math.sin(rot) + ey * Math.cos(rot)); } }
    rect(x, y, w, h){ this.subs.push([]); this.add(x, y); this.add(x + w, y); this.add(x + w, y + h); this.add(x, y + h); }
    closePath(){}
  }
  let cur = new Rec(tp);
  const emit = p => { for (const sub of p.subs) {
    if (sub.length < 3) continue;
    const pts = p.tf ? sub : sub.map(([x, y]) => tp(x, y));
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const [x, y] of pts) { if (x < x0) x0 = x; if (y < y0) y0 = y; if (x > x1) x1 = x; if (y > y1) y1 = y; }
    if (Number.isFinite(x0 + y0 + x1 + y1)) obstacles.push({ pts, bb: [x0, y0, x1, y1] });
  } };
  const noop = () => {}, grad = { addColorStop: noop };
  const API = {
    save(){ stack.push(m); }, restore(){ m = stack.pop() || m; },
    translate(x, y){ m = [m[0], m[1], m[2], m[3], m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]]; },
    rotate(a){ const c = Math.cos(a), s = Math.sin(a); m = [m[0] * c + m[2] * s, m[1] * c + m[3] * s, -m[0] * s + m[2] * c, -m[1] * s + m[3] * c, m[4], m[5]]; },
    scale(x, y){ m = [m[0] * x, m[1] * x, m[2] * y, m[3] * y, m[4], m[5]]; },
    setTransform(a, b, c, d, e, f){ m = [a, b, c, d, e, f]; },
    transform(a, b, c, d, e, f){ m = [m[0] * a + m[2] * b, m[1] * a + m[3] * b, m[0] * c + m[2] * d, m[1] * c + m[3] * d, m[0] * e + m[2] * f + m[4], m[1] * e + m[3] * f + m[5]]; },
    beginPath(){ cur = new Rec(tp); },
    moveTo(x, y){ cur.moveTo(x, y); }, lineTo(x, y){ cur.lineTo(x, y); },
    bezierCurveTo(...a){ cur.bezierCurveTo(...a); }, quadraticCurveTo(...a){ cur.quadraticCurveTo(...a); },
    arc(...a){ cur.arc(...a); }, ellipse(...a){ cur.ellipse(...a); }, rect(...a){ cur.rect(...a); }, closePath(){},
    fill(p){ emit(p instanceof Rec ? p : cur); },
    createLinearGradient: () => grad, createRadialGradient: () => grad, createConicGradient: () => grad,
  };
  const rec = new Proxy({}, { get(o, k){ return k in API ? API[k] : k in o ? o[k] : noop; }, set(o, k, v){ o[k] = v; return true; } });
  class RecPath extends Rec { constructor(){ super(null); } }
  setCtx(rec); globalThis.Path2D = RecPath;
  try {
    drawWood();
    rocks.forEach(r => { m = [1, 0, 0, 1, 0, 0]; stack.length = 0; drawRock(r); });
    for (const t of OBST_T) plants.mid.forEach(p => { m = [1, 0, 0, 1, 0, 0]; stack.length = 0; (p.type === "fern" ? drawFern : p.type === "lotus" ? drawLotus : drawSword)(p, t); });
  } finally { setCtx(origCtx); if (origP2D === undefined) delete globalThis.Path2D; else globalThis.Path2D = origP2D; }
}

function makeStatic(N){
  const cvs = document.createElement("canvas");
  cvs.width = Math.round(W * DPR); cvs.height = Math.round(H * DPR);
  const g = cvs.getContext("2d");
  g.scale(DPR, DPR);
  const blurOK = typeof g.filter === "string";
  const blur = (px, fn) => { if (blurOK) g.filter = `blur(${px}px)`; fn(); if (blurOK) g.filter = "none"; };
  // 水:上は光を含んだ明るい翡翠色、下は深い青緑
  let gr = g.createLinearGradient(0, waterTop, 0, H);
  const wc = N ? ["#a3d6da", "#5ea3ab", "#2e6d7d", "#183d4f"] : ["#c2ecdf", "#80cbbd", "#479d9c", "#2a6e78"];
  gr.addColorStop(0, wc[0]); gr.addColorStop(0.28, wc[1]); gr.addColorStop(0.62, wc[2]); gr.addColorStop(1, wc[3]);
  g.fillStyle = gr; g.fillRect(0, waterTop, W, H - waterTop);
  // 左上からの光だまり
  if (N) {
    gr = g.createLinearGradient(0, waterTop, 0, H * 0.6);
    gr.addColorStop(0, "rgba(240,248,255,0.4)"); gr.addColorStop(1, "rgba(240,248,255,0)");
    g.fillStyle = gr; g.fillRect(0, waterTop, W, H);
  } else {
    gr = g.createRadialGradient(W * 0.28, waterTop, 0, W * 0.28, waterTop, W * 0.8);
    gr.addColorStop(0, "rgba(255,240,196,0.45)"); gr.addColorStop(0.5, "rgba(255,240,196,0.12)"); gr.addColorStop(1, "rgba(255,240,196,0)");
    g.fillStyle = gr; g.fillRect(0, waterTop, W, H);
  }
  const r = mulberry(7);
  // 遠景の草原(二層、ぼかして奥行きを出す)
  const meadow = (n, col, hMin, hMax, wMax, px) => blur(px, () => {
    g.fillStyle = col;
    for (let i = 0; i < n; i++) {
      const x = r() * W, base = sandY(x) + 2 * U, h = (H - waterTop) * (hMin + r() * (hMax - hMin));
      const bend = (r() - 0.4) * 50 * U, w = (4 + r() * wMax) * U;
      g.beginPath(); g.moveTo(x - w, base);
      g.quadraticCurveTo(x + bend * 0.3, base - h * 0.6, x + bend, base - h);
      g.quadraticCurveTo(x + bend * 0.3 + w * 0.4, base - h * 0.6, x + w, base);
      g.closePath(); g.fill();
    }
    for (let i = 0; i < n / 5; i++) {
      const x = r() * W, y = sandY(x);
      g.beginPath(); g.ellipse(x, y, (30 + r() * 60) * U, (20 + r() * 40) * U, 0, Math.PI, TAU); g.fill();
    }
  });
  meadow(70, N ? "rgba(130,185,190,0.26)" : "rgba(150,210,185,0.30)", 0.2, 0.55, 8, 5 * U + 1);
  meadow(45, N ? "rgba(35,95,95,0.34)" : "rgba(70,140,110,0.28)", 0.12, 0.4, 6, 2.5 * U + 0.5);
  // ぼんやりした光の粒(玉ボケ)
  blur(4 * U + 1, () => {
    for (let i = 0; i < (N ? 0 : 14); i++) {
      const x = r() * W, y = waterTop + r() * H * 0.45, rad = (8 + r() * 26) * U;
      g.fillStyle = `rgba(255,250,225,${0.05 + r() * 0.08})`;
      g.beginPath(); g.arc(x, y, rad, 0, TAU); g.fill();
    }
  });
  // 砂
  g.beginPath(); g.moveTo(0, H);
  for (let x = 0; x <= W; x += 4) g.lineTo(x, sandY(x));
  g.lineTo(W, H); g.closePath();
  gr = g.createLinearGradient(0, H * 0.78, 0, H);
  const sc = N ? ["#e2ddca", "#b9af93", "#6c634f"] : ["#e6d6ac", "#cdb685", "#8e7652"];
  gr.addColorStop(0, sc[0]); gr.addColorStop(0.4, sc[1]); gr.addColorStop(1, sc[2]);
  g.fillStyle = gr; g.fill();
  g.save(); g.clip();
  // 砂紋
  g.lineWidth = 1.4 * U; g.strokeStyle = "rgba(255,246,220,0.25)";
  for (let k = 0; k < 9; k++) {
    g.beginPath();
    for (let x = 0; x <= W; x += 10) { const y = sandY(x) + (8 + k * 12) * U * (1 + k * 0.08) + Math.sin(x / U * 0.03 + k * 1.7) * 3 * U; x ? g.lineTo(x, y) : g.moveTo(x, y); }
    g.stroke();
  }
  const rr = mulberry(99);
  for (let i = 0; i < 950; i++) {
    const x = rr() * W, top = sandY(x), y = top + Math.pow(rr(), 0.8) * (H - top);
    const d = (y - top) / (H - top);
    const s = (0.8 + rr() * 2.2 + d * 2.8) * U;
    const tone = rr();
    g.fillStyle = tone < 0.45 ? `rgba(135,110,75,${0.22 + rr() * 0.25})` : tone < 0.85 ? `rgba(245,232,200,${0.35 + rr() * 0.4})` : tone < 0.93 ? "rgba(110,120,115,0.45)" : "rgba(190,150,110,0.55)";
    g.beginPath(); g.ellipse(x, y, s * 1.3, s, rr() * TAU, 0, TAU); g.fill();
    if (s > 2.6 * U) { g.fillStyle = "rgba(255,255,245,0.35)"; g.beginPath(); g.arc(x - s * 0.4, y - s * 0.35, s * 0.35, 0, TAU); g.fill(); }
  }
  gr = g.createLinearGradient(0, H * 0.76, 0, H * 0.84);
  gr.addColorStop(0, "rgba(25,60,55,0.35)"); gr.addColorStop(1, "rgba(25,60,55,0)");
  g.fillStyle = gr; g.fillRect(0, H * 0.74, W, H * 0.11);
  g.restore();
  return cvs;
}
function buildStatic(){ staticLayer = makeStatic(false); staticNight = makeStatic(true); }

/* ---------------- 水草の描画 ---------------- */
function spine(p, t, h = p.h, nn = p.n){ // h・nn:成長で伸ばした高さ・節の数(省略時は元のまま)
  const pts = [];
  let x = p.x, y = p.y;
  const seg = h / nn;
  pts.push([x, y, -Math.PI / 2 + p.lean]);
  for (let i = 1; i <= nn; i++) {
    const s = i / nn;
    const cur = current(x, t - s * 1.1 - p.phase * 0.05);
    const a = -Math.PI / 2 + p.lean * (1 - s * 0.35) + cur * p.flex * Math.pow(s, 1.25)
      + Math.sin(t * 1.6 + s * 5 + p.phase) * 0.04 * s;
    x += Math.cos(a) * seg; y += Math.sin(a) * seg;
    if (y < waterTop + 8 * U) y = waterTop + 8 * U;
    pts.push([x, y, a]);
  }
  return pts;
}
export function drawRibbon(p, t){
  // 成長:葉が最大 1.3 倍に伸びる(水面の少し下で頭打ち。届いた先は spine が水面に沿わせる)。手前の草(flat)は変えない
  const h = !p.flat && growth >= AG_EPS ? Math.min(p.h * (1 + 0.3 * growth), Math.max(p.h, p.y - waterTop - 6 * U)) : p.h;
  const pts = spine(p, t, h), n = pts.length, L = [], R = [];
  for (let i = 0; i < n; i++) {
    const s = i / (n - 1), [x, y, a] = pts[i];
    const tw = p.flat ? 1 : 0.3 + 0.7 * Math.abs(Math.cos(s * 2.6 + p.tw + Math.sin(t * 0.5 + p.tw) * 0.6));
    const taper = s < 0.82 ? 1 : Math.max(0.04, (1 - s) / 0.18);
    const w = p.w * tw * taper * (0.75 + 0.25 * (1 - s)) * 0.5;
    const nx = -Math.sin(a), ny = Math.cos(a);
    L.push([x + nx * w, y + ny * w]); R.push([x - nx * w, y - ny * w]);
  }
  ctx.beginPath(); ctx.moveTo(L[0][0], L[0][1]);
  for (let i = 1; i < n; i++) ctx.lineTo(L[i][0], L[i][1]);
  for (let i = n - 1; i >= 0; i--) ctx.lineTo(R[i][0], R[i][1]);
  ctx.closePath();
  const g = ctx.createLinearGradient(pts[0][0], pts[0][1], pts[n - 1][0], pts[n - 1][1]);
  g.addColorStop(0, p.c1); g.addColorStop(1, p.c2);
  ctx.fillStyle = g; ctx.fill();
  if (!p.flat) {
    ctx.strokeStyle = "rgba(235,255,205,0.2)"; ctx.lineWidth = p.w * 0.16; ctx.lineCap = "round";
    ctx.beginPath(); ctx.moveTo(pts[1][0], pts[1][1]);
    for (let i = 2; i < n - 1; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.stroke();
  }
}
export function drawStem(p, t){
  // 成長:背が最大 1.35 倍に伸び(水面の少し下で頭打ち)、節も増えて葉の間隔は保つ。先端の赤みが増し、下の方まで染まる
  const g = growth >= AG_EPS ? growth : 0;
  let h = p.h, nn = p.n, tip = p.c2;
  if (g) { h = Math.min(p.h * (1 + 0.35 * g), Math.max(p.h, p.y - waterTop - 14 * U)); nn = Math.max(p.n, Math.round(p.n * h / p.h)); tip = mixC(p.c2, "#dd5a45", 0.3 * g); }
  const pts = spine(p, t, h, nn);
  ctx.strokeStyle = p.stemC; ctx.lineWidth = 2 * U; ctx.lineCap = "round";
  ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  ctx.stroke();
  for (let i = 2; i < pts.length; i += 1) {
    const s = i / nn, [x, y, a] = pts[i];
    const len = p.leaf * (1.05 - 0.45 * s);
    ctx.fillStyle = g ? mixC(p.c1, tip, Math.pow(s, 1.6 - 0.6 * g)) : mix(p.c1, p.c2, Math.pow(s, 1.6));
    for (const side of [-1, 1]) {
      const la = a + side * (1.05 - 0.25 * s) + Math.sin(t * 1.3 + i + p.phase) * 0.06;
      ctx.beginPath();
      ctx.ellipse(x + Math.cos(la) * len * 0.5, y + Math.sin(la) * len * 0.5, len * 0.5, len * 0.15, la, 0, TAU);
      ctx.fill();
    }
  }
}
function drawLeaf(bx, by, l, t, flex, pet, cBase, cTip, cMid = l.c, dots = null){
  const sp = { x: bx, y: by, h: l.len, n: 10, lean: l.ang, flex, phase: l.phase };
  const pts = spine(sp, t), n = pts.length, Lp = [], Rp = [];
  for (let i = 0; i < n; i++) {
    const s = i / (n - 1), [x, y, a] = pts[i];
    const w = s < pet ? l.w * 0.05 : l.w * Math.pow(Math.sin(Math.PI * (s - pet) / (1 - pet)), 0.75) * 0.5 + 0.5 * U;
    const nx = -Math.sin(a), ny = Math.cos(a);
    Lp.push([x + nx * w, y + ny * w]); Rp.push([x - nx * w, y - ny * w]);
  }
  ctx.beginPath(); ctx.moveTo(Lp[0][0], Lp[0][1]);
  for (let i = 1; i < n; i++) ctx.lineTo(Lp[i][0], Lp[i][1]);
  for (let i = n - 1; i >= 0; i--) ctx.lineTo(Rp[i][0], Rp[i][1]);
  ctx.closePath();
  const g = ctx.createLinearGradient(pts[0][0], pts[0][1], pts[n - 1][0], pts[n - 1][1]);
  g.addColorStop(0, cBase); g.addColorStop(0.5, cMid); g.addColorStop(1, cTip);
  ctx.fillStyle = g; ctx.fill();
  ctx.strokeStyle = "rgba(210,240,180,0.35)"; ctx.lineWidth = 1 * U;
  const i0 = Math.max(1, Math.floor(pet * (n - 1)));
  ctx.beginPath(); ctx.moveTo(pts[i0][0], pts[i0][1]);
  for (let i = i0 + 1; i < n; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  ctx.stroke();
  ctx.strokeStyle = "rgba(210,240,180,0.16)"; ctx.lineWidth = 0.7 * U;
  for (let i = i0 + 1; i < n - 2; i++) {
    ctx.beginPath(); ctx.moveTo(pts[i][0], pts[i][1]); ctx.lineTo((pts[i + 1][0] + Lp[i + 1][0] * 2) / 3, (pts[i + 1][1] + Lp[i + 1][1] * 2) / 3);
    ctx.moveTo(pts[i][0], pts[i][1]); ctx.lineTo((pts[i + 1][0] + Rp[i + 1][0] * 2) / 3, (pts[i + 1][1] + Rp[i + 1][1] * 2) / 3); ctx.stroke();
  }
  if (dots) { // 縁の苔(濃い茶緑の小さな点)。しきい値 th が algaeHard 未満の点だけ、まとめて 1 回で塗る
    let any = false;
    for (const d of dots) {
      if (d.th >= algaeHard) continue;
      const i = clamp(Math.round(d.s * (n - 1)), i0 + 1, n - 2), E = d.side > 0 ? Lp[i] : Rp[i];
      const x = lerp(pts[i][0], E[0], 0.85), y = lerp(pts[i][1], E[1], 0.85);
      if (!any) { ctx.beginPath(); any = true; }
      ctx.moveTo(x + d.rad, y); ctx.arc(x, y, d.rad, 0, TAU);
    }
    if (any) { ctx.fillStyle = "rgba(84,76,32,0.58)"; ctx.fill(); }
  }
}
// アマゾンソード:外側(先頭)の古い葉ほど、clog に比例して黄ばむ(内側 4 割の葉は緑のまま)。algaeHard で葉の縁に苔の点
const SW_A = lt("#2c5c27", 0.08), SW_B = lt("#8cc866", 0.08), FERN_A = lt("#244f28", 0.08), FERN_B = lt("#7fbe5e", 0.08);
export function drawSword(p, t){
  const n = p.leaves.length, c = clog >= AG_EPS ? clog : 0, a = algaeHard >= AG_EPS;
  p.leaves.forEach((l, i) => {
    const w = c * clamp(1 - i / (n * 0.6), 0, 1) * 0.85;
    if (!w && !a) return drawLeaf(p.x, p.y, l, t, 0.14, 0.25, SW_A, SW_B);
    if (!w) return drawLeaf(p.x, p.y, l, t, 0.14, 0.25, SW_A, SW_B, l.c, l.dots);
    drawLeaf(p.x, p.y, l, t, 0.14, 0.25, mixC(SW_A, "#7d7a2a", w), mixC(SW_B, "#e0d676", w), mixC(l.c, "#b2ae45", w), a ? l.dots : null);
  });
}
export function drawFern(p, t){ p.leaves.forEach(l => drawLeaf(l.bx, l.by, l, t, 0.2, 0.05, FERN_A, FERN_B)); }
const LOTUS = [lt("#e7866a", 0.06), lt("#c24d44", 0.06), lt("#8e2f33", 0.06)];
export function drawLotus(p, t){
  p.leaves.forEach(l => {
    const pts = spine({ x: p.x, y: p.y, h: l.len, n: 8, lean: l.ang, flex: 0.2, phase: l.phase }, t);
    ctx.strokeStyle = "rgb(150,80,65)"; ctx.lineWidth = 1.7 * U; // 葉柄(不透明)
    ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]); ctx.stroke();
    const [x, y, a] = pts[pts.length - 1];
    ctx.save(); ctx.translate(x, y); ctx.rotate(a + l.tilt + Math.sin(t * 0.8 + l.phase) * 0.08);
    const bw = l.w, bh = l.w * 0.6;
    const leaf = new Path2D();
    leaf.moveTo(bw * 0.06, 0);
    leaf.bezierCurveTo(-bw * 0.12, -bh * 0.9, bw * 0.75, -bh * 1.0, bw, 0);
    leaf.bezierCurveTo(bw * 0.75, bh * 1.0, -bw * 0.12, bh * 0.9, bw * 0.06, 0);
    const g = ctx.createLinearGradient(0, -bh, bw, bh);
    g.addColorStop(0, LOTUS[0]); g.addColorStop(0.5, LOTUS[1]); g.addColorStop(1, LOTUS[2]);
    ctx.fillStyle = g; ctx.fill(leaf);
    ctx.save(); ctx.clip(leaf);
    ctx.fillStyle = "rgba(95,25,35,0.35)";
    l.spots.forEach(([u, v, k]) => { ctx.beginPath(); ctx.arc(bw * u, v * bh, k * U, 0, TAU); ctx.fill(); });
    ctx.restore();
    ctx.strokeStyle = "rgba(255,210,190,0.45)"; ctx.lineWidth = 0.9 * U;
    ctx.beginPath(); ctx.moveTo(bw * 0.06, 0); ctx.lineTo(bw * 0.95, 0); ctx.stroke();
    ctx.restore();
  });
}
export function drawWood(){
  wood.forEach(br => {
    const n = br.length, Lp = [], Rp = [];
    for (let i = 0; i < n; i++) {
      const a = i < n - 1 ? Math.atan2(br[i + 1][1] - br[i][1], br[i + 1][0] - br[i][0]) : Math.atan2(br[i][1] - br[i - 1][1], br[i][0] - br[i - 1][0]);
      const nx = -Math.sin(a), ny = Math.cos(a), w = br[i][2] / 2;
      Lp.push([br[i][0] + nx * w, br[i][1] + ny * w]); Rp.push([br[i][0] - nx * w, br[i][1] - ny * w]);
    }
    ctx.beginPath(); ctx.moveTo(Lp[0][0], Lp[0][1]);
    for (let i = 1; i < n; i++) ctx.lineTo(Lp[i][0], Lp[i][1]);
    ctx.quadraticCurveTo(br[n - 1][0] + (br[n - 1][0] - br[n - 2][0]) * 0.3, br[n - 1][1] + (br[n - 1][1] - br[n - 2][1]) * 0.3, Rp[n - 1][0], Rp[n - 1][1]);
    for (let i = n - 2; i >= 0; i--) ctx.lineTo(Rp[i][0], Rp[i][1]);
    ctx.closePath();
    ctx.fillStyle = "#5a3d2a"; ctx.fill();
    ctx.save(); ctx.clip();
    ctx.lineCap = "round";
    ctx.strokeStyle = "rgba(235,195,145,0.35)";
    ctx.lineWidth = br[0][2] * 0.28;
    ctx.beginPath(); for (let i = 0; i < n; i++) { const y = br[i][1] - br[i][2] * 0.32; i ? ctx.lineTo(br[i][0], y) : ctx.moveTo(br[i][0], y); } ctx.stroke();
    ctx.strokeStyle = "rgba(30,18,12,0.35)"; ctx.lineWidth = Math.max(0.6, 0.9 * U);
    for (const off of [0.12, -0.05, 0.28]) { ctx.beginPath(); for (let i = 0; i < n; i++) { const y = br[i][1] + br[i][2] * off; i ? ctx.lineTo(br[i][0], y) : ctx.moveTo(br[i][0], y); } ctx.stroke(); }
    ctx.restore();
  });
}
export function drawMoss(){
  ctx.globalAlpha = 0.72;
  moss.forEach(m => m.bits.forEach(([dx, dy, r, c]) => { ctx.fillStyle = c; ctx.beginPath(); ctx.arc(m.x + dx, m.y + dy, r, 0, TAU); ctx.fill(); }));
  ctx.globalAlpha = 1;
}
export function drawFloats(t){
  floats.forEach(fl => {
    const x = fl.x + Math.sin(t * 0.15 + fl.k) * 25 * U, sy = surfaceY(x, t);
    // 浮草の下の淡い影
    const g = ctx.createLinearGradient(0, sy, 0, sy + 150 * U);
    g.addColorStop(0, "rgba(15,50,45,0.16)"); g.addColorStop(1, "rgba(15,50,45,0)");
    ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(x - 30 * U, sy); ctx.lineTo(x + 30 * U, sy); ctx.lineTo(x + 20 * U, sy + 150 * U); ctx.lineTo(x - 55 * U, sy + 150 * U); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = "rgba(225,215,185,0.55)"; ctx.lineWidth = Math.max(0.6, 0.8 * U);
    fl.roots.forEach(rt => {
      ctx.beginPath(); let px = x + rt.dx, py = sy + 3 * U; ctx.moveTo(px, py);
      for (let i = 1; i <= 6; i++) { const s = i / 6; px += current(px, t - s) * 5 * U * s + Math.sin(t * 1.2 + rt.phase + s * 4) * 1.2 * U; py += rt.h / 6; ctx.lineTo(px, py); }
      ctx.stroke();
    });
    const leaf = ([dx, r, c]) => {
      const lx = x + dx, ly = surfaceY(lx, t) + 1.5 * U;
      ctx.fillStyle = "rgb(40,80,40)"; ctx.beginPath(); ctx.ellipse(lx, ly + 1.2 * U, r, r * 0.28, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = c; ctx.beginPath(); ctx.ellipse(lx, ly, r, r * 0.26, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = "rgba(240,255,210,0.55)"; ctx.beginPath(); ctx.ellipse(lx - r * 0.2, ly - r * 0.08, r * 0.5, r * 0.07, 0, 0, TAU); ctx.fill();
    };
    fl.leaves.forEach(leaf);
    // 成長:葉が増える(最大で元の約 1.6 倍。追加の葉は別シードで作り置き)
    if (growth >= AG_EPS && fl.extra) for (let i = 0, k = Math.round(fl.extra.length * growth); i < k; i++) leaf(fl.extra[i]);
  });
}

export function drawCarpet(p, t){
  const sw = (current(p.x, t) * 0.12);
  p.leaves.forEach(([dx, dy, s, rot, c]) => {
    ctx.fillStyle = c;
    ctx.beginPath(); ctx.ellipse(p.x + dx + sw * (-dy) , p.y + dy, s * 1.3, s * 0.8, rot + sw, 0, TAU); ctx.fill();
  });
}
export function drawRock(r){
  ctx.beginPath(); ctx.moveTo(r.pts[0][0], r.pts[0][1]);
  for (let i = 1; i < r.pts.length; i++) {
    const a = r.pts[i - 1], b = r.pts[i];
    ctx.quadraticCurveTo(a[0], a[1], (a[0] + b[0]) / 2, (a[1] + b[1]) / 2);
  }
  ctx.lineTo(r.pts[r.pts.length - 1][0], r.pts[r.pts.length - 1][1]); ctx.closePath();
  const g = ctx.createRadialGradient(r.x - r.w * 0.35, r.base - r.h * 0.9, r.w * 0.05, r.x, r.base - r.h * 0.3, r.w * 1.1);
  g.addColorStop(0, "#c9c6b4"); g.addColorStop(0.45, "#8a887a"); g.addColorStop(1, "#4a4c45");
  ctx.fillStyle = g; ctx.fill();
  ctx.save(); ctx.clip();
  ctx.strokeStyle = "rgba(40,40,35,0.18)"; ctx.lineWidth = 1.2 * U;
  ctx.beginPath(); ctx.moveTo(r.x - r.w * 0.5, r.base - r.h * 0.3); ctx.quadraticCurveTo(r.x, r.base - r.h * 0.55, r.x + r.w * 0.6, r.base - r.h * 0.2); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(r.x - r.w * 0.2, r.base - r.h * 0.75); ctx.quadraticCurveTo(r.x + r.w * 0.1, r.base - r.h * 0.6, r.x + r.w * 0.3, r.base - r.h * 0.7); ctx.stroke();
  ctx.fillStyle = "rgba(20,40,35,0.25)"; ctx.fillRect(r.x - r.w * 1.2, r.base - r.h * 0.18, r.w * 2.4, r.h);
  ctx.restore();
}

/* ---------------- 時間経過の見た目(ガラスの汚れ・苔、岩と流木の苔) ----------------
   状態(dirt・algaeGlass・algaeHard)は aging.js が所有。値が AG_EPS 未満の要素は描画命令を出さない(新品では何も描かない)。
   乱数は別シード(AG_SEED)の mulberry だけを使い、buildScene の乱数列 r は消費しない。
   テクスチャ(オフスクリーン Canvas)は初めて必要になったときに作り(ensureAging)、resize で捨てる。毎フレームは drawImage+globalAlpha だけ。
   (起動時・resize のたびに作ると、状態が 0 の新品でも描画ログに作成命令が出てしまうため、必要になるまで作らない。
   起動時に状態が指定されている場合(?aging)は、buildAging の末尾ですぐ作る) */
const AG_EPS = 0.002, AG_SEED = 20261002;
const rgbOf = c => { if (c[0] === "#") { const n = parseInt(c.slice(1), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; } const m = c.match(/[\d.]+/g); return [+m[0], +m[1], +m[2]]; };
const mixC = (c1, c2, t) => { const a = rgbOf(c1), b = rgbOf(c2); return `rgb(${Math.round(lerp(a[0], b[0], t))},${Math.round(lerp(a[1], b[1], t))},${Math.round(lerp(a[2], b[2], t))})`; };
let agData = { hairs: [], blobs: [], box: null }, agTex = null;
const smooth = x => { x = clamp(x, 0, 1); return x * x * (3 - 2 * x); };
// 格子の値ノイズ(cw×ch セル。u, v は 0〜1)。ゆるやかな大きい斑を作るために使う
function valueNoise(r, cw, ch){
  const gw = cw + 2, g = new Float32Array(gw * (ch + 2));
  for (let i = 0; i < g.length; i++) g[i] = r();
  return (u, v) => {
    const x = u * cw, y = v * ch, i = Math.floor(x), j = Math.floor(y), fx = x - i, fy = y - j;
    const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
    return lerp(lerp(g[j * gw + i], g[j * gw + i + 1], sx), lerp(g[(j + 1) * gw + i], g[(j + 1) * gw + i + 1], sx), sy);
  };
}
function buildAging(){
  const r = mulberry(AG_SEED);
  agTex = null; tr = null; // テクスチャも跡も作り直し(resize)
  // 浮草の追加の葉(元の葉数の約 0.6 倍。成長に応じて先頭から使う)
  floats.forEach(fl => {
    fl.extra = [];
    for (let j = 0, n = Math.round(fl.leaves.length * 0.6); j < n; j++) fl.extra.push([(r() - 0.5) * 64 * U, (7 + r() * 6) * U, lt(mix("#5d9e3c", "#9fd062", r()), 0.1)]);
  });
  // アマゾンソードの葉の縁の苔の点(しきい値 th が algaeHard 未満のものを描く)
  plants.mid.forEach(p => {
    if (p.type !== "sword") return;
    p.leaves.forEach(l => { l.dots = []; for (let k = 0; k < 16; k++) l.dots.push({ s: 0.3 + r() * 0.65, side: r() < 0.5 ? -1 : 1, rad: (0.7 + r() * 0.9) * U, th: r() }); });
  });
  // 岩・流木の上面を覆うやわらかい茶緑のうぶ毛(hairs:小さな丸い毛玉、blobs:その下の薄い膜)。位置だけを作り、描くのは ensureAging
  const hairs = [], blobs = [];
  rocks.forEach(rk => {
    const pts = rk.pts, nHair = Math.round(rk.w / U * 3.6), nBlob = Math.round(rk.w / U * 0.7);
    for (let n = 0, tries = 0; n < nHair && tries < nHair * 6; tries++) {
      const q = r() * (pts.length - 1), i = Math.min(pts.length - 2, Math.floor(q)), f = q - i;
      const x = lerp(pts[i][0], pts[i + 1][0], f), y = lerp(pts[i][1], pts[i + 1][1], f);
      const ox = x - rk.x, oy = y - rk.base, L = Math.hypot(ox, oy) || 1, ux = ox / L, uy = oy / L;
      if (uy > -0.2) continue; // 上面だけ
      n++;
      const d = r() * r() * 0.42 * rk.h - 0.6 * U; // 輪郭から内側へ(手前ほど濃く)。少しだけ外へはみ出す
      hairs.push({ x: x - ux * d, y: y - uy * d, rad: (1.1 + r() * 2) * U, tone: r() < 0.5 ? 0 : 1, th: r() });
      if (n <= nBlob) { const d2 = r() * 0.25 * rk.h; blobs.push({ x: x - ux * d2, y: y - uy * d2, rad: (3 + r() * 4) * U, th: r() }); }
    }
  });
  wood.forEach(br => {
    for (let i = 0; i < br.length - 1; i++) {
      const [x0, y0, w0] = br[i], [x1, y1, w1] = br[i + 1], dx = x1 - x0, dy = y1 - y0, L = Math.hypot(dx, dy) || 1;
      let nx = -dy / L, ny = dx / L; if (ny > 0) { nx = -nx; ny = -ny; } // 上向きの法線
      const cnt = Math.max(1, Math.round(L / (1.5 * U)));
      for (let j = 0; j < cnt; j++) {
        const f = r(), w = lerp(w0, w1, f) / 2, cx = x0 + dx * f, cy = y0 + dy * f;
        if (-ny < 0.3 && r() < 0.5) continue; // ほぼ縦の枝は半分に間引く
        const o = w * (0.95 - r() * r() * 1.1); // 上の縁のあたりに多く、中心へ向かって薄く
        hairs.push({ x: cx + nx * o, y: cy + ny * o, rad: (1 + r() * 1.8) * U, tone: r() < 0.5 ? 0 : 1, th: r() });
        if (r() < 0.25) blobs.push({ x: cx + nx * w * 0.7, y: cy + ny * w * 0.7, rad: (2.2 + r() * 2.5) * U, th: r() });
      }
    }
  });
  let bx0 = Infinity, by0 = Infinity, bx1 = -Infinity, by1 = -Infinity;
  const grow = (x, y) => { bx0 = Math.min(bx0, x); by0 = Math.min(by0, y); bx1 = Math.max(bx1, x); by1 = Math.max(by1, y); };
  hairs.forEach(h => { grow(h.x - h.rad, h.y - h.rad); grow(h.x + h.rad, h.y + h.rad); }); blobs.forEach(b => { grow(b.x - b.rad, b.y - b.rad); grow(b.x + b.rad, b.y + b.rad); });
  const m = 6 * U;
  agData = { hairs, blobs, box: null };
  if (hairs.length) {
    const x = Math.max(0, bx0 - m), y = Math.max(waterTop, by0 - m);
    agData.box = { x, y, w: Math.min(W, bx1 + m) - x, h: Math.min(H, by1 + m) - y };
  }
  if (dirt >= AG_EPS || algaeGlass >= AG_EPS || algaeHard >= AG_EPS) ensureAging();
}
// テクスチャの作り置き(状態が必要になったときに 1 回。resize まで使い回す)
function ensureAging(){
  if (agTex) return agTex;
  const S = Math.min(DPR, 1.5), r = mulberry(AG_SEED + 1), t = { hard: [] };
  // 1) ガラスの汚れ:ゆるやかな大きい斑(黄緑〜茶のむらのある膜)。小さな画像を引き伸ばす(なめらかなので十分)
  {
    const DW = 192, DH = 120, [c, g] = mkCanvas(DW, DH), img = g.createImageData(DW, DH), d = img.data;
    const n1 = valueNoise(r, 3, 2), n2 = valueNoise(r, 6, 4), n3 = valueNoise(r, 11, 7), nc = valueNoise(r, 4, 3);
    let k = 0;
    for (let j = 0; j < DH; j++) {
      const v = (j + 0.5) / DH;
      for (let i = 0; i < DW; i++) {
        const u = (i + 0.5) / DW, n = 0.6 * n1(u, v) + 0.3 * n2(u, v) + 0.1 * n3(u, v), dens = smooth((n - 0.3) / 0.45), cm = nc(u, v);
        d[k] = lerp(176, 150, cm); d[k + 1] = lerp(184, 126, cm); d[k + 2] = lerp(92, 72, cm);
        d[k + 3] = (0.08 + 0.3 * dens) * (0.8 + 0.4 * v) * 255; k += 4;
      }
    }
    g.putImageData(img, 0, 0); t.dirt = c;
  }
  // 2) ガラスの苔:点状〜小さな斑の群生。下寄りと左右の隅に多く、上ほど少ない。早く出る点(A)と後から増える点(B)の 2 枚
  {
    const [ca, ga] = mkCanvas(Math.max(1, Math.round(W * S)), Math.max(1, Math.round(H * S))), [cb, gb] = mkCanvas(ca.width, ca.height);
    ga.scale(S, S); gb.scale(S, S);
    const hgt = H - waterTop, dens = (x, y) => {
      const yf = (y - waterTop) / hgt, xf = x / W, edge = Math.max(0, 1 - Math.min(xf, 1 - xf) / 0.12);
      return Math.min(1, 0.04 + 0.75 * yf * yf * yf + 0.45 * edge * (0.35 + 0.65 * yf));
    };
    for (let n = 0, tries = 0; n < 130 && tries < 6000; tries++) {
      const cx = r() * W, cy = waterTop + r() * hgt;
      if (r() > dens(cx, cy)) continue;
      n++;
      const R = (5 + r() * 12) * U, spots = 7 + Math.floor(r() * 10);
      for (let j = 0; j < spots; j++) {
        const a = r() * TAU, dd = R * Math.sqrt(r()), g = r() < 0.4 ? ga : gb;
        const big = r() < 0.15, rad = (big ? 2.6 + r() * 2.2 : 0.5 + r() * r() * 2.2) * U;
        g.fillStyle = mixC("#4f8f3a", "#8dbb4c", r()).replace("rgb(", "rgba(").replace(")", `,${big ? 0.34 : 0.5 + r() * 0.3})`);
        g.beginPath(); g.arc(cx + Math.cos(a) * dd, cy + Math.sin(a) * dd * 0.8, rad, 0, TAU); g.fill();
      }
    }
    t.algaeA = ca; t.algaeB = cb;
  }
  // 3) 岩・流木の苔:しきい値の帯(0〜1/3、1/3〜2/3、2/3〜1)ごとに 1 枚。外接の四角だけ作る
  if (agData.box) {
    const B = agData.box, bw = Math.max(1, Math.round(B.w * S)), bh = Math.max(1, Math.round(B.h * S));
    const TONE = ["rgba(112,116,54,0.34)", "rgba(140,128,66,0.3)"];
    for (let b = 0; b < 3; b++) {
      const [c, g] = mkCanvas(bw, bh);
      g.scale(S, S); g.translate(-B.x, -B.y);
      const blurOK = typeof g.filter === "string";
      if (blurOK) g.filter = `blur(${0.7 * U}px)`; // やわらかく(毛玉の輪郭をぼかす)
      const inBand = th => th >= b / 3 && (b === 2 || th < (b + 1) / 3);
      g.fillStyle = "rgba(112,112,52,0.22)";
      agData.blobs.forEach(o => { if (!inBand(o.th)) return; g.beginPath(); g.arc(o.x, o.y, o.rad, 0, TAU); g.fill(); });
      agData.hairs.forEach(h => {
        if (!inBand(h.th)) return;
        g.fillStyle = TONE[h.tone];
        g.beginPath(); g.arc(h.x, h.y, h.rad, 0, TAU); g.fill();
      });
      t.hard.push(c);
    }
  }
  agTex = t;
  return t;
}
/* ---------------- なめた跡(案3:前面ガラスの貝・オトが通った跡、エビがつまんだ岩・流木の跡) ----------------
   見た目だけの層。苔の量(状態)は変えない。跡は保存しない。
   方式:低解像度(MS ピクセルに 1 ピクセル)の「跡マスク」キャンバスに、いまなめている位置を 0.2 秒ごとに丸く書き足す。
   マスクは TRAIL.gens 枚の世代(キャンバス)に分け、世代ごとに「年齢」で透明度を変えて苔のテクスチャへ destination-out で重ねた
   「跡あり版」を 0.2 秒ごとに作り置きし、drawAgingGlass / drawAgingHard はそれがあれば使う(毎フレームの追加コストなし。getImageData / putImageData は使わない)。
   戻り方:世代の進みは「苔の増える速さ」に比例(dt × glassMult または hardMult / RATE ÷ 世代数 × TRAIL.life)。時間経過がオフの間は進まない。
   全世代が過ぎると跡は消える。清掃・リセット(苔の状態が下がる)・resize・?aging・性能による切り替え(off)で全部捨てる。 */
export const TRAIL = { ms: 4, gens: 6, life: 0.15, stampSec: 0.2, rebuildSec: 0.2, radius: 1.0 };
let tr = null, trSeq = 0; // { glass, hard: { b: [{c,g}], head, prog, any, quiet } , acc, since, prevSince, prevG, prevH, cache: { gA, gB, h: [] }, mw, mh }
function newMask(mw, mh, any = false){ const b = []; for (let i = 0; i < TRAIL.gens; i++) { const [c, g] = mkCanvas(mw, mh); b.push({ c, g }); } return { b, head: 0, prog: 0, any, quiet: 0, tot: 0 }; }
export function resetTrails(){ tr = null; }
export const trailProgress = () => tr ? tr.glass.tot : 0; // 世代の累計(戻りの進み。テスト用)
export function trailState(){ return { mw: tr ? tr.mw : 0, mh: tr ? tr.mh : 0, glass: !!(tr && tr.glass.any), hard: !!(tr && tr.hard.any), cached: !!(tr && tr.cache.gA), stamps: tr ? tr.stamps : 0, rebuilds: tr ? tr.rebuilds : 0, id: tr ? tr.id : 0 }; }
function ensureTrail(){
  if (tr) return tr;
  const mw = Math.max(1, Math.ceil(W / TRAIL.ms)), mh = Math.max(1, Math.ceil(H / TRAIL.ms));
  tr = { glass: newMask(mw, mh), hard: newMask(mw, mh), acc: 0, since: 0, prevSince: -1, prevG: algaeGlass, prevH: algaeHard, cache: { gA: null, gB: null, h: [] }, mw, mh, stamps: 0, rebuilds: 0, dirty: false, id: ++trSeq };
  return tr;
}
function stamp(m, x, y, r){
  const g = m.b[m.head].g;
  g.fillStyle = "rgba(0,0,0,0.95)"; g.beginPath(); g.arc(x / TRAIL.ms, y / TRAIL.ms, Math.max(1, r * TRAIL.radius / TRAIL.ms), 0, TAU); g.fill();
  m.any = true; m.quiet = 0;
}
function advance(m, gensStep){
  if (!m.any) return;
  m.prog += gensStep; m.tot += gensStep;
  while (m.prog >= 1) {
    m.prog -= 1; m.head = (m.head + 1) % TRAIL.gens; m.b[m.head].g.clearRect(0, 0, m.b[m.head].c.width, m.b[m.head].c.height);
    if (++m.quiet >= TRAIL.gens) { m.any = false; m.prog = 0; tr.dirty = true; }
  }
}
// マスクの世代を、年齢に応じた透明度(fade:性能による消去の強さ)で srcCanvas に destination-out で重ねた「跡あり版」を作る
function applyMask(g, m, sx, sy, sw, sh, w, h, fade){
  g.globalCompositeOperation = "destination-out";
  for (let i = 0; i < TRAIL.gens; i++) {
    const age = (m.head - i + TRAIL.gens) % TRAIL.gens, wgt = clamp(1 - (age + m.prog) / TRAIL.gens, 0, 1) * fade;
    if (wgt < 0.01) continue;
    g.globalAlpha = wgt; g.drawImage(m.b[i].c, sx, sy, sw, sh, 0, 0, w, h);
  }
  g.globalAlpha = 1; g.globalCompositeOperation = "source-over";
}
function rebuildTrails(fade){
  const t = ensureAging(), c = tr.cache; tr.rebuilds++;
  if (tr.glass.any && t.algaeA) {
    const w = t.algaeA.width, h = t.algaeA.height;
    if (!c.gA) { const [a, ga] = mkCanvas(w, h), [b, gb] = mkCanvas(w, h); c.gA = { c: a, g: ga }; c.gB = { c: b, g: gb }; }
    [[c.gA, t.algaeA], [c.gB, t.algaeB]].forEach(([d, src]) => { d.g.globalCompositeOperation = "source-over"; d.g.clearRect(0, 0, w, h); d.g.drawImage(src, 0, 0); applyMask(d.g, tr.glass, 0, 0, tr.mw, tr.mh, w, h, fade); });
  } else { c.gA = c.gB = null; }
  if (tr.hard.any && agData.box && t.hard.length) {
    const B = agData.box;
    t.hard.forEach((src, i) => {
      const w = src.width, h = src.height;
      if (!c.h[i]) { const [cc, gg] = mkCanvas(w, h); c.h[i] = { c: cc, g: gg }; }
      const d = c.h[i]; d.g.globalCompositeOperation = "source-over"; d.g.clearRect(0, 0, w, h); d.g.drawImage(src, 0, 0);
      applyMask(d.g, tr.hard, B.x / TRAIL.ms, B.y / TRAIL.ms, B.w / TRAIL.ms, B.h / TRAIL.ms, w, h, fade);
    });
  } else c.h = [];
  tr.dirty = false; tr.since = 0;
}
/* 毎フレーム。graz:crawlers.grazers() の結果(新種がいなければ空)。strength:trailStrength()(0 なら跡の表現は使わない) */
export function updateTrails(dt, graz, strength){
  if (strength <= 0) { if (tr) tr = null; return; }
  // 清掃・リセット・?aging などで苔の状態が下がったら、跡は全部消す
  if (tr && (sinceClean < tr.prevSince - 1e-6 || algaeGlass < tr.prevG - 0.001 || algaeHard < tr.prevH - 0.001)) tr = null;
  if (!tr) {
    if (!graz.length) { return; }
    // なめる対象の苔がない(新品)間は何も作らない
    if (!graz.some(g => g.active && (g.kind === "glassF" ? algaeGlass >= AG_EPS : algaeHard >= AG_EPS))) return;
    ensureTrail();
  }
  tr.prevSince = sinceClean; tr.prevG = algaeGlass; tr.prevH = algaeHard;
  tr.acc += dt; tr.since += dt;
  if (tr.acc >= TRAIL.stampSec) {
    tr.acc = 0;
    for (const g of graz) {
      if (!g.active) continue;
      if (g.kind === "glassF" && algaeGlass >= AG_EPS) { stamp(tr.glass, g.x, g.y, g.r); tr.stamps++; tr.dirty = true; }
      else if (g.kind === "hard" && algaeHard >= AG_EPS) { stamp(tr.hard, g.x, g.y, g.r); tr.stamps++; tr.dirty = true; }
    }
  }
  if (agingOn) {
    advance(tr.glass, dt * glassMult(counts) / (TRAIL.life * RATE.glassRiseSec) * TRAIL.gens);
    advance(tr.hard, dt * hardMult(counts) / (TRAIL.life * RATE.hardSec) * TRAIL.gens);
  }
  const any = tr.glass.any || tr.hard.any;
  if (!any) { if (tr.cache.gA || tr.cache.h.length) { tr.cache = { gA: null, gB: null, h: [] }; } return; }
  // 作り置きの更新:書き足しがあったとき 0.2 秒ごと(消去中は 0.1 秒ごと)、なくても 2 秒ごと(戻りの反映)
  const every = strength < 1 ? TRAIL.rebuildSec / 2 : TRAIL.rebuildSec;
  if ((tr.dirty && tr.since >= every) || tr.since >= 2 || (strength < 1 && tr.since >= every) || (!tr.cache.gA && !tr.cache.h.length)) rebuildTrails(strength);
}
// ガラスの汚れ・苔(水面の後、色調補正の前に呼ぶ:照明の色調がかかる)。水中部分(waterTop〜H)だけ
export function drawAgingGlass(){
  const dOn = dirt >= AG_EPS, aOn = algaeGlass >= AG_EPS;
  if (!dOn && !aOn) return;
  const t = ensureAging(), a0 = ctx.globalAlpha, h = H - waterTop;
  if (dOn) {
    ctx.globalAlpha = a0 * dirt; ctx.drawImage(t.dirt, 0, waterTop, W, h);
    ctx.globalAlpha = a0 * dirt * 0.09; ctx.fillStyle = "rgb(236,240,226)"; ctx.fillRect(0, waterTop, W, h); // わずかな白濁
  }
  if (aOn) {
    ctx.globalAlpha = a0 * 0.85 * clamp(algaeGlass * 2.2, 0, 1); ctx.drawImage(tr && tr.cache.gA ? tr.cache.gA.c : t.algaeA, 0, 0, W, H);
    const b = clamp((algaeGlass - 0.25) / 0.75, 0, 1);
    if (b >= AG_EPS) { ctx.globalAlpha = a0 * 0.85 * b; ctx.drawImage(tr && tr.cache.gB ? tr.cache.gB.c : t.algaeB, 0, 0, W, H); }
  }
  ctx.globalAlpha = a0;
}
// 岩・流木の苔(drawMoss の後)。うぶ毛状のくすんだ茶緑(装飾のモスの緑とは別)
export function drawAgingHard(){
  if (algaeHard < AG_EPS || !agData.box) return;
  const t = ensureAging(), B = agData.box, a0 = ctx.globalAlpha;
  for (let b = 0; b < 3; b++) {
    const al = clamp(algaeHard * 3 - b, 0, 1);
    if (al < AG_EPS || !t.hard[b]) continue;
    ctx.globalAlpha = a0 * al; ctx.drawImage(tr && tr.cache.h[b] ? tr.cache.h[b].c : t.hard[b], B.x, B.y, B.w, B.h);
  }
  ctx.globalAlpha = a0;
}

/* ---------------- 光・水面 ---------------- */
// 光の素材は作り置き(毎フレームは drawImage と、作り置きのグラデーションの fill だけ)。
// buildLight() が buildScene の最後(resize のたび)に呼ばれる。コースティクスと LED 暗幕の素材は大きさに依存しないので一度だけ作る。
const lit = { caus: null, nightMul: null, ray: null, orb: null, g: null };
const CAUS_TILE = 188;   // コースティクス 1 タイル(2*TAU を 188 画素 = 元の 1 画素あたり 0.067rad と同じ細かさ)
const CAUS_LAYERS = [    // 2 枚を別方向・別速度に流し、screen で重ねる(sx, sy, vx, vy は素材画素単位。sw, sh は窓の大きさ)
  { phase: 23, sw: 150, sh: 90, vx: 5, vy: 1.6, ox: 0, oy: 0 },
  { phase: 71, sw: 180, sh: 108, vx: -3.6, vy: 0.9, ox: 60, oy: 40 },
];
function mkCanvas(w, h){ const c = document.createElement("canvas"); c.width = w; c.height = h; return [c, c.getContext("2d")]; }
// 一度だけ使う画素計算(単一ファイル時代の毎フレームの画素計算と同じ式。タイルの継ぎ目が出ないよう、明示の px/py は定数 -250 にして周期にした)
function causticsMask(time){
  const n = CAUS_TILE, [c, g] = mkCanvas(n, n), img = g.createImageData(n, n), d = img.data;
  let k = 0;
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const px = (i / n) * TAU * 2 - 250, py = (j / n) * TAU * 2 - 250;
      let ix = px, iy = py, cs = 1;
      for (let m = 0; m < 4; m++) {
        const tt = time * (1 - 3.5 / (m + 1));
        const nix = px + Math.cos(tt - ix) + Math.sin(tt + iy);
        const niy = py + Math.sin(tt - iy) + Math.cos(tt + ix);
        ix = nix; iy = niy;
        const a = -250 / (Math.sin(ix + tt) / 0.005), b = -250 / (Math.cos(iy + tt) / 0.005);
        cs += 1 / Math.sqrt(a * a + b * b);
      }
      cs /= 4; cs = 1.17 - Math.pow(cs, 1.4);
      const v = Math.pow(Math.abs(cs), 8);
      d[k] = 255; d[k + 1] = 255; d[k + 2] = 255; d[k + 3] = Math.min(255, v * 300);
      k += 4;
    }
  }
  g.putImageData(img, 0, 0);
  return c;
}
// 白い素材(alpha だけ持つ)を色付きにする(source-in)。tile = true なら 2x2 に並べ、窓がタイルの継ぎ目をまたいでも切れないようにする
function tint(src, col, tile){
  const w = src.width * (tile ? 2 : 1), h = src.height * (tile ? 2 : 1), [c, g] = mkCanvas(w, h);
  if (tile) { for (let y = 0; y < 2; y++) for (let x = 0; x < 2; x++) g.drawImage(src, x * src.width, y * src.height); } else g.drawImage(src, 0, 0);
  g.globalCompositeOperation = "source-in"; g.fillStyle = col; g.fillRect(0, 0, w, h);
  return c;
}
const CAUS_COL = ["rgb(255,248,222)", "rgb(228,240,255)"], RAY_COL = ["rgb(255,244,210)", "rgb(226,238,255)"];
function buildLight(){
  if (!lit.caus) {
    lit.caus = CAUS_LAYERS.map(L => { const m = causticsMask(L.phase); return CAUS_COL.map(col => tint(m, col, true)); });
    // LED の暗幕:縦(上が明るく下ほど暗い)と横(左右の端ほど暗い)の multiply を 1 枚に焼く(元の 2 回の multiply と同じ積)
    const NW = 128, NH = 96, [c, g] = mkCanvas(NW, NH), img = g.createImageData(NW, NH), d = img.data;
    const stops = (v, st) => { for (let i = 1; i < st.length; i++) if (v <= st[i][0]) { const f = (v - st[i - 1][0]) / (st[i][0] - st[i - 1][0]); return st[i - 1][1].map((x, q) => lerp(x, st[i][1][q], f)); } return st[st.length - 1][1]; };
    const vs = [[0, [246, 249, 255]], [0.45, [196, 209, 228]], [1, [111, 128, 160]]], hs = [[0, [154, 167, 189]], [0.1, [255, 255, 255]], [0.9, [255, 255, 255]], [1, [154, 167, 189]]];
    let k = 0;
    for (let j = 0; j < NH; j++) {
      const cv = stops(j / (NH - 1), vs);
      for (let i = 0; i < NW; i++) { const ch = stops(i / (NW - 1), hs); d[k] = cv[0] * ch[0] / 255; d[k + 1] = cv[1] * ch[1] / 255; d[k + 2] = cv[2] * ch[2] / 255; d[k + 3] = 255; k += 4; }
    }
    g.putImageData(img, 0, 0); lit.nightMul = c;
  }
  // 光の筋 1 本ぶん(横はやわらかく、下ほど広がり、縦は薄くなる)。昼用・夜用
  const RW = 96, RH = 192, [rc, rg] = mkCanvas(RW, RH), rimg = rg.createImageData(RW, RH), rd = rimg.data;
  let q = 0;
  for (let j = 0; j < RH; j++) {
    const v = j / (RH - 1), vp = v < 0.6 ? lerp(1, 0.35, v / 0.6) : lerp(0.35, 0, (v - 0.6) / 0.4), hw = lerp(0.8, 1.5, v) / 1.5 * (RW / 2);
    for (let i = 0; i < RW; i++) {
      const u = (i + 0.5 - RW / 2) / hw, p = Math.abs(u) < 1 ? (1 - u * u) * (1 - u * u) : 0;
      rd[q] = 255; rd[q + 1] = 255; rd[q + 2] = 255; rd[q + 3] = vp * p * 255; q += 4;
    }
  }
  rg.putImageData(rimg, 0, 0);
  lit.ray = RAY_COL.map(col => tint(rc, col, false));
  // 玉ボケ 1 個ぶん(中心が濃く、縁へ消える)。alpha は描くときの globalAlpha で掛ける
  const OS = 128, [oc, og] = mkCanvas(OS, OS), og1 = og.createRadialGradient(OS / 2, OS / 2, 0, OS / 2, OS / 2, OS / 2);
  og1.addColorStop(0, "rgba(255,250,225,1)"); og1.addColorStop(0.7, "rgba(255,250,225,0.6)"); og1.addColorStop(1, "rgba(255,250,225,0)");
  og.fillStyle = og1; og.fillRect(0, 0, OS, OS); lit.orb = oc;
  // 画面の大きさに依存するグラデーション(resize のたびに作り直し、毎フレームは fillStyle に代入するだけ)
  const G = {};
  G.skyDay = ctx.createLinearGradient(0, 0, 0, waterTop); G.skyDay.addColorStop(0, "#fbf6e6"); G.skyDay.addColorStop(1, "#dcebe0");
  G.skyNight = ctx.createLinearGradient(0, 0, 0, waterTop); G.skyNight.addColorStop(0, "#0b1113"); G.skyNight.addColorStop(1, "#2a3c41");
  G.band = ctx.createLinearGradient(0, waterTop, 0, waterTop + 22 * U); G.band.addColorStop(0, "rgba(255,255,240,0.5)"); G.band.addColorStop(1, "rgba(255,255,240,0)");
  G.nightSL = ctx.createLinearGradient(0, 0, 0, H); G.nightSL.addColorStop(0, "rgba(225,238,255,0.42)"); G.nightSL.addColorStop(1, "rgba(10,25,60,0.4)");
  G.daySL = ctx.createLinearGradient(0, 0, 0, H);
  G.daySL.addColorStop(0, "rgba(255,222,165,0.5)"); G.daySL.addColorStop(0.5, "rgba(255,255,255,0)"); G.daySL.addColorStop(1, "rgba(25,75,125,0.45)");
  G.dayGlow = ctx.createRadialGradient(W * 0.3, waterTop, 0, W * 0.3, waterTop, W * 0.45);
  G.dayGlow.addColorStop(0, "rgba(255,240,205,0.16)"); G.dayGlow.addColorStop(1, "rgba(255,240,205,0)");
  lit.g = G;
}
const wrap = (v, n) => ((v % n) + n) % n;
// 揺らめく光の網目:2 枚のテクスチャを別方向に流して screen で重ねる(魚にも水草にも砂にも落ちる)。昼用・夜用を nightT で混ぜる
export function drawCaustics(t){
  if (!lit.caus) return;
  const n = nightT;
  ctx.save(); ctx.globalCompositeOperation = "screen";
  const aTop = lerp(0.25, 0.34, n) * 0.62, aSand = lerp(0.32, 0.42, n) * 0.62;
  const win = CAUS_LAYERS.map(L => [wrap(L.ox + t * L.vx, CAUS_TILE), wrap(L.oy + t * L.vy, CAUS_TILE), L.sw, L.sh]);
  const vars = [[0, 1 - n], [1, n]].filter(v => v[1] > 0.001);
  vars.forEach(([vi, f]) => lit.caus.forEach((tex, li) => {
    const [sx, sy, sw, sh] = win[li];
    ctx.globalAlpha = aTop * f; ctx.drawImage(tex[vi], sx, sy, sw, sh, 0, waterTop, W, H - waterTop);
  }));
  ctx.beginPath(); ctx.moveTo(0, H);
  for (let x = 0; x <= W; x += 10) ctx.lineTo(x, sandY(x));
  ctx.lineTo(W, H); ctx.closePath(); ctx.clip();
  vars.forEach(([vi, f]) => lit.caus.forEach((tex, li) => {
    const [sx, sy, sw, sh] = win[li];
    ctx.globalAlpha = aSand * f; ctx.drawImage(tex[vi], sx, sy, sw, sh, -W * 0.1, H * 0.7, W * 1.2, H * 0.3);
  }));
  ctx.restore();
}
export function drawRays(t){
  if (!lit.ray) return;
  ctx.save(); ctx.globalCompositeOperation = "screen";
  const n = nightT, yb = H * 0.85, hb = yb - waterTop;
  rays.forEach(r => {
    const a = 0.06 + 0.11 * noise1(t * 0.18 + r.k);
    const drift = Math.sin(t * 0.1 + r.k) * 20 * U;
    const x0 = r.x + drift, x1 = r.x + r.slant * (1 - n) + drift * 1.5;
    const ws = lerp(1, 0.55, n), am = lerp(1, 0.8, n), wd = r.w * 1.5 * ws * 2 * 0.9;
    ctx.save();
    ctx.transform(1, 0, (x1 - x0) / hb, 1, x0 - wd / 2, waterTop);
    if (n < 0.999) { ctx.globalAlpha = a * 1.3 * am * (1 - n); ctx.drawImage(lit.ray[0], 0, 0, wd, hb); }
    if (n > 0.001) { ctx.globalAlpha = a * 1.3 * am * n; ctx.drawImage(lit.ray[1], 0, 0, wd, hb); }
    ctx.restore();
  });
  ctx.restore();
}
function rayLight(x, y){
  let v = 0;
  for (const r of rays) { const f = (y - waterTop) / (H * 0.9 - waterTop); const cx = r.x + r.slant * (1 - nightT) * f; const d = (x - cx) / (r.w * (0.6 + f)); v += Math.exp(-d * d); }
  return Math.min(1, v);
}

function surfaceY(x, t){ const xs = x / U; return waterTop + Math.sin(xs * 0.02 + t * 1.1) * 1.3 * U + Math.sin(xs * 0.047 - t * 0.8) * 0.8 * U; }
export function drawSurface(t){
  ctx.save();
  ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, surfaceY(0, t));
  for (let x = 0; x <= W; x += 8) ctx.lineTo(x, surfaceY(x, t));
  ctx.lineTo(W, 0); ctx.closePath();
  const G = lit.g, a0 = ctx.globalAlpha;
  if (nightT < 0.999) { ctx.fillStyle = G.skyDay; ctx.fill(); }
  if (nightT > 0.001) { ctx.globalAlpha = a0 * nightT; ctx.fillStyle = G.skyNight; ctx.fill(); ctx.globalAlpha = a0; }
  // 水面の裏側に映る明るい帯
  ctx.fillStyle = G.band; ctx.fillRect(0, waterTop - 2 * U, W, 24 * U);
  ctx.strokeStyle = "rgba(255,255,250,0.85)"; ctx.lineWidth = 1.3 * U;
  ctx.beginPath(); ctx.moveTo(0, surfaceY(0, t));
  for (let x = 0; x <= W; x += 8) ctx.lineTo(x, surfaceY(x, t));
  ctx.stroke();
  // きらめき
  ctx.globalCompositeOperation = "screen";
  glints.forEach(gl => {
    const a = Math.pow(Math.max(0, Math.sin(t * gl.f + gl.k)), 10);
    if (a < 0.02) return;
    const x = (gl.x + t * 6 * U) % W, y = surfaceY(x, t) + 1.5 * U, s = gl.s * U * (0.6 + a);
    ctx.fillStyle = nightT > 0.5 ? `rgba(240,248,255,${a})` : `rgba(255,252,235,${a * 0.9})`;
    ctx.beginPath(); ctx.ellipse(x, y, s * 4, s * 0.8, 0, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.ellipse(x, y, s * 0.8, s * 2.2, 0, 0, TAU); ctx.fill();
  });
  ctx.restore();
}

/* ---------------- 温度計 ---------------- */
export function drawThermometer(){
  const x = W * 0.045, top = waterTop + H * 0.09, h = H * 0.44, w = 15 * U;
  const lo = 16, hi = 36, sTop = top + 10 * U, sBot = top + h - 26 * U;
  const yT = T => sBot - (clamp(T, lo, hi) - lo) / (hi - lo) * (sBot - sTop);
  ctx.save();
  // 吸盤
  ctx.fillStyle = "rgba(235,245,245,0.45)";
  ctx.beginPath(); ctx.ellipse(x, top - 6 * U, 11 * U, 6 * U, 0, 0, TAU); ctx.fill();
  // ガラス管
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(x - w / 2, top, w, h, w / 2); else ctx.rect(x - w / 2, top, w, h);
  ctx.fillStyle = "rgba(245,250,250,0.32)"; ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,0.8)"; ctx.lineWidth = 1 * U; ctx.stroke();
  // 適温帯
  ctx.fillStyle = "rgba(80,170,100,0.45)";
  ctx.fillRect(x - w / 2 + 1 * U, yT(27), 3 * U, yT(24) - yT(27));
  // 目盛
  ctx.strokeStyle = "rgba(30,40,40,0.75)"; ctx.fillStyle = "rgba(20,30,30,0.9)";
  ctx.font = `600 ${Math.max(9, 9.5 * U)}px "Zen Kaku Gothic New", sans-serif`; ctx.textAlign = "left"; ctx.textBaseline = "middle";
  for (let T = lo; T <= hi; T++) {
    const y = yT(T), big = T % 5 === 0;
    ctx.lineWidth = big ? 1.1 * U : 0.7 * U;
    ctx.beginPath(); ctx.moveTo(x + w * 0.05, y); ctx.lineTo(x + w * (big ? 0.45 : 0.3), y); ctx.stroke();
  }
  // 液柱と球部
  const bulbY = top + h - 13 * U;
  ctx.fillStyle = "#d8322b";
  ctx.beginPath(); ctx.arc(x - w * 0.18, bulbY, 6.2 * U, 0, TAU); ctx.fill();
  ctx.fillRect(x - w * 0.18 - 1.6 * U, yT(Tw), 3.2 * U, bulbY - yT(Tw));
  ctx.fillStyle = "rgba(255,255,255,0.5)"; ctx.fillRect(x - w * 0.18 - 1.4 * U, yT(Tw), 0.9 * U, bulbY - yT(Tw) - 4 * U);
  // 数字ラベル(読みやすいよう管の外に)
  ctx.fillStyle = "rgba(255,255,255,0.9)"; ctx.textAlign = "left";
  if (FX.shadow) { ctx.shadowColor = "rgba(0,0,0,0.45)"; ctx.shadowBlur = 3 * U; }
  [20, 25, 30, 35].forEach(T => ctx.fillText(String(T), x + w * 0.62, yT(T)));
  ctx.font = `700 ${Math.max(11, 13 * U)}px "Zen Kaku Gothic New", sans-serif`;
  ctx.textAlign = "center";
  ctx.fillText(`${Tw.toFixed(1)}℃`, x, top + h + 14 * U);
  ctx.restore();
}

/* ---------------- 24時間計 ---------------- */
// 時針の角度(度)。0時を真上として時計回り、24時間で360度。分に応じて連続的に進む。
export function clockHourAngle(h, m){ return ((h + m / 60) / 24) * 360; }
export function drawClock(){
  // 左下。温度計と同じ x。半径 28U、下端は水槽の底から 18U 上。U = min(W/1000, H/625) なので
  // 上端(吸盤込み)H-85U は常に H*0.864 以下 → 温度計の℃ラベル(下端 約 0.585H+21U ≒ 0.62H 以下)と重ならない。
  // 位置・大きさは clockGeom() と共通(ui.js が透明なボタンを重ねる)。時間経過が OFF のときはグレー系で淡く描く(針は動く)。
  const { x, y, r } = clockGeom(), on = agingOn;
  const now = new Date(), ang = clockHourAngle(now.getHours(), now.getMinutes()) * Math.PI / 180;
  const at = (a, d) => [x + Math.sin(a) * d, y - Math.cos(a) * d];
  ctx.save();
  // 吸盤
  ctx.fillStyle = on ? "rgba(235,245,245,0.45)" : "rgba(215,218,218,0.4)";
  ctx.beginPath(); ctx.ellipse(x, y - r - 3 * U, 9 * U, 5 * U, 0, 0, TAU); ctx.fill();
  // 文字盤(半透明のガラス)
  ctx.beginPath(); ctx.arc(x, y, r, 0, TAU);
  ctx.fillStyle = on ? "rgba(245,250,250,0.32)" : "rgba(222,224,224,0.66)"; ctx.fill();
  ctx.strokeStyle = on ? "rgba(255,255,255,0.8)" : "rgba(150,155,155,0.85)"; ctx.lineWidth = 1.5 * U; ctx.stroke();
  // 目盛(1時間ごと、6時間ごとは太く長く)
  ctx.strokeStyle = on ? "rgba(30,40,40,0.75)" : "rgba(70,76,76,0.8)"; ctx.lineCap = "round";
  for (let i = 0; i < 24; i++) {
    const a = i / 24 * TAU, big = i % 6 === 0;
    const [x0, y0] = at(a, r * (big ? 0.76 : 0.85)), [x1, y1] = at(a, r * 0.94);
    ctx.lineWidth = big ? 1.4 * U : 0.7 * U;
    ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
  }
  // 数字(0・6・12・18)
  ctx.fillStyle = on ? "rgba(20,30,30,0.9)" : "rgba(60,66,66,0.9)";
  ctx.font = `600 ${Math.max(8, 8.5 * U)}px "Zen Kaku Gothic New", sans-serif`; ctx.textAlign = "center"; ctx.textBaseline = "middle";
  [0, 6, 12, 18].forEach(hh => { const [tx, ty] = at(hh / 24 * TAU, r * 0.55); ctx.fillText(String(hh), tx, ty); });
  // 時針(1本のみ)
  const [hx, hy] = at(ang, r * 0.7), hc = on ? "#d8322b" : "#4a5050";
  if (!on) { // OFF:明るい縁取りで、昼夜どちらの背景でも針を読めるようにする
    ctx.strokeStyle = "rgba(240,243,243,0.85)"; ctx.lineWidth = 4.2 * U;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(hx, hy); ctx.stroke();
  }
  ctx.strokeStyle = hc; ctx.lineWidth = 2 * U;
  ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(hx, hy); ctx.stroke();
  ctx.fillStyle = hc; ctx.beginPath(); ctx.arc(x, y, 2.2 * U, 0, TAU); ctx.fill();
  ctx.restore();
}
/* 24時間計の中心と半径(論理座標。canvas の CSS サイズと同じ単位) */
export function clockGeom(){ return { x: W * 0.045, y: H - 46 * U, r: 28 * U }; }

/* ---------------- 酸素メーター ---------------- */
// 24時間計の右隣。溶存酸素 DO(mg/L)を、下が開いた 270° の目盛りの針で示す。針の角度は Canvas の角度(右=0°、時計回り):
// 135°(左下)= 0 mg/L 〜 405°(右下)= 10 mg/L。DO が減ると針は左回り。範囲外は 0〜10 に丸める。
export function o2NeedleAngle(d){ return 135 + 270 * clamp(d, 0, 10) / 10; }
// 扇形の色の位置(mg/L)。7〜10 青 / 4.5 黄(低酸素行動の始まり)/ 0〜2 赤(3 未満で体調低下)。間は滑らかに
const O2_STOPS = [[0, "#e0645c"], [2, "#e0645c"], [4.5, "#f1d25c"], [7, "#4aa3df"], [10, "#4aa3df"]];
function o2ColorAt(d){
  for (let i = 1; i < O2_STOPS.length; i++) if (d <= O2_STOPS[i][0]) {
    const [d0, c0] = O2_STOPS[i - 1], [d1, c1] = O2_STOPS[i];
    return mix(c0, c1, d1 > d0 ? (d - d0) / (d1 - d0) : 1);
  }
  return O2_STOPS[O2_STOPS.length - 1][1];
}
// 位置・大きさ:時計と同じ高さ・同じ半径で、中心を時計の中心の 66U 右(縁の間に約 10U)
export function meterGeom(){ const c = clockGeom(); return { x: c.x + 66 * U, y: c.y, r: c.r }; }
let meter = null; // { cv, ox, oy }:文字盤の作り置き(resize のたびに buildMeter が作り直す)
export function buildMeter(){
  const { x, y, r } = meterGeom();
  const pad = 2 * U, top = r + 9 * U; // 文字盤の中心から作り置きの上端までの距離(吸盤の分を含む)
  const lw = Math.ceil(2 * (r + pad)), lh = Math.ceil(top + r + pad);
  const cv = document.createElement("canvas");
  cv.width = Math.round(lw * DPR); cv.height = Math.round(lh * DPR);
  const g = cv.getContext("2d");
  g.scale(DPR, DPR);
  const cx = lw / 2, cy = top;
  // 吸盤・文字盤(半透明のガラス)・縁は時計(ON)と同じ
  g.fillStyle = "rgba(235,245,245,0.45)";
  g.beginPath(); g.ellipse(cx, cy - r - 3 * U, 9 * U, 5 * U, 0, 0, TAU); g.fill();
  g.beginPath(); g.arc(cx, cy, r, 0, TAU);
  g.fillStyle = "rgba(245,250,250,0.32)"; g.fill();
  g.strokeStyle = "rgba(255,255,255,0.8)"; g.lineWidth = 1.5 * U; g.stroke();
  // 270° の扇形(中心から 0.86r まで)を、多い方(右下・青)から少ない方(左下・赤)へ塗る
  const a0 = 135 * Math.PI / 180, a1 = 405 * Math.PI / 180, fr = r * 0.86;
  g.globalAlpha = 0.82;
  const cg = typeof g.createConicGradient === "function" ? g.createConicGradient(a0, cx, cy) : null;
  if (cg && typeof cg.addColorStop === "function") {
    // 円錐グラデーションの位置は「1 周(360°)に対する割合」。扇形は 270° なので DO d の位置は 0.75 * d / 10
    O2_STOPS.forEach(([d, c]) => cg.addColorStop(0.75 * d / 10, c));
    g.fillStyle = cg;
    g.beginPath(); g.moveTo(cx, cy); g.arc(cx, cy, fr, a0, a1); g.closePath(); g.fill();
  } else {
    // 代替(createConicGradient がない環境):2° ずつの細い扇形で塗る。継ぎ目が出ないよう少し重ねる
    const n = 135, da = (a1 - a0) / n;
    for (let i = 0; i < n; i++) {
      g.fillStyle = o2ColorAt((i + 0.5) / n * 10);
      g.beginPath(); g.moveTo(cx, cy); g.arc(cx, cy, fr, a0 + i * da, a0 + (i + 1) * da + 0.012); g.closePath(); g.fill();
    }
  }
  g.globalAlpha = 1;
  // 扇形の縁(うすい白)
  g.strokeStyle = "rgba(255,255,255,0.55)"; g.lineWidth = 0.8 * U; g.lineJoin = "round";
  g.beginPath(); g.moveTo(cx, cy); g.arc(cx, cy, fr, a0, a1); g.closePath(); g.stroke();
  // 文字(中央下の開いた部分)
  g.fillStyle = "rgba(20,30,30,0.9)";
  g.font = `600 ${Math.max(8, 8.5 * U)}px "Zen Kaku Gothic New", sans-serif`; g.textAlign = "center"; g.textBaseline = "middle";
  g.fillText("O₂", cx, cy + r * 0.66);
  meter = { cv, ox: x - cx, oy: y - cy };
}
export function drawO2Meter(){
  if (!meter) return;
  const { x, y, r } = meterGeom();
  ctx.save();
  ctx.drawImage(meter.cv, meter.ox, meter.oy, meter.cv.width / DPR, meter.cv.height / DPR);
  // 針:時計の時針と同じ太さ(2U)。扇形のどの色の上でも読めるよう、濃い色に明るい縁取りを付ける
  const a = o2NeedleAngle(DO) * Math.PI / 180, nx = x + Math.cos(a) * r * 0.72, ny = y + Math.sin(a) * r * 0.72;
  ctx.lineCap = "round";
  ctx.strokeStyle = "rgba(240,243,243,0.85)"; ctx.lineWidth = 4.2 * U;
  ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(nx, ny); ctx.stroke();
  ctx.strokeStyle = "#364242"; ctx.lineWidth = 2 * U;
  ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(nx, ny); ctx.stroke();
  ctx.fillStyle = "#364242"; ctx.beginPath(); ctx.arc(x, y, 2.2 * U, 0, TAU); ctx.fill();
  ctx.restore();
}

/* ---------------- ガラスの映り込み ---------------- */
function nightGrade(n){
  ctx.save();
  ctx.globalAlpha = n;
  // LEDの光は上から届き、下や端ほど暗くなる(作り置きの暗幕を multiply で 1 回)
  ctx.globalCompositeOperation = "multiply";
  ctx.drawImage(lit.nightMul, 0, waterTop, W, H - waterTop);
  // 上は青白く明るく、下は暗い青へ(soft-light を 1 回)
  ctx.globalCompositeOperation = "soft-light";
  ctx.fillStyle = lit.g.nightSL; ctx.fillRect(0, waterTop, W, H - waterTop);
  ctx.restore();
}
export function drawFixture(t){
  const n = nightT, x0 = W * 0.05, x1 = W * 0.95, y0 = waterTop * 0.12, h = waterTop * 0.46;
  ctx.save();
  // 脚
  ctx.fillStyle = mix("#6d7373", "#2a3033", n);
  ctx.fillRect(x0 + 6 * U, y0 + h, 4 * U, waterTop - y0 - h); ctx.fillRect(x1 - 10 * U, y0 + h, 4 * U, waterTop - y0 - h);
  // 本体
  const g = ctx.createLinearGradient(0, y0, 0, y0 + h);
  g.addColorStop(0, mix("#8d9495", "#3a4245", n)); g.addColorStop(1, mix("#5a6062", "#1c2224", n));
  ctx.fillStyle = g;
  ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(x0, y0, x1 - x0, h, h * 0.4); else ctx.rect(x0, y0, x1 - x0, h); ctx.fill();
  // 発光面
  const sh = Math.max(1.5, h * 0.3);
  ctx.fillStyle = mix("#c3c7c6", "#ffffff", n);
  ctx.fillRect(x0 + h * 0.5, y0 + h - sh, x1 - x0 - h, sh);
  if (n > 0.01) {
    ctx.globalCompositeOperation = "screen";
    const glow = ctx.createLinearGradient(0, y0 + h, 0, waterTop + 26 * U);
    glow.addColorStop(0, `rgba(235,245,255,${0.75 * n})`); glow.addColorStop(1, "rgba(235,245,255,0)");
    ctx.fillStyle = glow; ctx.fillRect(x0, y0 + h - sh, x1 - x0, waterTop + 26 * U - y0 - h + sh);
    ctx.fillStyle = `rgba(255,255,255,${0.9 * n})`;
    const step = 22 * U;
    for (let x = x0 + h; x < x1 - h * 0.5; x += step) { ctx.beginPath(); ctx.arc(x, y0 + h - sh / 2, Math.max(1, sh * 0.45), 0, TAU); ctx.fill(); }
  }
  ctx.restore();
}
export function drawGlass(){
  let g = ctx.createLinearGradient(0, 0, W * 0.1, 0);
  g.addColorStop(0, "rgba(255,255,255,0.1)"); g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g; ctx.fillRect(0, 0, W * 0.1, H);
  ctx.fillStyle = "rgba(255,255,255,0.05)";
  ctx.beginPath(); ctx.moveTo(W * 0.78, 0); ctx.lineTo(W * 0.84, 0); ctx.lineTo(W * 0.7, H); ctx.lineTo(W * 0.67, H); ctx.closePath(); ctx.fill();
  g = ctx.createRadialGradient(W / 2, H * 0.42, Math.min(W, H) * 0.45, W / 2, H * 0.42, Math.max(W, H) * 0.78);
  g.addColorStop(0, "rgba(5,35,40,0)"); g.addColorStop(1, "rgba(5,35,40,0.2)");
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
}
export function grade(){
  if (nightT > 0.001 && FX.gradeNight) nightGrade(nightT);
  if (nightT > 0.999 || !FX.gradeDay) return;
  ctx.save();
  ctx.globalAlpha = 1 - nightT;
  ctx.globalCompositeOperation = "soft-light";
  ctx.fillStyle = lit.g.daySL; ctx.fillRect(0, 0, W, H);
  ctx.globalCompositeOperation = "screen";
  ctx.fillStyle = lit.g.dayGlow; ctx.fillRect(0, 0, W, H * 0.6);
  ctx.restore();
}

/* ---------------- エアストーン・泡・浮遊物 ---------------- */
export function spawnBubble(x, y, r){ if (bubbles.length < 220) bubbles.push({ x, y, r, vy: -(35 + Math.random() * 25) * U, k: Math.random() * 10 }); }
function airstone(){ const x = W * 0.93; return { x, y: sandY(x) + 6 * U }; }
export function updateBubbles(dt, t){
  const a = airstone();
  if (Math.random() < dt * 14) spawnBubble(a.x + (Math.random() - 0.5) * 8 * U, a.y - 4 * U, (1.2 + Math.random() * 2.6) * U);
  for (let i = bubbles.length - 1; i >= 0; i--) {
    const b = bubbles[i];
    b.y += b.vy * dt; b.x += Math.sin(t * 5 + b.k) * 12 * U * dt + current(b.x, t) * 6 * U * dt;
    b.r *= 1 + dt * 0.04;
    if (b.y < waterTop + 2 * U) bubbles.splice(i, 1);
  }
}
/* 砂煙:コリドラスが砂をつつくと舞う、やわらかい粒(数粒が上へ舞って消える) */
export function spawnPuff(x, y){
  if (!FX.puff || puffs.length >= 60) return;
  puffs.push({ x, y, vx: (Math.random() - 0.5) * 14 * U, vy: -(8 + Math.random() * 10) * U, r: (1.2 + Math.random() * 1.4) * U, age: 0, life: 1.1 + Math.random() * 0.9 });
}
export function updatePuffs(dt, t){
  for (let i = puffs.length - 1; i >= 0; i--) {
    const p = puffs[i]; p.age += dt;
    if (p.age >= p.life) { puffs.splice(i, 1); continue; }
    p.vy *= Math.exp(-dt * 1.2); p.x += (p.vx + current(p.x, t) * 5 * U) * dt; p.y += p.vy * dt; p.vx *= Math.exp(-dt * 1.5);
  }
}
export function drawPuffs(){
  if (!puffs.length) return;
  ctx.save();
  puffs.forEach(p => {
    const k = p.age / p.life;
    ctx.fillStyle = `rgba(222,205,160,${0.5 * (1 - k) * Math.min(1, p.age * 6)})`;
    ctx.beginPath(); ctx.arc(p.x, p.y, p.r * (1 + k * 0.8), 0, TAU); ctx.fill();
  });
  ctx.restore();
}
export function drawBubbles(){
  const a = airstone();
  ctx.strokeStyle = "rgba(210,230,230,0.28)"; ctx.lineWidth = 2 * U;
  ctx.beginPath(); ctx.moveTo(a.x + 6 * U, a.y); ctx.lineTo(a.x + 12 * U, waterTop - 8 * U); ctx.stroke();
  ctx.fillStyle = "#8d8a80"; ctx.beginPath(); ctx.ellipse(a.x, a.y, 11 * U, 5 * U, 0, 0, TAU); ctx.fill();
  bubbles.forEach(b => {
    ctx.strokeStyle = "rgba(255,255,255,0.55)"; ctx.lineWidth = 0.8 * U;
    ctx.fillStyle = "rgba(230,250,250,0.18)";
    ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, TAU); ctx.fill(); ctx.stroke();
    ctx.fillStyle = "rgba(255,255,255,0.8)"; ctx.beginPath(); ctx.arc(b.x - b.r * 0.35, b.y - b.r * 0.35, b.r * 0.28, 0, TAU); ctx.fill();
  });
}
/* ---------------- 軽量モードの作り置き(liteOn のときだけ main.js が使う) ----------------
   描画するパスの数を減らすため、(1) 動かない物(流木・岩・こけ・岩流木の苔)、(2) 水草(奥・中景・前景)、(3) 泡を、
   作り置きの画像として貼る。全面のオフスクリーンは W*DPR × H*DPR(貼るときは 1:1 なのでぼやけない)。
   画像は不透明な物体を不透明のまま焼いたもの(drawImage は globalAlpha=1)。resize(buildScene)と通常モードへの切り替えで捨てる。
   トップレベルでは何も作らない(必要になった最初の呼び出しで作る)。 */
const LITE = { layers: {}, bub: null };
export function liteRelease(){ LITE.layers = {}; LITE.bub = null; }
export const liteActive = () => Object.keys(LITE.layers).length > 0 || !!LITE.bub;
/* 層ごとの作り置きの状態(テスト・計測用):{ 名前: { calls: 貼った回数, redraws: 描き直した回数 } } */
export const liteStats = () => Object.fromEntries(Object.entries(LITE.layers).map(([k, L]) => [k, { calls: L.calls, redraws: L.redraws }]));
/* name の全面オフスクリーンを貼る。描き直すのは、初回・(every 指定なら every 回に 1 回。phase は最初の位置のずらし)・(every なしなら key が変わったとき)。
   描き直しのときだけ fn() をオフスクリーンへ向けて呼ぶ(ctx を差し替える。fn は素の ctx と U だけを使う) */
export function liteLayer(name, { key = 0, every = 0, phase = 0 } = {}, fn){
  let L = LITE.layers[name];
  if (!L) {
    const c = document.createElement("canvas"); c.width = Math.round(W * DPR); c.height = Math.round(H * DPR);
    L = LITE.layers[name] = { c, g: c.getContext("2d"), n: phase, key: undefined, fresh: true, calls: 0, redraws: 0 };
  }
  L.calls++;
  const due = L.fresh || (every ? L.n % every === 0 : key !== L.key);
  L.n++;
  if (due) {
    const orig = ctx, g = L.g;
    L.fresh = false; L.key = key; L.redraws++;
    setCtx(g);
    try {
      g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, L.c.width, L.c.height);
      g.setTransform(DPR, 0, 0, DPR, 0, 0); g.globalAlpha = 1;
      fn();
    } finally { setCtx(orig); }
  }
  ctx.drawImage(L.c, 0, 0, W, H);
}
/* 動かない物(流木・岩・こけ・岩流木の苔)。苔の量は 1/512 刻みで量子化し、変わったときだけ描き直す(時間で動く要素はない) */
export function drawHardLite(){
  liteLayer("hard", { key: Math.round(algaeHard * 512) }, () => { drawWood(); rocks.forEach(drawRock); drawMoss(); drawAgingHard(); });
}
/* 泡の作り置き(大きさ数段階の小さな画像)。形は drawBubbles と同じ(薄い塗り・縁・ハイライト) */
const BUB_K = [1.2, 1.8, 2.7, 4, 6];
function bubbleSprites(){
  if (LITE.bub) return LITE.bub;
  return LITE.bub = BUB_K.map(k => {
    const r = k * U, S = 2 * (r + 1 * U), [c, g] = mkCanvas(Math.max(1, Math.ceil(S * DPR)), Math.max(1, Math.ceil(S * DPR)));
    g.scale(c.width / S, c.height / S); // 画素にぴったり合わせる(S は小数のため)
    g.strokeStyle = "rgba(255,255,255,0.55)"; g.lineWidth = 0.8 * U; g.fillStyle = "rgba(230,250,250,0.18)";
    g.beginPath(); g.arc(S / 2, S / 2, r, 0, TAU); g.fill(); g.stroke();
    g.fillStyle = "rgba(255,255,255,0.8)"; g.beginPath(); g.arc(S / 2 - r * 0.35, S / 2 - r * 0.35, r * 0.28, 0, TAU); g.fill();
    return { c, r, S };
  });
}
export function drawBubblesLite(){
  const a = airstone(), sp = bubbleSprites();
  ctx.strokeStyle = "rgba(210,230,230,0.28)"; ctx.lineWidth = 2 * U;
  ctx.beginPath(); ctx.moveTo(a.x + 6 * U, a.y); ctx.lineTo(a.x + 12 * U, waterTop - 8 * U); ctx.stroke();
  ctx.fillStyle = "#8d8a80"; ctx.beginPath(); ctx.ellipse(a.x, a.y, 11 * U, 5 * U, 0, 0, TAU); ctx.fill();
  for (const b of bubbles) {
    let s = sp[0], best = Infinity;
    for (const q of sp) { const d = Math.abs(Math.log(b.r / q.r)); if (d < best) { best = d; s = q; } }
    const sz = s.S * b.r / s.r;
    ctx.drawImage(s.c, b.x - sz / 2, b.y - sz / 2, sz, sz);
  }
}
export function drawMotes(t){
  ctx.save(); ctx.globalCompositeOperation = "screen";
  const a0 = ctx.globalAlpha;
  orbs.forEach(o => {
    const x = (o.x + t * 4 * U) % W, y = o.y + Math.sin(t * 0.2 + o.k) * 15 * U;
    const a = (0.05 + 0.05 * Math.sin(t * 0.3 + o.k)) * (1 - nightT);
    if (a < 0.003) return;
    ctx.globalAlpha = a0 * a; ctx.drawImage(lit.orb, x - o.rad, y - o.rad, o.rad * 2, o.rad * 2);
  });
  ctx.globalAlpha = a0;
  motes.forEach(m => {
    let x = (m.x + t * 3 * U + Math.sin(t * 0.3 + m.k) * 20 * U) % W; if (x < 0) x += W;
    const y = m.y + Math.sin(t * 0.25 + m.k * 2) * 12 * U;
    const a = m.a * (0.35 + 1.4 * rayLight(x, y)) * (0.7 + 0.3 * Math.sin(t * 2 + m.k));
    ctx.fillStyle = nightT > 0.5 ? `rgba(235,244,255,${Math.min(0.8, a)})` : `rgba(255,252,232,${Math.min(0.8, a)})`;
    ctx.beginPath(); ctx.arc(x, y, m.s * U, 0, TAU); ctx.fill();
  });
  ctx.restore();
}
