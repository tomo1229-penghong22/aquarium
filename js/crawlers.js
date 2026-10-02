// お掃除生体(オトシンクルス・ヤマトヌマエビ・石巻貝)の位置・動き・描画の呼び出し。
// 3 種は fishes に入っている(数・体調・呼吸量は他の魚と同じ)が、泳ぎの更新(updateFish)と描画(drawFish)は使わず、このモジュールが担当する。
// 這える面:砂・岩の上辺・流木の枝の上辺(scene.js の rocks / getWood を、描かれている輪郭どおりに)・前面ガラス(gF)・奥のガラス(gB)。
// 位置は「面の種類 + 面の番号 + 位置(s)」で持つので、resize(情景の作り直し)後も relayout() だけで追従する。
// 物理:瞬間移動しない(貝は砂の手前の縁まで這ってガラスを這い上がる。エビは放物線で跳ぶ。オトは泳ぐ)/同じ面の個体どうしは重ならない(近づいたら向きを変える・待つ・脇へよける)。
// 依存の向き:scene・fish-render・fish-behavior の後(main.js から呼ばれる)。トップレベルで乱数・Canvas・Date を使わない。
import { H, TAU, Tw, U, W, clamp, lerp, sandY, waterTop } from "./core.js";
import { SPECIES } from "./species.js";
import { DO, hypoxia } from "./aging.js";
import { getWood, rocks } from "./scene.js";
import { GROUND, drawCreature, drawSnailFront, drawSnailTilt } from "./fish-render.js";
import { activity, fishes } from "./fish-behavior.js";

/* ---------------- 主な数値 ---------------- */
export const CRAWL = {
  snailGlassP: 0.12,          // 石巻貝:休むたびにガラスへ向かう確率(約 25 秒ごとの判断)
  snailGlassStay: [20, 50],   //   ガラスの苔の帯にいる時間(秒)。這い上がる・這い降りる時間は別
  snailRest: [4, 12], snailMove: [6, 20], // 石巻貝:休む・這う時間(秒)。速さは SPECIES.snail.speed × U × 活動度(約 1.4〜4 px/s)
  snailTilt: 2.5,             //   砂の手前の縁で、横向きの姿からガラスの足の裏へ移る(戻る)のにかける時間(秒)
  snailSlope: 60,             //   貝が這える面の傾き(水平からの角度の上限。度)。急な面では殻が横向きになるので避ける
  shrimpPick: [3, 8], shrimpWalk: [1.2, 3.5], shrimpWalkV: 0.55,   // ヤマト:つまむ・歩く時間(秒)、歩く速さ(種の速さの倍率)
  shrimpHopP: 0.15,           //   つまむのが終わるたびに跳ねて移る確率
  hopHeight: 14,              //   跳躍の高さ(U)。放物線 y = 4h·e(1−e)。時間は距離 ÷ 110U/s(0.5〜1.4 秒)
  otoStick: [6, 16], otoSwimV: 1.6,  // オト:吸いついている時間(秒)、移動の速さ(種の速さの倍率)
  sep: 1.0,                   // 同じ面の個体どうしの最小の中心距離 = (半径の和)× sep。これより近づく動きはしない
};
const WEIGHTS = {
  snail: { sand: 0.35, rock: 0.35, wood: 0.3 },
  shrimp: { sand: 0.35, rock: 0.3, wood: 0.35 },
  oto: { gB: 0.4, gF: 0.15, wood: 0.3, rock: 0.15 },
};
const rnd = (a, b) => a + Math.random() * (b - a);
const pickR = r => rnd(r[0], r[1]);
const yEdge = () => H - 10 * U; // 砂の手前の縁(前面ガラスと砂の境目)の高さ

/* ---------------- 這える面 ---------------- */
let rockS = [], woodS = [];
/* 点列 pts([x, y])から面を作る。ok:砂の上に出ている範囲 [s0, s1]、貝の範囲 sn:地面に続く側から、傾きが snailSlope 以下の間(なければ null) */
function mk(pts){
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  const len = cum[cum.length - 1] || 1;
  let i0 = -1, i1 = -1;
  pts.forEach((p, i) => { if (p[1] < sandY(p[0]) - 4 * U) { if (i0 < 0) i0 = i; i1 = i; } }); // 砂の上に出ている範囲だけ
  const ok = i0 >= 0 && (cum[i1] - cum[i0]) / len > 0.05;
  const pl = { pts, cum, len, s0: ok ? cum[i0] / len : 0, s1: ok ? cum[i1] / len : 1, ok, sn: null, gEnd: 0 };
  if (!ok) return pl;
  // 貝の範囲:地面に近い端(砂から 10U 以内)から、傾きが上限以下の区間を内側へ伸ばす
  const slopeOk = i => { const a = pts[i], b = pts[i + 1]; return Math.abs(b[1] - a[1]) <= Math.tan(CRAWL.snailSlope * Math.PI / 180) * Math.abs(b[0] - a[0]) + 1e-9; };
  const nearGround = i => pts[i][1] >= sandY(pts[i][0]) - 12 * U;
  let best = null;
  if (nearGround(i0)) { let j = i0; while (j < i1 && slopeOk(j)) j++; best = { a: i0, b: j, end: 0 }; }
  if (nearGround(i1)) { let j = i1; while (j > i0 && slopeOk(j - 1)) j--; const c = { a: j, b: i1, end: 1 }; if (!best || cum[c.b] - cum[c.a] > cum[best.b] - cum[best.a]) best = c; }
  if (best && cum[best.b] - cum[best.a] >= Math.max(12 * U, 0.05 * len)) { pl.sn = [cum[best.a] / len, cum[best.b] / len]; pl.gEnd = best.end; }
  return pl;
}
/* 岩の描かれている輪郭(drawRock と同じ:各点を制御点に、隣の点との中点どうしを二次曲線でつなぐ)を細かく標本化した点列 */
function rockOutline(pts){
  const out = [[pts[0][0], pts[0][1]]]; let cx = pts[0][0], cy = pts[0][1];
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i], mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
    for (let k = 1; k <= 8; k++) { const t = k / 8, u = 1 - t; out.push([u * u * cx + 2 * u * t * a[0] + t * t * mx, u * u * cy + 2 * u * t * a[1] + t * t * my]); }
    cx = mx; cy = my;
  }
  return out;
}
/* 流木の枝の描かれている上辺(drawWood と同じ頂点の法線で、太さの半分だけ離した点列。上向きの側の縁) */
function woodTop(br){
  const n = br.length, out = []; let prev = 0;
  for (let i = 0; i < n; i++) {
    const a = i < n - 1 ? Math.atan2(br[i + 1][1] - br[i][1], br[i + 1][0] - br[i][0]) : Math.atan2(br[i][1] - br[i - 1][1], br[i][0] - br[i - 1][0]);
    const nx = -Math.sin(a), ny = Math.cos(a), w = br[i][2] / 2; // drawWood の Lp(+)と Rp(−)
    let sgn = ny < -0.3 ? 1 : ny > 0.3 ? -1 : (prev || (ny <= 0 ? 1 : -1)); // 上向きの側(ほぼ縦のときは前の頂点と同じ側)
    prev = sgn;
    out.push([br[i][0] + sgn * nx * w, br[i][1] + sgn * ny * w]);
  }
  return out;
}
/* 情景を作り直した後(resize)に呼ぶ */
export function relayout(){
  rockS = rocks.map(r => mk(rockOutline(r.pts)));
  woodS = getWood().map(b => mk(woodTop(b)));
}
function raw(pl, s){ // 点列上の位置 [x, y](弧長の比 s)
  const d = clamp(s, 0, 1) * pl.len, n = pl.pts.length;
  let i = 1; while (i < n - 1 && pl.cum[i] < d) i++;
  const a = pl.pts[i - 1], b = pl.pts[i], seg = (pl.cum[i] - pl.cum[i - 1]) || 1, k = clamp((d - pl.cum[i - 1]) / seg, 0, 1);
  return [lerp(a[0], b[0], k), lerp(a[1], b[1], k)];
}
const polyOf = c => { const list = c.surf === "rock" ? rockS : c.surf === "wood" ? woodS : null; return list && list[Math.min(c.id, list.length - 1)]; };
const sandPos = (x, z, dep) => lerp(sandY(x) + (2 + z * 14) * U, yEdge(), dep || 0);
/* c.surf / id / s / z / dep / fx / fy から c.x c.y(接地点)、c.tx c.ty(s が増える向き)、c.ux c.uy(面の上向きの単位ベクトル)を求める */
function place(c){
  const kind = c.surf;
  if (kind === "gF" || kind === "gB") { c.x = c.fx * W; c.y = c.fy * H; c.tx = 1; c.ty = 0; c.ux = 0; c.uy = -1; return; }
  const pl = kind === "sand" ? null : polyOf(c);
  if (!pl || !pl.ok) { // 砂(面がないときも砂へ)
    const x = clamp(c.s, 0.03, 0.97) * W, k = (sandY(x + 1) - sandY(x - 1)) / 2 * (1 - (c.dep || 0)), n = Math.hypot(1, k);
    c.x = x + (c.bx || 0); c.y = sandPos(x, c.z, c.dep) + (c.by || 0); c.tx = 1 / n; c.ty = k / n; c.ux = k / n; c.uy = -1 / n; return;
  }
  const [lo, hi] = rangeOf(c), s = clamp(c.s, lo, hi), p = raw(pl, s), p0 = raw(pl, s - 0.04), p1 = raw(pl, s + 0.04);
  let tx = p1[0] - p0[0], ty = p1[1] - p0[1]; const n = Math.hypot(tx, ty) || 1; tx /= n; ty /= n;
  let ux = ty, uy = -tx; if (uy > 0 || (uy === 0 && ux < 0)) { ux = -ux; uy = -uy; }
  c.x = p[0] + (c.bx || 0); c.y = p[1] + (c.by || 0); c.tx = tx; c.ty = ty; c.ux = ux; c.uy = uy;
}
const lenOf = c => { if (c.surf === "rock" || c.surf === "wood") return polyOf(c)?.len || 1; return W; };
function rangeOf(c, sp){
  const pl = c.surf === "sand" ? null : polyOf(c);
  if (!pl || !pl.ok) return [0.03, 0.97];
  return (sp || c.sp) === "snail" && pl.sn ? pl.sn : [pl.s0, pl.s1];
}
/* 前面ガラスの苔の多い所(scene.js の苔の分布:下寄り+左右の隅)に合わせた、貝・オトの行き先。
   苔の濃さ ≒ 0.04 + 0.75·yf³ + 0.45·edge·(0.35+0.65·yf)(yf:水面〜下端の比、edge:左右 12% の隅で 1)。
   帯の上端は、中央で yf=0.6、隅で yf=0.35(下端側ほど濃い)、下端は砂の少し上(sandY − 8U)。砂の下には出ない */
const edgeOf = x => Math.max(0, 1 - Math.min(x / W, 1 - x / W) / 0.12);
export function glassBand(x){
  const top = waterTop + (H - waterTop) * lerp(0.6, 0.35, edgeOf(x));
  return [top, Math.max(top + 4 * U, sandY(clamp(x, 0, W)) - 8 * U)];
}
function randGlassF(){
  const fx = Math.random() < 0.4 ? (Math.random() < 0.5 ? rnd(0.05, 0.16) : rnd(0.84, 0.95)) : rnd(0.06, 0.94), [y0, y1] = glassBand(fx * W);
  return { surf: "gF", id: 0, s: 0, z: 0, dep: 0, fx, fy: rnd(y0, y1) / H };
}
const onGlass = c => c.surf === "gF" || c.surf === "gB";
const keyOf = c => c.surf === "rock" ? "r" + c.id : c.surf === "wood" ? "w" + c.id : c.surf; // 「同じ面」の識別

/* ---------------- 重なりの回避 ---------------- */
/* 体の半径(中心から体の端まで。同じ面の個体どうしの重なりの判定に使う):エビ・オトは体長の半分(オトはガラスでの拡大縮小を含む)、貝は殻と足の広がりで横向き 0.45 × 体長、ガラスの足の裏は 0.6 × 体長 */
export function crawlerRadius(f){
  const c = f.cr, L = SPECIES[f.sp].len * U * f.scale;
  if (f.sp === "snail") return L * (c.surf === "gF" || c.tl > 0 ? 0.6 * 1.2 : 0.45);
  if (f.sp === "oto") return 0.5 * L * (c.surf === "gB" ? 0.8 : c.surf === "gF" ? 1.1 : 1);
  return 0.5 * L;
}
/* 個体の位置(描かれている中心付近。跳んでいる・泳いでいるときも) */
function posOf(c){
  if (c.st === "hop") return [c.x, c.y];
  if (c.surf === "gF" || c.surf === "gB" || c.st === "swim") return [c.fx * W, c.fy * H];
  return [c.x, c.y];
}
/* 同じ面に「いる」個体(跳躍中・泳ぎ中は含めない)と、行き先の予約(res)の位置・半径・面 */
function* occupants(self, key){
  for (const o of fishes) {
    const c = o.cr; if (o === self || !c || !SPECIES[o.sp].solo) continue;
    if (c.st !== "hop" && c.st !== "swim" && keyOf(c) === key) yield [c.surf === "gF" || c.surf === "gB" ? c.fx * W : c.x, c.surf === "gF" || c.surf === "gB" ? c.fy * H : c.y, crawlerRadius(o)];
    if (c.res && c.res.key === key) yield [c.res.x, c.res.y, c.res.r];
  }
}
/* いま (x0, y0) にいる個体 f が (nx, ny) へ動くと、同じ面の誰かに近づきすぎるか(すでに近すぎる場合は、離れる動きなら許す) */
function blocked(f, c, nx, ny, key){
  const r = crawlerRadius(f), [x0, y0] = posOf(c);
  for (const [ox, oy, orad] of occupants(f, key)) {
    const minD = (r + orad) * CRAWL.sep, dn = Math.hypot(nx - ox, ny - oy);
    if (dn < minD && dn < Math.hypot(x0 - ox, y0 - oy) - 1e-6) return true;
  }
  return false;
}
/* 場所 (x, y) が面 key の他の個体から十分に離れているか(新しい居場所の選択用。余裕 1.35 倍) */
function clearance(f, key, x, y){
  const r = crawlerRadius(f); let m = Infinity;
  for (const [ox, oy, orad] of occupants(f, key)) m = Math.min(m, Math.hypot(x - ox, y - oy) / ((r + orad) * 1.35));
  return m;
}
/* gen() が返す候補のうち、ほかの個体がいない場所を選ぶ(最大 14 回試す。なければ最も空いている所) */
function freeSpot(f, gen){
  let best = null, bc = -1;
  for (let i = 0; i < 14; i++) {
    const sp = gen(); place(sp);
    const cl = clearance(f, keyOf(sp), sp.x, sp.y);
    if (cl >= 1) return sp;
    if (cl > bc) { bc = cl; best = sp; }
  }
  return best;
}

/* 新しい居場所の候補 { surf, id, s, z, dep, fx, fy }。hot:高温・低酸素の度合い(オトは水面近くのガラス、エビは流木の高い所へ寄る) */
function randSpot(sp, hot, noGlassF = false){
  const w = WEIGHTS[sp]; let kind = null, r = Math.random() * Object.keys(w).reduce((s, k) => s + (noGlassF && k === "gF" ? 0 : w[k]), 0);
  for (const k of Object.keys(w)) { if (noGlassF && k === "gF") continue; r -= w[k]; if (r <= 0) { kind = k; break; } }
  kind = kind || "sand";
  if (sp === "oto" && hot > 0.3 && Math.random() < hot) kind = Math.random() < 0.7 ? "gB" : "gF";
  if (sp === "shrimp" && hot > 0.3 && Math.random() < hot) kind = "wood";
  const c = { surf: kind, id: 0, s: 0.5, z: Math.random(), dep: 0, fx: 0, fy: 0, sp };
  if (kind === "gF" && hot <= 0.3) return Object.assign(randGlassF(), { sp });
  if (kind === "gF" || kind === "gB") {
    c.fx = rnd(0.06, 0.94);
    const y = hot > 0.3 ? rnd(waterTop + 25 * U, waterTop + 90 * U) : rnd(waterTop + 30 * U, sandY(c.fx * W) - 24 * U);
    c.fy = y / H;
  } else if (kind === "sand") c.s = rnd(0.04, 0.96);
  else {
    const list = kind === "rock" ? rockS : woodS, ids = list.map((p, i) => i).filter(i => list[i].ok && (sp !== "snail" || list[i].sn));
    if (!ids.length) { c.surf = "sand"; c.s = rnd(0.04, 0.96); return c; }
    c.id = ids[Math.floor(Math.random() * ids.length)];
    const pl = list[c.id], [lo, hi] = sp === "snail" ? pl.sn : [pl.s0, pl.s1];
    c.s = kind === "wood" && sp === "shrimp" && hot > 0.3 ? lerp(lerp(lo, hi, 0.6), hi, Math.random()) : lerp(lo, hi, Math.random());
  }
  return c;
}
function attach(c, spot){
  c.surf = spot.surf; c.id = spot.id; c.s = spot.s; c.z = spot.z; c.dep = spot.dep || 0; c.fx = spot.fx; c.fy = spot.fy;
  place(c);
  if (onGlass(c)) { // ガラスでの向き
    c.ang = Math.random() < (spot.surf === "gF" ? 0.85 : 0.5) ? rnd(-0.3, 0.3) : (Math.random() < 0.5 ? 1 : -1) * rnd(1.2, 1.7); // 前面ガラスは横向きが多い(苔の帯に沿う)
    c.sx = Math.random() < 0.5 ? 1 : -1;
  } else { c.fx = c.x / W; c.fy = c.y / H; }
}
function initCr(f){
  const c = { sp: f.sp, surf: "sand", id: 0, s: 0.5, z: 0, dep: 0, fx: 0, fy: 0, x: 0, y: 0, tx: 1, ty: 0, ux: 0, uy: -1, dir: Math.random() < 0.5 ? 1 : -1,
    st: f.sp === "oto" ? "stick" : "rest", t: rnd(0, 5), fade: 1, pk: 0, graze: 0, gz: 0, gt: rnd(1, 3), clk: 0, pause: 0, bx: 0, by: 0, tl: 0, res: null,
    hd: Math.random() < 0.5 ? 0 : Math.PI, hdD: 0, hdT: 3, ang: 0, sx: 1, sa: 0, ssx: 1, swim: null, hp: 0, hsx: 1 };
  f.cr = c; // (半径の計算が f.cr を読むので、先に付ける)
  attach(c, freeSpot(f, () => randSpot(f.sp, 0)));
  c.hdD = c.hd; f.phase = Math.random() * TAU;
  return c;
}

/* ---------------- 更新 ---------------- */
const wrapA = a => { while (a > Math.PI) a -= TAU; while (a < -Math.PI) a += TAU; return a; };
/* 面の上を s の方向(c.dir)へ v で進む。同じ面の誰かに近づきすぎるなら動かず、向きを変えて少し待つ。端で折り返す。動いたら true */
function stepSurf(f, c, v, dt){
  const [lo, hi] = rangeOf(c), key = keyOf(c);
  let s1 = c.s + c.dir * v * dt / lenOf(c);
  if (s1 < lo) { s1 = lo; c.dir = 1; } else if (s1 > hi) { s1 = hi; c.dir = -1; }
  const probe = { ...c, s: s1 }; place(probe);
  if (blocked(f, c, probe.x, probe.y, key)) { c.dir = -c.dir; c.pause = rnd(0.6, 1.6); return false; }
  c.s = s1; return true;
}
/* 砂の上を (tx, ty)(画面の座標)へ向かって v で進む(貝が手前の縁へ向かうとき・戻るとき)。誰かに近づきすぎるなら、少し向きを変えて試す(脇へよける)。動けなければ待つ。着いたら true */
function stepSand(f, c, tx, ty, v, dt){
  const [x0, y0] = [c.s * W, sandPos(c.s * W, c.z, c.dep)], dx = tx - x0, dy = ty - y0, d = Math.hypot(dx, dy);
  if (d < Math.max(0.5 * U, v * dt)) return true;
  const h = Math.atan2(dy, dx);
  for (const off of [0, 0.7, -0.7, 1.4, -1.4]) {
    const nx = clamp(x0 + Math.cos(h + off) * v * dt, 0.03 * W, 0.97 * W), ny = y0 + Math.sin(h + off) * v * dt, base = sandPos(nx, c.z, 0), full = yEdge() - base;
    const probe = { ...c, s: nx / W, dep: clamp((ny - base) / (full || 1), 0, 1) }; place(probe);
    if (blocked(f, c, probe.x, probe.y, "sand")) continue;
    c.s = probe.s; c.dep = probe.dep; if (Math.abs(nx - x0) > 0.05 * U * 0 + 1e-6) c.dir = nx > x0 ? 1 : -1;
    return false;
  }
  c.pause = rnd(0.5, 1.2); return false;
}
/* ガラスの上を向き hd(ラジアン)へ v で進む。誰かに近づきすぎるなら、少し向きを変えて試す。動けなければ待つ */
function stepGlass(f, c, hd, v, dt){
  const x0 = c.fx * W, y0 = c.fy * H;
  for (const off of [0, 0.7, -0.7, 1.4, -1.4]) {
    const nx = x0 + Math.cos(hd + off) * v * dt, ny = y0 + Math.sin(hd + off) * v * dt;
    if (!blocked(f, c, nx, ny, keyOf(c))) { c.fx = nx / W; c.fy = ny / H; return off; }
  }
  c.pause = rnd(0.5, 1.2); return null;
}

/* 貝:砂・岩・流木の上を這い、ときどき砂の手前の縁からガラスを這い上がって苔を食べ、また這い降りる */
function snailFreeGlass(f){ return freeSpot(f, () => Object.assign(randGlassF(), { sp: "snail" })); }
/* 砂の手前の縁の、ガラスへ移る(ガラスから戻る)場所:砂の上にも前面ガラスの上にも、ほかの個体がいない x を選ぶ */
function pickEdgeX(f, x0){
  let best = x0, bc = -1;
  for (let i = 0; i < 12; i++) {
    const x = clamp(x0 + (i ? rnd(-90, 90) * U : 0), 0.06 * W, 0.94 * W), cl = Math.min(clearance(f, "gF", x, yEdge()), clearance(f, "sand", x, yEdge()));
    if (cl >= 1) return x; if (cl > bc) { bc = cl; best = x; }
  }
  return best;
}
function updSnail(f, c, S, act, dt){
  c.bx *= Math.exp(-dt / 1.0); c.by *= Math.exp(-dt / 1.0); if (Math.abs(c.bx) < 0.01) c.bx = 0; if (Math.abs(c.by) < 0.01) c.by = 0;
  if (c.surf === "gF" && (c.st === "rest" || c.st === "move")) { c.st = "glass"; c.tl = 1; } // (テストなどでガラスへ置かれた貝)
  const onG = c.surf === "gF" || c.tl > 0;
  f.phase += dt * (onG ? 1.2 : 0.5) * act;
  if (c.stName !== c.st) { c.stName = c.st; c.stT = 0; } c.stT += dt;
  // 行き詰まり(岩・砂の入口で先客を待ち合う、など)を防ぐ:縁・入口への道のりが 150 秒を超えたら、あきらめて普通の移動に戻る
  if ((c.st === "toSand" || c.st === "toRock" || c.st === "toEdge") && c.stT > 150) { c.st = "move"; c.t = pickR(CRAWL.snailMove); c.res = null; c.dir = -c.dir; c.pause = 0; }
  if (c.pause > 0) { c.pause -= dt; place(c); return; }
  const v = S.speed * U * act, tilt = CRAWL.snailTilt;
  switch (c.st) {
    case "rest":
      c.t -= dt;
      if (c.t <= 0) {
        const pl = c.surf === "sand" ? null : polyOf(c), trip = Math.random() < CRAWL.snailGlassP;
        if (trip && c.surf === "sand") { c.gspot = snailFreeGlass(f); c.res = { key: "gF", x: c.gspot.x, y: c.gspot.y, r: crawlerRadius(f) * 1.2 }; c.edgeX = pickEdgeX(f, c.s * W); c.st = "toEdge"; }
        else if (trip && pl && pl.sn) { c.st = "toSand"; c.dir = (c.s - (pl.sn[0] + pl.sn[1]) / 2 < 0) === (pl.gEnd === 0) ? (pl.gEnd === 0 ? -1 : 1) : (pl.gEnd === 0 ? -1 : 1); c.dir = pl.gEnd === 0 ? -1 : 1; }
        else if (c.surf === "sand" && Math.random() < 0.3 && climbTarget(f, c)) c.st = "toRock";
        else { c.st = "move"; c.t = pickR(CRAWL.snailMove); c.dir = Math.random() < 0.5 ? 1 : -1; }
      }
      break;
    case "move":
      c.t -= dt; stepSurf(f, c, v, dt);
      if (c.t <= 0) { c.st = "rest"; c.t = pickR(CRAWL.snailRest); }
      break;
    case "toSand": { // 岩・流木を地面に近い端まで降りて、砂へ移る(端の点と砂の点の差は、短い間に滑らかに消す)
      const pl = polyOf(c), endS = pl.gEnd === 0 ? pl.sn[0] : pl.sn[1];
      c.dir = endS < c.s ? -1 : 1;
      stepSurf(f, c, v, dt); if (c.pause > 0) break;
      if (Math.abs(c.s - endS) * pl.len < 0.8 * U) {
        if (clearance(f, "sand", c.x, sandPos(c.x, 0, 0)) < 1) { c.pause = rnd(0.8, 1.6); break; } // 砂の入口に先客がいれば、端で待つ
        const x0 = c.x, y0 = c.y; c.surf = "sand"; c.s = x0 / W; c.z = 0; c.dep = 0; c.bx = c.by = 0; place(c); c.bx = x0 - c.x; c.by = y0 - c.y; place(c);
        c.gspot = snailFreeGlass(f); c.res = { key: "gF", x: c.gspot.x, y: c.gspot.y, r: crawlerRadius(f) * 1.2 }; c.edgeX = pickEdgeX(f, c.s * W); c.st = "toEdge"; }
      break;
    }
    case "toEdge": // 砂の上を手前の縁(前面ガラスとの境目)へ向かって斜めに這う
      if (stepSand(f, c, c.edgeX, yEdge(), v * 0.8, dt)) {
        if (clearance(f, "gF", c.x, yEdge()) < 1) { c.pause = rnd(0.8, 1.6); break; } // ガラスの縁に先客がいれば待つ
        c.st = "tilt"; c.tl = 0.001;
      }
      break;
    case "tilt": // 縁で、横向きの姿から足の裏を見せる姿へゆっくり向きを変える
      c.tl = Math.min(1, c.tl + dt / tilt);
      if (c.tl >= 1) { c.surf = "gF"; c.fx = c.x / W; c.fy = c.y / H; c.hd = -Math.PI / 2; c.hdD = c.dir >= 0 ? 0 : Math.PI; c.st = "climb"; }
      break;
    case "climb": { // ガラスを這い上がる(行き先の苔の帯へ向かって)
      const g = c.gspot, tx = g.fx * W, ty = g.fy * H, dx = tx - c.fx * W, dy = ty - c.fy * H, d = Math.hypot(dx, dy);
      c.hd = Math.atan2(dy, dx); c.hdD += wrapA(c.hd - c.hdD) * Math.min(1, dt * 1.5);
      if (d < Math.max(1 * U, v * 1.2 * dt)) { c.st = "glass"; c.t = pickR(CRAWL.snailGlassStay); c.res = null; c.hd = Math.random() < 0.5 ? 0 : Math.PI; c.hdT = 3; break; }
      stepGlass(f, c, c.hd, v * 1.2, dt);
      break;
    }
    case "glass": { // 苔の帯を、横向きを基準に這う(向きを保ち、少しだけふらつく)
      c.t -= dt;
      c.hdT -= dt; if (c.hdT <= 0) { const base = Math.cos(c.hd) >= 0 ? 0 : Math.PI; c.hd = base + (Math.random() - 0.5) * 0.9; c.hdT = rnd(4, 12); }
      const x0 = c.fx * W, y0 = c.fy * H, [y0b, y1b] = glassBand(x0);
      const nx = x0 + Math.cos(c.hd) * v * 1.2 * dt, ny = y0 + Math.sin(c.hd) * v * 1.2 * dt, [by0, by1] = glassBand(nx);
      if (nx < W * 0.05 || nx > W * 0.95 || ny < by0 || ny > by1) c.hd = (nx < W * 0.05 ? 0 : nx > W * 0.95 ? Math.PI : (Math.cos(c.hd) >= 0 ? 0 : Math.PI)) + rnd(-0.2, 0.2);
      else stepGlass(f, c, c.hd, v * 1.2, dt);
      c.hdD += wrapA(c.hd - c.hdD) * Math.min(1, dt * 1.5);
      if (c.t <= 0) { c.edgeX = pickEdgeX(f, c.fx * W); c.st = "descend"; }
      break;
    }
    case "descend": { // ガラスを這い降りて、手前の縁へ
      const dx = c.edgeX - c.fx * W, dy = yEdge() - c.fy * H, d = Math.hypot(dx, dy);
      c.hd = Math.atan2(dy, dx); c.hdD += wrapA(c.hd - c.hdD) * Math.min(1, dt * 1.5);
      if (d < Math.max(1 * U, v * 1.2 * dt)) {
        if (clearance(f, "sand", c.edgeX, yEdge()) < 1) { c.pause = rnd(0.8, 1.6); break; } // 砂の縁に先客がいれば待つ
        c.fx = c.edgeX / W; c.fy = yEdge() / H; c.dir = Math.cos(c.hdD) >= 0 ? 1 : -1; c.st = "untilt"; break;
      }
      stepGlass(f, c, c.hd, v * 1.2, dt);
      break;
    }
    case "untilt": // 縁で、足の裏を見せる姿から横向きの姿へ戻る
      c.tl = Math.max(0, c.tl - dt / tilt);
      if (c.tl <= 0) { c.tl = 0; c.surf = "sand"; c.s = c.fx; c.z = 0; c.dep = 1; c.bx = c.by = 0; c.st = "return"; }
      break;
    case "return": // 砂の上を奥のほうへ戻る
      if (stepSand(f, c, c.s * W + rnd(-1, 1) * 0, sandPos(c.s * W, c.z, 0), v * 0.8, dt)) { c.dep = 0; c.st = "rest"; c.t = pickR(CRAWL.snailRest); }
      break;
    case "toRock": { // 砂の上を岩・流木の地面に近い端まで這って、登る
      const g = c.climb, pl = g.pl, endS = pl.gEnd === 0 ? pl.sn[0] : pl.sn[1], ep = raw(pl, endS);
      if (stepSand(f, c, ep[0], sandPos(ep[0], c.z, 0), v * 0.9, dt)) {
        if (clearance(f, keyOf({ surf: g.surf, id: g.id }), ep[0], ep[1]) < 1) { c.pause = rnd(0.8, 1.6); break; } // 岩・流木の入口に先客がいれば、砂で待つ
        const x0 = c.x, y0 = c.y; c.surf = g.surf; c.id = g.id; c.s = endS; c.bx = c.by = 0; place(c); c.bx = x0 - c.x; c.by = y0 - c.y; place(c);
        c.dep = 0; c.dir = pl.gEnd === 0 ? 1 : -1; c.st = "move"; c.t = pickR(CRAWL.snailMove);
      } else if (c.pause <= 0 && !g.pl) c.st = "rest";
      break;
    }
  }
  if (c.surf !== "gF") place(c);
}
/* 砂の上の貝が登れる岩・流木(貝の範囲があり、入口の近くにほかの個体がいない)を選ぶ */
function climbTarget(f, c){
  const cands = [];
  rockS.forEach((pl, i) => { if (pl.ok && pl.sn) cands.push({ surf: "rock", id: i, pl }); });
  woodS.forEach((pl, i) => { if (pl.ok && pl.sn) cands.push({ surf: "wood", id: i, pl }); });
  if (!cands.length) return false;
  const g = cands[Math.floor(Math.random() * cands.length)], ep = raw(g.pl, g.pl.gEnd === 0 ? g.pl.sn[0] : g.pl.sn[1]);
  if (clearance(f, keyOf({ surf: g.surf, id: g.id }), ep[0], ep[1]) < 1) return false;
  c.climb = g; return true;
}

/* エビ:歩く・つまむ・ときどき跳ねる(放物線で落ちる) */
function updShrimp(f, c, S, act, dt, hot){
  c.bx *= Math.exp(-dt / 1.0); c.by *= Math.exp(-dt / 1.0);
  c.pk += ((c.st === "pick" ? 1 : 0) - c.pk) * Math.min(1, dt * 6);
  f.clawT = (f.clawT || 0) + dt * (0.4 + 0.6 * c.pk);
  if (c.st === "hop") {
    c.hp += dt / c.hdur;
    const e = clamp(c.hp, 0, 1);
    c.x = lerp(c.hx0, c.hx1, e); c.y = lerp(c.hy0, c.hy1, e) - 4 * CRAWL.hopHeight * U * e * (1 - e);
    f.phase += dt * 14;
    if (c.hp >= 1) { attach(c, c.hspot); c.res = null; c.st = "pick"; c.t = pickR(CRAWL.shrimpPick); }
    return;
  }
  if (c.pause > 0) { c.pause -= dt; place(c); return; }
  c.t -= dt;
  if (c.st === "walk") {
    f.phase += dt * 8 * act;
    stepSurf(f, c, S.speed * U * act * CRAWL.shrimpWalkV, dt);
    if (c.t <= 0) { c.st = "pick"; c.t = pickR(CRAWL.shrimpPick); }
  } else if (c.t <= 0) { // pick の終わり
    if (Math.random() < CRAWL.shrimpHopP * (1 + hot * 2) && f.health > 0.2) {
      // 近い候補(ほかの個体がいない所)を選んで、短く跳ねる
      let best = null, bd = 1e9;
      for (let i = 0; i < 6; i++) { const sp = freeSpot(f, () => randSpot("shrimp", hot)), d = Math.hypot(sp.x - c.x, sp.y - c.y); if (clearance(f, keyOf(sp), sp.x, sp.y) >= 1 && d < bd) { bd = d; best = sp; } }
      if (best) {
        c.hspot = best; c.hx0 = c.x; c.hy0 = c.y; c.hx1 = best.x; c.hy1 = best.y; c.hdur = clamp(bd / (110 * U), 0.5, 1.4); c.hp = 0; c.hsx = best.x >= c.x ? 1 : -1; c.st = "hop";
        c.res = { key: keyOf(best), x: best.x, y: best.y, r: crawlerRadius(f) };
      } else { c.st = "pick"; c.t = pickR(CRAWL.shrimpPick); }
    } else { c.st = "walk"; c.t = pickR(CRAWL.shrimpWalk); c.dir = Math.random() < 0.5 ? 1 : -1; }
  }
  if (c.st !== "hop") place(c);
}

/* オト:ガラス・流木・岩に吸いついて削り、泳いで別の(空いている)場所へ移る。泳ぐ間、ほかの個体に近づきすぎないようにそれる */
function updOto(f, c, S, act, dt, hot){
  c.clk += dt;
  c.bx *= Math.exp(-dt / 1.0); c.by *= Math.exp(-dt / 1.0);
  if (c.st === "swim") {
    f.phase += dt * 10;
    const tg = { ...c.swim }; place(tg);
    const x = c.fx * W, y = c.fy * H, v = S.speed * U * act * CRAWL.otoSwimV, r = crawlerRadius(f);
    let dx = tg.x - x, dy = tg.y - y; const d = Math.hypot(dx, dy);
    c.t -= dt;
    if (d < Math.max(2 * U, v * dt) || c.t <= 0) { attach(c, c.swim); c.res = null; c.st = "stick"; c.t = pickR(CRAWL.otoStick); c.gz = 0; c.gt = rnd(1, 3); return; }
    // ほかの個体(吸いついている・泳いでいる、どの面でも)に近づきすぎそうなら、離れる向きを足してそれる
    let ax = dx / d, ay = dy / d;
    for (const o of fishes) {
      const q = o.cr; if (o === f || !q || !SPECIES[o.sp].solo) continue;
      const [ox, oy] = posOf(q), ro = crawlerRadius(o), rr = (r + ro) * 1.6, dd = Math.hypot(x - ox, y - oy);
      if (dd < rr && dd > 1e-6) { const w = (rr - dd) / (rr * 0.6); ax += (x - ox) / dd * w * 1.5; ay += (y - oy) / dd * w * 1.5; }
    }
    const an = Math.hypot(ax, ay) || 1; ax /= an; ay /= an;
    let nx = x + ax * v * dt, ny = y + ay * v * dt;
    nx = clamp(nx, 0.03 * W, 0.97 * W); ny = clamp(ny, waterTop + 6 * U, sandY(nx) - 6 * U); // 砂にもぐらない・水面から出ない
    c.sa = Math.atan2(ny - y, Math.abs(nx - x) + 4 * U); c.ssx = nx - x >= 0 ? 1 : -1;
    c.fx = nx / W; c.fy = ny / H;
    return;
  }
  if (c.pause > 0) c.pause -= dt;
  c.t -= dt; c.gt -= dt;
  if (c.gt <= 0) { c.gz = c.gz ? 0 : 1; c.gt = c.gz ? rnd(2, 5) : rnd(1, 3); } // 削る(2〜5 秒)と休む(1〜3 秒)を繰り返す
  c.graze += (c.gz - c.graze) * Math.min(1, dt * 5);
  f.phase += dt * 0.5;
  if (c.t <= 0) {
    c.swim = freeSpot(f, () => randSpot("oto", hot)); // 移動先(ほかの個体がいない所)
    place(c.swim); c.res = { key: keyOf(c.swim), x: c.swim.x, y: c.swim.y, r: crawlerRadius(f) };
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
  if (f.sp === "snail") return c.surf === "gF" || c.tl > 0 ? "glass" : "low";
  return "low";
}
/* 面の上の姿勢:接地点から面の上向きへ体の足元の分だけ浮かせる。向きは進行方向(t が右向きなら +1) */
function surfacePose(c, L, g, moveDir){
  const mrx = -c.uy, mry = c.ux, dot = c.tx * mrx + c.ty * mry;
  const sx = (dot >= 0 ? 1 : -1) * moveDir;
  return [c.x + c.ux * g * L, c.y + c.uy * g * L, Math.atan2(c.ux, -c.uy), sx];
}
function drawOne(f){
  const S = SPECIES[f.sp], c = f.cr, L0 = S.len * U * f.scale;
  if (f.sp === "snail") {
    if (c.tl > 0 && c.tl < 1) { drawSnailTilt(f, L0, c.surf === "gF" ? c.fx * W : c.x, c.surf === "gF" ? c.fy * H : c.y, c.dir >= 0 ? 1 : -1, c.tl); return; } // 縁で、横向き ⇔ 足の裏
    if (c.surf === "gF") { drawSnailFront(f, L0 * 1.2, c.fx * W, c.fy * H, c.hdD, 1); return; }
    const [x, y, rot, sx] = surfacePose(c, L0, GROUND.snail, c.dir);
    drawCreature(f, L0, 0, x, y, rot, sx, 1); return;
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
    const k = c.surf === "gB" ? 0.8 : 1.1; // 奥のガラスは小さく(奥行きの淡さは、描画順で後から重なる霞の層が受け持つ。透明にはしない)
    drawCreature(f, L0 * k, wag, c.fx * W + Math.cos(c.ang) * jit, c.fy * H + Math.sin(c.ang) * jit, c.ang, c.sx, 1); return;
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
    const c = f.cr; if (!SPECIES[f.sp].solo || !c) continue;
    const L = SPECIES[f.sp].len * U * f.scale;
    if (f.sp === "snail" && c.surf === "gF" && c.tl >= 1) out.push({ kind: "glassF", sp: "snail", x: c.fx * W + Math.cos(c.hdD) * L * 0.6, y: c.fy * H + Math.sin(c.hdD) * L * 0.6, r: L * 0.45, active: true });
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
/* 面からの浮き・めり込みの点検用:岩・流木・砂の上の個体の接地点(体の足元)と、その面の種類・番号 */
export function contactOf(f){
  const c = f.cr; if (!c || onGlass(c) || c.st === "swim" || c.st === "hop" || c.tl > 0) return null;
  return { x: c.x, y: c.y, surf: c.surf, id: c.id, dep: c.dep || 0, trans: Math.hypot(c.bx || 0, c.by || 0) > 0.3 };
}
