// 水槽の情景(配置・水草・光・水面・温度計・ガラス・エアストーン・泡)の生成と描画。
import { DPR, H, TAU, Tw, U, W, clamp, ctx, current, lerp, mix, mulberry, nightT, noise1, sandY, waterTop } from "./core.js";
import { agingOn } from "./aging.js";

/* ---- 情景の状態(buildScene が作り直す) ---- */
export let staticNight = null, staticLayer = null, plants = { back: [], mid: [], front: [] }, rocks = [];
let rays = [], motes = [];
export const bubbles = [];
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
        phase: r() * 10, c: mix("#3c7a31", "#5c9a3f", r()) });
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
      c1: "#4f8a38", c2: "#a6d46a", tw: 0, flat: true });
    plants.front.push({ type: "tuft", blades });
  }
  for (let i = 0; i < 16; i++) {
    const cx = W * (0.02 + r() * 0.96), baseY = sandY(cx) + (48 + r() * 30) * U, leaves = [];
    for (let j = 0; j < 14; j++) leaves.push([(r() - 0.5) * 48 * U, -r() * 12 * U, (3.5 + r() * 2.5) * U, r() * TAU, mix("#4f9a3c", "#8fcf5a", r())]);
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
      phase: r() * 10, c: mix("#2e6a33", "#4d8d3f", r()) });
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
    for (let j = 0; j < nl; j++) leaves.push([(r() - 0.5) * 50 * U, (7 + r() * 6) * U, mix("#5d9e3c", "#9fd062", r())]);
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
function spine(p, t){
  const pts = [];
  let x = p.x, y = p.y;
  const seg = p.h / p.n;
  pts.push([x, y, -Math.PI / 2 + p.lean]);
  for (let i = 1; i <= p.n; i++) {
    const s = i / p.n;
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
  const pts = spine(p, t), n = pts.length, L = [], R = [];
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
  const pts = spine(p, t);
  ctx.strokeStyle = p.stemC; ctx.lineWidth = 2 * U; ctx.lineCap = "round";
  ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  ctx.stroke();
  for (let i = 2; i < pts.length; i += 1) {
    const s = i / p.n, [x, y, a] = pts[i];
    const len = p.leaf * (1.05 - 0.45 * s);
    ctx.fillStyle = mix(p.c1, p.c2, Math.pow(s, 1.6));
    for (const side of [-1, 1]) {
      const la = a + side * (1.05 - 0.25 * s) + Math.sin(t * 1.3 + i + p.phase) * 0.06;
      ctx.beginPath();
      ctx.ellipse(x + Math.cos(la) * len * 0.5, y + Math.sin(la) * len * 0.5, len * 0.5, len * 0.15, la, 0, TAU);
      ctx.fill();
    }
  }
}
function drawLeaf(bx, by, l, t, flex, pet, cBase, cTip){
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
  g.addColorStop(0, cBase); g.addColorStop(0.5, l.c); g.addColorStop(1, cTip);
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
}
export function drawSword(p, t){ p.leaves.forEach(l => drawLeaf(p.x, p.y, l, t, 0.14, 0.25, "#2c5c27", "#8cc866")); }
export function drawFern(p, t){ p.leaves.forEach(l => drawLeaf(l.bx, l.by, l, t, 0.2, 0.05, "#244f28", "#7fbe5e")); }
export function drawLotus(p, t){
  p.leaves.forEach(l => {
    const pts = spine({ x: p.x, y: p.y, h: l.len, n: 8, lean: l.ang, flex: 0.2, phase: l.phase }, t);
    ctx.strokeStyle = "rgba(150,80,65,0.9)"; ctx.lineWidth = 1.7 * U;
    ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]); ctx.stroke();
    const [x, y, a] = pts[pts.length - 1];
    ctx.save(); ctx.translate(x, y); ctx.rotate(a + l.tilt + Math.sin(t * 0.8 + l.phase) * 0.08);
    const bw = l.w, bh = l.w * 0.6;
    const leaf = new Path2D();
    leaf.moveTo(bw * 0.06, 0);
    leaf.bezierCurveTo(-bw * 0.12, -bh * 0.9, bw * 0.75, -bh * 1.0, bw, 0);
    leaf.bezierCurveTo(bw * 0.75, bh * 1.0, -bw * 0.12, bh * 0.9, bw * 0.06, 0);
    const g = ctx.createLinearGradient(0, -bh, bw, bh);
    g.addColorStop(0, "#e7866a"); g.addColorStop(0.5, "#c24d44"); g.addColorStop(1, "#8e2f33");
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
    fl.leaves.forEach(([dx, r, c]) => {
      const lx = x + dx, ly = surfaceY(lx, t) + 1.5 * U;
      ctx.fillStyle = "rgba(40,80,40,0.8)"; ctx.beginPath(); ctx.ellipse(lx, ly + 1.2 * U, r, r * 0.28, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = c; ctx.beginPath(); ctx.ellipse(lx, ly, r, r * 0.26, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = "rgba(240,255,210,0.55)"; ctx.beginPath(); ctx.ellipse(lx - r * 0.2, ly - r * 0.08, r * 0.5, r * 0.07, 0, 0, TAU); ctx.fill();
    });
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
// 一度だけ使う画素計算(元の computeCaustics と同じ式。タイルの継ぎ目が出ないよう、明示の px/py は定数 -250 にして周期にした)
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
  ctx.shadowColor = "rgba(0,0,0,0.45)"; ctx.shadowBlur = 3 * U;
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
  if (nightT > 0.001) nightGrade(nightT);
  if (nightT > 0.999) return;
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
