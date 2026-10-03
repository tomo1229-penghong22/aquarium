// issue #7 K4:お掃除生体(オト・エビ・貝)の「描く位置・角度」の連続性の計測(基準 E。npm test には未組み込み)
// 使い方: node tests/crawl-continuity.mjs [--minutes=5] [--seeds=1,2,3]     (親:シードごとに子プロセスを走らせて表にする)
//         node tests/crawl-continuity.mjs --child --seed=N --minutes=5       (子:JSON を 1 行で出力)
// AQUARIUM_JS_ROOT で別の版の js/ を対象にできる(修正の前後比較用)。
// 計測:smoke.mjs と同じモックで js/main.js を読み込み、Math.random をシード固定にして dt=1/60 で minutes 分進める。
//   構成は「お掃除生体は最大数(oto 10, shrimp 20, snail 10)、魚は既定」。
//   毎フレーム、記録用の ctx に差し替えて drawCrawlers(層) を呼び、個体ごとの最初の translate(x,y)・rotate(rot)・scale(sx) を取る(= 描く位置・角度・向き)。
//   個体ごとの「状態の種類」(エビ:跳躍/それ以外、オト:泳ぎ/それ以外(面の種類つき)、貝:横向き/足の裏の遷移中/ガラスの足の裏。面の種類つき)が
//   変わったフレームを「切り替わり」とし、そのフレームの位置の変化(px→U)と角度の変化(rad)を、同じ個体のふだんの動きの 1 フレームの最大変化と並べる。
//   ふだんの動き = 跳躍中(エビ)・泳ぎ中(オト)の、状態が変わらないフレームの変化。貝はふだんが極めて遅いので、同じ種類内の最大変化を使う。
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";
import { spawn } from "node:child_process";

const args = Object.fromEntries(process.argv.slice(2).map(a => { const m = a.match(/^--([^=]+)(?:=(.*))?$/); return [m[1], m[2] ?? true]; }));
const SELF = fileURLToPath(import.meta.url);
const root = join(dirname(SELF), "..");
const MINUTES = Number(args.minutes ?? 5);
const SP = ["shrimp", "oto", "snail"];

async function parent() {
  const seeds = String(args.seeds ?? "1,2,3").split(",").map(Number);
  const rs = await Promise.all(seeds.map(seed => new Promise((res, rej) => {
    const p = spawn(process.execPath, [SELF, "--child", `--seed=${seed}`, `--minutes=${MINUTES}`], { stdio: ["ignore", "pipe", "inherit"] });
    let out = ""; p.stdout.on("data", d => out += d); p.on("close", c => c ? rej(new Error("child " + c)) : res(JSON.parse(out.trim().split("\n").pop())));
  })));
  if (args.json) { console.log(JSON.stringify(rs)); return; }
  report(rs, seeds);
}
const f2 = v => Number.isFinite(v) ? v.toFixed(3) : "-";
function report(rs, seeds) {
  console.log(`## お掃除生体の連続性(最大数・${MINUTES} 分 × シード ${seeds.join(",")}。U=${rs[0].U.toFixed(3)}。位置は U 単位、角度は rad)`);
  for (const sp of SP) {
    const tot = {}; let normPos = 0, normRot = 0; const indivPos = [], indivRot = [];
    for (const r of rs) {
      normPos = Math.max(normPos, r.sp[sp].normPos); normRot = Math.max(normRot, r.sp[sp].normRot);
      indivPos.push(...r.sp[sp].indPos); indivRot.push(...r.sp[sp].indRot);
      for (const [k, v] of Object.entries(r.sp[sp].tr)) {
        const t = (tot[k] ??= { n: 0, maxPos: 0, maxRot: 0, overPos: 0, overRot: 0, over: 0, sxFlip: 0 });
        t.n += v.n; t.maxPos = Math.max(t.maxPos, v.maxPos); t.maxRot = Math.max(t.maxRot, v.maxRot); t.overPos += v.overPos; t.overRot += v.overRot; t.over += v.over; t.sxFlip += v.sxFlip;
      }
    }
    console.log(`\n### ${sp}(個体 ${rs[0].n[sp]}。状態内の向き反転 ${rs.reduce((a, r) => a + r.sp[sp].inFlip, 0)} 回、NaN ${rs.reduce((a, r) => a + r.sp[sp].nan, 0)}、描画数の不一致 ${rs.reduce((a, r) => a + r.sp[sp].mismatch, 0)})`);
    console.log(`ふだんの動きの 1 フレームの最大変化(全個体の最大):位置 ${f2(normPos)} U、角度 ${f2(normRot)} rad`);
    console.log("| 切り替わり | 回数 | 位置の最大変化 U | 角度の最大変化 rad | 位置が個体のふだんを超えた回数 | 角度が個体のふだんを超えた回数 | どちらか超えた回数 | 向き(sx)反転 |\n|---|---|---|---|---|---|---|---|");
    for (const [k, t] of Object.entries(tot).sort()) console.log(`| ${k} | ${t.n} | ${f2(t.maxPos)} | ${f2(t.maxRot)} | ${t.overPos} | ${t.overRot} | ${t.over} | ${t.sxFlip} |`);
  }
}

async function child() {
  const seed = Number(args.seed);
  { let s = seed | 0; Math.random = () => { s = s + 0x6D2B79F5 | 0; let t = Math.imul(s ^ s >>> 15, 1 | s); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  const noop = () => {}, grad = { addColorStop: noop };
  const mkctx = () => new Proxy({}, { get(o, k) { if (k in o) return o[k]; if (k === "createLinearGradient" || k === "createRadialGradient" || k === "createConicGradient") return () => grad; if (k === "createImageData") return (w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }); return noop; }, set(o, k, v) { o[k] = v; return true; } });
  const classList = () => { const s = new Set(); return { add: c => s.add(c), remove: c => s.delete(c), contains: c => s.has(c), toggle: (c, v) => ((v ?? !s.has(c)) ? s.add(c) : s.delete(c)) }; };
  const mkel = (extra = {}) => ({ children: [], style: {}, dataset: { v: "1" }, value: 25, textContent: "", innerHTML: "", title: "", classList: classList(), appendChild(c) { this.children.push(c); }, L: {}, addEventListener(t, f) { (this.L[t] ??= []).push(f); }, attrs: {}, setAttribute(k, v) { this.attrs[k] = String(v); }, querySelector: () => null, matches: () => false, getBoundingClientRect: () => ({ left: 0, top: 0, right: 304, bottom: 190, width: 304, height: 190 }), offsetWidth: 320, offsetHeight: 260, ...extra });
  const mkcanvas = () => { const c = mkel({ width: 0, height: 0, clientWidth: 900, clientHeight: 0, getContext: () => mkctx() }); c.parentElement = mkel(); c.L = {}; c.addEventListener = (t, f) => { (c.L[t] ??= []).push(f); }; return c; };
  const ids = {}; let rafQ = [];
  const sandbox = {
    Path2D: class { moveTo() {} lineTo() {} bezierCurveTo() {} quadraticCurveTo() {} closePath() {} },
    document: { getElementById: id => (ids[id] ??= (id === "tank" || id === "popcv") ? mkcanvas() : mkel()),
      createElement: t => { if (t === "canvas") return mkcanvas(); const d = mkel(); Object.defineProperty(d, "innerHTML", { set() { d.children = [mkel(), mkel(), mkel()]; }, get() { return ""; } }); return d; },
      querySelectorAll: () => [], L: {}, addEventListener(t, f) { (this.L[t] ??= []).push(f); }, visibilityState: "visible", documentElement: mkel(), fullscreenElement: null },
    window: { devicePixelRatio: 2, addEventListener: noop }, localStorage: { getItem: () => null, setItem: noop }, performance: { now: () => 0 },
    requestAnimationFrame: f => { rafQ.push(f); return rafQ.length; }, setTimeout: (f) => { f(); return 0; }, clearTimeout: noop, innerWidth: 1280, innerHeight: 800,
  };
  for (const [k, v] of Object.entries(sandbox)) Object.defineProperty(globalThis, k, { value: v, writable: true, configurable: true, enumerable: true });
  const JSROOT = process.env.AQUARIUM_JS_ROOT || root;
  const imp = n => import(pathToFileURL(join(JSROOT, "js", n)).href);
  await imp("main.js");
  const [core, species, beh, cr, fr] = await Promise.all([imp("core.js"), imp("species.js"), imp("fish-behavior.js"), imp("crawlers.js"), imp("fish-render.js")]);
  const { SPECIES, ORDER } = species;
  let now = 0;
  const frame = () => { now += 1000 / 60; const q = rafQ; rafQ = []; q.forEach(f => f(now)); };
  for (const k of ORDER) core.counts[k] = SPECIES[k].solo ? SPECIES[k].max : SPECIES[k].def;
  beh.syncFish();
  for (let i = 0; i < 120; i++) frame();
  const solos = beh.fishes.filter(f => SPECIES[f.sp].solo);

  // 記録用 ctx:save の深さ 0 で始まる 1 回の描画ごとに、最初の translate / rotate / scale を取る
  let draws = [], depth = 0, cur = null;
  const rec = new Proxy({}, { get(o, k) {
    if (k === "save") return () => { if (depth === 0) { cur = { x: NaN, y: NaN, rot: 0, sx: 1, gotT: false, gotR: false, gotS: false }; draws.push(cur); } depth++; };
    if (k === "restore") return () => { depth--; };
    if (k === "translate") return (x, y) => { if (depth === 1 && !cur.gotT) { cur.gotT = true; cur.x = x; cur.y = y; } };
    if (k === "rotate") return a => { if (depth === 1 && cur.gotT && !cur.gotR) { cur.gotR = true; cur.rot = a; } };
    if (k === "scale") return (x) => { if (depth >= 1 && cur.gotT && !cur.gotS) { cur.gotS = true; cur.sx = x; } };
    if (k in o) return o[k];
    if (k === "createLinearGradient" || k === "createRadialGradient" || k === "createConicGradient") return () => grad;
    return noop; }, set(o, k, v) { o[k] = v; return true; } });
  const layerOf = f => { const c = f.cr; // crawlers.js の layerOf と同じ(変えたらここも合わせる)
    if (f.sp === "oto") return c.st === "swim" ? "front" : c.surf === "gB" ? "back" : c.surf === "gF" ? "glass" : "low";
    if (f.sp === "snail") return c.surf === "gF" || c.tl > 0 ? "glass" : "low";
    return "low"; };
  const kindOf = f => { const c = f.cr;
    if (f.sp === "shrimp") return c.st === "hop" ? "hop" : "ground:" + c.surf;
    if (f.sp === "oto") return c.st === "swim" ? "swim" : c.surf;
    return c.tl > 0 && c.tl < 1 ? "tilt" : c.surf === "gF" ? "glassFront" : "side:" + c.surf; };
  const mv = { shrimp: "hop", oto: "swim" };
  const wrapA = a => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };
  const U = core.U, dt = 1 / 60, FR = Math.round(MINUTES * 60 / dt), origCtx = core.ctx;
  const out = { U, n: {}, sp: {} };
  for (const s of SP) { out.n[s] = solos.filter(f => f.sp === s).length; out.sp[s] = { inFlip: 0, nan: 0, mismatch: 0, tr: {}, normPos: 0, normRot: 0, indPos: [], indRot: [] }; }
  const st = new Map(); // 個体ごと { prev:{x,y,rot,sx,kind}, normPos, normRot, trans:[{key,dp,dr,flip}] }
  for (const f of solos) st.set(f, { prev: null, normPos: 0, normRot: 0, trans: [] });
  const LAYERS = ["back", "low", "front", "glass"];
  for (let n = 0; n < FR; n++) {
    frame();
    const pose = new Map();
    core.setCtx(rec);
    try {
      for (const layer of LAYERS) {
        draws = []; depth = 0; cur = null;
        cr.drawCrawlers(layer);
        const exp = solos.filter(f => f.cr && layerOf(f) === layer);
        if (draws.length !== exp.length) { for (const f of exp) out.sp[f.sp].mismatch++; continue; }
        exp.forEach((f, i) => pose.set(f, draws[i]));
      }
    } finally { core.setCtx(origCtx); }
    for (const f of solos) {
      const d = pose.get(f), t = st.get(f), a = out.sp[f.sp];
      if (!d || !Number.isFinite(d.x + d.y + d.rot)) { a.nan++; t.prev = null; continue; }
      const kind = kindOf(f), c = f.cr, L0 = SPECIES[f.sp].len * U * f.scale;
      // 正規化:角度は「鼻先の向き」h = rot(左向きなら +π)。縁の遷移描画(原点が接地点)は、横向きの姿の中心(接地点より GROUND 分上)に合わせ、p=0 で横向き・p=1 で足の裏の中心へ移る点として扱う
      const lift = kind === "tilt" ? fr.GROUND.snail * L0 * (1 - c.tl) : 0;
      const p = { x: d.x, y: d.y - lift, rot: d.rot + (d.sx < 0 ? Math.PI : 0), sx: d.sx, kind };
      if (t.prev) {
        const dp = Math.hypot(p.x - t.prev.x, p.y - t.prev.y) / U, dr = Math.abs(wrapA(p.rot - t.prev.rot));
        if (p.kind === t.prev.kind) {
          if (p.sx !== t.prev.sx) a.inFlip++; // 状態の中での向き(sx)反転は「ふだんの動き」から除く(件数だけ数える)
          else if (f.sp === "snail" || p.kind === mv[f.sp]) { t.normPos = Math.max(t.normPos, dp); t.normRot = Math.max(t.normRot, dr); }
        } else t.trans.push({ key: `${t.prev.kind} -> ${p.kind}`, dp, dr, flip: p.sx !== t.prev.sx });
      }
      t.prev = p;
    }
  }
  for (const f of solos) {
    const t = st.get(f), a = out.sp[f.sp];
    a.normPos = Math.max(a.normPos, t.normPos); a.normRot = Math.max(a.normRot, t.normRot); a.indPos.push(t.normPos); a.indRot.push(t.normRot);
    for (const x of t.trans) {
      const r = (a.tr[x.key] ??= { n: 0, maxPos: 0, maxRot: 0, overPos: 0, overRot: 0, over: 0, sxFlip: 0 });
      const op = x.dp > t.normPos + 0.05, orr = x.dr > t.normRot + 0.01; // 許容:位置 0.05U(画面で約 0.05 px)、角度 0.01 rad(約 0.6 度)
      r.n++; r.maxPos = Math.max(r.maxPos, x.dp); r.maxRot = Math.max(r.maxRot, x.dr); if (op) r.overPos++; if (orr) r.overRot++; if (op || orr) r.over++; if (x.flip) r.sxFlip++;
    }
  }
  console.log(JSON.stringify(out));
}
if (args.child) await child(); else await parent();
