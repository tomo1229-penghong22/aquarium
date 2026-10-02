// 魚アイコンにマウスを重ねたときの拡大ポップアップ(小さな水槽と仕草の状態機械)。
import { TAU, U, clamp, ctx, lerp, mix, nightT, setCtx, setU } from "./core.js";
import { NOTES, POP_L, SPECIES } from "./species.js";
import { BODY_A, GROUND, PAINT, drawSnailFront, setBaseA, setBodyA, setEye } from "./fish-render.js";

/* ---------------- 拡大ポップアップ ---------------- */
const PW = 304, PH = 190;
const popEl = document.getElementById("pop"), popCv = document.getElementById("popcv");
const popName = document.getElementById("popname"), popNote = document.getElementById("popnote");
const pctx = popCv.getContext("2d");
const pointer = { x: 0, y: 0, known: false };
document.addEventListener("pointermove", e => { if (e.pointerType === "mouse") { pointer.x = e.clientX; pointer.y = e.clientY; pointer.known = true; } }, { passive: true });
export const P = { open: false, raf: 0, sp: null, f: null, L: 100, owner: null };
const rnd = (a, b) => a + Math.random() * (b - a);
const pulse = (t, s, d) => (t >= s && t <= s + d) ? Math.sin(Math.PI * (t - s) / d) : 0;
const popFloor = x => PH * 0.87 + Math.sin(x * 0.03) * 2;

/* お掃除生体(貝・エビは底を這う/歩く、オトは水中で吸いつく・短く泳ぐ)。種ごとの仕草の候補(重みつき)は魚用とは別 */
const CRAWL = { snail: 1, shrimp: 1, oto: 1 };
const POOLS = {
  snail: [["drift", 3], ["hide", 2], ["flip", 1.4], ["glassview", 1.6]],
  shrimp: [["drift", 3], ["wash", 2.2], ["backhop", 1.6], ["hug", 2.4]],
  oto: [["drift", 3], ["turn", 2], ["graze", 3], ["flow", 2], ["pakupaku", 2]],
};
const floorY = (sp, x) => popFloor(x) - P.L * GROUND[sp] + 2;
function popBounds(){
  const L = P.L, sp = P.sp;
  const mx = sp === "guppy" ? L * 1.15 : CRAWL[sp] ? L * 0.5 : L * 0.72;
  const xr = [mx, PW - mx];
  let yr = [PH * 0.38, PH * 0.6];
  if (sp === "angel") yr = [PH * 0.47, PH * 0.52];
  if (sp === "cory") yr = [popFloor(PW / 2) - L * 0.2, popFloor(PW / 2) - L * 0.2];
  if (sp === "shrimp" || sp === "snail") yr = [floorY(sp, PW / 2), floorY(sp, PW / 2)];
  return { xr, yr };
}
function popWander(){ const b = popBounds(); P.tx = rnd(b.xr[0], b.xr[1]); P.ty = rnd(b.yr[0], b.yr[1]); P.wanderT = rnd(2.5, 5); }
function popText(str, x, y){ P.texts.push({ s: str, x, y, age: 0, life: 1.2 }); }
export function popReset(sp){
  const S = SPECIES[sp];
  P.sp = sp; P.L = POP_L[sp];
  const spots = []; for (let i = 0; i < 7; i++) spots.push([0.35 + Math.random() * 0.55, (Math.random() - 0.5) * 0.7, 0.5 + Math.random()]);
  let variant = Math.floor(Math.random() * S.variants);
  if (sp === "angel") variant = Math.random() < 0.3 ? 1 : 0;
  P.f = { phase: Math.random() * TAU, pale: 0, health: 1, spots, variant, ox: Math.random(), tailScale: 1, hide: 0, wash: 0, hold: 0, pick: 0, clawT: 0 };
  P.gv = 0; P.gx = PW / 2; P.gy = PH * 0.45; P.gdir = 1;
  const b = popBounds();
  P.x = PW / 2; P.y = (b.yr[0] + b.yr[1]) / 2; P.vx = 0; P.vy = 0;
  P.flip = P.tflip = Math.random() < 0.5 ? 1 : -1;
  P.lockFlip = 0; P.pitch = 0; P.nod = 0; P.spin = 0; P.shake = 0; P.roll = 0; P.squash = 0;
  P.act = null; P.actT = 0; P.d = {}; P.nextAct = rnd(1.0, 2.0); P.t = 0;
  P.bubbles = []; P.amb = []; P.texts = []; P.sparks = []; P.puffs = []; P.food = null; P.trail = [];
  popWander();
}
function pickAct(){
  const pool = POOLS[P.sp] ? POOLS[P.sp].slice() : [["turn", 3], ["drift", 2.5], ["food", 2], ["bubble", 2], ["wiggle", 1.3], ["spin", 1], ["startle", 1], ["peek", 1.2]];
  if (!POOLS[P.sp]) ({ neon: [["dash", 2.2]], rummy: [["dash", 2.2]], guppy: [["showoff", 2.6]], platy: [["food", 2]], angel: [["bow", 2.4]], cory: [["wink", 3], ["nibble", 3]] })[P.sp]?.forEach(a => pool.push(a));
  const list = pool.filter(a => !(P.sp === "angel" && a[0] === "spin") && a[0] !== P.lastAct);
  let sum = list.reduce((s, a) => s + a[1], 0), r = Math.random() * sum;
  for (const a of list) { r -= a[1]; if (r <= 0) return a[0]; }
  return "drift";
}
export function startAct(name){
  const L = P.L, dir = P.flip >= 0 ? 1 : -1, b = popBounds();
  P.lastAct = name;
  if (name === "drift") { popWander(); return; }
  P.act = name; P.actT = 0; P.d = {};
  if (name === "turn") { P.tx = P.x < PW / 2 ? b.xr[1] : b.xr[0]; P.ty = rnd(b.yr[0], b.yr[1]); }
  if (name === "food") P.food = { x: rnd(PW * 0.25, PW * 0.75), y: -4, vy: 24, k: Math.random() * 9 };
  if (name === "startle") {
    popText("!", P.x + dir * L * 0.2, P.y - L * 0.35);
    P.vx = -dir * 190; P.lockFlip = 1.0; P.tflip = dir;
    P.tx = clamp(P.x - dir * 55, b.xr[0] - 20, b.xr[1] + 20); P.ty = P.y;
  }
  if (name === "peek") { P.d.dir = dir; P.d.stage = 0; P.tx = dir > 0 ? PW + L * (P.sp === "guppy" ? 1.9 : 1.2) : -L * (P.sp === "guppy" ? 1.9 : 1.2); }
  if (name === "wiggle" && Math.random() < 0.6) popText("ぷるぷる", P.x, P.y - L * 0.32);
  if (name === "dash") { P.d.n = 0; P.d.next = 0; }
  if (name === "nibble") { P.ty = popFloor(P.x) - L * 0.12; }
  if (name === "hide") popText("!", P.x, P.y - L * 0.5);
  if (name === "glassview") { P.gx = clamp(P.x, 70, PW - 70); P.gy = PH * 0.46; P.gdir = P.x < PW / 2 ? 1 : -1; popText("ぺたぺた", P.gx, P.gy - 40); }
  if (name === "hug") { const tw = P.x < PW / 2 ? 1 : -1; P.food = { x: tw > 0 ? rnd(PW * 0.55, PW * 0.94) : rnd(PW * 0.06, PW * 0.45), y: popFloor(PW * 0.5) - 3, vy: 0, k: Math.random() * 9, held: false, s: 1 }; } // 体の前(足 0.55L)で拾える範囲に置く
  if (name === "backhop") { P.d.x0 = P.x; P.d.dir = dir; P.lockFlip = 99; P.tflip = dir; }
}
function endAct(){ P.f.hide = 0; P.f.wash = 0; P.f.hold = 0; P.f.pick = 0; P.act = null; P.nextAct = rnd(3.2, 6.5); P.lockFlip = 0; P.spin = 0; P.f.tailScale = 1; popWander(); }

export function updatePop(dt){
  const S = SPECIES[P.sp], L = P.L, b = popBounds();
  const dir = P.flip >= 0 ? 1 : -1;
  const mouthX = () => P.x + (P.flip >= 0 ? 1 : -1) * L * 0.5 * Math.max(0.3, Math.abs(P.flip));
  let speedMax = P.sp === "snail" ? 9 : P.sp === "shrimp" ? 34 : P.sp === "oto" ? 55 : 70, accel = 2.4, wagMul = 1, wagSpeed = 1, holdPitch = null;
  const fl = P.sp === "snail" || P.sp === "shrimp" ? floorY(P.sp, P.x) : 0; // 底を這う種の、いまの x での体の中心の高さ
  P.t += dt; P.shake = 0;
  if (P.act) {
    P.actT += dt;
    const t = P.actT;
    switch (P.act) {
      case "turn": if (Math.abs(P.tx - P.x) < 8 || t > 3.5) endAct(); break;
      case "food": {
        const fd = P.food;
        if (fd) {
          const toward = Math.sign(fd.x - P.x) || dir;
          P.tx = fd.x - toward * L * 0.47; P.ty = clamp(fd.y + 2, b.yr[0] - 40, popFloor(fd.x) - L * 0.12);
          if (P.sp === "cory") P.ty = Math.max(P.ty, popFloor(fd.x) - L * 0.3);
          speedMax = 115;
          P.tflip = toward; P.lockFlip = 0.15;
          const mx = mouthX();
          if (Math.abs(mx - fd.x) < 10 && Math.abs(P.y - fd.y) < L * 0.2 + 6 && Math.sign(P.flip) === toward) {
            popText("ぱくっ", mx, P.y - L * 0.25); P.food = null; P.squash = 1; P.d.eaten = t;
          }
          if (t > 9) P.food = null;
        } else if (!P.d.eaten || t - P.d.eaten > 0.7) endAct();
        break;
      }
      case "bubble": {
        P.tx = P.x; P.ty = P.y; wagSpeed = 0.6;
        if (t > 0.45 && !P.d.b) { P.d.b = { x: mouthX(), y: P.y - 2, r: 0, att: true, age: 0, wob: Math.random() * 9 }; P.bubbles.push(P.d.b); }
        if (P.d.b && P.d.b.att) {
          P.d.b.x = mouthX() + dir * P.d.b.r; P.d.b.y = P.y - 2; P.d.b.r = Math.min(8, (t - 0.45) * 12);
          if (t > 1.2) { P.d.b.att = false; P.d.b.vy = -38; P.d.popped = false; }
        }
        if (P.d.b && P.d.b.dead) {
          if (Math.random() < 0.5) { startAct("startle"); } else endAct();
        }
        if (t > 5) endAct();
        break;
      }
      case "wiggle": wagMul = 2.3; wagSpeed = 3.4; P.tx = P.x; P.ty = P.y; P.shake = Math.sin(P.t * 48) * 1.6; if (t > 1.1) endAct(); break;
      case "spin": {
        const k = clamp(t / 0.95, 0, 1), e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
        P.spin = e * TAU; wagSpeed = 2; P.tx = P.x; P.ty = P.y;
        if (t > 0.95) { P.spin = 0; popText("くるっ", P.x, P.y - L * 0.35); endAct(); }
        break;
      }
      case "startle": wagSpeed = 2.4; wagMul = 1.4; if (t > 1.0) endAct(); break;
      case "peek": {
        const d = P.d;
        if (d.stage === 0) { speedMax = 95; if (Math.abs(P.x - P.tx) < 12 || t > 3.5) { d.stage = 1; d.t0 = t; } }
        else if (d.stage === 1) { if (t - d.t0 > 0.9) { d.stage = 2; d.t0 = t; P.flip = P.tflip = -d.dir; P.lockFlip = 99; P.tx = d.dir > 0 ? PW + L * 0.12 : -L * 0.12; P.ty = rnd(b.yr[0], b.yr[1]); } }
        else if (d.stage === 2) { speedMax = 30; if (Math.abs(P.x - P.tx) < 5 || t - d.t0 > 3) { d.stage = 3; d.t0 = t; popText("…?", P.x - d.dir * L * 0.45, P.y - L * 0.3); } }
        else if (d.stage === 3) { P.tx = P.x; if (t - d.t0 > 1.2) endAct(); }
        break;
      }
      case "dash": {
        speedMax = 420; accel = 7; wagSpeed = 2.6;
        if (t >= P.d.next) { if (P.d.n >= 3) { endAct(); break; } P.tx = P.x < PW / 2 ? b.xr[1] : b.xr[0]; P.ty = rnd(b.yr[0], b.yr[1]); P.d.n++; P.d.next = t + 0.5; }
        P.trail.push([P.x, P.y, P.flip, P.pitch]); if (P.trail.length > 6) P.trail.shift();
        break;
      }
      case "showoff": {
        P.tx = P.x; P.ty = P.y;
        P.f.tailScale = 1 + 0.38 * Math.pow(Math.sin(Math.PI * clamp(t / 2, 0, 1)), 0.6);
        wagMul = 0.5; wagSpeed = 0.7;
        if (Math.random() < dt * 9) P.sparks.push({ x: P.x - dir * L * rnd(0.9, 1.6), y: P.y + rnd(-L * 0.45, L * 0.45), age: 0, life: 0.7, s: rnd(3, 6) });
        if (t > 2) endAct();
        break;
      }
      case "bow": P.tx = P.x; P.ty = P.y; wagSpeed = 0.6; P.nod = Math.sin(Math.PI * clamp(t / 1.8, 0, 1)) * 0.42; if (t > 1.9) { P.nod = 0; endAct(); } break;
      case "wink": {
        P.tx = P.x; P.ty = P.y;
        P.roll = pulse(t, 0.2, 0.42) + pulse(t, 0.9, 0.42);
        if (t > 0.35 && !P.d.said) { P.d.said = true; popText("ぱちっ", P.x + dir * L * 0.3, P.y - L * 0.33); }
        if (t > 1.5) { P.roll = 0; endAct(); }
        break;
      }
      /* ---- 貝 ---- */
      case "hide": { // 驚いて殻に引っこみ、しばらくしてそ〜っと顔を出す
        P.tx = P.x; P.ty = fl; speedMax = 0;
        P.f.hide = clamp(t < 0.25 ? t / 0.25 : t < 2.3 ? 1 : 1 - (t - 2.3) / 0.7, 0, 1);
        P.shake = t < 0.3 ? Math.sin(t * 70) * 1.3 : 0;
        if (t > 2.3 && !P.d.said) { P.d.said = true; popText("そ〜っ", P.x, P.y - L * 0.5); }
        if (t > 3.1) endAct();
        break;
      }
      case "flip": { // ひっくり返ってじたばたし、よいしょと起き上がる
        const e = k => k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
        P.tx = P.x; speedMax = 140; wagSpeed = 4;
        if (t < 0.5) { const k = e(clamp(t / 0.5, 0, 1)); P.spin = k * Math.PI; if (t > 0.3 && !P.d.a) { P.d.a = 1; popText("ころん", P.x, P.y - L * 0.5); } }
        else if (t < 2.9) { const k = (t - 0.5) / 2.4; P.spin = Math.PI + Math.sin(t * 10) * 0.32 * (1 - k); P.f.phase += dt * 6; if (!P.d.b) { P.d.b = 1; popText("じたばた", P.x, P.y - L * 0.55); } }
        else if (t < 3.6) { P.spin = Math.PI * (1 - e(clamp((t - 2.9) / 0.7, 0, 1))); if (!P.d.c) { P.d.c = 1; popText("よいしょ", P.x, P.y - L * 0.55); } }
        else { P.spin = 0; P.squash = 1; endAct(); break; }
        P.ty = popFloor(P.x) - L * lerp(GROUND.snail, 0.44, clamp(P.spin / Math.PI, 0, 1)) + 2;
        break;
      }
      case "glassview": { // 前面ガラスに移って、足の裏と口を見せながら横へ這う(P.gv でクロスフェード)
        P.tx = P.x; P.ty = fl; speedMax = 0;
        P.gx += P.gdir * 16 * dt; P.gy += (PH * 0.46 + Math.sin(t * 0.9) * 6 - P.gy) * Math.min(1, dt * 2);
        P.gx = clamp(P.gx, 60, PW - 60); P.f.phase += dt * 2.2;
        if (t > 5.8) endAct();
        break;
      }
      /* ---- エビ ---- */
      case "wash": { // はさみで顔を洗う
        P.tx = P.x; P.ty = fl; speedMax = 0;
        P.f.wash = clamp(Math.min(t / 0.3, (2.5 - t) / 0.3), 0, 1); P.f.clawT += dt * 2;
        P.nod = Math.sin(t * 15) * 0.05 * P.f.wash; P.shake = Math.sin(t * 30) * 0.6 * P.f.wash;
        if (t > 0.5 && !P.d.said) { P.d.said = true; popText("ごしごし", P.x + dir * L * 0.3, P.y - L * 0.4); }
        if (t > 2.6) endAct();
        break;
      }
      case "backhop": { // 身をかがめて、後ろへピョンと跳ねる
        const d = P.d, T0 = 0.35, TJ = 0.55;
        P.f.clawT += dt;
        if (t < T0) { P.tx = P.x; P.ty = fl; speedMax = 0; holdPitch = 0.22; }
        else if (t < T0 + TJ) {
          const k = (t - T0) / TJ, x1 = clamp(d.x0 - d.dir * 85, b.xr[0], b.xr[1]);
          P.x = lerp(d.x0, x1, k); P.y = floorY("shrimp", P.x) - Math.sin(Math.PI * k) * 58;
          P.tx = P.x; P.ty = P.y; P.vx = P.vy = 0; wagMul = 3.2; wagSpeed = 5; holdPitch = k < 0.5 ? -0.5 : 0.25; P.flip = P.tflip = d.dir;
          if (!d.said) { d.said = true; popText("ぴょん!", P.x, P.y - L * 0.5); }
        } else {
          P.tx = P.x; P.ty = fl; speedMax = 0;
          if (!d.landed) { d.landed = true; P.squash = 1; }
          if (t > T0 + TJ + 0.5) endAct();
        }
        break;
      }
      case "hug": { // 餌を見つけて、両手で抱えてもぐもぐ食べる
        const fd = P.food;
        if (!fd) { endAct(); break; }
        if (!fd.held) {
          const toward = Math.sign(fd.x - P.x) || dir;
          P.tx = fd.x - toward * L * 0.55; P.ty = fl; P.tflip = toward; P.lockFlip = 0.15; speedMax = 46; P.f.pick = 0.4;
          if (Math.abs(P.x + toward * L * 0.55 - fd.x) < 10) { fd.held = true; fd.t0 = t; popText("ひょい", fd.x, fd.y - 24); }
          if (t > 12) { P.food = null; endAct(); }
        } else {
          const u = t - fd.t0, hd = P.flip >= 0 ? 1 : -1;
          P.tx = P.x; P.ty = fl; speedMax = 0; P.f.hold = clamp(Math.min(u / 0.25, 1), 0, 1); P.f.clawT += dt;
          fd.x = P.x + hd * L * 0.57 * Math.max(0.3, Math.abs(P.flip)); fd.y = P.y + L * 0.1; fd.s = Math.max(0.15, 1 - u / 2.4);
          P.nod = Math.sin(u * 16) * 0.03;
          if (u > 0.4 && !fd.said) { fd.said = true; popText("もぐもぐ", P.x, P.y - L * 0.4); }
          if (u > 2.4) { P.food = null; P.squash = 1; endAct(); }
        }
        break;
      }
      /* ---- オト ---- */
      case "graze": { // ガラスに吸いついて、小刻みに体を震わせて削る
        P.tx = P.x; P.ty = P.y; speedMax = 0; wagSpeed = 0.3;
        P.shake = Math.sin(P.t * 42) * 1.5; holdPitch = 0.12;
        if (Math.random() < dt * 9) P.puffs.push({ x: mouthX(), y: P.y + L * 0.06, vx: rnd(-12, 12), vy: rnd(-26, -6), age: 0, life: 0.7, r: rnd(0.8, 1.8) });
        if (t > 0.4 && !P.d.said) { P.d.said = true; popText("ごしごし", P.x, P.y - L * 0.32); }
        if (t > 3.2) endAct();
        break;
      }
      case "flow": { // 吸いついたまま、水流で体がなびく
        P.tx = P.x; P.ty = P.y; speedMax = 0; wagMul = 2.6; wagSpeed = 3.5;
        P.nod = Math.sin(t * 3.2) * 0.34 * clamp(Math.min(t / 0.4, (2.6 - t) / 0.4), 0, 1);
        if (t > 0.3 && !P.d.said) { P.d.said = true; popText("ゆらゆら", P.x, P.y - L * 0.34); }
        if (t > 2.6) { P.nod = 0; endAct(); }
        break;
      }
      case "pakupaku": { // 口をパクパクさせながら、目だけきょろきょろ動かす
        P.tx = P.x; P.ty = P.y; speedMax = 0; wagSpeed = 0.4;
        P.squash = 0.55 + 0.45 * Math.sin(t * 17); P.roll = Math.sin(t * 4.2) * 0.9;
        if (t > 0.2 && !P.d.said) { P.d.said = true; popText("ぱくぱく", P.x + dir * L * 0.3, P.y - L * 0.32); }
        if (t > 2.4) { P.roll = 0; endAct(); }
        break;
      }
      case "nibble": {
        P.tx = P.x + Math.sin(t * 2) * 6; wagSpeed = 2.2;
        holdPitch = 0.3 + Math.sin(t * 20) * 0.05;
        if (Math.random() < dt * 16) P.puffs.push({ x: mouthX(), y: popFloor(P.x) - 2, vx: rnd(-25, 25), vy: rnd(-40, -15), age: 0, life: 0.8, r: rnd(1, 2.4) });
        if (t > 0.5 && !P.d.said) { P.d.said = true; popText("もぐもぐ", P.x, P.y - L * 0.35); }
        if (t > 2) endAct();
        break;
      }
    }
  } else {
    P.wanderT -= dt; if (P.wanderT <= 0) popWander();
    P.nextAct -= dt; if (P.nextAct <= 0) startAct(pickAct());
  }
  // 移動
  const dx = P.tx - P.x, dy = P.ty - P.y;
  const desx = clamp(dx * 1.7, -speedMax, speedMax), desy = clamp(dy * 1.7, -speedMax * 0.6, speedMax * 0.6);
  P.vx += (desx - P.vx) * Math.min(1, dt * accel);
  P.vy += (desy - P.vy) * Math.min(1, dt * accel);
  P.x += P.vx * dt; P.y += P.vy * dt;
  P.y = clamp(P.y, L * 0.12, P.sp === "snail" || P.sp === "shrimp" ? floorY(P.sp, P.x) : popFloor(P.x) - L * (P.sp === "cory" ? 0.1 : 0.2));
  if (P.lockFlip > 0) P.lockFlip -= dt; else if (Math.abs(P.vx) > 12) P.tflip = Math.sign(P.vx);
  P.flip += clamp(P.tflip - P.flip, -dt * 3.8, dt * 3.8);
  const pt = holdPitch !== null ? holdPitch : clamp(Math.atan2(P.vy, Math.abs(P.vx) + 40), -0.35, 0.35);
  P.pitch += (pt - P.pitch) * Math.min(1, dt * 4);
  const effort = Math.min(1, Math.hypot(P.vx, P.vy) / 90);
  if (P.sp === "snail" || P.sp === "shrimp") { // 這う・歩く種:動いているときだけ脚・触角が動く。止まっている間はつまむ(エビ)
    P.f.phase += dt * (0.4 + Math.min(1, Math.hypot(P.vx, P.vy) / 12) * 7) * wagSpeed;
    if (P.sp === "shrimp") { const still = effort < 0.15 && !P.act; P.f.pick += ((still ? 1 : P.act === "hug" || P.act === "wash" || P.act === "backhop" ? P.f.pick : 0.15) - P.f.pick) * Math.min(1, dt * 5); P.f.clawT += dt * (0.5 + P.f.pick); }
  } else P.f.phase += dt * (2.2 + effort * 7) * S.wagRate * wagSpeed;
  P.gv += ((P.act === "glassview" && P.actT < 5.3 ? 1 : 0) - P.gv) * Math.min(1, dt * 4);
  P.wagMul = wagMul; P.effort = effort;
  P.squash = Math.max(0, P.squash - dt * 5);
  if (P.act !== "dash" && P.trail.length) P.trail.shift();
  // 泡・粒・文字
  P.bubbles.forEach(bb => { if (bb.att) return; bb.age += dt; bb.y += bb.vy * dt; bb.x += Math.sin(P.t * 6 + bb.wob) * 14 * dt;
    if (bb.y < 14 || bb.age > 2.4) { bb.dead = true; popText("ぷくっ", bb.x, bb.y + 4); for (let i = 0; i < 6; i++) P.sparks.push({ x: bb.x, y: bb.y, age: 0, life: 0.35, s: 2, ring: i }); } });
  P.bubbles = P.bubbles.filter(bb => !bb.dead || (P.d.b === bb && P.act === "bubble"));
  if (Math.random() < dt * 2) P.amb.push({ x: PW * 0.9 + rnd(-4, 4), y: popFloor(PW * 0.9), r: rnd(1, 2.6), k: Math.random() * 9 });
  P.amb.forEach(a => { a.y -= 34 * dt; a.x += Math.sin(P.t * 4 + a.k) * 8 * dt; }); P.amb = P.amb.filter(a => a.y > 0);
  if (P.food && !P.food.held) { P.food.y = Math.min(popFloor(P.food.x) - 3, P.food.y + P.food.vy * dt); P.food.x += Math.sin(P.t * 2 + P.food.k) * (P.act === "hug" ? 0 : 10) * dt; }
  [P.texts, P.sparks, P.puffs].forEach(arr => arr.forEach(o => { o.age += dt; if (o.vx !== undefined) { o.x += o.vx * dt; o.y += o.vy * dt; o.vy += 60 * dt; } }));
  P.texts = P.texts.filter(o => o.age < o.life); P.sparks = P.sparks.filter(o => o.age < o.life); P.puffs = P.puffs.filter(o => o.age < o.life);
}

function drawPopFish(x, y, flip, pitch, alpha){
  const L = P.L, dir = flip >= 0 ? 1 : -1;
  const wag = Math.sin(P.f.phase) * SPECIES[P.sp].wag * P.wagMul * (0.45 + 0.55 * P.effort);
  ctx.save();
  setBaseA(alpha * SPECIES[P.sp].finAlpha); setBodyA(alpha); ctx.globalAlpha = BODY_A; // 体は不透明(alpha はフェード・残像のときだけ 1 未満)
  ctx.translate(x + P.shake, y + (P.sp === "snail" || P.sp === "shrimp" ? 0 : Math.sin(P.t * 1.4) * 1.6));
  ctx.rotate((pitch + P.nod + P.spin) * dir);
  const sq = P.squash * 0.08;
  ctx.scale(dir * Math.max(0.1, Math.abs(flip)) * (1 - sq), 1 + sq);
  PAINT[P.sp](L, wag, P.f);
  ctx.restore(); setBaseA(1); setBodyA(1);
}
export function drawPop(){
  const oc = ctx, oU = U;
  setCtx(pctx); setU(P.L / 38);
  const n = nightT, L = P.L;
  ctx.setTransform(pdprGet(), 0, 0, pdprGet(), 0, 0);
  // 背景
  let g = ctx.createLinearGradient(0, 0, 0, PH);
  g.addColorStop(0, mix("#c3ebdf", "#a3d2d8", n)); g.addColorStop(0.5, mix("#6ab8ad", "#3a7886", n)); g.addColorStop(1, mix("#2f7d82", "#11303f", n));
  ctx.fillStyle = g; ctx.fillRect(0, 0, PW, PH);
  ctx.save(); ctx.globalCompositeOperation = "screen";
  const bx0 = lerp(PW * 0.25, PW * 0.5, n), bx1 = lerp(PW * 0.05, PW * 0.5, n);
  g = ctx.createLinearGradient(0, 0, 0, PH);
  g.addColorStop(0, n > 0.5 ? "rgba(230,242,255,0.3)" : "rgba(255,242,205,0.3)"); g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(bx0 - 40, 0); ctx.lineTo(bx0 + 40, 0); ctx.lineTo(bx1 + 80, PH); ctx.lineTo(bx1 - 80, PH); ctx.closePath(); ctx.fill();
  ctx.restore();
  // 水草
  [[10, 95, 7], [26, 70, 6], [PW - 14, 110, 7], [PW - 32, 78, 6], [PW - 50, 52, 5]].forEach(([x, h, w], i) => {
    const sw = Math.sin(P.t * 0.9 + i * 1.7) * 9 + Math.sin(P.t * 2.1 + i) * 2, base = popFloor(x) + 4;
    ctx.fillStyle = mix("#4f8a38", "#3a6e3a", n);
    ctx.beginPath(); ctx.moveTo(x - w / 2, base);
    ctx.quadraticCurveTo(x + sw * 0.3, base - h * 0.6, x + sw, base - h);
    ctx.quadraticCurveTo(x + sw * 0.3 + w * 0.3, base - h * 0.6, x + w / 2, base);
    ctx.fill();
  });
  // 砂
  ctx.beginPath(); ctx.moveTo(0, PH);
  for (let x = 0; x <= PW; x += 6) ctx.lineTo(x, popFloor(x));
  ctx.lineTo(PW, PH); ctx.closePath();
  g = ctx.createLinearGradient(0, PH * 0.85, 0, PH);
  g.addColorStop(0, mix("#e6d6ac", "#b9b29a", n)); g.addColorStop(1, mix("#b89e70", "#6c634f", n));
  ctx.fillStyle = g; ctx.fill();
  // 背景の泡
  P.amb.forEach(a => { ctx.strokeStyle = "rgba(255,255,255,0.5)"; ctx.lineWidth = 0.8; ctx.beginPath(); ctx.arc(a.x, a.y, a.r, 0, TAU); ctx.stroke(); });
  // 餌
  if (P.food) { ctx.fillStyle = "#e9a24a"; ctx.save(); ctx.translate(P.food.x, P.food.y); ctx.rotate(P.t * 1.5 + P.food.k); if (P.food.s !== undefined) ctx.scale(P.food.s, P.food.s); ctx.fillRect(-3.5, -2.2, 7, 4.4); ctx.restore(); }
  // 影
  const gap = popFloor(P.x) - P.y;
  ctx.fillStyle = `rgba(20,45,40,${0.22 * clamp(1 - gap / 140, 0, 1)})`;
  ctx.beginPath(); ctx.ellipse(P.x, popFloor(P.x) + 2, L * 0.45, L * 0.06, 0, 0, TAU); ctx.fill();
  // 残像
  P.trail.forEach((tr, i) => drawPopFish(tr[0], tr[1], tr[2], tr[3], 0.08 + i * 0.04));
  // 本体(目はマウスの方をちらっと追う)
  const dir = P.flip >= 0 ? 1 : -1;
  let edx = Math.sin(P.t * 0.7) * 0.5, edy = Math.sin(P.t * 0.5) * 0.3;
  if (pointer.known) {
    const rc = popCv.getBoundingClientRect();
    const px = (pointer.x - rc.left) / rc.width * PW, py = (pointer.y - rc.top) / rc.height * PH;
    const ex = P.x + dir * L * 0.3 * Math.abs(P.flip), ey = P.y - L * 0.03;
    const vx = px - ex, vy = py - ey, dd = Math.hypot(vx, vy) || 1, m = Math.min(1, dd / 70);
    edx = vx / dd * dir * m; edy = vy / dd * m;
  }
  setEye({ dx: edx, dy: edy, roll: P.roll });
  if (P.gv < 0.98) drawPopFish(P.x, P.y, P.flip, P.pitch, 1 - P.gv);
  if (P.sp === "snail" && P.gv > 0.02) drawSnailFront(P.f, L * 1.15, P.gx, P.gy, P.gdir > 0 ? 0 : Math.PI, P.gv); // 前面ガラスの貝(足の裏と口)
  setEye(null);
  // 泡
  P.bubbles.forEach(bb => {
    if (bb.dead || bb.r < 0.5) return;
    ctx.fillStyle = "rgba(235,252,255,0.25)"; ctx.strokeStyle = "rgba(255,255,255,0.8)"; ctx.lineWidth = 1.1;
    ctx.beginPath(); ctx.arc(bb.x, bb.y, bb.r, 0, TAU); ctx.fill(); ctx.stroke();
    ctx.fillStyle = "rgba(255,255,255,0.9)"; ctx.beginPath(); ctx.arc(bb.x - bb.r * 0.35, bb.y - bb.r * 0.35, bb.r * 0.25, 0, TAU); ctx.fill();
  });
  // 砂けむり
  P.puffs.forEach(o => { ctx.fillStyle = `rgba(230,215,180,${0.8 * (1 - o.age / o.life)})`; ctx.beginPath(); ctx.arc(o.x, o.y, o.r, 0, TAU); ctx.fill(); });
  // きらきら
  P.sparks.forEach(o => {
    const k = o.age / o.life, a = 1 - k;
    if (o.ring !== undefined) {
      const ang = o.ring / 6 * TAU, r0 = 4 + k * 10;
      ctx.strokeStyle = `rgba(255,255,255,${a})`; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(o.x + Math.cos(ang) * r0, o.y + Math.sin(ang) * r0); ctx.lineTo(o.x + Math.cos(ang) * (r0 + 4), o.y + Math.sin(ang) * (r0 + 4)); ctx.stroke();
    } else {
      const sz = o.s * Math.sin(Math.PI * k);
      ctx.fillStyle = `rgba(255,252,220,${a})`;
      ctx.beginPath(); ctx.moveTo(o.x, o.y - sz); ctx.lineTo(o.x + sz * 0.25, o.y); ctx.lineTo(o.x, o.y + sz); ctx.lineTo(o.x - sz * 0.25, o.y); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.moveTo(o.x - sz, o.y); ctx.lineTo(o.x, o.y + sz * 0.25); ctx.lineTo(o.x + sz, o.y); ctx.lineTo(o.x, o.y - sz * 0.25); ctx.closePath(); ctx.fill();
    }
  });
  // 擬音
  P.texts.forEach(o => {
    const k = o.age / o.life, a = k < 0.15 ? k / 0.15 : 1 - Math.max(0, (k - 0.6) / 0.4);
    const sc = k < 0.15 ? 0.7 + k / 0.15 * 0.3 : 1;
    ctx.save(); ctx.globalAlpha = a; ctx.translate(clamp(o.x, 30, PW - 30), clamp(o.y - k * 14, 16, PH - 10)); ctx.scale(sc, sc);
    ctx.font = '700 15px "Zen Kaku Gothic New", "Hiragino Sans", sans-serif'; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.lineWidth = 4; ctx.strokeStyle = "rgba(20,50,50,0.55)"; ctx.strokeText(o.s, 0, 0);
    ctx.fillStyle = "#fffdf4"; ctx.fillText(o.s, 0, 0);
    ctx.restore();
  });
  // 周辺減光
  g = ctx.createRadialGradient(PW / 2, PH / 2, PH * 0.45, PW / 2, PH / 2, PW * 0.7);
  g.addColorStop(0, "rgba(0,25,30,0)"); g.addColorStop(1, `rgba(0,25,30,${lerp(0.22, 0.4, n)})`);
  ctx.fillStyle = g; ctx.fillRect(0, 0, PW, PH);
  setCtx(oc); setU(oU);
}
let pdpr = 1;
function pdprGet(){ return pdpr; }
let popLast = 0;
function popLoop(now){
  const dt = Math.min(0.05, (now - popLast) / 1000 || 0.016); popLast = now;
  updatePop(dt); drawPop();
  if (P.open) P.raf = requestAnimationFrame(popLoop); else P.raf = 0;
}
function placePop(anchor){
  const rc = anchor.getBoundingClientRect(), pw = popEl.offsetWidth, ph = popEl.offsetHeight, m = 10;
  let left, top, origin;
  if (rc.left - pw - 16 > m) { left = rc.left - pw - 16; top = clamp(rc.top + rc.height / 2 - ph / 2, m, innerHeight - ph - m); origin = "right center"; }
  else {
    left = clamp(rc.left - 8, m, innerWidth - pw - m);
    if (rc.top - ph - 12 > m) { top = rc.top - ph - 12; origin = "left bottom"; } else { top = Math.min(rc.bottom + 12, innerHeight - ph - m); origin = "left top"; }
  }
  popEl.style.left = left + "px"; popEl.style.top = top + "px"; popEl.style.transformOrigin = origin;
}
let popCloseTimer = 0;
export function openPop(sp, anchor){
  clearTimeout(popCloseTimer);
  if (P.open && P.sp === sp) return;
  pdpr = Math.min(window.devicePixelRatio || 1, 2);
  popCv.width = Math.round(PW * pdpr); popCv.height = Math.round(PH * pdpr);
  popName.textContent = SPECIES[sp].name; popNote.textContent = NOTES[sp];
  popReset(sp); P.owner = anchor;
  placePop(anchor);
  popEl.classList.add("show"); popEl.setAttribute("aria-hidden", "false");
  if (!P.open) { P.open = true; popLast = performance.now(); if (!P.raf) P.raf = requestAnimationFrame(popLoop); }
}
export function closePop(delay){
  clearTimeout(popCloseTimer);
  popCloseTimer = setTimeout(() => { P.open = false; P.owner = null; popEl.classList.remove("show"); popEl.setAttribute("aria-hidden", "true"); }, delay || 0);
}
export function bindPop(sp, ic, info){
  ic.addEventListener("pointerenter", e => { if (e.pointerType === "mouse") { P.byMouse = true; openPop(sp, ic); } });
  ic.addEventListener("pointerleave", e => { if (e.pointerType === "mouse") closePop(0); });
  // WebKit ではタップ由来の click の pointerType が "mouse" になったり無かったりするため、直前の pointerdown の種別で判定する
  let downType = "";
  ic.addEventListener("pointerdown", e => { downType = e.pointerType || ""; });
  ic.addEventListener("click", () => {
    const t = downType; downType = "";
    if (t === "mouse") return; // マウスは pointerenter/pointerleave で開閉する
    if (P.open && P.sp === sp) closePop(0); else { P.byMouse = false; openPop(sp, ic); }
  });
  ic.addEventListener("focus", () => { let kb = true; try { kb = ic.matches(":focus-visible"); } catch (err) {} if (kb) { P.byMouse = false; openPop(sp, ic); } });
  ic.addEventListener("blur", () => { if (!P.byMouse) closePop(0); });
  ic.addEventListener("keydown", e => { if (e.key === "Escape") closePop(0); });
}
document.addEventListener("pointerdown", e => { if (P.open && P.owner && e.target !== P.owner && e.pointerType !== "mouse") closePop(0); });
// 念のため:マウスがアイコンの外にあれば必ず閉じる
document.addEventListener("pointermove", e => {
  if (!P.open || !P.byMouse || e.pointerType !== "mouse" || !P.owner) return;
  const r = P.owner.getBoundingClientRect();
  if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) closePop(0);
}, { passive: true });
window.addEventListener("scroll", () => { if (P.open) closePop(0); }, { passive: true });
