// 魚の生成・体調・行動(群れ・分離・壁・水温による層の移動)。
import { TAU, Tw, U, W, bottomY, clamp, counts, lerp, timeScale, waterTop } from "./core.js";
import { ORDER, SPECIES } from "./species.js";
import { FX, obstacles, spawnBubble, spawnPuff } from "./scene.js";
import { FISH_R } from "./fish-render.js";
import { DO, hypoxia } from "./aging.js";

/* 群れる種(school > 0.5)の形の調整。前後方向に一列に並ばないようにする */
const SCHOOL_VSPREAD = 1.0; // 目標位置の縦の散らばり(従来 0.6)
const SCHOOL_FORE = 1.3;  // 進行方向の前後で分離が効く距離の倍率(1 で従来どおり円形)

/* 水槽いっぱいに泳ぐための範囲。種の生息層 zone は傾向として残し、上下に広げて使う(下の baseZone)。
   横は体が端からはみ出さないよう、体長に応じた余白(体長 × X_MARGIN_L か、幅の X_MARGIN_W の大きいほう)を取る */
const X_MARGIN_W = 0.02, X_MARGIN_L = 0.6; // 個体の目標・初期位置の横の余白
const SCHOOL_X = [0.05, 0.95];             // 群れの中心の横の範囲(幅に対する比)
const LOOSE_PULL = 0.15;                   // 群れ度 0.5 以下の種:群れの中心へ引かれる強さの倍率(1 だと範囲の端へ行けない)
const ARRIVE_L = 0.3;                      // 目標に着いたとみなす距離(体長の倍率。従来 1.2。大きいと端の目標の手前で切り替わり、端まで行けない)
const WALL_L = 0.6;                        // 壁の反発が始まる距離(体長の倍率。従来 1.2)
const CENTER_V = 1.0;                      // 群れの中心の最高速度(種の速さの倍率)
const TRAVEL_K = 0.6;                      // 目標へ着くまでの見込み時間 = 距離 / (種の速さ × この倍率)。次の目標へ切り替えるまでの下限(途中で切り替えると端まで行けない)
const ZONE_UP = 0.3, ZONE_DOWN = 0.75;     // 層の広げ方:a' = 0.3a、b' = b + 0.75(0.95 − b)
function xRange(L){ const m = Math.max(X_MARGIN_W * W, L * X_MARGIN_L); return [m, W - m]; }
function randX(L){ const [lo, hi] = xRange(L); return lo + Math.random() * (hi - lo); }

/* 向きを変える動き(U ターン):一度始めたら、速さに関係なく最後まで回りきる(途中で止まらない・逆戻りしない)。
   始めるのは、進行方向が今の向きと逆で、速さが TURN_START × U を超える状態が TURN_HOLD 秒続いたとき(速さが小さいときの揺れでは始めない)。
   回る間(TURN_T 秒)は、前へ進みながら弧を描く:横の速度を cos で反転させ、縦へ TURN_ARC × 速さ × sin で逃げる。横幅(flip)は smoothstep でなめらかに ±1 の間を動く。 */
const TURN_START = 5, TURN_HOLD = 0.15, TURN_T = 0.95, TURN_ARC = 0.5;
const smooth = p => p * p * (3 - 2 * p);

/* 層の入れ替え(z が 0.45 をまたぐ=描く層が変わる)で魚が物の後ろへ瞬時に隠れる・前へ瞬時に現れるのを防ぐ。
   魚の外接(FISH_R の正方形)が、流木・岩・中景の草の塗られる輪郭(scene.js の obstacles)と重なっている間は、またがない。 */
export const LAYER_Z = 0.45;
export function overlapsObstacle(x, y, R){
  const x0 = x - R, y0 = y - R, x1 = x + R, y1 = y + R;
  for (const o of obstacles) {
    const b = o.bb;
    if (b[2] < x0 || b[0] > x1 || b[3] < y0 || b[1] > y1) continue;
    const pts = o.pts;
    for (let i = 0; i < pts.length; i++) { const p = pts[i]; if (p[0] >= x0 && p[0] <= x1 && p[1] >= y0 && p[1] <= y1) return true; } // 物の頂点が箱の中
    for (let i = 0; i <= 6; i++) for (let j = 0; j <= 6; j++) if (inPoly(x0 + (x1 - x0) * i / 6, y0 + (y1 - y0) * j / 6, pts)) return true; // 箱の格子点が物の中
    for (let i = 0, k = pts.length - 1; i < pts.length; k = i++) if (segHitsBox(pts[k], pts[i], x0, y0, x1, y1)) return true; // 物の辺が箱を横切る
  }
  return false;
}
function inPoly(x, y, pts){ let c = false; for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) { const a = pts[i], b = pts[j]; if ((a[1] > y) !== (b[1] > y) && x < (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]) + a[0]) c = !c; } return c; }
function segHitsBox(a, b, x0, y0, x1, y1){ // 線分 ab と箱の交差(Liang–Barsky)
  let t0 = 0, t1 = 1; const dx = b[0] - a[0], dy = b[1] - a[1];
  for (const [p, q] of [[-dx, a[0] - x0], [dx, x1 - a[0]], [-dy, a[1] - y0], [dy, y1 - a[1]]]) {
    if (p === 0) { if (q < 0) return false; } else { const r = q / p; if (p < 0) { if (r > t1) return false; if (r > t0) t0 = r; } else { if (r < t0) return false; if (r < t1) t1 = r; } }
  }
  return true;
}

/* ---------------- 魚の生成 ---------------- */
export const fishes = [];
export const schools = {};
ORDER.forEach(k => schools[k] = { x: 0, y: 0, cx: 0, cy: 0, timer: 0 });

/* 低酸素(DO < 3.0 mg/L)での体調低下:rate = HYPOXIA_K × ((3 − DO)/3)² / hardy [/秒]。DO=1 で約 3 分(1.0→0.4)、DO=0 で約 2 分(1.0→0.04) */
const HYPOXIA_DO = 3.0, HYPOXIA_K = 0.0075;

/* hyp:低酸素係数(既定は現在の DO から)。水面へ寄る強さは、暑さ係数と低酸素係数の大きいほう(水面呼吸) */
/* 種の生息層を広げたもの(コリドラスは底のまま) */
export function baseZone(S){
  const [a, b] = S.zone;
  if (S === SPECIES.cory) return [a, b];
  return [a * ZONE_UP, b + ZONE_DOWN * (0.95 - b)];
}
export function effectiveZone(S, hyp = hypoxia(DO)){
  const cold = clamp((23 - Tw) / 5, 0, 1), hot = Math.max(clamp((Tw - 29) / 4, 0, 1), hyp);
  let [a, b] = baseZone(S);
  a = lerp(a, 0.55, cold * 0.6); b = lerp(b, 0.95, cold * 0.6);
  a = lerp(a, 0.0, hot * 0.9); b = lerp(b, 0.16, hot * 0.9);
  return [a, b];
}
function zoneY(x, frac, z){ return waterTop + 20 * U + frac * (bottomY(x, z) - waterTop - 40 * U); }

export function makeFish(sp){
  const S = SPECIES[sp];
  const z = Math.random();
  const x = randX(S.len * U * 1.1); // 体長は最大(scale 1.12)に近い値で余白を取る
  const zn = baseZone(S);
  const y = sp === "cory" ? bottomY(x, z) - 10 * U : zoneY(x, lerp(zn[0], zn[1], Math.random()), z);
  const f = { sp, x, y, z, zt: z, vx: (Math.random() - 0.5) * 20 * U, vy: 0, flip: Math.random() < 0.5 ? 1 : -1, turnT: 0, turnSide: 1, turnS: 0, turnDir: 0, turnV0: 0, turnHold: 0, pitch: 0, tilt: 0,
    phase: Math.random() * TAU, health: 1, hardy: 0.85 + Math.random() * 0.3, scale: 0.88 + Math.random() * 0.24,
    ox: Math.random() * 2 - 1, oy: Math.random() * 2 - 1, tx: x, ty: y, tTimer: Math.random() * 3, burst: 0,
    variant: Math.floor(Math.random() * S.variants), pale: 0, state: "forage", stateT: Math.random() * 4, spots: [] };
  for (let i = 0; i < 7; i++) f.spots.push([0.35 + Math.random() * 0.55, (Math.random() - 0.5) * 0.7, 0.5 + Math.random()]);
  if (sp === "angel" && Math.random() < 0.3) f.variant = 1;
  return f;
}
export function syncFish(){
  ORDER.forEach(sp => {
    const list = fishes.filter(f => f.sp === sp);
    let diff = counts[sp] - list.length;
    while (diff > 0) { fishes.push(makeFish(sp)); diff--; }
    while (diff < 0) { const idx = fishes.lastIndexOf(fishes.filter(f => f.sp === sp).pop()); fishes.splice(idx, 1); diff++; }
  });
}

/* ---------------- 体調・行動 ---------------- */
export function activity(T){ return T < 26 ? clamp(0.35 + (T - 18) / 8 * 0.65, 0.35, 1) : 1 + Math.min(0.45, (T - 26) * 0.07); }

export function updateHealth(f, dt){
  const [lo, hi] = SPECIES[f.sp].opt;
  const d = dt * timeScale;
  const lowDO = DO < HYPOXIA_DO;
  if (Tw < lo) {
    const rate = (lo - Tw) * 0.0011 / f.hardy;
    if (f.health > 0.38) f.health = Math.max(0.38, f.health - rate * d);
  } else if (Tw > hi) {
    const rate = Math.pow(Tw - hi, 1.5) * 0.0007 / f.hardy;
    f.health = Math.max(0.04, f.health - rate * d);
  } else if (!lowDO) {
    f.health = Math.min(1, f.health + 0.008 * d);
  }
  if (lowDO) { // 低酸素:適温でも回復しない。下限は高温と同じ 0.04
    const x = (HYPOXIA_DO - DO) / HYPOXIA_DO;
    f.health = Math.max(0.04, f.health - HYPOXIA_K * x * x / f.hardy * d);
  }
  f.pale = clamp((0.85 - f.health) * 1.1, 0, 0.85);
}

function schoolSpread(n){ return (40 + Math.sqrt(n) * 22) * U; }
function pickTarget(f){
  const S = SPECIES[f.sp];
  const zn = effectiveZone(S);
  f.tx = randX(S.len * U * f.scale);
  f.ty = zoneY(f.tx, lerp(zn[0], zn[1], Math.random()), f.z);
  f.tTimer = (f.sp === "angel" ? 5 : 2.5) + Math.random() * 5;
  f.tTimer = Math.max(f.tTimer, Math.hypot(f.tx - f.x, f.ty - f.y) / (S.speed * U * TRAVEL_K));
  if (Math.random() < 0.25) f.zt = Math.random();
}

export function updateSchools(dt){
  ORDER.forEach(sp => {
    const s = schools[sp], S = SPECIES[sp];
    if (S.solo) return; // 群れの中心を持たない種(オト・エビ・貝)
    s.timer -= dt;
    if (s.timer <= 0) {
      const zn = effectiveZone(S);
      s.x = W * (SCHOOL_X[0] + Math.random() * (SCHOOL_X[1] - SCHOOL_X[0]));
      s.y = zoneY(s.x, lerp(zn[0], zn[1], Math.random()), 0.5);
      s.timer = 4 + Math.random() * 6;
      if (!s.cx) { s.cx = s.x; s.cy = s.y; }
    }
    // 群れの中心は魚の速さより速く動かさない(離れた目標へ速く動くと、魚が追いつくまで群れが引き伸ばされ、追いつくときに詰まる)
    const vmax = S.speed * U * CENTER_V * dt;
    const mx = (s.x - s.cx) * Math.min(1, dt * 0.35), my = (s.y - s.cy) * Math.min(1, dt * 0.35), mh = Math.hypot(mx, my);
    const k = mh > vmax ? vmax / mh : 1;
    s.cx += mx * k; s.cy += my * k;
  });
}

export function updateFish(f, dt){
  const S = SPECIES[f.sp];
  const L = S.len * U * f.scale;
  const hot = Math.max(clamp((Tw - 29) / 4, 0, 1), hypoxia(DO)), cold = clamp((23 - Tw) / 5, 0, 1);
  const act = activity(Tw) * (0.3 + 0.7 * f.health);
  let tx, ty, speed = S.speed * U * act;

  if (f.sp === "cory") {
    f.stateT -= dt;
    const floorY = bottomY(f.x, f.z) - L * 0.25;
    if (f.state === "air") {
      tx = f.tx; ty = waterTop + L * 0.3; speed *= 2.2;
      if (f.y < waterTop + L * 0.7) { f.state = "down"; spawnBubble(f.x + f.flip * L * 0.5, f.y, 1.6 * U); }
    } else if (f.state === "down") {
      tx = f.tx; ty = floorY; speed *= 1.6;
      if (f.y > floorY - L * 0.3) { f.state = "forage"; f.stateT = 3 + Math.random() * 4; }
    } else {
      if (f.stateT <= 0) {
        const rnd = Math.random(), airP = 0.05 + hot * 0.45;
        if (rnd < airP && f.health > 0.25) { f.state = "air"; f.tx = f.x + (Math.random() - 0.5) * 120 * U; }
        else if (rnd < 0.45) { f.state = "rest"; f.stateT = 2 + Math.random() * 4; }
        else { f.state = "forage"; f.stateT = 3 + Math.random() * 5;
          const sc = schools.cory; f.tx = lerp(f.x + (Math.random() - 0.5) * 320 * U, sc.cx, S.school); }
      }
      tx = f.state === "rest" ? f.x : f.tx; ty = floorY;
      speed *= f.state === "rest" ? 0.05 : 0.55;
    }
    // 砂つつき:forage 中ときどき口先を砂に突っ込み(約 0.9 秒)、砂煙の粒を数粒上げる(FX.puff が false なら何もしない)
    if (FX.puff && f.state === "forage") {
      if (f.dig > 0) { f.dig -= dt; speed *= 0.25; if (Math.random() < dt * 14) spawnPuff(f.x + f.flip * L * 0.5, f.y + L * 0.22); }
      else if (f.health > 0.3 && Math.random() < dt * 0.35) f.dig = 0.9;
    }
    { const [lo, hi] = xRange(L); tx = clamp(tx, lo, hi); }
  } else {
    f.tTimer -= dt;
    if (f.tTimer <= 0 || Math.hypot(f.tx - f.x, f.ty - f.y) < L * ARRIVE_L) pickTarget(f);
    const s = schools[f.sp];
    const n = counts[f.sp];
    const spread = schoolSpread(n);
    const pull = S.solo ? 0 : S.school > 0.5 ? S.school : S.school * LOOSE_PULL;
    tx = lerp(f.tx, s.cx + f.ox * spread * 1.4, pull);
    // 群れる種は縦の散らばりを大きくして、進行方向に細長い一列に見えないようにする(他の種は従来どおり 0.6)
    ty = lerp(f.ty, s.cy + f.oy * spread * (S.school > 0.5 ? SCHOOL_VSPREAD : 0.6), pull);
    // 高水温:水面へ。低水温:底寄りに沈みがち
    ty = lerp(ty, waterTop + (12 + Math.abs(f.oy) * 30) * U, hot * 0.85);
    if (f.health < 0.3) ty = lerp(ty, bottomY(f.x, f.z) - L * 0.5, (0.3 - f.health) / 0.3 * (hot > 0 ? 0.25 : 0.8));
    if (hot > 0.2 && f.y < waterTop + L && Math.random() < dt * 0.6 * hot) spawnBubble(f.x + f.flip * L * 0.5, f.y - 3 * U, 1.3 * U);
  }

  // 目標への速度
  let dx = tx - f.x, dy = ty - f.y;
  const d = Math.hypot(dx, dy) || 1;
  const arrive = Math.min(1, d / (L * 2.5));
  let desx = dx / d * speed * (1 + f.burst) * arrive;
  let desy = dy / d * speed * (1 + f.burst) * arrive * 0.65;

  // 群れ:分離と整列
  let sepx = 0, sepy = 0, alx = 0, aly = 0, an = 0;
  // 進行方向の単位ベクトル。速度が基準速度の 10% 未満だと向きがノイズになる(0 だと向きが定まらず、全同種から押される)ので、
  // そのときは従来の円形の分離にする(10% は school-metric.mjs で「ほぼ静止」とみなす値と同じ)
  const hv = Math.hypot(f.vx, f.vy), hx = f.vx / (hv || 1), hy = f.vy / (hv || 1);
  const flock = S.school > 0.5 && hv >= 0.1 * S.speed * U;
  for (const o of fishes) {
    if (o === f) continue;
    const ox = f.x - o.x, oy = f.y - o.y, dd = ox * ox + oy * oy;
    const rad = L * (o.sp === f.sp ? 1.0 : 0.8);
    if (flock && o.sp === f.sp && dd > 0.01) {
      // 群れる種の同種間:進行方向の前後は分離半径を長くして(楕円)、数珠つなぎの等間隔を崩す
      const al = ox * hx + oy * hy, pe = oy * hx - ox * hy;
      const de = Math.sqrt(al * al / (SCHOOL_FORE * SCHOOL_FORE) + pe * pe);
      if (de < rad) { const k = (rad - de) / rad; sepx += ox * k; sepy += oy * k; }
    } else if (dd < rad * rad && dd > 0.01) { const k = (rad - Math.sqrt(dd)) / rad; sepx += ox * k; sepy += oy * k; }
    if (o.sp === f.sp && dd < (L * 5) ** 2) { alx += o.vx; aly += o.vy; an++; }
  }
  desx += sepx * 1.6; desy += sepy * 1.6;
  if (an && S.school > 0.5) { desx = lerp(desx, alx / an, 0.25); desy = lerp(desy, aly / an, 0.25); }

  // 壁
  const m = L * WALL_L;
  if (f.x < m) desx += (m - f.x) * 3; if (f.x > W - m) desx -= (f.x - (W - m)) * 3;

  const accel = Math.min(1, dt * (1.2 + act));
  f.vx += (desx - f.vx) * accel;
  f.vy += (desy - f.vy) * accel;
  // 向きを変える途中(U ターン):横の速度は cos で反転し、縦へ弧を描いて逃げる(速度ベクトルを回していく)
  let yArc = 0;
  if (f.turnT > 0) {
    f.turnT += dt;
    const p = Math.min(1, f.turnT / TURN_T);
    const e = smooth(p), th = Math.PI * e;
    f.vx = f.turnSide * f.turnV0 * Math.cos(th) + sepx * 1.6; // 回る間も、ほかの魚との分離は効かせる(重なって詰まらないように)
    yArc = f.turnDir * TURN_ARC * f.turnV0 * Math.sin(th);
    f.turnS = Math.sin(th);
  }
  f.x += f.vx * dt; f.y += (f.vy + yArc) * dt;
  f.x = clamp(f.x, L * 0.6, W - L * 0.6);
  f.y = clamp(f.y, waterTop + L * 0.35, bottomY(f.x, f.z) - L * 0.22);

  { // z は目標へゆっくり近づく。0.45 をまたぐ(描く層が変わる)ときは、外接が物の輪郭と重なっていなければまたぐ。重なっていれば手前で待つ
    const z0 = f.z; let z1 = z0 + (f.zt - z0) * dt * 0.08;
    if (S.solo !== true && f.sp !== "cory" && (z0 < LAYER_Z) !== (z1 < LAYER_Z)) {
      const R = L * (0.72 + 0.38 * Math.max(z0, z1)) * FISH_R[f.sp]; // 描画時の体長は L × (0.72 + 0.38 z)。またぐ前後の大きいほうの z での外接の半径
      if (overlapsObstacle(f.x, f.y, R)) z1 = z0 < LAYER_Z ? Math.min(z1, LAYER_Z - 1e-6) : Math.max(z1, LAYER_Z);
    }
    f.z = z1;
  }
  if (f.sp !== "cory" && S.school < 0.5 && Math.random() < dt * 0.05) f.burst = 0.6;
  if (S.school > 0.5 && Math.random() < dt * 0.03) f.burst = 0.9;
  f.burst *= Math.exp(-dt * 2.2);

  // 向き・姿勢
  if (f.turnT > 0) {
    const p = Math.min(1, f.turnT / TURN_T);
    f.flip = f.turnSide * (1 - 2 * smooth(p)); // 横幅の縮み:+側 → 0(正面向き)→ −側。smoothstep でなめらか(見た目の最小幅は描画側の FLIP_MIN)
    if (p >= 1) { f.flip = -f.turnSide; f.turnT = 0; f.turnS = 0; f.turnHold = 0; }
  } else {
    const side = f.flip >= 0 ? 1 : -1;
    if (Math.abs(f.vx) > TURN_START * U && Math.sign(f.vx) !== side) {
      f.turnHold += dt;
      if (f.turnHold >= TURN_HOLD) { // 回り始める。縦は水槽の中央へ向かって(群れの中心が上にあれば下へ、下にあれば上へ)逃げる
        f.turnT = dt; f.turnSide = side; f.turnV0 = Math.abs(f.vx); f.turnHold = 0;
        f.turnDir = schools[f.sp].cy < (waterTop + bottomY(f.x, f.z)) / 2 ? 1 : -1; f.turnS = 0; // 同種は群れの中心を基準に同じ側へ逃げる(隣どうしが上下逆へ逃げて交差しない)
      }
    } else f.turnHold = 0;
  }
  const pt = clamp(Math.atan2(f.vy, Math.abs(f.vx) + 6 * U), -0.45, 0.45);
  f.pitch += (pt - f.pitch) * Math.min(1, dt * 4);
  let tilt = 0;
  if (f.sp === "cory" && f.state === "forage") tilt = f.dig > 0 ? 0.5 : 0.14;
  tilt += Math.pow(1 - f.health, 2) * (hot > 0 ? -0.35 : 0.45);
  f.tilt += (tilt - f.tilt) * Math.min(1, dt * 2);
  const sp = Math.hypot(f.vx, f.vy);
  f.phase += dt * (2.5 + sp / L * 4.5 + f.turnS * 3) * S.wagRate * (hot > 0 ? 1 + hot * 0.5 : 1); // 回る間は尾を速く振る
  f.speedNow = sp;
}
