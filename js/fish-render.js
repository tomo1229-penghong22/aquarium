// 魚の描画。描画関数は、core.js が export する ctx と U を素の名前で使う。
import { TAU, U, bottomY, ctx, lerp, nightT } from "./core.js";
import { GUPPY_COL, PLATY_COL, SPECIES } from "./species.js";

/* ---------------- 描画ヘルパ ---------------- */
function bodyPath(L, H){
  const p = new Path2D(), nx = L * 0.5, px = -L * 0.5, ph = H * 0.17;
  p.moveTo(nx, H * 0.06);
  p.bezierCurveTo(nx, -H * 0.34, L * 0.18, -H * 0.5, -L * 0.04, -H * 0.49);
  p.bezierCurveTo(-L * 0.28, -H * 0.45, px + L * 0.06, -ph * 1.05, px, -ph);
  p.lineTo(px, ph);
  p.bezierCurveTo(px + L * 0.06, ph * 1.05, -L * 0.28, H * 0.45, -L * 0.04, H * 0.49);
  p.bezierCurveTo(L * 0.18, H * 0.5, nx, H * 0.34, nx, H * 0.06);
  p.closePath(); return p;
}
function forkTail(len, s, fork){
  const p = new Path2D();
  p.moveTo(0, -s * 0.12);
  p.quadraticCurveTo(-len * 0.5, -s * 0.2, -len, -s * 0.5);
  p.quadraticCurveTo(-len * 0.8, -s * 0.12, -len * (1 - fork), 0);
  p.quadraticCurveTo(-len * 0.8, s * 0.12, -len, s * 0.5);
  p.quadraticCurveTo(-len * 0.5, s * 0.2, 0, s * 0.12);
  p.closePath(); return p;
}
function fanTail(len, s){
  const p = new Path2D();
  p.moveTo(0, -s * 0.1);
  p.quadraticCurveTo(-len * 0.4, -s * 0.22, -len, -s * 0.5);
  p.bezierCurveTo(-len * 1.16, -s * 0.2, -len * 1.16, s * 0.2, -len, s * 0.5);
  p.quadraticCurveTo(-len * 0.4, s * 0.22, 0, s * 0.1);
  p.closePath(); return p;
}
function fin(a, c, tip, b){ const p = new Path2D(); p.moveTo(a[0], a[1]); p.quadraticCurveTo(c[0], c[1], tip[0], tip[1]); p.lineTo(b[0], b[1]); p.closePath(); return p; }
function withTail(x, wag, fn){ ctx.save(); ctx.translate(x, 0); ctx.rotate(wag); ctx.transform(1, wag * 0.5, 0, 1, 0, 0); fn(); ctx.restore(); }
function shade(path, L, H, f){
  ctx.save(); ctx.clip(path);
  const g = ctx.createLinearGradient(0, -H / 2, 0, H / 2);
  g.addColorStop(0, "rgba(255,248,225,0.38)"); g.addColorStop(0.45, "rgba(255,255,255,0)"); g.addColorStop(1, "rgba(0,32,44,0.36)");
  ctx.fillStyle = g; ctx.fillRect(-L, -H * 1.5, L * 2, H * 3);
  ctx.fillStyle = "rgba(255,255,250,0.16)";
  ctx.beginPath(); ctx.ellipse(L * 0.02, -H * 0.3, L * 0.34, H * 0.09, -0.04, 0, TAU); ctx.fill();
  if (f.pale > 0.02) { ctx.fillStyle = `rgba(200,202,194,${f.pale * 0.6})`; ctx.fillRect(-L, -H * 1.5, L * 2, H * 3); }
  ctx.beginPath(); ctx.rect(-L, -H * 2, L * 2, H * 1.9); ctx.clip();
  ctx.strokeStyle = "rgba(255,250,228,0.5)"; ctx.lineWidth = Math.max(0.8, 1.5 * U); ctx.stroke(path);
  ctx.restore();
}
function finRays(len, s, n, col){
  ctx.strokeStyle = col; ctx.lineWidth = Math.max(0.5, 0.6 * U);
  for (let i = 0; i < n; i++) { const v = lerp(-0.45, 0.45, i / (n - 1)); ctx.beginPath(); ctx.moveTo(0, v * s * 0.2); ctx.lineTo(-len * 0.95, v * s); ctx.stroke(); }
}

export let EYE = null;
function eye(x, y, r, iris){
  ctx.fillStyle = iris || "#e9e4d4"; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
  let px = x + r * 0.1, py = y;
  if (EYE) { px += EYE.dx * r * 0.28; py += EYE.dy * r * 0.28 + EYE.roll * r * 1.05; }
  ctx.save(); ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.clip();
  ctx.fillStyle = "#0e1212"; ctx.beginPath(); ctx.arc(px, py, r * 0.62, 0, TAU); ctx.fill();
  ctx.restore();
  ctx.fillStyle = "rgba(255,255,255,0.85)"; ctx.beginPath(); ctx.arc(x + r * 0.28, y - r * 0.3, r * 0.22, 0, TAU); ctx.fill();
}
function pectoral(L, H, f, col){
  ctx.save(); ctx.translate(L * 0.14, H * 0.12); ctx.rotate(0.5 + Math.sin(f.phase * 1.6) * 0.35);
  ctx.fillStyle = col; ctx.beginPath(); ctx.ellipse(-L * 0.07, 0, L * 0.09, H * 0.12, 0, 0, TAU); ctx.fill(); ctx.restore();
}

export let BASE_A = 1;
export const PAINT = {
  neon(L, wag, f){
    const H = L * 0.27, finC = "rgba(220,230,236,0.35)";
    withTail(-L * 0.48, wag, () => { ctx.fillStyle = finC; ctx.fill(forkTail(L * 0.36, H * 1.0, 0.45)); finRays(L * 0.34, H * 0.9, 6, "rgba(255,255,255,0.22)"); });
    ctx.fillStyle = finC;
    ctx.fill(fin([-L * 0.02, -H * 0.46], [-L * 0.06, -H * 0.9], [-L * 0.16, -H * 0.85], [-L * 0.2, -H * 0.4]));
    ctx.fill(fin([-L * 0.05, H * 0.45], [-L * 0.15, H * 0.8], [-L * 0.34, H * 0.62], [-L * 0.38, H * 0.3]));
    const body = bodyPath(L, H);
    ctx.fillStyle = "#b8c2c4"; ctx.fill(body);
    ctx.save(); ctx.clip(body);
    const rg = ctx.createLinearGradient(L * 0.15, 0, -L * 0.5, 0);
    rg.addColorStop(0, "rgba(214,44,54,0)"); rg.addColorStop(0.25, "#d6323f"); rg.addColorStop(1, "#c42a36");
    ctx.fillStyle = rg; ctx.fillRect(-L * 0.6, H * 0.03, L * 0.8, H);
    const shimmer = 0.75 + 0.25 * Math.sin(f.phase * 0.5 + f.ox * 5);
    const bg = ctx.createLinearGradient(L * 0.38, 0, -L * 0.46, 0);
    bg.addColorStop(0, `rgba(110,236,255,${shimmer})`); bg.addColorStop(0.5, "#2fb4ff"); bg.addColorStop(1, "#2a6cf0");
    ctx.fillStyle = bg; ctx.beginPath();
    ctx.moveTo(L * 0.38, -H * 0.14); ctx.quadraticCurveTo(0, -H * 0.28, -L * 0.47, -H * 0.12);
    ctx.lineTo(-L * 0.47, H * 0.03); ctx.quadraticCurveTo(0, -H * 0.02, L * 0.38, H * 0.03); ctx.fill();
    ctx.restore();
    shade(body, L, H, f);
    ctx.strokeStyle = `rgba(100,225,255,${0.22 * (1 + nightT * 0.9) * shimmer * (0.4 + 0.6 * f.health)})`; ctx.lineWidth = H * 0.5; ctx.lineCap = "round";
    ctx.beginPath(); ctx.moveTo(L * 0.3, -H * 0.1); ctx.quadraticCurveTo(0, -H * 0.2, -L * 0.42, -H * 0.06); ctx.stroke();
    pectoral(L, H, f, finC);
    eye(L * 0.31, -H * 0.1, H * 0.18);
  },
  rummy(L, wag, f){
    const H = L * 0.25, finC = "rgba(225,232,232,0.4)";
    withTail(-L * 0.48, wag, () => {
      const tp = forkTail(L * 0.38, H * 1.1, 0.45), len = L * 0.38, s = H * 1.1;
      ctx.fillStyle = "rgba(245,245,240,0.85)"; ctx.fill(tp);
      ctx.save(); ctx.clip(tp); ctx.fillStyle = "#171a1a";
      ctx.fillRect(-len * 0.72, -s * 0.07, len * 0.72, s * 0.14);
      ctx.lineWidth = s * 0.1; ctx.strokeStyle = "#171a1a";
      ctx.beginPath(); ctx.moveTo(-len * 0.3, -s * 0.12); ctx.lineTo(-len * 0.8, -s * 0.36); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-len * 0.3, s * 0.12); ctx.lineTo(-len * 0.8, s * 0.36); ctx.stroke();
      ctx.restore();
    });
    ctx.fillStyle = finC;
    ctx.fill(fin([-L * 0.0, -H * 0.47], [-L * 0.05, -H * 0.95], [-L * 0.16, -H * 0.9], [-L * 0.2, -H * 0.42]));
    ctx.fill(fin([-L * 0.08, H * 0.45], [-L * 0.18, H * 0.78], [-L * 0.36, H * 0.6], [-L * 0.4, H * 0.3]));
    const body = bodyPath(L, H);
    ctx.fillStyle = "#c7cfca"; ctx.fill(body);
    ctx.save(); ctx.clip(body);
    const rg = ctx.createRadialGradient(L * 0.42, -H * 0.05, 0, L * 0.42, -H * 0.05, L * 0.34);
    rg.addColorStop(0, "rgba(212,34,40,0.95)"); rg.addColorStop(0.6, "rgba(212,34,40,0.6)"); rg.addColorStop(1, "rgba(212,34,40,0)");
    ctx.fillStyle = rg; ctx.fillRect(-L, -H, L * 2, H * 2);
    ctx.restore();
    shade(body, L, H, f);
    pectoral(L, H, f, finC);
    eye(L * 0.31, -H * 0.1, H * 0.19, "#e0625a");
  },
  guppy(L, wag, f){
    const H = L * 0.3, [c1, c2] = GUPPY_COL[f.variant % GUPPY_COL.length];
    withTail(-L * 0.46, wag * 1.2, () => {
      const ts = f.tailScale || 1, len = L * 1.0 * ts, s = L * 0.8 * ts, tp = fanTail(len, s);
      const g = ctx.createLinearGradient(0, 0, -len * 1.1, 0);
      g.addColorStop(0, c1); g.addColorStop(0.55, c1); g.addColorStop(1, c2);
      ctx.globalAlpha = BASE_A * 0.88; ctx.fillStyle = g; ctx.fill(tp); ctx.globalAlpha = BASE_A;
      ctx.save(); ctx.clip(tp); ctx.fillStyle = "rgba(20,20,30,0.55)";
      f.spots.forEach(([u, v, k]) => { ctx.beginPath(); ctx.arc(-len * u, v * s * u, 1.6 * U * k, 0, TAU); ctx.fill(); });
      ctx.strokeStyle = "rgba(255,255,255,0.18)"; ctx.lineWidth = 0.6 * U;
      for (let i = -3; i <= 3; i++) { ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(-len * 1.1, i * s * 0.15); ctx.stroke(); }
      ctx.restore();
    });
    ctx.globalAlpha = BASE_A * 0.85; ctx.fillStyle = c1;
    const dw = Math.sin(f.phase * 0.8) * L * 0.05;
    ctx.fill(fin([L * 0.02, -H * 0.45], [-L * 0.2, -H * 1.1], [-L * 0.62 + dw, -H * 1.0], [-L * 0.3, -H * 0.36]));
    ctx.globalAlpha = BASE_A;
    const body = bodyPath(L, H);
    ctx.fillStyle = "#a7ab98"; ctx.fill(body);
    ctx.save(); ctx.clip(body);
    const g = ctx.createLinearGradient(L * 0.1, 0, -L * 0.5, 0);
    g.addColorStop(0, "rgba(0,0,0,0)"); g.addColorStop(1, c1);
    ctx.globalAlpha = BASE_A * 0.75; ctx.fillStyle = g; ctx.fillRect(-L * 0.6, -H, L * 0.8, H * 2); ctx.globalAlpha = BASE_A;
    ctx.fillStyle = "rgba(120,200,230,0.35)"; ctx.beginPath(); ctx.ellipse(-L * 0.05, H * 0.05, L * 0.12, H * 0.2, 0, 0, TAU); ctx.fill();
    ctx.restore();
    shade(body, L, H, f);
    pectoral(L, H, f, "rgba(230,230,220,0.35)");
    eye(L * 0.3, -H * 0.08, H * 0.2);
  },
  platy(L, wag, f){
    const H = L * 0.42, v = PLATY_COL[f.variant % PLATY_COL.length];
    withTail(-L * 0.47, wag, () => { ctx.fillStyle = v.t; ctx.globalAlpha = BASE_A * 0.9; ctx.fill(fanTail(L * 0.34, H * 0.95)); ctx.globalAlpha = BASE_A; finRays(L * 0.34, H * 0.9, 7, "rgba(255,240,220,0.25)"); });
    ctx.fillStyle = v.b; ctx.globalAlpha = BASE_A * 0.85;
    ctx.fill(fin([L * 0.02, -H * 0.48], [-L * 0.04, -H * 0.85], [-L * 0.22, -H * 0.78], [-L * 0.3, -H * 0.38]));
    ctx.fill(fin([-L * 0.1, H * 0.45], [-L * 0.18, H * 0.7], [-L * 0.3, H * 0.6], [-L * 0.34, H * 0.33]));
    ctx.globalAlpha = BASE_A;
    const body = bodyPath(L, H);
    ctx.fillStyle = v.b; ctx.fill(body);
    ctx.save(); ctx.clip(body);
    ctx.fillStyle = "rgba(255,255,255,0.12)"; ctx.beginPath(); ctx.ellipse(0, H * 0.2, L * 0.35, H * 0.2, 0, 0, TAU); ctx.fill();
    ctx.restore();
    shade(body, L, H, f);
    pectoral(L, H, f, "rgba(255,210,170,0.45)");
    eye(L * 0.31, -H * 0.1, H * 0.15);
  },
  angel(L, wag, f){
    const H = L * 0.92, marble = f.variant === 1;
    const base = marble ? "#e6dcc2" : "#d7dbd4", finC = marble ? "rgba(225,215,190,0.55)" : "rgba(215,222,218,0.5)";
    const sway = Math.sin(f.phase * 0.9) * L * 0.06 + wag * L * 0.2;
    // 腹びれの長い糸
    ctx.strokeStyle = "rgba(220,225,220,0.7)"; ctx.lineWidth = 1.3 * U;
    ctx.beginPath(); ctx.moveTo(L * 0.18, H * 0.3); ctx.quadraticCurveTo(L * 0.1, H * 0.8, -L * 0.1 + sway, H * 1.25); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(L * 0.16, H * 0.3); ctx.quadraticCurveTo(L * 0.02, H * 0.8, -L * 0.2 + sway, H * 1.18); ctx.stroke();
    const dorsal = fin([L * 0.06, -H * 0.46], [-L * 0.18, -H * 0.95], [-L * 0.62 + sway, -H * 1.28], [-L * 0.44, -H * 0.18]);
    const anal = fin([L * 0.06, H * 0.46], [-L * 0.18, H * 0.95], [-L * 0.62 + sway, H * 1.28], [-L * 0.44, H * 0.18]);
    ctx.fillStyle = finC; ctx.fill(dorsal); ctx.fill(anal);
    withTail(-L * 0.46, wag, () => {
      ctx.fillStyle = finC; ctx.fill(fanTail(L * 0.42, H * 0.55)); finRays(L * 0.44, H * 0.5, 8, "rgba(255,255,255,0.25)");
      ctx.strokeStyle = "rgba(230,232,228,0.45)"; ctx.lineWidth = 1 * U;
      ctx.beginPath(); ctx.moveTo(-L * 0.3, -H * 0.24); ctx.lineTo(-L * 0.62, -H * 0.36); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-L * 0.3, H * 0.24); ctx.lineTo(-L * 0.62, H * 0.36); ctx.stroke();
    });
    const body = new Path2D();
    body.moveTo(L * 0.5, -H * 0.02);
    body.bezierCurveTo(L * 0.44, -H * 0.26, L * 0.16, -H * 0.5, -L * 0.06, -H * 0.5);
    body.bezierCurveTo(-L * 0.3, -H * 0.46, -L * 0.46, -H * 0.2, -L * 0.5, 0);
    body.bezierCurveTo(-L * 0.46, H * 0.2, -L * 0.3, H * 0.46, -L * 0.06, H * 0.5);
    body.bezierCurveTo(L * 0.16, H * 0.5, L * 0.44, H * 0.24, L * 0.5, -H * 0.02);
    ctx.fillStyle = base; ctx.fill(body);
    // 縦じま(ひれにも薄く続く)
    const bars = [[L * 0.3, 0.12], [L * 0.0, 0.2], [-L * 0.34, 0.12]];
    const barCol = marble ? "rgba(30,28,24,0.7)" : "rgba(28,30,30,0.82)";
    [dorsal, anal].forEach(p => { ctx.save(); ctx.clip(p); ctx.fillStyle = "rgba(30,32,32,0.35)";
      bars.slice(1).forEach(([bx, w]) => { ctx.save(); ctx.translate(bx, 0); ctx.rotate(0.25); ctx.fillRect(-L * w / 2, -H * 2, L * w, H * 4); ctx.restore(); }); ctx.restore(); });
    ctx.save(); ctx.clip(body); ctx.fillStyle = barCol;
    if (marble) {
      [[-L * 0.1, -H * 0.2, 0.2], [L * 0.1, H * 0.15, 0.14], [-L * 0.3, H * 0.1, 0.12]].forEach(([x, y, r]) => { ctx.beginPath(); ctx.ellipse(x, y, L * r, H * r * 0.9, 0.6, 0, TAU); ctx.fill(); });
      ctx.fillRect(L * 0.24, -H, L * 0.1, H * 2);
    } else {
      bars.forEach(([bx, w]) => { ctx.save(); ctx.translate(bx, 0); ctx.rotate(bx < L * 0.2 ? 0.18 : 0); ctx.fillRect(-L * w / 2, -H, L * w, H * 2); ctx.restore(); });
    }
    ctx.restore();
    shade(body, L, H * 0.9, f);
    pectoral(L, H * 0.5, f, finC);
    eye(L * 0.31, -H * 0.1, H * 0.085, "#c9433a");
  },
  cory(L, wag, f){
    const H = L * 0.36, finC = "rgba(235,232,225,0.45)";
    withTail(-L * 0.48, wag, () => {
      ctx.fillStyle = finC; ctx.fill(forkTail(L * 0.3, H * 1.05, 0.3)); finRays(L * 0.28, H * 0.95, 6, "rgba(80,70,60,0.25)");
    });
    ctx.fillStyle = "#1c1d1d";
    ctx.fill(fin([L * 0.04, -H * 0.46], [L * 0.0, -H * 1.1], [-L * 0.1, -H * 1.05], [-L * 0.2, -H * 0.42]));
    const body = new Path2D();
    body.moveTo(L * 0.5, H * 0.14);
    body.bezierCurveTo(L * 0.5, -H * 0.3, L * 0.22, -H * 0.56, -L * 0.04, -H * 0.5);
    body.bezierCurveTo(-L * 0.3, -H * 0.42, -L * 0.45, -H * 0.2, -L * 0.5, -H * 0.13);
    body.lineTo(-L * 0.5, H * 0.13);
    body.bezierCurveTo(-L * 0.3, H * 0.3, 0, H * 0.46, L * 0.3, H * 0.44);
    body.quadraticCurveTo(L * 0.48, H * 0.4, L * 0.5, H * 0.14);
    ctx.fillStyle = "#eee5d8"; ctx.fill(body);
    ctx.save(); ctx.clip(body);
    ctx.fillStyle = "#1c1d1d";
    ctx.beginPath(); ctx.ellipse(L * 0.3, -H * 0.1, L * 0.09, H * 0.34, 0.2, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.ellipse(-L * 0.4, -H * 0.02, L * 0.1, H * 0.3, 0, 0, TAU); ctx.fill();
    ctx.strokeStyle = "rgba(90,80,70,0.25)"; ctx.lineWidth = 0.8 * U;
    ctx.beginPath(); ctx.moveTo(L * 0.2, 0); ctx.lineTo(-L * 0.45, 0); ctx.stroke();
    for (let i = 0; i < 6; i++) { const x = L * 0.12 - i * L * 0.1; ctx.beginPath(); ctx.moveTo(x, -H * 0.4); ctx.lineTo(x - L * 0.03, H * 0.4); ctx.stroke(); }
    ctx.restore();
    shade(body, L, H, f);
    ctx.strokeStyle = "rgba(230,220,200,0.8)"; ctx.lineWidth = 0.9 * U;
    const bw = Math.sin(f.phase * 2) * 0.1;
    ctx.beginPath(); ctx.moveTo(L * 0.45, H * 0.3); ctx.lineTo(L * 0.52, H * (0.55 + bw)); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(L * 0.42, H * 0.34); ctx.lineTo(L * 0.46, H * (0.6 - bw)); ctx.stroke();
    pectoral(L, H, f, finC);
    eye(L * 0.3, -H * 0.1, H * 0.13, "#8a8f86");
  },
  /* 仮の描画(N1。N2 で本描画に置き換える):体長 L の楕円 1 つだけ */
  oto(L, wag, f){ placeholder(L, 0.2, "#8c8a6a"); },
  shrimp(L, wag, f){ placeholder(L, 0.16, "#b9c3b4"); },
  snail(L, wag, f){ placeholder(L, 0.5, "#7a6a4a"); },
};
function placeholder(L, hr, col){
  ctx.fillStyle = col; ctx.beginPath(); ctx.ellipse(0, 0, L * 0.5, L * hr, 0, 0, TAU); ctx.fill();
}

export function drawFish(f){
  const S = SPECIES[f.sp];
  const L = S.len * U * f.scale * (0.72 + 0.38 * f.z);
  const wag = Math.sin(f.phase) * S.wag * (0.45 + 0.55 * Math.min(1, (f.speedNow || 0) / (S.speed * U)));
  const dir = f.flip >= 0 ? 1 : -1;
  const fy = bottomY(f.x, f.z), gap = fy - f.y;
  if (gap < 110 * U) {
    ctx.fillStyle = `rgba(20,50,45,${0.16 * (1 - gap / (110 * U))})`;
    ctx.beginPath(); ctx.ellipse(f.x, fy - 3 * U, L * 0.5, L * 0.09, 0, 0, TAU); ctx.fill();
  }
  ctx.save();
  ctx.translate(f.x, f.y);
  ctx.rotate((f.pitch + f.tilt) * dir);
  ctx.scale(dir * Math.max(0.1, Math.abs(f.flip)), 1);
  BASE_A = S.alpha; ctx.globalAlpha = BASE_A;
  PAINT[f.sp](L, wag, f);
  ctx.restore(); BASE_A = 1;
}

/* ---- セッター(EYE と BASE_A はポップアップからも設定する) ---- */
export function setEye(v){ EYE = v; }
export function setBaseA(v){ BASE_A = v; }
