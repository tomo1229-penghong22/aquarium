// 魚の描画。描画関数は、core.js が export する ctx と U を素の名前で使う。
import { DPR, TAU, U, bottomY, clamp, ctx, lerp, nightT, setCtx } from "./core.js";
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
function withTail(x, wag, fn){ ctx.save(); ctx.translate(x, 0); ctx.rotate(wag); ctx.transform(1, wag * 0.5, 0, 1, 0, 0); finOn(); fn(); ctx.restore(); bodyOn(); } // 尾びれは膜(半透明)
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
  ctx.save(); ctx.translate(L * 0.14, H * 0.12); ctx.rotate(0.5 + Math.sin(f.phase * 1.6) * 0.35); finOn(1, "finNear"); // 胸びれは膜(半透明)
  ctx.fillStyle = col; ctx.beginPath(); ctx.ellipse(-L * 0.07, 0, L * 0.09, H * 0.12, 0, 0, TAU); ctx.fill(); ctx.restore(); bodyOn();
}

/* 透明度の規則:体は不透明(BODY_A。ふだん 1。出現・消滅のフェードの間だけ下げる)、ひれ・尾の膜だけ半透明(BASE_A = finAlpha × フェード)。
   ひれを描く部分だけ ctx.globalAlpha = BASE_A、体を描く部分は ctx.globalAlpha = BODY_A にする。自分の体の奥にあるひれは、体より先に描いて体で隠す。 */
export let BASE_A = 1, BODY_A = 1;
/* 透明度の切り替え(テストの監査用に、種類を AUDIT.hook へ知らせる。通常は何もしない)
   "fin":体の奥にあるひれ・尾(体より先に描く) / "finNear":体の手前の胸びれ / "body":体 */
export const AUDIT = { hook: null };
function finOn(m = 1, tag = "fin"){ ctx.globalAlpha = BASE_A * m; if (AUDIT.hook) AUDIT.hook(tag); }
function bodyOn(){ ctx.globalAlpha = BODY_A; if (AUDIT.hook) AUDIT.hook("body"); }
export const PAINT = {
  neon(L, wag, f){
    const H = L * 0.27, finC = "rgba(220,230,236,0.35)";
    withTail(-L * 0.48, wag, () => { ctx.fillStyle = finC; ctx.fill(forkTail(L * 0.36, H * 1.0, 0.45)); finRays(L * 0.34, H * 0.9, 6, "rgba(255,255,255,0.22)"); });
    finOn(); ctx.fillStyle = finC;
    ctx.fill(fin([-L * 0.02, -H * 0.46], [-L * 0.06, -H * 0.9], [-L * 0.16, -H * 0.85], [-L * 0.2, -H * 0.4]));
    ctx.fill(fin([-L * 0.05, H * 0.45], [-L * 0.15, H * 0.8], [-L * 0.34, H * 0.62], [-L * 0.38, H * 0.3]));
    bodyOn();
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
    finOn(); ctx.fillStyle = finC;
    ctx.fill(fin([-L * 0.0, -H * 0.47], [-L * 0.05, -H * 0.95], [-L * 0.16, -H * 0.9], [-L * 0.2, -H * 0.42]));
    ctx.fill(fin([-L * 0.08, H * 0.45], [-L * 0.18, H * 0.78], [-L * 0.36, H * 0.6], [-L * 0.4, H * 0.3]));
    bodyOn();
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
    finOn(0.85); ctx.fillStyle = c1;
    const dw = Math.sin(f.phase * 0.8) * L * 0.05;
    ctx.fill(fin([L * 0.02, -H * 0.45], [-L * 0.2, -H * 1.1], [-L * 0.62 + dw, -H * 1.0], [-L * 0.3, -H * 0.36]));
    bodyOn();
    const body = bodyPath(L, H);
    ctx.fillStyle = "#a7ab98"; ctx.fill(body);
    ctx.save(); ctx.clip(body);
    const g = ctx.createLinearGradient(L * 0.1, 0, -L * 0.5, 0);
    const n1 = parseInt(c1.slice(1), 16); // 体の色むらは、色そのものの透明度で重ねる(体の塗りの globalAlpha は 1 のまま)
    g.addColorStop(0, "rgba(0,0,0,0)"); g.addColorStop(1, `rgba(${n1 >> 16 & 255},${n1 >> 8 & 255},${n1 & 255},0.75)`);
    ctx.fillStyle = g; ctx.fillRect(-L * 0.6, -H, L * 0.8, H * 2);
    ctx.fillStyle = "rgba(120,200,230,0.35)"; ctx.beginPath(); ctx.ellipse(-L * 0.05, H * 0.05, L * 0.12, H * 0.2, 0, 0, TAU); ctx.fill();
    ctx.restore();
    shade(body, L, H, f);
    pectoral(L, H, f, "rgba(230,230,220,0.35)");
    eye(L * 0.3, -H * 0.08, H * 0.2);
  },
  platy(L, wag, f){
    const H = L * 0.42, v = PLATY_COL[f.variant % PLATY_COL.length];
    withTail(-L * 0.47, wag, () => { ctx.fillStyle = v.t; ctx.globalAlpha = BASE_A * 0.9; ctx.fill(fanTail(L * 0.34, H * 0.95)); ctx.globalAlpha = BASE_A; finRays(L * 0.34, H * 0.9, 7, "rgba(255,240,220,0.25)"); });
    finOn(0.85); ctx.fillStyle = v.b;
    ctx.fill(fin([L * 0.02, -H * 0.48], [-L * 0.04, -H * 0.85], [-L * 0.22, -H * 0.78], [-L * 0.3, -H * 0.38]));
    ctx.fill(fin([-L * 0.1, H * 0.45], [-L * 0.18, H * 0.7], [-L * 0.3, H * 0.6], [-L * 0.34, H * 0.33]));
    bodyOn();
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
    // 腹びれの長い糸(ひれ:半透明)
    finOn(); ctx.strokeStyle = "rgba(220,225,220,0.7)"; ctx.lineWidth = 1.3 * U;
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
    // ひれの縦じま(体より先に描く:体の奥のひれは体で隠れる)
    const bars = [[L * 0.3, 0.12], [L * 0.0, 0.2], [-L * 0.34, 0.12]];
    finOn();
    [dorsal, anal].forEach(p => { ctx.save(); ctx.clip(p); ctx.fillStyle = "rgba(30,32,32,0.35)";
      bars.slice(1).forEach(([bx, w]) => { ctx.save(); ctx.translate(bx, 0); ctx.rotate(0.25); ctx.fillRect(-L * w / 2, -H * 2, L * w, H * 4); ctx.restore(); }); ctx.restore(); });
    bodyOn();
    const body = new Path2D();
    body.moveTo(L * 0.5, -H * 0.02);
    body.bezierCurveTo(L * 0.44, -H * 0.26, L * 0.16, -H * 0.5, -L * 0.06, -H * 0.5);
    body.bezierCurveTo(-L * 0.3, -H * 0.46, -L * 0.46, -H * 0.2, -L * 0.5, 0);
    body.bezierCurveTo(-L * 0.46, H * 0.2, -L * 0.3, H * 0.46, -L * 0.06, H * 0.5);
    body.bezierCurveTo(L * 0.16, H * 0.5, L * 0.44, H * 0.24, L * 0.5, -H * 0.02);
    ctx.fillStyle = base; ctx.fill(body);
    // 体の縦じま
    const barCol = marble ? "rgba(30,28,24,0.7)" : "rgba(28,30,30,0.82)";
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
    finOn(); ctx.fillStyle = "#1c1d1d";
    ctx.fill(fin([L * 0.04, -H * 0.46], [L * 0.0, -H * 1.1], [-L * 0.1, -H * 1.05], [-L * 0.2, -H * 0.42]));
    bodyOn();
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
  /* お掃除生体(横向き。原点は体の中心、頭は +x)。足元までの距離は GROUND(体長 L の倍率) */
  oto(L, wag, f){
    const H = L * 0.2, finC = "rgba(205,196,175,0.5)";
    withTail(-L * 0.48, wag, () => { ctx.fillStyle = finC; ctx.fill(forkTail(L * 0.24, H * 1.1, 0.2)); finRays(L * 0.22, H, 4, "rgba(80,66,48,0.22)"); });
    finOn(); ctx.fillStyle = finC;
    ctx.fill(fin([L * 0.02, -H * 0.45], [-L * 0.02, -H * 0.95], [-L * 0.12, -H * 0.85], [-L * 0.14, -H * 0.42]));
    bodyOn();
    const body = bodyPath(L, H);
    ctx.fillStyle = "#ddd5c1"; ctx.fill(body);
    ctx.save(); ctx.clip(body);
    ctx.fillStyle = "#6a563a"; ctx.fillRect(-L * 0.6, -H, L * 1.2, H * 0.86);           // 背:暗い褐色
    ctx.fillStyle = "#25211e";                                                          // 体側の黒い太い線
    ctx.beginPath(); ctx.moveTo(L * 0.5, -H * 0.22); ctx.lineTo(-L * 0.5, -H * 0.2); ctx.lineTo(-L * 0.5, H * 0.13); ctx.lineTo(L * 0.5, H * 0.07); ctx.fill();
    ctx.restore();
    shade(body, L, H, f);
    ctx.fillStyle = "rgba(238,229,205,0.95)"; ctx.beginPath(); ctx.ellipse(L * 0.45, H * 0.17, L * 0.05, H * 0.11, 0.35, 0, TAU); ctx.fill(); // 腹側の吸盤状の口
    pectoral(L, H, f, finC);
    eye(L * 0.33, -H * 0.2, H * 0.14, "#9a8a60");
  },
  shrimp(L, wag, f){ // 体が実際に半透明。1 匹を「不透明に描いた 1 枚」にしてから、まとめて半透明(BASE_A)で貼る(脚・節・触角の重なりで濃くならず、反対側の脚が二重に見えない)
    const m = ctx.getTransform ? ctx.getTransform() : null, k = (m && Math.hypot(m.a, m.b)) || 1; // 現在の変換の拡大率(画面の画素 / 長さの単位)
    const bx = -0.62 * L, by = -0.34 * L, pw = Math.max(1, Math.ceil(1.64 * L * k)), ph = Math.max(1, Math.ceil(0.64 * L * k));
    const buf = shrimpBuffer(pw, ph), g = buf.getContext("2d"), main = ctx;
    g.globalAlpha = 1; g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, pw, ph);
    g.setTransform(k, 0, 0, k, -bx * k, -by * k);
    setCtx(g);
    try { paintShrimpParts(L, wag, f); } finally { setCtx(main); }
    main.globalAlpha = BASE_A; // エビ全体の透明度(finAlpha × フェード)
    main.drawImage(buf, 0, 0, pw, ph, bx, by, pw / k, ph / k);
  },
  snail(L, wag, f){
    const hide = f.hide || 0;                                   // 0〜1:殻へ引っこむ度合い(ポップアップの仕草)。足は縮み、殻は地面へ下がる
    const R = L * 0.36, cx = -L * 0.1, cy = -L * 0.12 + hide * L * 0.1;
    ctx.fillStyle = "#cdbd9c"; ctx.beginPath(); ctx.ellipse(L * 0.06 - hide * L * 0.16, L * 0.2, L * 0.5 * (1 - hide * 0.7), L * 0.09 * (1 - hide * 0.35), 0, 0, TAU); ctx.fill();   // 足
    if (hide < 0.5) {
      ctx.fillStyle = "#bba98a"; ctx.beginPath(); ctx.ellipse(L * 0.46 - hide * L * 0.3, L * 0.15, L * 0.12, L * 0.09, 0, 0, TAU); ctx.fill();  // 頭
      ctx.strokeStyle = "#8f8266"; ctx.lineWidth = Math.max(0.7, 0.9 * U); ctx.lineCap = "round";
      const sway = Math.sin(f.phase * 0.7) * L * 0.02, k = 1 - hide * 2;
      ctx.beginPath(); ctx.moveTo(L * 0.52, L * 0.1); ctx.lineTo(L * (0.52 + 0.1 * k), L * (0.1 - 0.08 * k) + sway); ctx.moveTo(L * 0.5, L * 0.09); ctx.lineTo(L * (0.5 + 0.07 * k), L * (0.09 - 0.09 * k) - sway); ctx.stroke();
    }
    ctx.fillStyle = "#3d3a22"; ctx.beginPath(); ctx.arc(cx, cy, R, 0, TAU); ctx.fill();                                      // 殻
    ctx.save(); ctx.beginPath(); ctx.arc(cx, cy, R, 0, TAU); ctx.clip();
    ctx.strokeStyle = "rgba(168,152,84,0.55)"; ctx.lineWidth = Math.max(0.8, 1.1 * U);
    for (let k = 0; k < 3; k++) { ctx.beginPath(); ctx.arc(cx + R * 0.1 * k, cy, R * (0.88 - 0.26 * k), Math.PI * 0.9, Math.PI * 2.25); ctx.stroke(); }
    ctx.strokeStyle = "rgba(16,16,8,0.45)";
    for (let k = 0; k < 5; k++) { const a = Math.PI * (0.1 + k * 0.28); ctx.beginPath(); ctx.moveTo(cx + Math.cos(a) * R * 0.3, cy + Math.sin(a) * R * 0.3); ctx.lineTo(cx + Math.cos(a) * R, cy + Math.sin(a) * R); ctx.stroke(); }
    const g = ctx.createLinearGradient(0, cy - R, 0, cy + R);
    g.addColorStop(0, "rgba(255,248,215,0.2)"); g.addColorStop(0.5, "rgba(255,255,255,0)"); g.addColorStop(1, "rgba(0,28,36,0.34)");
    ctx.fillStyle = g; ctx.fillRect(cx - R, cy - R, R * 2, R * 2);
    ctx.fillStyle = "rgba(255,250,225,0.22)"; ctx.beginPath(); ctx.ellipse(cx - R * 0.3, cy - R * 0.45, R * 0.32, R * 0.13, -0.6, 0, TAU); ctx.fill();
    if (f.pale > 0.02) { ctx.fillStyle = `rgba(200,202,194,${f.pale * 0.5})`; ctx.fillRect(cx - R, cy - R, R * 2, R * 2); }
    ctx.restore();
    ctx.strokeStyle = "rgba(255,250,228,0.3)"; ctx.lineWidth = Math.max(0.8, 1.0 * U); ctx.beginPath(); ctx.arc(cx, cy, R, 0, TAU); ctx.stroke();
  },
};
/* エビ 1 匹ぶんのオフスクリーン(全員で共用。必要な大きさが増えたときだけ作り直す) */
let shrimpBuf = null;
function shrimpBuffer(w, h){
  if (!shrimpBuf || shrimpBuf.width < w || shrimpBuf.height < h) {
    const c = document.createElement("canvas"); c.width = Math.max(w, shrimpBuf ? shrimpBuf.width : 0); c.height = Math.max(h, shrimpBuf ? shrimpBuf.height : 0); shrimpBuf = c;
  }
  return shrimpBuf;
}
/* エビの各部分をすべて不透明に描く(奥から手前の順:反対側の触角・歩脚 → 腹部 → 尾扇 → 頭胸部 → 点列・目 → 前脚)。透けて見えるのは、貼るときの半透明だけ */
function paintShrimpParts(L, wag, f){
  const hh = L * 0.13, t = f.phase, pick = f.pick || 0, ct = f.clawT ?? t;
  ctx.lineCap = "round"; ctx.lineWidth = Math.max(0.7, 0.9 * U); ctx.strokeStyle = "#a9bda9";
  for (let i = 0; i < 5; i++) { // 歩脚
    const x = L * (0.2 - i * 0.085), sw = Math.sin(t * 3 + i * 1.3) * L * 0.045;
    ctx.beginPath(); ctx.moveTo(x, hh * 0.45); ctx.lineTo(x + sw, L * 0.17); ctx.stroke();
  }
  ctx.strokeStyle = "#d2e0d2"; ctx.lineWidth = Math.max(0.5, 0.6 * U); // 触角
  for (const d of [-1, 1]) { ctx.beginPath(); ctx.moveTo(L * 0.45, -L * 0.05); ctx.quadraticCurveTo(L * 0.7, -L * (0.12 + 0.05 * d), L * 0.95, -L * (0.1 + 0.12 * d) + Math.sin(t * 0.8 + d) * L * 0.03); ctx.stroke(); }
  ctx.fillStyle = "#c2d4c2";
  for (let i = 0; i < 6; i++) { // 腹部の節(後ろへ向かって少し下がる)
    const x = L * (0.09 - i * 0.085), y = -L * 0.015 - Math.sin(i / 5 * Math.PI) * L * 0.03 + Math.max(0, i - 3) * L * 0.03, r = 1 - i * 0.07;
    ctx.beginPath(); ctx.ellipse(x, y, L * 0.075, hh * 0.78 * r, 0, 0, TAU); ctx.fill();
  }
  ctx.save(); ctx.translate(-L * 0.5, L * 0.04); ctx.rotate(wag * 0.8);                // 尾扇
  ctx.fillStyle = "#d3e0d3";
  for (const a of [-0.5, 0, 0.5]) { ctx.beginPath(); ctx.ellipse(-L * 0.04 * Math.cos(a), L * 0.04 * Math.sin(a), L * 0.07, hh * 0.35, a, 0, TAU); ctx.fill(); }
  ctx.restore();
  ctx.fillStyle = "#c8d9c8"; ctx.beginPath(); ctx.ellipse(L * 0.26, -L * 0.01, L * 0.2, hh * 0.95, 0.05, 0, TAU); ctx.fill(); // 頭胸部
  ctx.beginPath(); ctx.moveTo(L * 0.44, -L * 0.04); ctx.lineTo(L * 0.52, -L * 0.07); ctx.lineTo(L * 0.44, L * 0.0); ctx.fill();   // 額角
  ctx.fillStyle = "rgba(255,255,245,0.3)"; ctx.beginPath(); ctx.ellipse(L * 0.24, -L * 0.06, L * 0.14, hh * 0.18, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = "#a2573d";                                                           // 体側の赤褐色の点列
  for (let i = 0; i < 9; i++) { ctx.beginPath(); ctx.ellipse(L * (0.34 - i * 0.075), L * (0.015 + (i > 4 ? (i - 4) * 0.012 : 0)), L * 0.017, L * 0.012, 0, 0, TAU); ctx.fill(); }
  ctx.fillStyle = "#1a1d1b"; ctx.beginPath(); ctx.arc(L * 0.4, -L * 0.07, L * 0.02, 0, TAU); ctx.fill(); // 目
  ctx.strokeStyle = "#b4c7b4"; ctx.fillStyle = "#b9ccb9"; ctx.lineWidth = Math.max(0.7, 0.9 * U); // 前脚(はさみ)
  for (const d of [0, 1]) {
    let a = 0.35 + Math.sin(ct * 13 + d * 2.4) * 0.55 * pick + (1 - pick) * 0.1, bx = L * 0.4, by = L * 0.07;
    const wash = f.wash || 0, hold = f.hold || 0;
    if (wash > 0) a = lerp(a, -0.95 + Math.sin(ct * 17 + d * 2.4) * 0.3, wash);   // 顔を洗う:はさみを目のあたりへ上げ、こすり合わせる
    if (hold > 0) a = lerp(a, 0.55 + d * 0.5 + Math.sin(ct * 20 + d) * 0.08, hold); // 餌を両手で抱える
    const mx = bx + Math.cos(a) * L * 0.1, my = by + Math.sin(a) * L * 0.1, ex = mx + Math.cos(a * 0.4) * L * 0.09, ey = my + Math.sin(a) * L * 0.06;
    ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(mx, my); ctx.lineTo(ex, ey); ctx.stroke();
    ctx.beginPath(); ctx.arc(ex, ey, L * 0.022, 0, TAU); ctx.fill();
  }
}
/* 足元(体の中心から接地面まで)の距離。体長 L の倍率 */
export const GROUND = { oto: 0.1, shrimp: 0.17, snail: 0.29 };
/* 前面ガラスの石巻貝を、ガラスの外から見た姿(足の裏と口)。原点は足の中心、頭は +x */
export function paintSnailFront(L, f){
  const rx = L * 0.56, ry = L * 0.36, ph = f.phase;
  // 殻:足の向こう側にあり、足の外側(後ろ寄りと脇)に縁だけのぞく(透けて見えるのではなく、足の後ろに隠れた殻の縁)
  ctx.fillStyle = "#3d3a22"; ctx.beginPath(); ctx.ellipse(-rx * 0.42, 0, rx * 0.66, ry * 1.1, 0, 0, TAU); ctx.fill();
  ctx.strokeStyle = "rgba(168,152,84,0.55)"; ctx.lineWidth = Math.max(0.6, 0.9 * U);
  ctx.beginPath(); ctx.ellipse(-rx * 0.42, 0, rx * 0.5, ry * 0.88, 0, Math.PI * 0.55, Math.PI * 1.45); ctx.stroke();
  ctx.fillStyle = "#e3d5b8"; ctx.beginPath(); ctx.ellipse(0, 0, rx, ry, 0, 0, TAU); ctx.fill();                      // 足の裏(肉の面なので不透明)
  ctx.strokeStyle = "rgba(150,135,105,0.45)"; ctx.lineWidth = Math.max(0.6, 0.8 * U);                                  // ゆっくり波打つ筋
  for (let i = 0; i < 6; i++) {
    const x = -rx * 0.8 + (((i + ph * 0.45) % 6 + 6) % 6) / 6 * rx * 1.25, h = ry * 0.78 * Math.sqrt(Math.max(0, 1 - (x / rx) * (x / rx)));
    ctx.beginPath(); ctx.moveTo(x, -h); ctx.quadraticCurveTo(x + ry * 0.2, 0, x, h); ctx.stroke();
  }
  ctx.fillStyle = "#d8c8aa"; ctx.beginPath(); ctx.ellipse(rx * 0.8, 0, rx * 0.28, ry * 0.55, 0, 0, TAU); ctx.fill(); // 頭
  const wob = Math.sin(ph * 1.7) * ry * 0.22;                                                                           // 左右に動く口
  ctx.fillStyle = "#965f54"; ctx.beginPath(); ctx.ellipse(rx * 0.92, wob, rx * 0.1, ry * 0.2, 0, 0, TAU); ctx.fill();
  ctx.strokeStyle = "rgba(120,78,70,0.7)"; ctx.beginPath(); ctx.moveTo(rx * 0.86, wob); ctx.lineTo(rx * 0.98, wob); ctx.stroke();
  ctx.strokeStyle = "#aa987a"; ctx.lineWidth = Math.max(0.6, 0.9 * U); ctx.lineCap = "round";
  for (const d of [-1, 1]) { ctx.beginPath(); ctx.moveTo(rx * 0.95, d * ry * 0.3); ctx.lineTo(rx * 1.22, d * ry * 0.5 + Math.sin(ph + d) * ry * 0.06); ctx.stroke(); }
  ctx.strokeStyle = "rgba(255,250,235,0.35)"; ctx.lineWidth = Math.max(0.6, 0.8 * U); ctx.beginPath(); ctx.ellipse(0, 0, rx, ry, 0, 0, TAU); ctx.stroke(); // 縁がわずかに明るい
}
/* お掃除生体を (x, y)・角度 rot・向き sx(±1)で描く。a:出現・消滅のフェードの倍率(ふだん 1。体も a で薄くなるのはフェードの間だけ) */
export function drawCreature(f, L, wag, x, y, rot, sx, a = 1){
  ctx.save(); ctx.translate(x, y); ctx.rotate(rot); ctx.scale(sx, 1);
  BASE_A = SPECIES[f.sp].finAlpha * a; BODY_A = a; ctx.globalAlpha = BODY_A;
  PAINT[f.sp](L, wag, f);
  ctx.restore(); BASE_A = 1; BODY_A = 1;
}
/* 砂の手前の縁(前面ガラスとの境目)で、横向きの姿(p = 0)と、ガラスの外から見た足の裏の姿(p = 1)の間を、連続して変形させて描く(消えて現れない)。
   原点は接地点(縁の上の点)。足が平たい楕円から足の裏へ広がり、殻が足の上から足の向こう側(後ろ)へ回り込む。
   L:横向きの体長(drawCreature と同じ)。足の裏の姿は L の 1.2 倍の大きさ(drawSnailFront と同じ)に合わせる。頭は +x */
export function paintSnailTilt(L, f, p){
  const Lf = L * 1.2, rx = 0.56 * Lf, ry = 0.36 * Lf, e = p * p * (3 - 2 * p);
  const foot = { x: lerp(0.06 * L, 0, e), y: lerp(-0.09 * L, 0, e), rx: lerp(0.5 * L, rx, e), ry: lerp(0.09 * L, ry, e) };
  const shell = { x: lerp(-0.1 * L, -0.42 * rx, e), y: lerp(-0.41 * L, 0, e), rx: lerp(0.36 * L, 0.66 * rx, e), ry: lerp(0.36 * L, 1.1 * ry, e) };
  const head = { x: lerp(0.46 * L, 0.8 * rx, e), y: lerp(-0.14 * L, 0, e), rx: lerp(0.12 * L, 0.28 * rx, e), ry: lerp(0.09 * L, 0.55 * ry, e) };
  const ell = (o, col) => { ctx.fillStyle = col; ctx.beginPath(); ctx.ellipse(o.x, o.y, o.rx, o.ry, 0, 0, TAU); ctx.fill(); };
  const drawShell = () => {
    ctx.fillStyle = "#3d3a22"; ctx.beginPath(); ctx.ellipse(shell.x, shell.y, shell.rx, shell.ry, 0, 0, TAU); ctx.fill();
    ctx.strokeStyle = `rgba(168,152,84,${0.55 * (1 - e)})`; ctx.lineWidth = Math.max(0.8, 1.1 * U);                  // 殻の渦の筋(横向きのときだけ)
    for (let k = 0; k < 3; k++) { ctx.beginPath(); ctx.ellipse(shell.x + shell.rx * 0.1 * k, shell.y, shell.rx * (0.88 - 0.26 * k), shell.ry * (0.88 - 0.26 * k), 0, Math.PI * 0.9, Math.PI * 2.25); ctx.stroke(); }
    ctx.fillStyle = `rgba(255,250,225,${0.22 * (1 - e)})`; ctx.beginPath(); ctx.ellipse(shell.x - shell.rx * 0.3, shell.y - shell.ry * 0.45, shell.rx * 0.32, shell.ry * 0.13, -0.6, 0, TAU); ctx.fill();
  };
  if (p >= 0.5) drawShell();                       // 足の裏を見せるころは、殻は足の向こう側(先に描く)
  ell(foot, e < 0.5 ? "#cdbd9c" : "#e3d5b8");
  if (e > 0.3) {                                   // 足の裏の波打つ筋
    ctx.strokeStyle = `rgba(150,135,105,${0.45 * clamp((e - 0.3) / 0.7, 0, 1)})`; ctx.lineWidth = Math.max(0.6, 0.8 * U);
    for (let i = 0; i < 6; i++) { const x = foot.x - foot.rx * 0.8 + (i / 6) * foot.rx * 1.25, h = foot.ry * 0.78 * Math.sqrt(Math.max(0, 1 - ((x - foot.x) / foot.rx) ** 2)); ctx.beginPath(); ctx.moveTo(x, foot.y - h); ctx.quadraticCurveTo(x + foot.ry * 0.2, foot.y, x, foot.y + h); ctx.stroke(); }
  }
  ell(head, e < 0.5 ? "#bba98a" : "#d8c8aa");
  if (e > 0.5) { ctx.fillStyle = "#965f54"; ctx.beginPath(); ctx.ellipse(lerp(head.x, 0.92 * rx, e), head.y, 0.1 * rx * e, 0.2 * ry * e, 0, 0, TAU); ctx.fill(); }
  if (p < 0.5) drawShell();                        // 横向きのころは、殻は足の上(後に描く)
}
export function drawSnailTilt(f, L, x, y, sx, p){
  ctx.save(); ctx.translate(x, y); ctx.scale(sx, 1);
  ctx.globalAlpha = BODY_A;
  paintSnailTilt(L, f, p);
  ctx.restore();
}
export function drawSnailFront(f, L, x, y, rot, a = 1){
  ctx.save(); ctx.translate(x, y); ctx.rotate(rot); ctx.globalAlpha = a;
  paintSnailFront(L, f);
  ctx.restore();
}

/* 向きを変える(U ターン)途中の見た目。f.turnS(0〜1。回りの最大でも 1)・f.turnDir(+1 下へ逃げる / −1 上へ)は fish-behavior.js が毎フレーム設定する(なければふだんの姿)。
   FLIP_MIN:正面向きに近い瞬間の最小の横幅(体長に対する比)。体は横から見て体高が体長の約 0.25〜0.35 倍、正面から見た体の厚み(左右の幅)は体長の約 0.15〜0.25 倍
   (側扁した魚。ネオン・ラミー・エンゼルは薄く、グッピー・プラティ・コリドラスはやや厚い)。0.2 なら正面向きでも細長い楕円(魚の正面)に見え、細い線にならない。 */
export const FLIP_MIN = 0.2;
const TURN_AMP = 0.4, TURN_BEND = 0.3; // 回る間の尾の振りの増え方(最大で 1 + TURN_AMP 倍)と、片側へ曲げる角度(rad)
export function fishWag(f, S){
  const ts = f.turnS || 0;
  if (ts <= 0) return Math.sin(f.phase) * S.wag * (0.45 + 0.55 * Math.min(1, (f.speedNow || 0) / (S.speed * U)));
  // 回る間は速さが落ちても尾をしっかり振り、逃げる側(turnDir)へ尾を曲げる(ローカル座標で wag が正だと尾が上へ上がる)
  return Math.sin(f.phase) * S.wag * (1 + TURN_AMP * ts) - (f.turnDir || 0) * TURN_BEND * ts;
}
export function drawFish(f){
  const S = SPECIES[f.sp];
  const L = S.len * U * f.scale * (0.72 + 0.38 * f.z);
  const wag = fishWag(f, S);
  const dir = f.flip >= 0 ? 1 : -1;
  const fy = bottomY(f.x, f.z), gap = fy - f.y;
  if (gap < 110 * U) {
    ctx.fillStyle = `rgba(20,50,45,${0.16 * (1 - gap / (110 * U))})`;
    ctx.beginPath(); ctx.ellipse(f.x, fy - 3 * U, L * 0.5, L * 0.09, 0, 0, TAU); ctx.fill();
  }
  ctx.save();
  ctx.translate(f.x, f.y);
  ctx.rotate((f.pitch + f.tilt) * dir);
  ctx.scale(dir * Math.max(FLIP_MIN, Math.abs(f.flip)), 1);
  BASE_A = S.finAlpha; BODY_A = 1; ctx.globalAlpha = BODY_A;
  PAINT[f.sp](L, wag, f);
  ctx.restore(); BASE_A = 1;
}

/* ---- セッター(EYE・BASE_A・BODY_A はポップアップからも設定する) ---- */
export function setEye(v){ EYE = v; }
export function setBaseA(v){ BASE_A = v; }
export function setBodyA(v){ BODY_A = v; }

/* ---------------- 軽量モード:個体ごとのスプライト(main.js・crawlers.js が liteOn のときだけ使う) ----------------
   魚・這う生体の 1 匹を、小さなオフスクリーン(個体の原点が中央)に描いて貼る。
   姿勢(向き・回転・体のくねり・尾・ひれ・色・フェード)の描き直しは 3 フレームに 1 回(個体ごとに通し番号でずらす)。
   位置は毎フレーム(貼る位置だけ動かす。拡大縮小なし、貼る位置は画素に丸める)。貼るときの globalAlpha は 1。
   透明度(ひれの膜・エビの 1 枚の半透明・フェード)は、描画関数がスプライトの中でそのまま描く。
   スプライトは resize(U・DPR の変化)・個体の消滅・軽量オフで捨てる。大きさは半径 R(原点から描画の端までの距離の上限)で決める。 */
const SPR = new Map();      // 個体 f → { c, g, Rd, dpr, u, n, fresh, redraws, calls }
let sprSeq = 0;
export const LITE_EVERY = 3;
/* 描画の外接半径(長さの単位)。魚は体長 L に対する倍率、お掃除生体は基準の長さ L0 に対する倍率。tests/smoke.mjs の外接の検査が上限を確かめる */
export const FISH_R = { neon: 1.1, rummy: 1.1, guppy: 1.7, platy: 1.3, angel: 2.1, cory: 1.2 }; // 実測(制御点まで含む保守的な外接)の最大値に余白をつけた値
export const CREATURE_R = 1.2;                // 実測の最大 1.30(エビ、L0 の 1.2 倍の大きさのとき)に対し、max(L, 1.2·L0) × 1.2 を半径にする
export function liteSpritesRelease(){ SPR.clear(); }
export function litePrune(list){ if (SPR.size > list.length) { const keep = new Set(list); for (const f of [...SPR.keys()]) if (!keep.has(f)) SPR.delete(f); } }
export function liteSpriteStats(){
  let bytes = 0, redraws = 0, calls = 0;
  for (const s of SPR.values()) { bytes += 4 * (2 * s.Rd) ** 2; redraws += s.redraws; calls += s.calls; }
  return { count: SPR.size, bytes, redraws, calls };
}
export function liteSpriteOf(f){ const s = SPR.get(f); return s ? { Rd: s.Rd, dpr: s.dpr, redraws: s.redraws, calls: s.calls, g: s.g } : null; }
/* R:外接半径(css 長さ)。x, y:原点の位置。fn:原点(0,0)を中心に描く関数(ctx はスプライトへ差し替わる。素の ctx と U だけを使う) */
function liteSprite(f, R, x, y, fn){
  const need = Math.max(2, Math.ceil(R * DPR));
  let s = SPR.get(f);
  if (!s || s.dpr !== DPR || s.Rd < need || s.Rd > need * 1.4 + 8) {   // 足りない・大きすぎる・DPR が変わったときだけ作り直す
    const c = document.createElement("canvas"), Rd = Math.ceil(need * 1.1) + 2;
    c.width = c.height = 2 * Rd;
    s = { c, g: c.getContext("2d"), Rd, dpr: DPR, n: s ? s.n : sprSeq++, fresh: true, redraws: s ? s.redraws : 0, calls: s ? s.calls : 0 };
    SPR.set(f, s);
  }
  s.calls++;
  const due = s.fresh || s.n % LITE_EVERY === 0;
  s.n++;
  if (due) {
    const orig = ctx, g = s.g;
    s.fresh = false; s.redraws++;
    setCtx(g);
    try {
      g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, s.c.width, s.c.height);
      g.setTransform(DPR, 0, 0, DPR, s.Rd, s.Rd); g.globalAlpha = 1;
      fn();
    } finally { setCtx(orig); BASE_A = 1; BODY_A = 1; }
  }
  ctx.drawImage(s.c, (Math.round(x * DPR) - s.Rd) / DPR, (Math.round(y * DPR) - s.Rd) / DPR, 2 * s.Rd / DPR, 2 * s.Rd / DPR);
}
/* drawFish の軽量版。足元の影は位置で決まるので、スプライトの外に毎フレーム描く(パス 1 つ) */
export function drawFishLite(f){
  const S = SPECIES[f.sp];
  const L = S.len * U * f.scale * (0.72 + 0.38 * f.z);
  const fy = bottomY(f.x, f.z), gap = fy - f.y;
  if (gap < 110 * U) {
    ctx.fillStyle = `rgba(20,50,45,${0.16 * (1 - gap / (110 * U))})`;
    ctx.beginPath(); ctx.ellipse(f.x, fy - 3 * U, L * 0.5, L * 0.09, 0, 0, TAU); ctx.fill();
  }
  liteSprite(f, L * FISH_R[f.sp], f.x, f.y, () => {
    const wag = fishWag(f, S);
    const dir = f.flip >= 0 ? 1 : -1;
    ctx.rotate((f.pitch + f.tilt) * dir);
    ctx.scale(dir * Math.max(FLIP_MIN, Math.abs(f.flip)), 1);
    BASE_A = S.finAlpha; BODY_A = 1; ctx.globalAlpha = BODY_A;
    PAINT[f.sp](L, wag, f);
  });
}
/* お掃除生体(drawCreature / drawSnailTilt / drawSnailFront)の軽量版。L0:その個体の基準の長さ(外接の見積もりに使う。貝の前面の姿は 1.2 倍で描かれるのでここで見込む) */
export function drawCreatureLite(f, L0, L, wag, x, y, rot, sx, a = 1){
  liteSprite(f, Math.max(L, L0 * 1.2) * CREATURE_R, x, y, () => {
    ctx.rotate(rot); ctx.scale(sx, 1);
    BASE_A = SPECIES[f.sp].finAlpha * a; BODY_A = a; ctx.globalAlpha = BODY_A;
    PAINT[f.sp](L, wag, f);
  });
}
export function drawSnailTiltLite(f, L0, x, y, sx, p){
  liteSprite(f, L0 * 1.2 * CREATURE_R, x, y, () => { ctx.scale(sx, 1); ctx.globalAlpha = BODY_A; paintSnailTilt(L0, f, p); });
}
export function drawSnailFrontLite(f, L0, L, x, y, rot, a = 1){
  liteSprite(f, Math.max(L, L0 * 1.2) * CREATURE_R, x, y, () => { ctx.rotate(rot); ctx.globalAlpha = a; paintSnailFront(L, f); });
}
