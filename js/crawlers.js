// お掃除生体(オトシンクルス・ヤマトヌマエビ・石巻貝)の位置・動き・描画の呼び出し。
// 3 種は fishes に入っている(数・体調・呼吸量は他の魚と同じ)が、泳ぎの更新(updateFish)と描画(drawFish)は使わず、このモジュールが担当する。
// 這える面:砂・岩の上辺・流木の枝(scene.js の rocks / getWood)・前面ガラス(gF)・奥のガラス(gB)。
// 位置は「面の種類 + 面の番号 + 位置(s)」で持つので、resize(情景の作り直し)後も relayout() だけで追従する。
// 依存の向き:scene・fish-render・fish-behavior の後(main.js から呼ばれる)。トップレベルで乱数・Canvas・Date を使わない。
import { H, TAU, Tw, U, W, clamp, lerp, sandY, waterTop } from "./core.js";
import { SPECIES } from "./species.js";
import { DO, hypoxia } from "./aging.js";
import { getWood, rocks } from "./scene.js";
import { GROUND, drawCreature, drawSnailFront } from "./fish-render.js";
import { activity, fishes } from "./fish-behavior.js";

/* ---------------- 主な数値 ---------------- */
export const CRAWL = {
  snailGlassP: 0.12,          // 石巻貝:休むたびに前面ガラスへ移る確率(約 25 秒ごとの判断 → 平均 3.5 分に 1 回)
  snailGlassStay: [40, 90],   //   ガラスにいる時間(秒)
  snailRest: [4, 12], snailMove: [6, 20], // 石巻貝:休む・這う時間(秒)。速さは SPECIES.snail.speed × U × 活動度(約 1.4〜4 px/s)
  shrimpPick: [3, 8], shrimpWalk: [1.2, 3.5], shrimpWalkV: 0.55,   // ヤマト:つまむ・歩く時間(秒)、歩く速さ(種の速さの倍率)
  shrimpHopP: 0.15,           //   つまむのが終わるたびに跳ねて移る確率
  otoStick: [6, 16], otoSwimV: 1.6,  // オト:吸いついている時間(秒)、移動の速さ(種の速さの倍率)
  fadeSec: 1.0,               // 貝がガラス・別の面へ移るときのフェード(秒)
};
const WEIGHTS = {
  snail: { sand: 0.35, rock: 0.35, wood: 0.3 },
  shrimp: { sand: 0.35, rock: 0.3, wood: 0.35 },
  oto: { gB: 0.4, gF: 0.15, wood: 0.3, rock: 0.15 },
};
const rnd = (a, b) => a + Math.random() * (b - a);
const pickR = r => rnd(r[0], r[1]);

/* ---------------- 這える面 ---------------- */
let rockS = [], woodS = [];
function mk(pts){
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  const len = cum[cum.length - 1] || 1;
  let i0 = -1, i1 = -1;
  pts.forEach((p, i) => { if (p[1] < sandY(p[0]) - 4 * U) { if (i0 < 0) i0 = i; i1 = i; } }); // 砂の上に出ている範囲だけ
  const ok = i0 >= 0 && (cum[i1] - cum[i0]) / len > 0.05;
  return { pts, cum, len, s0: ok ? cum[i0] / len : 0, s1: ok ? cum[i1] / len : 1, ok };
}
/* 情景を作り直した後(resize)に呼ぶ */
export function relayout(){
  rockS = rocks.map(r => mk(r.pts.map(p => [p[0], p[1], 0])));
  woodS = getWood().map(b => mk(b.map(p => [p[0], p[1], p[2]])));
}
function raw(pl, s){ // 点列上の位置 [x, y, 太さ](弧長の比 s)
  const d = clamp(s, 0, 1) * pl.len, n = pl.pts.length;
  let i = 1; while (i < n - 1 && pl.cum[i] < d) i++;
  const a = pl.pts[i - 1], b = pl.pts[i], seg = (pl.cum[i] - pl.cum[i - 1]) || 1, k = clamp((d - pl.cum[i - 1]) / seg, 0, 1);
  return [lerp(a[0], b[0], k), lerp(a[1], b[1], k), lerp(a[2], b[2], k)];
}
/* c.surf / id / s / z / fx / fy から c.x c.y(接地点)、c.tx c.ty(s が増える向き)、c.ux c.uy(面の上向きの単位ベクトル)を求める */
function place(c){
  const kind = c.surf;
  if (kind === "gF" || kind === "gB") { c.x = c.fx * W; c.y = c.fy * H; c.tx = 1; c.ty = 0; c.ux = 0; c.uy = -1; return; }
  const list = kind === "rock" ? rockS : kind === "wood" ? woodS : null, pl = list && list[Math.min(c.id, list.length - 1)];
  if (!pl || !pl.ok) { // 面がない(砂へ)
    const x = clamp(c.s, 0.03, 0.97) * W, k = (sandY(x + 1) - sandY(x - 1)) / 2, n = Math.hypot(1, k);
    c.x = x; c.y = sandY(x) + (2 + c.z * 14) * U; c.tx = 1 / n; c.ty = k / n; c.ux = k / n; c.uy = -1 / n; return;
  }
  const s = clamp(c.s, pl.s0, pl.s1), p = raw(pl, s), p0 = raw(pl, s - 0.05), p1 = raw(pl, s + 0.05);
  let tx = p1[0] - p0[0], ty = p1[1] - p0[1]; const n = Math.hypot(tx, ty) || 1; tx /= n; ty /= n;
  let ux = ty, uy = -tx; if (uy > 0 || (uy === 0 && ux < 0)) { ux = -ux; uy = -uy; }
  c.x = p[0] + ux * p[2] / 2; c.y = p[1] + uy * p[2] / 2; c.tx = tx; c.ty = ty; c.ux = ux; c.uy = uy;
}
const lenOf = c => c.surf === "rock" ? (rockS[Math.min(c.id, rockS.length - 1)]?.len || 1) : c.surf === "wood" ? (woodS[Math.min(c.id, woodS.length - 1)]?.len || 1) : W;
function rangeOf(c){
  const list = c.surf === "rock" ? rockS : c.surf === "wood" ? woodS : null, pl = list && list[Math.min(c.id, list.length - 1)];
  return pl && pl.ok ? [pl.s0, pl.s1] : [0.03, 0.97];
}
const onGlass = c => c.surf === "gF" || c.surf === "gB";

/* 新しい居場所の候補 { surf, id, s, z, fx, fy }。hot:高温・低酸素の度合い(オトは水面近くのガラス、エビは流木の高い所へ寄る) */
function randSpot(sp, hot, noGlassF = false){
  const w = WEIGHTS[sp]; let kind = null, r = Math.random() * Object.keys(w).reduce((s, k) => s + (noGlassF && k === "gF" ? 0 : w[k]), 0);
  for (const k of Object.keys(w)) { if (noGlassF && k === "gF") continue; r -= w[k]; if (r <= 0) { kind = k; break; } }
  kind = kind || "sand";
  if (sp === "oto" && hot > 0.3 && Math.random() < hot) kind = Math.random() < 0.7 ? "gB" : "gF";
  if (sp === "shrimp" && hot > 0.3 && Math.random() < hot) kind = "wood";
  const c = { surf: kind, id: 0, s: 0.5, z: Math.random(), fx: 0, fy: 0 };
  if (kind === "gF" || kind === "gB") {
    c.fx = rnd(0.06, 0.94);
    const y = hot > 0.3 ? rnd(waterTop + 25 * U, waterTop + 90 * U) : rnd(waterTop + 30 * U, sandY(c.fx * W) - 24 * U);
    c.fy = y / H;
  } else if (kind === "sand") c.s = rnd(0.04, 0.96);
  else {
    const list = kind === "rock" ? rockS : woodS, ids = list.map((p, i) => i).filter(i => list[i].ok);
    if (!ids.length) { c.surf = "sand"; c.s = rnd(0.04, 0.96); return c; }
    c.id = ids[Math.floor(Math.random() * ids.length)];
    const pl = list[c.id];
    c.s = kind === "wood" && sp === "shrimp" && hot > 0.3 ? lerp(lerp(pl.s0, pl.s1, 0.6), pl.s1, Math.random()) : lerp(pl.s0, pl.s1, Math.random());
  }
  return c;
}
function attach(c, spot){
  c.surf = spot.surf; c.id = spot.id; c.s = spot.s; c.z = spot.z; c.fx = spot.fx; c.fy = spot.fy;
  place(c);
  if (onGlass(c)) { // ガラスでの向き
    c.ang = Math.random() < 0.5 ? rnd(-0.3, 0.3) : (Math.random() < 0.5 ? 1 : -1) * rnd(1.2, 1.7);
    c.sx = Math.random() < 0.5 ? 1 : -1;
  } else { c.fx = c.x / W; c.fy = c.y / H; }
}
function initCr(f){
  const c = { surf: "sand", id: 0, s: 0.5, z: 0, fx: 0, fy: 0, x: 0, y: 0, tx: 1, ty: 0, ux: 0, uy: -1, dir: Math.random() < 0.5 ? 1 : -1,
    st: f.sp === "oto" ? "stick" : "rest", t: rnd(0, 5), fade: 1, fph: null, pend: null, pk: 0, graze: 0, gz: 0, gt: rnd(1, 3), clk: 0,
    hd: rnd(0, TAU), hdD: 0, hdT: 3, ang: 0, sx: 1, sa: 0, ssx: 1, swim: null, hop: null, hp: 0, hsx: 1 };
  attach(c, randSpot(f.sp, 0));
  c.hdD = c.hd; f.phase = Math.random() * TAU;
  return c;
}

/* ---------------- 更新 ---------------- */
function startTransfer(c, spot){ c.pend = spot; c.fph = "out"; }
function stepFade(c, dt){
  if (c.fph === "out") { c.fade -= dt / CRAWL.fadeSec; if (c.fade <= 0) { c.fade = 0; attach(c, c.pend); c.pend = null; c.fph = "in"; c.hd = rnd(0, TAU); c.hdD = c.hd; c.hdT = 3; c.st = "rest"; c.t = rnd(2, 5); } }
  else { c.fade += dt / CRAWL.fadeSec; if (c.fade >= 1) { c.fade = 1; c.fph = null; } }
}
function moveAlong(c, v, dt){
  const [lo, hi] = rangeOf(c);
  c.s += c.dir * v * dt / lenOf(c);
  if (c.s < lo) { c.s = lo; c.dir = 1; } else if (c.s > hi) { c.s = hi; c.dir = -1; }
}
const wrapA = a => { while (a > Math.PI) a -= TAU; while (a < -Math.PI) a += TAU; return a; };

function updSnail(f, c, S, act, dt){
  const onG = c.surf === "gF";
  f.phase += dt * (onG ? 1.2 : 0.5) * act;
  if (c.fph) { stepFade(c, dt); if (!c.fph) c.t = c.surf === "gF" ? pickR(CRAWL.snailGlassStay) : pickR(CRAWL.snailRest); place(c); return; }
  c.t -= dt;
  if (onG) {
    c.hdT -= dt; if (c.hdT <= 0) { c.hd += (Math.random() - 0.5) * 1.6; c.hdT = rnd(4, 12); }
    const v = S.speed * U * act * 1.2;
    let nx = c.fx * W + Math.cos(c.hd) * v * dt, ny = c.fy * H + Math.sin(c.hd) * v * dt;
    const x0 = W * 0.05, x1 = W * 0.95, y0 = waterTop + 26 * U, y1 = sandY(clamp(nx, 0, W)) - 24 * U;
    if (nx < x0 || nx > x1 || ny < y0 || ny > y1) { c.hd = Math.atan2((y0 + y1) / 2 - ny, W / 2 - nx) + (Math.random() - 0.5) * 0.8; nx = clamp(nx, x0, x1); ny = clamp(ny, y0, y1); }
    c.fx = nx / W; c.fy = ny / H;
    c.hdD += wrapA(c.hd - c.hdD) * Math.min(1, dt * 1.5);
    if (c.t <= 0) startTransfer(c, randSpot("snail", 0, true));
  } else if (c.st === "rest") {
    if (c.t <= 0) {
      if (Math.random() < CRAWL.snailGlassP) startTransfer(c, { surf: "gF", id: 0, s: 0, z: 0, fx: rnd(0.08, 0.92), fy: rnd(0.2, 0.7) });
      else { c.st = "move"; c.t = pickR(CRAWL.snailMove); c.dir = Math.random() < 0.5 ? 1 : -1; }
    }
  } else {
    moveAlong(c, S.speed * U * act, dt);
    if (c.t <= 0) { c.st = "rest"; c.t = pickR(CRAWL.snailRest); }
  }
  if (!c.fph) place(c);
}

function updShrimp(f, c, S, act, dt, hot){
  c.pk += ((c.st === "pick" ? 1 : 0) - c.pk) * Math.min(1, dt * 6);
  f.clawT = (f.clawT || 0) + dt * (0.4 + 0.6 * c.pk);
  c.t -= dt;
  if (c.st === "hop") {
    c.hp += dt / c.hdur;
    const e = clamp(c.hp, 0, 1);
    c.x = lerp(c.hx0, c.hx1, e); c.y = lerp(c.hy0, c.hy1, e) - Math.sin(Math.PI * e) * 14 * U;
    f.phase += dt * 14;
    if (c.hp >= 1) { attach(c, c.hspot); c.st = "pick"; c.t = pickR(CRAWL.shrimpPick); }
    return;
  }
  if (c.st === "walk") {
    f.phase += dt * 8 * act;
    moveAlong(c, S.speed * U * act * CRAWL.shrimpWalkV, dt);
    if (c.t <= 0) { c.st = "pick"; c.t = pickR(CRAWL.shrimpPick); }
  } else if (c.t <= 0) { // pick の終わり
    if (Math.random() < CRAWL.shrimpHopP * (1 + hot * 2) && f.health > 0.2) {
      let best = null, bd = 1e9; // 近い候補を選ぶ(短く跳ねる)
      for (let i = 0; i < 4; i++) { const sp = randSpot("shrimp", hot), d = (place(sp), Math.hypot(sp.x - c.x, sp.y - c.y)); if (d < bd) { bd = d; best = sp; } }
      c.hspot = best; c.hx0 = c.x; c.hy0 = c.y; c.hx1 = best.x; c.hy1 = best.y; c.hdur = clamp(bd / (110 * U), 0.5, 1.4); c.hp = 0; c.hsx = best.x >= c.x ? 1 : -1; c.st = "hop";
    } else { c.st = "walk"; c.t = pickR(CRAWL.shrimpWalk); c.dir = Math.random() < 0.5 ? 1 : -1; }
  }
  place(c);
}

function updOto(f, c, S, act, dt, hot){
  c.clk += dt;
  if (c.st === "swim") {
    f.phase += dt * 10;
    const tg = { ...c.swim }; place(tg);
    const x = c.fx * W, y = c.fy * H, dx = tg.x - x, dy = tg.y - y, d = Math.hypot(dx, dy), v = S.speed * U * act * CRAWL.otoSwimV;
    c.t -= dt;
    if (d < Math.max(2 * U, v * dt) || c.t <= 0) { attach(c, c.swim); c.st = "stick"; c.t = pickR(CRAWL.otoStick); c.gz = 0; c.gt = rnd(1, 3); return; }
    c.fx = (x + dx / d * v * dt) / W; c.fy = (y + dy / d * v * dt) / H;
    c.sa = Math.atan2(dy, Math.abs(dx) + 4 * U); c.ssx = dx >= 0 ? 1 : -1;
    return;
  }
  c.t -= dt; c.gt -= dt;
  if (c.gt <= 0) { c.gz = c.gz ? 0 : 1; c.gt = c.gz ? rnd(2, 5) : rnd(1, 3); } // 削る(2〜5 秒)と休む(1〜3 秒)を繰り返す
  c.graze += (c.gz - c.graze) * Math.min(1, dt * 5);
  f.phase += dt * 0.5;
  if (c.t <= 0) {
    c.swim = randSpot("oto", hot); // 移動先
    c.fx = (onGlass(c) ? c.fx : c.x / W); c.fy = (onGlass(c) ? c.fy : c.y / H);
    c.st = "swim"; c.t = 14; c.graze = 0;
  } else if (!onGlass(c)) place(c);
}

/* 毎フレーム(fishes のうち solo 種だけ main.js から呼ぶ) */
export function updateCrawler(f, dt){
  const S = SPECIES[f.sp];
  if (!f.cr) f.cr = initCr(f);
  const c = f.cr, act = activity(Tw) * (0.3 + 0.7 * f.health), hot = Math.max(clamp((Tw - 29) / 4, 0, 1), hypoxia(DO));
  if (f.sp === "snail") updSnail(f, c, S, act, dt);
  else if (f.sp === "shrimp") updShrimp(f, c, S, act, dt, hot);
  else updOto(f, c, S, act, dt, hot);
}

/* ---------------- 描画 ---------------- */
function layerOf(f){
  const c = f.cr;
  if (f.sp === "oto") return c.st === "swim" ? "front" : c.surf === "gB" ? "back" : c.surf === "gF" ? "glass" : "low";
  if (f.sp === "snail") return c.surf === "gF" ? "glass" : "low";
  return "low";
}
/* 面の上の姿勢:接地点から面の上向きへ体の足元の分だけ浮かせる。向きは進行方向(t が右向きなら +1) */
function surfacePose(c, L, g, moveDir){
  const mrx = -c.uy, mry = c.ux, dot = c.tx * mrx + c.ty * mry;
  const sx = (dot >= 0 ? 1 : -1) * moveDir;
  return [c.x + c.ux * g * L, c.y + c.uy * g * L, Math.atan2(c.ux, -c.uy), sx];
}
function drawOne(f){
  const S = SPECIES[f.sp], c = f.cr, L0 = S.len * U * f.scale, al = c.fade;
  if (f.sp === "snail") {
    if (c.surf === "gF") { drawSnailFront(f, L0 * 1.2, c.fx * W, c.fy * H, c.hdD, al); return; }
    const [x, y, rot, sx] = surfacePose(c, L0, GROUND.snail, c.dir);
    drawCreature(f, L0, 0, x, y, rot, sx, al); return;
  }
  if (f.sp === "shrimp") {
    if (c.st === "hop") { const e = clamp(c.hp, 0, 1); drawCreature(f, L0, Math.sin(f.phase) * 0.5, c.x, c.y - GROUND.shrimp * L0, c.hsx * 0.7 * (2 * e - 1), c.hsx, 1); return; }
    const [x, y, rot, sx] = surfacePose(c, L0, GROUND.shrimp, c.dir);
    drawCreature(f, L0, Math.sin(f.phase * 3) * 0.06, x, y, rot, sx, 1); return;
  }
  // オト
  const jit = Math.sin(c.clk * 38) * 0.5 * U * c.graze, wag = Math.sin(c.clk * 38) * 0.05 * c.graze;
  if (c.st === "swim") { drawCreature(f, L0, Math.sin(f.phase) * S.wag, c.fx * W, c.fy * H, c.ssx * c.sa, c.ssx, 1); return; }
  if (onGlass(c)) {
    const k = c.surf === "gB" ? 0.8 : 1.1, a = c.surf === "gB" ? 0.85 : 1;
    drawCreature(f, L0 * k, wag, c.fx * W + Math.cos(c.ang) * jit, c.fy * H + Math.sin(c.ang) * jit, c.ang, c.sx, a); return;
  }
  const [x, y, rot, sx] = surfacePose(c, L0, GROUND.oto, 1);
  drawCreature(f, L0, wag, x + c.tx * jit, y + c.ty * jit, rot, sx, 1);
}
/* layer:"back"(奥のガラスのオト)/ "low"(岩・砂・流木の上の 3 種)/ "front"(移動中のオト)/ "glass"(前面ガラスの貝とオト) */
export function drawCrawlers(layer){
  for (const f of fishes) { if (!SPECIES[f.sp].solo || !f.cr || layerOf(f) !== layer) continue; drawOne(f); }
}

/* ---------------- 読み取り用(なめた跡・テスト) ---------------- */
/* 前面ガラスの貝・オト(kind "glassF")と、岩・流木の上でつまんでいるエビ(kind "hard")の現在位置と状態。active:なめている/つまんでいる */
export function grazers(){
  const out = [];
  for (const f of fishes) {
    const c = f.cr; if (!SPECIES[f.sp].solo || !c || c.fph) continue;
    const L = SPECIES[f.sp].len * U * f.scale;
    if (f.sp === "snail" && c.surf === "gF") out.push({ kind: "glassF", sp: "snail", x: c.fx * W + Math.cos(c.hdD) * L * 0.6, y: c.fy * H + Math.sin(c.hdD) * L * 0.6, r: L * 0.35, active: true });
    else if (f.sp === "oto" && c.surf === "gF" && c.st === "stick") out.push({ kind: "glassF", sp: "oto", x: c.fx * W, y: c.fy * H, r: L * 0.4, active: c.gz === 1 });
    else if (f.sp === "shrimp" && (c.surf === "rock" || c.surf === "wood") && c.st !== "hop") out.push({ kind: "hard", sp: "shrimp", x: c.x, y: c.y, r: L * 0.3, active: c.st === "pick" });
  }
  return out;
}
/* 3 種の現在位置(描画上の接地点・中心)と面の種類 */
export function crawlerPos(f){
  const c = f.cr; if (!c) return null;
  if (f.sp === "shrimp" && c.st === "hop") return { x: c.x, y: c.y, surf: "hop" };
  if (onGlass(c) || c.st === "swim") return { x: c.fx * W, y: c.fy * H, surf: c.st === "swim" ? "swim" : c.surf };
  return { x: c.x, y: c.y, surf: c.surf };
}
