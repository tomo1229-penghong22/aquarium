// 魚の生成・体調・行動(群れ・分離・壁・水温による層の移動)。
import { TAU, Tw, U, W, bottomY, clamp, counts, lerp, timeScale, waterTop } from "./core.js";
import { ORDER, SPECIES } from "./species.js";
import { spawnBubble } from "./scene.js";

/* ---------------- 魚の生成 ---------------- */
export const fishes = [];
export const schools = {};
ORDER.forEach(k => schools[k] = { x: 0, y: 0, cx: 0, cy: 0, timer: 0 });

function effectiveZone(S){
  const cold = clamp((23 - Tw) / 5, 0, 1), hot = clamp((Tw - 29) / 4, 0, 1);
  let a = S.zone[0], b = S.zone[1];
  a = lerp(a, 0.55, cold * 0.6); b = lerp(b, 0.95, cold * 0.6);
  a = lerp(a, 0.0, hot * 0.9); b = lerp(b, 0.16, hot * 0.9);
  return [a, b];
}
function zoneY(x, frac, z){ return waterTop + 20 * U + frac * (bottomY(x, z) - waterTop - 40 * U); }

export function makeFish(sp){
  const S = SPECIES[sp];
  const z = Math.random();
  const x = W * (0.1 + Math.random() * 0.8);
  const zn = S.zone;
  const y = sp === "cory" ? bottomY(x, z) - 10 * U : zoneY(x, lerp(zn[0], zn[1], Math.random()), z);
  const f = { sp, x, y, z, zt: z, vx: (Math.random() - 0.5) * 20 * U, vy: 0, flip: Math.random() < 0.5 ? 1 : -1, pitch: 0, tilt: 0,
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
function activity(T){ return T < 26 ? clamp(0.35 + (T - 18) / 8 * 0.65, 0.35, 1) : 1 + Math.min(0.45, (T - 26) * 0.07); }

export function updateHealth(f, dt){
  const [lo, hi] = SPECIES[f.sp].opt;
  const d = dt * timeScale;
  if (Tw < lo) {
    const rate = (lo - Tw) * 0.0011 / f.hardy;
    if (f.health > 0.38) f.health = Math.max(0.38, f.health - rate * d);
  } else if (Tw > hi) {
    const rate = Math.pow(Tw - hi, 1.5) * 0.0007 / f.hardy;
    f.health = Math.max(0.04, f.health - rate * d);
  } else {
    f.health = Math.min(1, f.health + 0.008 * d);
  }
  f.pale = clamp((0.85 - f.health) * 1.1, 0, 0.85);
}

function pickTarget(f){
  const S = SPECIES[f.sp];
  const zn = effectiveZone(S);
  f.tx = W * (0.07 + Math.random() * 0.86);
  f.ty = zoneY(f.tx, lerp(zn[0], zn[1], Math.random()), f.z);
  f.tTimer = (f.sp === "angel" ? 5 : 2.5) + Math.random() * 5;
  if (Math.random() < 0.25) f.zt = Math.random();
}

export function updateSchools(dt){
  ORDER.forEach(sp => {
    const s = schools[sp], S = SPECIES[sp];
    s.timer -= dt;
    if (s.timer <= 0) {
      const zn = effectiveZone(S);
      s.x = W * (0.15 + Math.random() * 0.7);
      s.y = zoneY(s.x, lerp(zn[0], zn[1], Math.random()), 0.5);
      s.timer = 4 + Math.random() * 6;
      if (!s.cx) { s.cx = s.x; s.cy = s.y; }
    }
    s.cx += (s.x - s.cx) * Math.min(1, dt * 0.35);
    s.cy += (s.y - s.cy) * Math.min(1, dt * 0.35);
  });
}

export function updateFish(f, dt){
  const S = SPECIES[f.sp];
  const L = S.len * U * f.scale;
  const hot = clamp((Tw - 29) / 4, 0, 1), cold = clamp((23 - Tw) / 5, 0, 1);
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
          const sc = schools.cory; f.tx = clamp(lerp(f.x + (Math.random() - 0.5) * 320 * U, sc.cx, S.school), 50 * U, W - 50 * U); }
      }
      tx = f.state === "rest" ? f.x : f.tx; ty = floorY;
      speed *= f.state === "rest" ? 0.05 : 0.55;
    }
    tx = clamp(tx, 40 * U, W - 40 * U);
  } else {
    f.tTimer -= dt;
    if (f.tTimer <= 0 || Math.hypot(f.tx - f.x, f.ty - f.y) < L * 1.2) pickTarget(f);
    const s = schools[f.sp];
    const n = counts[f.sp];
    const spread = (40 + Math.sqrt(n) * 22) * U;
    tx = lerp(f.tx, s.cx + f.ox * spread * 1.4, S.school);
    ty = lerp(f.ty, s.cy + f.oy * spread * 0.6, S.school);
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
  for (const o of fishes) {
    if (o === f) continue;
    const ox = f.x - o.x, oy = f.y - o.y, dd = ox * ox + oy * oy;
    const rad = L * (o.sp === f.sp ? 1.0 : 0.8);
    if (dd < rad * rad && dd > 0.01) { const k = (rad - Math.sqrt(dd)) / rad; sepx += ox * k; sepy += oy * k; }
    if (o.sp === f.sp && dd < (L * 5) ** 2) { alx += o.vx; aly += o.vy; an++; }
  }
  desx += sepx * 1.6; desy += sepy * 1.6;
  if (an && S.school > 0.5) { desx = lerp(desx, alx / an, 0.25); desy = lerp(desy, aly / an, 0.25); }

  // 壁
  const m = L * 1.2;
  if (f.x < m) desx += (m - f.x) * 3; if (f.x > W - m) desx -= (f.x - (W - m)) * 3;

  const accel = Math.min(1, dt * (1.2 + act));
  f.vx += (desx - f.vx) * accel;
  f.vy += (desy - f.vy) * accel;
  f.x += f.vx * dt; f.y += f.vy * dt;
  f.x = clamp(f.x, L * 0.6, W - L * 0.6);
  f.y = clamp(f.y, waterTop + L * 0.35, bottomY(f.x, f.z) - L * 0.22);

  f.z += (f.zt - f.z) * dt * 0.08;
  if (f.sp !== "cory" && S.school < 0.5 && Math.random() < dt * 0.05) f.burst = 0.6;
  if (S.school > 0.5 && Math.random() < dt * 0.03) f.burst = 0.9;
  f.burst *= Math.exp(-dt * 2.2);

  // 向き・姿勢
  if (Math.abs(f.vx) > 4 * U) { const tf = Math.sign(f.vx); f.flip += clamp(tf - f.flip, -dt * 4.5, dt * 4.5); }
  const pt = clamp(Math.atan2(f.vy, Math.abs(f.vx) + 6 * U), -0.45, 0.45);
  f.pitch += (pt - f.pitch) * Math.min(1, dt * 4);
  let tilt = 0;
  if (f.sp === "cory" && f.state === "forage") tilt = 0.14;
  tilt += Math.pow(1 - f.health, 2) * (hot > 0 ? -0.35 : 0.45);
  f.tilt += (tilt - f.tilt) * Math.min(1, dt * 2);
  const sp = Math.hypot(f.vx, f.vy);
  f.phase += dt * (2.5 + sp / L * 4.5) * S.wagRate * (hot > 0 ? 1 + hot * 0.5 : 1);
  f.speedNow = sp;
}
