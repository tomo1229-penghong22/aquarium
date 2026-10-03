// 水槽ページのスモークテスト(ブラウザ不要)
// Canvas と DOM を最小限モックしてグローバルに置き、js/main.js(ES Modules のエントリ)を dynamic import して実行します。
// 内部状態へは、各モジュールの export 経由でアクセスします(本番コードにテスト用の記述はありません)。
// 目的:実行時エラー・NaN・行動の詰まり・体調モデルの退行を早期に見つけること。
// 見た目の確認はブラウザで行ってください(docs/ARCHITECTURE.md「確認手順」)。
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";
import { readFileSync, readdirSync } from "node:fs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

/* ---------------- モック ---------------- */
const noop = () => {};
const grad = { addColorStop: noop };
function mkctx() {
  return new Proxy({}, {
    get(o, k) {
      if (k in o) return o[k];
      if (k === "createLinearGradient" || k === "createRadialGradient" || k === "createConicGradient") return () => grad;
      if (k === "createImageData") return (w, h) => ({ data: new Uint8ClampedArray(w * h * 4) });
      return noop;
    },
    set(o, k, v) { o[k] = v; return true; },
  });
}
function classList() {
  const s = new Set();
  return { add: c => s.add(c), remove: c => s.delete(c), contains: c => s.has(c),
    toggle: (c, v) => ((v ?? !s.has(c)) ? s.add(c) : s.delete(c)) };
}
function mkel(extra = {}) {
  return {
    children: [], style: {}, dataset: { v: "1" }, value: 25, textContent: "", innerHTML: "", title: "",
    classList: classList(), appendChild(c) { this.children.push(c); },
    L: {}, addEventListener(t, f) { (this.L[t] ??= []).push(f); },
    attrs: {}, setAttribute(k, v) { this.attrs[k] = String(v); },
    querySelector: () => null, matches: () => false,
    getBoundingClientRect: () => ({ left: 0, top: 0, right: 304, bottom: 190, width: 304, height: 190 }),
    offsetWidth: 320, offsetHeight: 260, ...extra,
  };
}
const canvases = [];
function mkcanvas() {
  const c = mkel({ width: 0, height: 0, clientWidth: 900, clientHeight: 0, getContext: () => mkctx() });
  c.parentElement = mkel();
  // アイコン(className "ico")のリスナーだけ保持して、テストから発火できるようにする
  c.L = {}; c.addEventListener = (t, f) => { (c.L[t] ??= []).push(f); }; canvases.push(c);
  return c;
}
const ids = {};
let rafQ = [];
let lsLast = null;                 // localStorage.setItem で最後に書かれた値
let vtimers = null, vclock = 0;    // 仮想タイマ(null の間は setTimeout を即時実行する従来の動作)
const sandbox = {
  Path2D: class { moveTo() {} lineTo() {} bezierCurveTo() {} quadraticCurveTo() {} closePath() {} },
  document: {
    getElementById: id => (ids[id] ??= (id === "tank" || id === "popcv") ? mkcanvas() : mkel()),
    createElement: t => {
      if (t === "canvas") return mkcanvas();
      const d = mkel();
      // パネル行の innerHTML 代入後に children[0..2] を参照するため、それらしく用意する
      Object.defineProperty(d, "innerHTML", { set() { d.children = [mkel(), mkel(), mkel()]; }, get() { return ""; } });
      return d;
    },
    querySelectorAll: () => [], L: {}, addEventListener(t, f) { (this.L[t] ??= []).push(f); }, visibilityState: "visible", documentElement: mkel(), fullscreenElement: null,
  },
  window: { devicePixelRatio: 2, addEventListener: noop },
  localStorage: { getItem: () => null, setItem: (k, v) => { lsLast = v; } },
  performance: { now: () => 0 },
  requestAnimationFrame: f => { rafQ.push(f); return rafQ.length; },
  setTimeout: (f, ms) => { if (vtimers) { vtimers.push({ f, at: vclock + (ms || 0), on: true }); return vtimers.length; } f(); return 0; },
  clearTimeout: id => { if (vtimers && vtimers[id - 1]) vtimers[id - 1].on = false; },
  innerWidth: 1280, innerHeight: 800,
};
// モックをグローバルに置いてから、エントリ(js/main.js)を読み込む。読み込み=起動。
for (const [k, v] of Object.entries(sandbox)) Object.defineProperty(globalThis, k, { value: v, writable: true, configurable: true, enumerable: true });
// AQUARIUM_JS_ROOT:別の版(変更前のコミットを取り出したディレクトリ)の js/ を対象にして、R-C の数値だけを並べるための口(ふだんは未設定)
const JSROOT = process.env.AQUARIUM_JS_ROOT || root;
const imp = name => import(pathToFileURL(join(JSROOT, "js", name)).href);
await imp("main.js");
const [core, sp, beh, pop, ui] = await Promise.all([imp("core.js"), imp("species.js"), imp("fish-behavior.js"), imp("popup.js"), imp("ui.js")]);
const scene = await imp("scene.js");
const ag = await imp("aging.js");
const A = { fishes: beh.fishes, P: pop.P, SPECIES: sp.SPECIES, ORDER: sp.ORDER, counts: core.counts, syncFish: beh.syncFish,
  popReset: pop.popReset, updatePop: pop.updatePop, drawPop: pop.drawPop, startAct: pop.startAct, setPseudo: ui.setPseudo,
  setT: v => core.setTset(v), getT: () => core.Tw, setTimeScale: v => core.setTimeScale(v), setNight: v => core.setNightOn(v), getNightT: () => core.nightT };

/* ---------------- ヘルパ ---------------- */
let now = 0;
function frames(n) { for (let i = 0; i < n; i++) { now += 1000 / 60; const q = rafQ; rafQ = []; q.forEach(f => f(now)); } }
const finite = () => A.fishes.every(f => Number.isFinite(f.x) && Number.isFinite(f.y) && Number.isFinite(f.health));
let failed = 0;
function check(name, ok, detail = "") {
  console.log(`${ok ? "✓" : "✗"} ${name}${detail ? "  (" + detail + ")" : ""}`);
  if (!ok) failed++;
}

/* ---------------- テスト ---------------- */
frames(300);
check("起動して描画ループが回る", finite(), `魚 ${A.fishes.length} 匹`);

A.ORDER.forEach(sp => { A.counts[sp] = A.SPECIES[sp].max; });
A.syncFish(); frames(120);
check("全種を最大数にしても安定", finite(), `魚 ${A.fishes.length} 匹`);
A.ORDER.forEach(sp => { A.counts[sp] = A.SPECIES[sp].def; });
A.syncFish(); // 以降は既定の数で(テスト時間短縮のため)

A.setT(34); A.setTimeScale(20); frames(60 * 10);
const hotMax = Math.max(...A.fishes.map(f => f.health));
check("34℃で放置するとひどく弱る", Math.abs(A.getT() - 34) < 0.01 && hotMax < 0.2, `最大体調 ${hotMax.toFixed(2)}`);

A.setT(25); frames(60 * 10);
check("適温に戻すと回復する", Math.min(...A.fishes.map(f => f.health)) > 0.9);

A.setT(18); frames(60 * 12);
const coldMin = Math.min(...A.fishes.map(f => f.health));
check("18℃では弱るが下限0.38で止まる", finite() && coldMin >= 0.379 && coldMin < 0.6, `最小体調 ${coldMin.toFixed(2)}`);
A.setT(25); A.setTimeScale(1);

A.setNight(true); frames(120);
check("夜モードへ遷移", A.getNightT() === 1);
A.setNight(false); frames(120);
check("昼モードへ遷移", A.getNightT() === 0);

A.setPseudo(true); frames(10); A.setPseudo(false); frames(10);
check("全画面(代替表示)の切り替え", finite());

const ACTS = ["turn", "food", "bubble", "wiggle", "spin", "startle", "peek", "dash", "showoff", "bow", "wink", "nibble"];
for (const sp of A.ORDER) {
  A.popReset(sp);
  for (const a of ACTS) { A.startAct(a); for (let i = 0; i < 300; i++) { A.updatePop(1 / 60); if (i % 10 === 0) A.drawPop(); } }
  let maxAct = 0;
  for (let i = 0; i < 60 * 90; i++) { A.updatePop(1 / 60); if (A.P.act) maxAct = Math.max(maxAct, A.P.actT); }
  check(`ポップアップが詰まらない:${A.SPECIES[sp].name}`, Number.isFinite(A.P.x) && Number.isFinite(A.P.y) && maxAct < 9.5, `最長アクション ${maxAct.toFixed(1)}秒`);
}
for (const sp of A.ORDER) {
  let ok = 0;
  for (let k = 0; k < 10; k++) {
    A.popReset(sp); A.startAct("food");
    let i = 0; while (A.P.act === "food" && i < 60 * 12) { A.updatePop(1 / 60); i++; }
    if (A.P.d.eaten) ok++;
  }
  check(`餌を食べられる:${A.SPECIES[sp].name}`, ok === 10, `${ok}/10`);
}

{
  // お掃除生体(oto・shrimp・snail):既定・上限、増減、保存と復元
  const NEW = ["oto", "shrimp", "snail"], want = { oto: [3, 10], shrimp: [5, 20], snail: [3, 10] };
  const specOk = NEW.every(k => A.SPECIES[k] && A.SPECIES[k].def === want[k][0] && A.SPECIES[k].max === want[k][1])
    && A.ORDER.slice(-3).join() === NEW.join() && A.ORDER.slice(0, 6).join() === "neon,rummy,guppy,platy,angel,cory";
  check("新しい3種のデータ:既定(3/5/3)・上限(10/20/10)・ORDER の末尾(既存6種の順は不変)", specOk);
  check("パネルの種の一覧が 9 種", A.ORDER.length === 9, `${A.ORDER.length} 種`);
  let err = null;
  try {
    for (const k of NEW) {
      for (const n of [0, 1, A.SPECIES[k].max, 0, A.SPECIES[k].def]) {
        A.counts[k] = n; A.syncFish(); frames(20);
        if (A.fishes.filter(f => f.sp === k).length !== n) throw new Error(`${k} を ${n} にしても数が合わない`);
      }
    }
    A.setT(34); frames(60); A.setT(18); frames(60); A.setT(25);
    if (!finite()) throw new Error("NaN");
  } catch (e) { err = e; }
  check("新しい3種を 0〜上限で増減しても例外なし(水温を変えても安定)", !err, err ? String(err) : "");

  // 保存の復元:core.js をクエリ付きで読み直す(モジュールの再評価)。localStorage を一時的に差し替える
  const origLS = globalThis.localStorage;
  const reload = async (data, tag) => {
    globalThis.localStorage = { getItem: () => data === null ? null : JSON.stringify(data), setItem: noop };
    try { return await import(pathToFileURL(join(root, "js", "core.js")).href + "?" + tag); } finally { globalThis.localStorage = origLS; }
  };
  try {
    const old = await reload({ counts: { neon: 7, rummy: 0, guppy: 5, platy: 3, angel: 2, cory: 4 }, T: 26 }, "old");
    const defOk = NEW.every(k => old.counts[k] === A.SPECIES[k].def) && old.counts.neon === 7;
    check("古い保存データ(新しい種のキーなし)→ 新しい種は既定の数", defOk, NEW.map(k => `${k}=${old.counts[k]}`).join(" "));
    const nw = await reload({ counts: { oto: 7, shrimp: 12, snail: 0, neon: 9 }, T: 25 }, "new");
    check("保存した新しい種の数が再読み込み後に復元される(oto 7 / shrimp 12 / snail 0)", nw.counts.oto === 7 && nw.counts.shrimp === 12 && nw.counts.snail === 0 && nw.counts.neon === 9,
      NEW.map(k => `${k}=${nw.counts[k]}`).join(" "));
    const big = await reload({ counts: { oto: 99, shrimp: -3, snail: "x" } }, "big");
    check("範囲外・不正な保存値は丸める/無視する(oto 99→10、shrimp -3→0、snail 文字列→既定)", big.counts.oto === 10 && big.counts.shrimp === 0 && big.counts.snail === 3,
      NEW.map(k => `${k}=${big.counts[k]}`).join(" "));
    // 実際の保存(save)が新しい種の数を含むこと
    A.counts.shrimp = 8; core.save();
    check("save() の保存データに新しい種の数が入る", JSON.parse(lsLast).counts.shrimp === 8);
    A.counts.shrimp = A.SPECIES.shrimp.def; A.syncFish();
    // 軽量モード:保存と復元(キーのない古い保存はオフ)
    const l0 = await reload({ counts: { neon: 7 }, T: 26 }, "lite0");
    const l1 = await reload({ counts: { neon: 7 }, T: 26, lite: true }, "lite1");
    const l2 = await reload({ lite: "yes" }, "lite2");
    check("軽量モード:lite キーのない古い保存はオフ、lite:true はオン、真偽でない値はオフ", l0.liteOn === false && l1.liteOn === true && l2.liteOn === false, `${l0.liteOn}/${l1.liteOn}/${l2.liteOn}`);
    core.setLite(true); core.save(); const sOn = JSON.parse(lsLast).lite; core.setLite(false); core.save(); const sOff = JSON.parse(lsLast).lite;
    check("軽量モード:save() が lite(真偽)を保存する", sOn === true && sOff === false, `${sOn}/${sOff}`);
  } catch (e) { check("保存の復元テストが例外なく動く", false, String(e)); }
}

{
  // お掃除生体の動きと描画(N2)
  const cr = await imp("crawlers.js");
  const NEW = ["oto", "shrimp", "snail"], save0 = Object.fromEntries(A.ORDER.map(k => [k, A.counts[k]]));
  const bounds = () => {
    let bad = null, n = 0;
    for (const f of A.fishes) {
      if (!A.SPECIES[f.sp].solo) continue;
      const p = cr.crawlerPos(f); if (!p) continue; n++;
      const ok = Number.isFinite(p.x) && Number.isFinite(p.y) && p.x >= 0 && p.x <= core.W && p.y >= core.waterTop && p.y <= (f.sp === "snail" ? core.H : core.sandY(p.x) + 30 * core.U + 1); // 貝は砂の手前の縁(前面ガラスとの境目。画面の下端)まで来る(R2)
      if (!ok && !bad) bad = `${f.sp} ${p.surf} (${p.x.toFixed(1)}, ${p.y.toFixed(1)}) 水面 ${core.waterTop.toFixed(1)} 砂 ${core.sandY(p.x).toFixed(1)}`;
    }
    return { bad, n };
  };
  { // 前面ガラスの貝・オトの行き先の帯:苔の多い下寄り(中央で下側 40%、隅で 65%)で、砂の上
    let ok = true, d = "";
    for (let i = 0; i <= 20; i++) {
      const x = core.W * (0.05 + 0.9 * i / 20), [y0, y1] = cr.glassBand(x), hg = core.H - core.waterTop, edge = Math.max(0, 1 - Math.min(x / core.W, 1 - x / core.W) / 0.12);
      const top = core.waterTop + hg * (0.6 - 0.25 * edge);
      if (!(Math.abs(y0 - top) < 1e-6 && y1 > y0 && y1 <= core.sandY(x) - 7 * core.U)) { ok = false; d = `x=${x.toFixed(0)} ${y0.toFixed(0)}〜${y1.toFixed(0)} 砂 ${core.sandY(x).toFixed(0)}`; }
    }
    check("前面ガラスの貝・オトの行き先の帯:中央は下側 40%・隅は下側 65%、下端は砂の少し上(砂の下に出ない)", ok, d);
  }
  for (const k of NEW) A.counts[k] = A.SPECIES[k].max;
  A.syncFish();
  const kinds = new Set(); let badAll = null, nSeen = 0;
  /* R-C(重なり・動き・浮き・フェード・瞬間移動)の計測を、同じ 2 分間のシミュレーションの中で行う(変更前の版でも同じ計測ができるよう、共通の API だけを使う) */
  const rad = f => { const c = f.cr, L = A.SPECIES[f.sp].len * core.U * f.scale; return f.sp === "snail" ? L * (c.surf === "gF" || c.tl > 0 ? 0.72 : 0.45) : f.sp === "oto" ? 0.5 * L * (c.surf === "gB" ? 0.8 : c.surf === "gF" ? 1.1 : 1) : 0.5 * L; };
  const keyOf = c => c.surf === "rock" || c.surf === "wood" ? c.surf + c.id : c.surf;
  const solo = () => A.fishes.filter(f => A.SPECIES[f.sp].solo && f.cr);
  const RC = { overlapSec: 0, sameSurfPairSec: 0, minFade: 1, maxJump: 0, maxJumpWho: "", path: new Map(), last: new Map(), maxGap: { rock: 0, wood: 0 }, gapWho: {}, sandOut: 0, maxPairD: 0 };
  // 岩・流木の描かれている輪郭(drawRock / drawWood と同じ式を、ここで独立に計算する)
  const rockPoly = r => { const out = [[r.pts[0][0], r.pts[0][1]]]; let cx = r.pts[0][0], cy = r.pts[0][1]; for (let i = 1; i < r.pts.length; i++) { const a = r.pts[i - 1], b = r.pts[i], mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2; for (let k = 1; k <= 12; k++) { const t = k / 12, u = 1 - t; out.push([u * u * cx + 2 * u * t * a[0] + t * t * mx, u * u * cy + 2 * u * t * a[1] + t * t * my]); } cx = mx; cy = my; } out.push(out[0]); return out; };
  const woodPoly = br => { const n = br.length, L = [], R = []; for (let i = 0; i < n; i++) { const a = i < n - 1 ? Math.atan2(br[i + 1][1] - br[i][1], br[i + 1][0] - br[i][0]) : Math.atan2(br[i][1] - br[i - 1][1], br[i][0] - br[i - 1][0]); const nx = -Math.sin(a), ny = Math.cos(a), w = br[i][2] / 2; L.push([br[i][0] + nx * w, br[i][1] + ny * w]); R.push([br[i][0] - nx * w, br[i][1] - ny * w]); } return [L, R.reverse()]; };
  const segD = (px, py, a, b) => { const dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy || 1, t = Math.max(0, Math.min(1, ((px - a[0]) * dx + (py - a[1]) * dy) / l2)); return Math.hypot(px - (a[0] + dx * t), py - (a[1] + dy * t)); };
  const polyD = (px, py, pts) => { let m = Infinity; for (let i = 1; i < pts.length; i++) m = Math.min(m, segD(px, py, pts[i - 1], pts[i])); return m; };
  const wood = scene.getWood ? scene.getWood() : [];
  const gapOf = f => { // 接地点と、描かれている輪郭(岩・流木)との距離。砂は、砂の面(sandY〜画面の下端)の内側かどうか
    const k = cr.contactOf ? cr.contactOf(f) : null; if (!k || k.trans) return null;
    if (k.surf === "rock") return polyD(k.x, k.y, rockPoly(scene.rocks[Math.min(k.id, scene.rocks.length - 1)]));
    if (k.surf === "wood") { const [L, R] = woodPoly(wood[Math.min(k.id, wood.length - 1)]); return Math.min(polyD(k.x, k.y, L), polyD(k.x, k.y, R)); }
    return null;
  };
  for (let i = 0; i < 60 * 120; i++) { // 2 分(60fps)
    frames(1);
    const list = solo();
    for (const f of list) { // 瞬間移動の検査(跳躍・泳ぎは除く)・フェードの有無
      const p = cr.crawlerPos(f), key = f, last = RC.last.get(key), c = f.cr;
      RC.minFade = Math.min(RC.minFade, c.fade ?? 1);
      if (last && c.st !== "hop" && last.st !== "hop" && c.st !== "swim" && last.st !== "swim") { const j = Math.hypot(p.x - last.x, p.y - last.y); if (j > RC.maxJump) { RC.maxJump = j; RC.maxJumpWho = `${f.sp} ${last.surf}→${p.surf} ${last.st}→${c.st}`; } }
      RC.last.set(key, { x: p.x, y: p.y, st: c.st, surf: p.surf });
      if (i % 6 === 0) { const lp = RC.path.get(f); RC.path.set(f, { x: p.x, y: p.y, len: (lp ? lp.len + Math.hypot(p.x - lp.x, p.y - lp.y) : 0) }); }
    }
    if (i % 6 === 0) { // 0.1 秒ごと:同じ面の個体どうしの重なり(中心距離 < 半径の和 × 0.8)の延べ時間(ペア × 秒)
      for (let a = 0; a < list.length; a++) for (let b = a + 1; b < list.length; b++) {
        const A1 = list[a], B1 = list[b], ca = A1.cr, cb = B1.cr;
        if (ca.st === "hop" || cb.st === "hop" || ca.st === "swim" || cb.st === "swim" || keyOf(ca) !== keyOf(cb)) continue;
        const pa = cr.crawlerPos(A1), pb = cr.crawlerPos(B1), d = Math.hypot(pa.x - pb.x, pa.y - pb.y), r = rad(A1) + rad(B1);
        RC.sameSurfPairSec += 0.1; if (d < 0.8 * r) RC.overlapSec += 0.1;
      }
    }
    if (i % 20 === 0) {
      const b = bounds(); nSeen = Math.max(nSeen, b.n); if (b.bad && !badAll) badAll = b.bad; list.forEach(f => kinds.add(f.sp + ":" + cr.crawlerPos(f).surf));
      for (const f of list) { const g = gapOf(f); if (g !== null) { const k = f.cr.surf; if (g > RC.maxGap[k]) { RC.maxGap[k] = g; RC.gapWho[k] = `${f.sp} id${f.cr.id}`; } } }
    }
  }
  { // R-C:重なり・詰まり・フェード・瞬間移動・浮き
    const U1 = core.U, list = solo(), bySp = {};
    for (const f of list) { const l = RC.path.get(f)?.len ?? 0; (bySp[f.sp] ??= []).push(l / U1); }
    const need = { snail: 0.05 * 4 * 120, shrimp: 0.05 * 22 * 120, oto: 0.05 * 26 * 120 }; // 2 分間に動く距離(U)の下限 = 種の速さ × 120 秒 × 5%
    const mins = Object.fromEntries(Object.entries(bySp).map(([k, v]) => [k, Math.min(...v)]));
    check(`R-C:同じ面のお掃除生体どうしの重なり(中心距離 < 半径の和の 0.8 倍)の延べ時間(最大数・2 分):${RC.overlapSec.toFixed(1)} 秒(同じ面にいた延べ ${RC.sameSurfPairSec.toFixed(0)} 秒)`, true, "変更前の版と並べる(報告)");
    check("R-C:重なりの延べ時間が、同じ面にいた延べ時間の 0.5% 以下(変更前は 10% 以下が目標の基準)", RC.overlapSec <= 0.005 * Math.max(RC.sameSurfPairSec, 1) + 1e-9, `${RC.overlapSec.toFixed(1)} / ${RC.sameSurfPairSec.toFixed(0)} 秒`);
    check("R-C:詰まって動けなくなる個体がない(2 分間の移動距離が、種の速さ × 120 秒 × 5% 以上:貝 24U・エビ 132U・オト 156U)", Object.entries(need).every(([k, n]) => mins[k] >= n), Object.entries(mins).map(([k, v]) => `${k} 最小 ${v.toFixed(0)}U(基準 ${need[k].toFixed(0)}U)`).join(" / "));
    check("R-C:貝のフェード(fade < 1)が一度も起きない", RC.minFade === 1, `最小 ${RC.minFade}`);
    check("R-C:瞬間移動しない(跳躍・泳ぎ以外の 1 フレームの移動が 3U 以下)", RC.maxJump <= 3 * U1, `最大 ${(RC.maxJump / U1).toFixed(2)}U(${RC.maxJumpWho})`);
    check("R-C:岩・流木の上の個体が、描かれている輪郭から浮かない・めり込まない(接地点と輪郭の距離 ≤ 1.5U)", RC.maxGap.rock <= 1.5 * U1 && RC.maxGap.wood <= 1.5 * U1, `岩 最大 ${(RC.maxGap.rock / U1).toFixed(2)}U(${RC.gapWho.rock || "-"}) / 流木 最大 ${(RC.maxGap.wood / U1).toFixed(2)}U(${RC.gapWho.wood || "-"})`);
  }
  if (cr.contactOf) { // 貝の前面ガラスへの往復(砂の手前の縁→ガラスを這い上がる→苔の帯→這い降りる→縁→砂へ戻る):描画なしで 15 分ぶん(dt 0.05)進める。全員が重ならないことも確かめる
    const CR = cr.CRAWL, P0 = CR.snailGlassP; CR.snailGlassP = 1;
    const snails = A.fishes.filter(f => f.sp === "snail" && f.cr), seen = new Map(), cyc = new Map(); let jump = 0, who = "", ov = 0, pair = 0, fade = 1, tlJump = 0, errT = null; const offend = {};
    const lastP = new Map(), lastTl = new Map();
    try {
      for (let i = 0; i < 18000; i++) {
        for (const f of A.fishes) if (A.SPECIES[f.sp].solo) cr.updateCrawler(f, 0.05);
        const list = solo();
        for (const f of snails) {
          const c = f.cr, p = cr.crawlerPos(f), lp = lastP.get(f), st = (seen.get(f) ?? new Set()); st.add(c.st); seen.set(f, st); fade = Math.min(fade, c.fade ?? 1);
          if (lp) { const j = Math.hypot(p.x - lp.x, p.y - lp.y); if (j > jump) { jump = j; who = `${lp.st}→${c.st}`; } }
          lastP.set(f, { x: p.x, y: p.y, st: c.st });
          const ltl = lastTl.get(f); if (ltl !== undefined) tlJump = Math.max(tlJump, Math.abs((c.tl || 0) - ltl)); lastTl.set(f, c.tl || 0);
          const seq = cyc.get(f) ?? []; if (seq[seq.length - 1] !== c.st) { seq.push(c.st); cyc.set(f, seq); }
        }
        if (i % 2 === 0) for (let a = 0; a < list.length; a++) for (let b = a + 1; b < list.length; b++) {
          const ca = list[a].cr, cb = list[b].cr; if (ca.st === "hop" || cb.st === "hop" || ca.st === "swim" || cb.st === "swim" || keyOf(ca) !== keyOf(cb)) continue;
          const pa = cr.crawlerPos(list[a]), pb = cr.crawlerPos(list[b]); pair += 0.1; if (Math.hypot(pa.x - pb.x, pa.y - pb.y) < 0.8 * (rad(list[a]) + rad(list[b]))) { ov += 0.1; const k = `${list[a].sp}:${ca.st}@${keyOf(ca)} × ${list[b].sp}:${cb.st}`; offend[k] = (offend[k] || 0) + 0.1; if (!offend.__s) offend.__s = JSON.stringify({ k, ta: [ca.s, ca.dir, ca.pause, ca.x, ca.y], tb: [cb.s, cb.dir, cb.pause, cb.x, cb.y], ra: rad(list[a]), rb: rad(list[b]), d: Math.hypot(pa.x - pb.x, pa.y - pb.y), i }); }
        }
      }
    } catch (e) { errT = e; } finally { CR.snailGlassP = P0; }
    const need = ["toEdge", "tilt", "climb", "glass", "descend", "untilt", "return"];
    const full = [...cyc.values()].filter(q => { const t = q.join(">"); return need.every(n => q.includes(n)) && q.indexOf("toEdge") < q.indexOf("tilt") && q.indexOf("tilt") < q.indexOf("climb") && q.indexOf("climb") < q.indexOf("glass") && q.indexOf("glass") < q.indexOf("descend") && q.indexOf("descend") < q.indexOf("untilt") && q.indexOf("untilt") < q.indexOf("return"); }).length;
    check("R2:貝が砂の手前の縁から前面ガラスを這い上がり、苔の帯を這って、這い降りて砂へ戻る(15 分、確率 1。一巡した貝の数)", !errT && full >= 2, errT ? String(errT.stack || errT) : `${full} / ${snails.length} 匹が一巡(各貝の状態の推移 ${[...cyc.values()].map(q => q.length + ":" + q.slice(0, 14).join(">")).join(" | ")})`);
    check("R2:貝の移動に瞬間移動・フェードがない(15 分:1 ステップ 0.05 秒の移動の最大、フェード、縁での変形の連続性)", jump <= 2 * core.U && fade === 1 && tlJump <= 0.05 / CR.snailTilt + 1e-6, `最大 ${(jump / core.U).toFixed(2)}U(${who}) / fade 最小 ${fade} / 変形の 1 ステップの変化 最大 ${tlJump.toFixed(4)}`);
    check(`R2:15 分(貝が頻繁にガラスへ往復する条件)でも、同じ面の重なりの延べ時間がほぼゼロ:${ov.toFixed(1)} 秒(同じ面の延べ ${pair.toFixed(0)} 秒)`, ov <= 0.005 * Math.max(pair, 1) + 1e-9, `${ov.toFixed(1)} / ${pair.toFixed(0)} 秒 ${Object.entries(offend).filter(([k]) => k !== "__s").sort((a, b) => b[1] - a[1]).slice(0, 6).map(([k, v]) => k + " " + v.toFixed(1)).join(" ; ")} 初回 ${offend.__s}`);
  }
  // 水温・照明・全画面サイズ・低酸素で、更新と描画(全レイヤ)が例外なく呼べる
  let err = null;
  const drawAll = () => ["back", "low", "front", "glass"].forEach(l => cr.drawCrawlers(l));
  try {
    const conds = [[25, false, false, 8], [18, false, false, 8], [34, true, false, 8], [25, false, true, 8], [25, true, false, 0.5], [34, false, true, 1]];
    for (const [T, night, fs, doV] of conds) {
      A.setT(T); A.setNight(night); A.setPseudo(fs); ag.setAgingState({ DO: doV });
      for (let i = 0; i < 400; i++) { frames(1); if (i % 40 === 0) { drawAll(); cr.grazers(); } }
      if (!finite() || bounds().bad) throw new Error(`T=${T} night=${night} fs=${fs} DO=${doV}: ${bounds().bad || "NaN"}`);
    }
    A.setPseudo(false); A.setNight(false); A.setT(25);
    for (const f of A.fishes) if (A.SPECIES[f.sp].solo) f.health = 1;
  } catch (e) { err = e; }
  check("お掃除生体:水温 18/34℃・昼夜・全画面サイズ・低酸素(DO 0.5/1)で更新と描画が例外なし・位置が範囲内", !err, err ? String(err.stack || err) : "");
  // 低酸素・高温でオトは水面近くのガラスへ寄る(寄っていることの確認:平均の高さが通常より上)
  const meanY = sp => { const l = A.fishes.filter(f => f.sp === sp && f.cr).map(f => cr.crawlerPos(f).y); return l.reduce((a, b) => a + b, 0) / l.length; };
  const grazersOk = Array.isArray(cr.grazers()) && cr.grazers().every(g => ["glassF", "hard"].includes(g.kind) && Number.isFinite(g.x) && Number.isFinite(g.y));
  check("お掃除生体:grazers() が前面ガラス(glassF)・岩流木(hard)の位置を返す", grazersOk, `${cr.grazers().length} 件`);
  // 低酸素:DO 固定でしばらく回す。オト・エビは水面側へ寄る(平均 y が通常時より小さい)
  const settle = (doV, n) => { for (let i = 0; i < n; i++) { ag.setAgingState({ DO: doV }); frames(1); } };
  settle(8, 60 * 20); const yOtoN = meanY("oto"), ySrN = meanY("shrimp"), ySnN = meanY("snail");
  settle(0.5, 60 * 45); const yOtoL = meanY("oto"), ySrL = meanY("shrimp"), ySnL = meanY("snail");
  check("低酸素でオト・エビは水面側へ寄る(平均の高さが上がる)。貝は水面へ寄らず、オトより下にいる", yOtoL < yOtoN && ySrL < ySrN && ySnL > yOtoL,
    `オト ${yOtoN.toFixed(0)}→${yOtoL.toFixed(0)} / エビ ${ySrN.toFixed(0)}→${ySrL.toFixed(0)} / 貝 ${ySnN.toFixed(0)}→${ySnL.toFixed(0)}`);
  ag.setAgingState({ DO: 8 });
  // 砂煙:フラグ on で粒が出て、off では出ない(描画命令なし)
  const puffRun = on => {
    scene.FX.puff = false; frames(60 * 3); scene.FX.puff = on; A.counts.cory = 12; A.syncFish(); // 先に既存の粒を消す
    let mx = 0; for (let i = 0; i < 60 * 20; i++) { frames(1); mx = Math.max(mx, scene.puffCount()); }
    scene.FX.puff = true; return mx;
  };
  const pOff = puffRun(false), pOn = puffRun(true);
  check("砂煙:フラグ off では粒が出ず、on ではコリドラスが砂煙の粒を上げる", pOff === 0 && pOn > 0 && scene.FX.puff === true, `off 最大 ${pOff} 粒 / on 最大 ${pOn} 粒`);
  for (const k of A.ORDER) A.counts[k] = save0[k];
  A.syncFish(); frames(30);
}

// お掃除生体の固有の仕草(drawlog.mjs の ACTS_NEW と同じ)。それぞれの種で 300 フレーム回して例外なし、最後まで終わる(詰まらない)
const ACTS_NEW = { snail: ["hide", "flip", "glassview"], shrimp: ["wash", "backhop", "hug"], oto: ["graze", "flow", "pakupaku"] };
for (const [sp, acts] of Object.entries(ACTS_NEW)) {
  for (const act of acts) {
    let err = null, endedAt = -1, fin = true, gvMax = 0, eaten = false;
    try {
      for (let r = 0; r < 5; r++) { // 乱数の違いで状態が変わるので 5 回
        A.popReset(sp); A.startAct(act);
        let i = 0;
        for (; i < 60 * 12; i++) {
          A.updatePop(1 / 60); if (i % 5 === 0) A.drawPop();
          gvMax = Math.max(gvMax, A.P.gv || 0);
          if (act === "hug" && A.P.food && A.P.food.held) eaten = true;
          if (!Number.isFinite(A.P.x) || !Number.isFinite(A.P.y)) fin = false;
          if (!A.P.act) break;
        }
        endedAt = Math.max(endedAt, i / 60);
        for (let k = 0; k < 300; k++) { A.updatePop(1 / 60); if (k % 10 === 0) A.drawPop(); }
        if (A.P.y > 190 || A.P.y < 0 || A.P.x < -50 || A.P.x > 354) fin = false; // 小さな水槽(304x190)の外へ出ない
      }
    } catch (e) { err = e; }
    check(`新しい仕草が例外なく終わる:${A.SPECIES[sp].name}の「${act}」(5 回。最後まで ${endedAt.toFixed(1)} 秒、位置は小水槽の中)`,
      !err && fin && endedAt >= 0 && endedAt < 9.5 && (act !== "glassview" || gvMax > 0.9) && (act !== "hug" || eaten), err ? String(err.stack || err) : `gv 最大 ${gvMax.toFixed(2)}`);
  }
}

{
  // 不透明化の監査(R1。画素は pixels.html で確かめる。ここは回帰防止):PAINT を記録用のコンテキストで走らせ、塗りの実効アルファを調べる
  //   体は不透明(globalAlpha 1)、ひれ・尾の膜だけ半透明、体の奥のひれは体より先に描く、エビは 1 枚のオフスクリーンから 1 回だけ貼る
  const fr = await imp("fish-render.js");
  const PAINT_OPS = ["fill", "stroke", "fillRect", "strokeRect", "drawImage", "fillText"];
  const record = (f, L, a = 1, front = false) => {
    const st = { globalAlpha: 1 }, stack = [], ops = []; let tag = "none";
    const rec = new Proxy({}, {
      get(o, k) {
        if (k === "save") return () => stack.push({ ...st });
        if (k === "restore") return () => { const x = stack.pop(); if (x) Object.assign(st, x); };
        if (PAINT_OPS.includes(k)) return (...args) => ops.push({ op: k, a: st.globalAlpha, tag, src: args[0], i: ops.length });
        if (/^create/.test(k)) return () => ({ addColorStop() {} });
        return k in st ? st[k] : () => {};
      },
      set(o, k, v) { st[k] = v; return true; },
    });
    const orig = core.ctx; core.setCtx(rec); fr.AUDIT.hook = t => { tag = t; };
    try { front ? fr.drawSnailFront(f, L, 0, 0, 0, a) : fr.drawCreature(f, L, 0.1, 0, 0, 0, 1, a); } finally { fr.AUDIT.hook = null; core.setCtx(orig); }
    return ops;
  };
  const mkf = (k, v = 0) => ({ sp: k, phase: 0.6, pale: 0, health: 1, spots: [[0.5, 0.2, 1], [0.7, -0.2, 1]], variant: v, ox: 0, tailScale: 1 });
  const bad = [], info = [];
  for (const [k, v] of [["neon", 0], ["rummy", 0], ["guppy", 0], ["platy", 0], ["angel", 0], ["angel", 1], ["cory", 0], ["oto", 0]]) {
    const fa = A.SPECIES[k].finAlpha, ops = record(mkf(k, v), 100), name = `${k}${v ? v : ""}`;
    const body = ops.filter(o => o.tag === "body"), far = ops.filter(o => o.tag === "fin"), near = ops.filter(o => o.tag === "finNear");
    const firstBody = body.length ? body[0].i : Infinity;
    if (!body.length || body.some(o => o.a !== 1)) bad.push(`${name}: 体の塗りが不透明でない(${body.map(o => o.a).filter(x => x !== 1)[0]})`);
    if (!far.length || far.some(o => !(o.a < 1 && o.a <= fa + 1e-9))) bad.push(`${name}: ひれ・尾の膜が半透明でない`);
    if (far.some(o => o.i > firstBody)) bad.push(`${name}: 体の奥のひれが体より後に描かれている(体で隠れない)`);
    if (!near.length || near.some(o => o.i < firstBody || !(o.a < 1))) bad.push(`${name}: 胸びれが体の手前の半透明でない`);
    if (ops.some(o => o.tag === "none")) bad.push(`${name}: 区間の目印のない塗りがある`);
    // フェード(a = 0.5)の間は体も薄くなる(出現・消滅だけ)
    const f2 = record(mkf(k, v), 100, 0.5).filter(o => o.tag === "body");
    if (f2.some(o => Math.abs(o.a - 0.5) > 1e-9)) bad.push(`${name}: フェードで体が薄くならない`);
    info.push(`${name} 体${body.length}/ひれ${far.length}+${near.length}`);
  }
  check("不透明化の監査:魚 6 種とオトは、体の塗りが globalAlpha 1、ひれ・尾の膜だけ半透明、体の奥のひれは体より先、胸びれは体の後", bad.length === 0, bad[0] || info.join(" "));
  // 貝(横向き・前面ガラス)は全部不透明。エビは 1 枚のオフスクリーンから 1 回だけ半透明で貼る
  const sn = record(mkf("snail"), 100), sf = record(mkf("snail"), 100, 1, true);
  check("不透明化の監査:石巻貝(横向き・前面ガラス)の塗りはすべて globalAlpha 1", sn.length > 10 && sn.every(o => o.a === 1) && sf.length > 10 && sf.every(o => o.a === 1), `横向き ${sn.length} 命令 / 前面ガラス ${sf.length} 命令`);
  const s1 = record(mkf("shrimp"), 100), s2 = record(mkf("shrimp"), 100), fa = A.SPECIES.shrimp.finAlpha;
  check("不透明化の監査:ヤマトヌマエビは、メインの描画に 1 枚の drawImage(半透明 finAlpha)だけを出し、共用の同じオフスクリーンから貼る",
    s1.length === 1 && s1[0].op === "drawImage" && Math.abs(s1[0].a - fa) < 1e-9 && s2.length === 1 && s1[0].src === s2[0].src && !!s1[0].src, `${s1.length} 命令(${s1.map(o => o.op)}) alpha ${s1[0]?.a}`);
  // R1b:岩・流木・水草・浮草は不透明(層の globalAlpha をやめた)。2 つの方法で確かめる:
  //  (1) main.js の draw() を上から読み、岩・流木・各層の水草・浮草を描く行の時点で ctx.globalAlpha が 1 であること
  //  (2) 描画関数そのものを記録用のコンテキスト(globalAlpha 1 から)で走らせ、すべての塗り・線の実効アルファが 1 であること(物体自身が半透明にしていない)
  {
    const src = readFileSync(join(JSROOT, "js", "main.js"), "utf8"), body = src.slice(src.indexOf("function draw()"), src.indexOf("function loop"));
    let alpha = 1; const badLines = [];
    for (const line of body.split("\n")) {
      for (const m of line.matchAll(/ctx\.globalAlpha = ([^;]+);/g)) alpha = m[1].trim() === "1" ? 1 : m[1].trim();
      if (/drawWood\(|drawRock|plants\.(back|mid|front)|drawFloats\(/.test(line) && alpha !== 1) badLines.push(`${line.trim()}(globalAlpha = ${alpha})`);
    }
    check("不透明化の監査(背景):main.js の draw() で、岩・流木・奥/中景/前景の水草・浮草を描く時点の globalAlpha が 1", badLines.length === 0, badLines[0] || "");
    const st = { globalAlpha: 1 }, stk = [], ops = [];
    const rec = new Proxy({}, {
      get(o, k) {
        if (k === "save") return () => stk.push({ ...st }); if (k === "restore") return () => { const q = stk.pop(); if (q) Object.assign(st, q); };
        if (PAINT_OPS.includes(k)) return () => ops.push({ op: k, a: st.globalAlpha });
        if (/^create/.test(k)) return () => ({ addColorStop() {} });
        return k in st ? st[k] : () => {};
      },
      set(o, k, v) { st[k] = v; return true; },
    });
    const orig = core.ctx; core.setCtx(rec);
    const groups = { 岩: () => scene.rocks.forEach(scene.drawRock), 流木: () => scene.drawWood(), 奥の水草: () => scene.plants.back.forEach(q => q.type === "ribbon" ? scene.drawRibbon(q, 1) : scene.drawStem(q, 1)),
      中景の草: () => scene.plants.mid.forEach(q => q.type === "fern" ? scene.drawFern(q, 1) : q.type === "lotus" ? scene.drawLotus(q, 1) : scene.drawSword(q, 1)),
      前景の草: () => scene.plants.front.forEach(q => { if (q.type === "tuft") q.blades.forEach(bl => scene.drawRibbon(bl, 1)); else scene.drawCarpet(q, 1); }), 浮草: () => scene.drawFloats(1) };
    const badG = []; let nOps = 0;
    try { for (const [name, fn] of Object.entries(groups)) { ops.length = 0; fn(); nOps += ops.length; if (!ops.length || ops.some(o => o.a !== 1)) badG.push(`${name}(${ops.length} 命令、alpha ${[...new Set(ops.map(o => o.a))]})`); } } finally { core.setCtx(orig); }
    check("不透明化の監査(背景):岩・流木・水草・浮草の描画関数の塗り・線の実効アルファがすべて 1", badG.length === 0, badG[0] || `${nOps} 命令`);
  }

}

{
  // sw.js の事前キャッシュのリストに、js/ の全 .js・icons/ の全 PNG・manifest が含まれていること
  const sw = readFileSync(join(root, "sw.js"), "utf8");
  const list = ((sw.match(/PRECACHE\s*=\s*\[([\s\S]*?)\]/) || [])[1] || "").match(/"[^"]+"/g)?.map(s => s.slice(1, -1).replace(/^\.\//, "")) ?? [];
  const need = [...readdirSync(join(root, "js")).filter(f => f.endsWith(".js")).map(f => `js/${f}`),
    ...readdirSync(join(root, "icons")).filter(f => f.endsWith(".png")).map(f => `icons/${f}`), "manifest.webmanifest", "index.html"];
  const missing = need.filter(f => !list.includes(f));
  check("sw.js の事前キャッシュに全ファイルが含まれる", need.length > 0 && missing.length === 0, missing.length ? `不足: ${missing.join(", ")}` : `${need.length} ファイル`);
}

{
  // タップでポップアップが開閉する(click の pointerType に依存しない)
  const ic = canvases.find(c => c.className === "ico" && c.L.click);
  const fire = (t, e) => (ic.L[t] || []).forEach(f => f(e));
  A.P.open = false; A.P.owner = null;
  fire("pointerdown", { pointerType: "touch" }); fire("click", { pointerType: "mouse" });
  const c1 = A.P.open === true;
  fire("pointerdown", { pointerType: "touch" }); fire("click", {});
  const c2 = A.P.open === false;
  fire("pointerdown", { pointerType: "mouse" }); fire("click", { pointerType: "mouse" });
  const c3 = A.P.open === false;
  check("タップでポップアップが開閉する(click の pointerType に依存しない)", !!ic && c1 && c2 && c3, `開く ${c1} / 閉じる ${c2} / マウス無視 ${c3}`);
}

{
  // 24時間計:時針の角度(純粋関数)と描画関数
  const a = (h, m) => scene.clockHourAngle(h, m);
  const near = (x, y) => Math.abs(x - y) < 1e-9;
  check("24時間計の角度:0:00→0 / 6:00→90 / 12:00→180 / 18:00→270 / 6:30→97.5",
    near(a(0, 0), 0) && near(a(6, 0), 90) && near(a(12, 0), 180) && near(a(18, 0), 270) && near(a(6, 30), 97.5),
    `${a(0, 0)} / ${a(6, 0)} / ${a(12, 0)} / ${a(18, 0)} / ${a(6, 30)}`);
  check("24時間計の角度:23:59 は 360 未満で 359 超", a(23, 59) < 360 && a(23, 59) > 359, `${a(23, 59)}`);
  let err = null;
  try { scene.drawClock(); } catch (e) { err = e; }
  check("24時間計の描画関数が例外なく呼べる", !err, err ? String(err) : "");
}

{
  // 酸素メーター:針の角度(純粋関数)・描画関数・毎フレームの命令
  const f = d => scene.o2NeedleAngle(d), near = (x, y) => Math.abs(x - y) < 1e-9;
  check("酸素メーターの針:DO 0→135 / 5→270 / 10→405 / 7.9→348.3 / 範囲外は丸める(-1→135、12→405)",
    near(f(0), 135) && near(f(5), 270) && near(f(10), 405) && near(f(7.9), 348.3) && near(f(-1), 135) && near(f(12), 405),
    `${f(0)} / ${f(5)} / ${f(10)} / ${f(7.9)} / ${f(-1)} / ${f(12)}`);
  const savedDO = ag.DO;
  let err = null;
  for (let d = 0; d <= 10; d += 0.5) { ag.setAgingState({ DO: d }); try { scene.drawO2Meter(); } catch (e) { err = e; } }
  ag.setAgingState({ DO: 25 }); try { scene.drawO2Meter(); } catch (e) { err = e; }
  check("酸素メーターの描画関数が DO 0〜10(と 25)で例外なく呼べる", !err, err ? String(err) : "");
  const g = scene.meterGeom(), c = scene.clockGeom();
  check("酸素メーターの位置:中心は時計の 66U 右・同じ高さ・同じ半径", Math.abs(g.x - c.x - 66 * core.U) < 1e-9 && g.y === c.y && g.r === c.r, `x ${g.x.toFixed(2)} (時計 ${c.x.toFixed(2)} + 66U ${(66 * core.U).toFixed(2)})`);
  const KEYS = ["createLinearGradient", "createRadialGradient", "createConicGradient", "createImageData", "putImageData", "drawImage", "fill", "stroke"];
  const n = Object.fromEntries(KEYS.map(k => [k, 0])), cx = core.ctx;
  for (const k of KEYS) cx[k] = () => { n[k]++; return { addColorStop() {}, data: new Uint8ClampedArray(4) }; };
  ag.setAgingState({ DO: 4 }); let e2 = null; try { scene.drawO2Meter(); } catch (e) { e2 = e; }
  for (const k of KEYS) delete cx[k];
  ag.setAgingState({ DO: savedDO });
  check("酸素メーターの毎フレーム:グラデーション生成・画素計算なし(drawImage 1 回+針の線・点だけ)",
    !e2 && n.createLinearGradient + n.createRadialGradient + n.createConicGradient + n.createImageData + n.putImageData === 0 && n.drawImage === 1,
    `drawImage ${n.drawImage} / stroke ${n.stroke} / fill ${n.fill} / グラデーション生成 ${n.createLinearGradient + n.createRadialGradient + n.createConicGradient}`);
}

{
  // 時計ボタン(時間経過の ON/OFF)・リセットの2段階・照明の自動化
  const fire = (id, t, e = {}) => (ids[id].L[t] || []).forEach(f => f(e));
  const savedOn = () => JSON.parse(lsLast).aging.on;
  const lab = () => ids.clockbtn.attrs["aria-label"];
  ag.restoreAging(null, Date.now()); core.save();
  const on0 = ag.agingOn;
  fire("clockbtn", "click"); const off1 = !ag.agingOn && savedOn() === false && ids.clockbtn.attrs["aria-pressed"] === "false" && lab() === "時間の経過:オフ。押すとオンにします";
  fire("clockbtn", "click"); const on2 = ag.agingOn && savedOn() === true && ids.clockbtn.attrs["aria-pressed"] === "true" && lab() === "時間の経過:オン。押すとオフにします";
  check("時計ボタンのクリックで agingOn が反転し、保存データの aging.on が変わる", on0 && off1 && on2, `既定 ${on0} / 1回目 ${off1} / 2回目 ${on2}`);
  let stopped = false; fire("clockbtn", "dblclick", { stopPropagation() { stopped = true; } });
  check("時計ボタンの dblclick は伝播を止める(全画面にならない)", stopped);
  check("時計ボタンの位置・大きさが設定される(中心 (0.045W, H-46U)、直径 56U)", (() => {
    const g = scene.clockGeom(), st = ids.clockbtn.style;
    return parseFloat(st.width) === 2 * g.r && parseFloat(st.height) === 2 * g.r && Math.abs(parseFloat(st.left) + g.r - core.W * 0.045) < 1e-6 && Math.abs(parseFloat(st.top) + g.r - (core.H - 46 * core.U)) < 1e-6;
  })(), `left ${ids.clockbtn.style.left} top ${ids.clockbtn.style.top} size ${ids.clockbtn.style.width}`);
  let e1 = null; ag.setAgingOn(false); try { scene.drawClock(); } catch (e) { e1 = e; } ag.setAgingOn(true);
  check("24時間計の描画(OFF)が例外なく呼べる", !e1, e1 ? String(e1) : "");

  // リセットの2段階(仮想タイマ)
  vtimers = []; vclock = 0;
  const adv = ms => { vclock += ms; vtimers.filter(t => t.on && t.at <= vclock).forEach(t => { t.on = false; t.f(); }); };
  const OLD = Date.now() - 5 * 86400000;
  ag.setAgingState({ dirt: 0.7, algaeGlass: 0.5, algaeHard: 0.4, clog: 0.6, growth: 0.8, lastClean: OLD, lastFilter: OLD });
  const label0 = "水槽をリセット";
  fire("resetbtn", "click");
  const step1 = ag.dirt === 0.7 && ag.clog === 0.6 && ag.lastClean === OLD && ids.resetbtn.textContent === "もう一度押すとリセット" && ids.resetbtn.attrs["aria-label"] === "もう一度押すと水槽をリセットします";
  adv(3900); const still = ids.resetbtn.textContent === "もう一度押すとリセット";
  adv(200); const back = ids.resetbtn.textContent === label0 && ids.resetbtn.attrs["aria-label"] === "水槽をリセット" && ag.dirt === 0.7;
  check("リセット:1回目は状態不変で文言が変わり、4秒で元に戻る", step1 && still && back, `1回目 ${step1} / 3.9秒 ${still} / 4.1秒 ${back}`);
  const nFish = A.fishes.length, T0 = core.Tset, t1 = Date.now();
  fire("resetbtn", "click"); fire("resetbtn", "click");
  check("リセット:2回目で dirt・clog 等が 0、last* が now(魚の数・水温は不変)",
    ag.dirt === 0 && ag.algaeGlass === 0 && ag.algaeHard === 0 && ag.clog === 0 && ag.growth === 0 && ag.lastClean >= t1 && ag.lastFilter >= t1 && A.fishes.length === nFish && core.Tset === T0 && ids.resetbtn.textContent === label0,
    `dirt ${ag.dirt} clog ${ag.clog} lastClean-now ${ag.lastClean - t1}ms`);
  vtimers = null;

  // 照明の自動化(ui.autoLightTick:前回の段階を覚え、変わったときだけ setNight)
  const jst = (y, m, d, hh, mm) => Date.UTC(y, m, d, hh - 9, mm);
  const st = ag.sunTimes(new Date(2026, 5, 21, 12)); // 6/21(東京)
  const nightNow = () => core.nightOn;
  ag.setAgingOn(true);
  fire("clockbtn", "click"); fire("clockbtn", "click"); // 前回の段階を null に戻す(OFF→ON)
  ui.autoLightTick(jst(2026, 5, 21, 3, 0)); const s1 = nightNow() === true;                 // 起動時:夜を即適用
  A.setNight(false); ui.autoLightTick(jst(2026, 5, 21, 3, 30)); const s2 = nightNow() === false; // 同じ段階 → 手動の昼を保つ
  ui.autoLightTick(st.sunrise + 3600000 - 60000); const s3 = nightNow() === false;            // まだ夜の段階 → 保つ
  A.setNight(true); ui.autoLightTick(st.sunrise + 3600000 + 60000); const s4 = nightNow() === false; // 日の出+1h をまたぐ → 昼
  A.setNight(true); ui.autoLightTick(st.sunset + 1800000 - 60000); const s5 = nightNow() === true;   // 昼の間は apply しない
  A.setNight(false); ui.autoLightTick(st.sunset + 1800000 - 30000); const s6 = nightNow() === false;
  ui.autoLightTick(st.sunset + 1800000 + 60000); const s7 = nightNow() === true;              // 日没+30m をまたぐ → 夜
  check("autoLightTick:起動時に適用/段階が変わるまで手動を保つ/日の出+1h で昼へ/日没+30m で夜へ", s1 && s2 && s3 && s4 && s5 && s6 && s7, [s1, s2, s3, s4, s5, s6, s7].join(","));
  // hidden 中に期日をまたいで visible に戻ると、清掃が実施され案内が出る
  vtimers = [];
  ag.setAgingOn(true); ag.takeNotice(); ids.notice.textContent = ""; ids.notice.classList.remove("show");
  ag.setAgingState({ dirt: 0.6, lastClean: Date.now() - 3 * 86400000, lastFilter: Date.now() });
  document.visibilityState = "visible";
  (document.L.visibilitychange || []).forEach(f => f());
  check("hidden 中に期日をまたいで visible に戻ると清掃が実施され案内が出る", ag.dirt === 0 && Date.now() - ag.lastClean < 5000 && ids.notice.textContent === "留守の間に水替えと水槽の清掃をしました" && ids.notice.classList.contains("show"),
    `dirt ${ag.dirt} 案内「${ids.notice.textContent}」`);
  vtimers = null;
  A.setNight(false); ag.setAgingOn(false);
  ui.autoLightTick(jst(2026, 5, 21, 23, 0)); const offOK = nightNow() === false;
  check("autoLightTick:OFF 中は動かない", offOK);
  ag.setAgingOn(true); A.setNight(false);
}

/* ---------------- A4:低酸素の行動と体調 ---------------- */
{
  const S = A.SPECIES.neon, hyp = v => beh.effectiveZone(S, v);
  const prevT = A.getT();
  A.setT(25); frames(60 * 10); // Tw を 25 に落ち着かせる
  const bz = beh.baseZone(S), z0 = hyp(0), z1 = hyp(1), zh = hyp(0.5), zDef = beh.effectiveZone(S);
  const bMax = Math.max(...A.ORDER.map(k => beh.effectiveZone(A.SPECIES[k], 1)[1]));
  A.setTimeScale(20); A.setT(34); frames(60 * 30);
  const zHot = hyp(0); // 34℃(暑さ最大)での値
  A.setTimeScale(1);
  check("effectiveZone:25℃で hypoxia=0 は種の層を広げたもの(baseZone)と同じ・既定引数は現在の DO、hypoxia=1 は 34℃ と同じ水面寄り",
    Math.abs(core.Tw - 34) < 0.05 && z0[0] === bz[0] && z0[1] === bz[1] && bz[0] < S.zone[0] && bz[1] > S.zone[1] && bz[1] <= 0.95 && zDef[0] === z0[0] && zDef[1] === z0[1]
      && z1[0] === zHot[0] && z1[1] === zHot[1] && z1[0] <= 0.16 && zh[1] < z0[1] && zh[1] > z1[1],
    `hyp0 [${z0.map(v => v.toFixed(3))}] / hyp0.5 [${zh.map(v => v.toFixed(3))}] / hyp1 [${z1.map(v => v.toFixed(3))}] / 全種 hyp1 の下端 最大 ${bMax.toFixed(3)}`);
  const savedDO = ag.DO;
  A.setTimeScale(20); A.setT(25); frames(60 * 10); A.setTimeScale(1); // Tw を 25 に落ち着かせる
  const tw25 = Math.abs(core.Tw - 25) < 0.05;
  const secTo = (doVal, target, maxSec, sp = "neon") => {
    const f = beh.makeFish(sp); f.hardy = 1; ag.setAgingState({ DO: doVal });
    const o = A.SPECIES[sp].opt; let t = 0;
    while (f.health >= target && t < maxSec) { beh.updateHealth(f, 1); t++; }
    return { t, h: f.health, opt: o };
  };
  const hoursAt = (doVal, sec) => { const f = beh.makeFish("neon"); f.hardy = 1; ag.setAgingState({ DO: doVal }); for (let i = 0; i < sec; i++) beh.updateHealth(f, 1); return f.health; };
  const r1 = secTo(1.0, 0.4, 3600), h25 = hoursAt(2.5, 300), h3 = hoursAt(3.0, 300), h45 = hoursAt(7.9, 300);
  check("体調:DO=1.0 で 1.0→0.4 未満まで 2〜5 分", tw25 && r1.t >= 120 && r1.t <= 300, `${(r1.t / 60).toFixed(2)} 分(${r1.t} 秒)`);
  check("体調:DO=2.5 で 5 分後も 0.6 以上", h25 >= 0.6, `5 分後 ${h25.toFixed(3)}`);
  check("体調:DO ≥ 3.0 では変化なし(1.0 のまま。弱った魚は従来どおり回復)", h3 === 1 && h45 === 1 && tw25 && (() => {
    const f = beh.makeFish("neon"); f.hardy = 1; f.health = 0.5; ag.setAgingState({ DO: 3.0 }); beh.updateHealth(f, 10); return Math.abs(f.health - 0.58) < 1e-9;
  })(), `DO3.0→${h3} DO7.9→${h45}`);
  check("体調:DO<3.0 では適温でも回復しない", (() => {
    const f = beh.makeFish("neon"); f.hardy = 1; f.health = 0.5; ag.setAgingState({ DO: 2.9 }); beh.updateHealth(f, 1); return f.health < 0.5;
  })());
  const r0 = secTo(0, 0.05, 3600);
  A.setTimeScale(20); A.setT(34); frames(60 * 30); A.setTimeScale(1);
  const fh = beh.makeFish("neon"); fh.hardy = 1; ag.setAgingState({ DO: 7.9 }); let th = 0; while (fh.health > 0.0401 && th < 3600) { beh.updateHealth(fh, 1); th++; }
  check("体調:DO=0 でも暴走しない(34℃ のネオンと同程度以下の速さ)", r0.t >= th * 0.9 && Math.abs(core.Tw - 34) < 0.05, `DO=0 で 0.04 まで ${r0.t} 秒 / 34℃ ネオン ${th} 秒(Tw ${core.Tw.toFixed(2)})`);
  A.setTimeScale(20); A.setT(prevT); frames(60 * 10); A.setTimeScale(1); ag.setAgingState({ DO: savedDO });
}

/* ---------------- A3:時間経過の見た目(汚れ・苔・水草の成長) ---------------- */
{
  // tank の ctx に呼び出し回数を数える関数を一時的に載せる(モックの Proxy は、載せた関数をそのまま返す)
  const KEYS = ["fill", "stroke", "drawImage", "fillRect", "clip", "arc", "ellipse", "moveTo", "lineTo", "quadraticCurveTo", "bezierCurveTo", "beginPath", "putImageData", "createImageData", "createLinearGradient", "createRadialGradient"];
  const cx = core.ctx;
  const count = fn => {
    const n = Object.fromEntries(KEYS.map(k => [k, 0]));
    for (const k of KEYS) cx[k] = () => { n[k]++; return k.startsWith("create") ? (k === "createImageData" ? { data: new Uint8ClampedArray(4) } : { addColorStop() {} }) : undefined; };
    let err = null; try { fn(); } catch (e) { err = e; }
    for (const k of KEYS) delete cx[k];
    return { n, err, total: Object.values(n).reduce((a, b) => a + b, 0) };
  };
  const ALL = v => ({ dirt: v, algaeGlass: v, algaeHard: v, clog: v, growth: v });
  const sword = scene.plants.mid.find(p => p.type === "sword"), stem = scene.plants.back.find(p => p.type === "stem"), ribbon = scene.plants.back.find(p => p.type === "ribbon");
  const savedAging = ag.serializeAging();

  ag.setAgingState(ALL(0));
  const z = count(() => { scene.drawAgingGlass(); scene.drawAgingHard(); });
  check("A3:全状態 0 では、ガラスの汚れ・苔と岩・流木の苔の描画命令が 1 つも出ない", !z.err && z.total === 0, z.err ? String(z.err) : `命令 ${z.total}`);
  ag.setAgingState(ALL(0.001));
  const z2 = count(() => { scene.drawAgingGlass(); scene.drawAgingHard(); });
  check("A3:0.002 未満の値でも描画命令が出ない", !z2.err && z2.total === 0, `命令 ${z2.total}`);

  ag.setAgingState(ALL(1));
  const warm = count(() => { scene.drawAgingGlass(); scene.drawAgingHard(); }); // 初回はテクスチャを作る
  const glass = count(() => scene.drawAgingGlass()), hard = count(() => scene.drawAgingHard());
  check("A3:全状態 1 で、新しい描画関数が例外なく呼ばれる", !warm.err && !glass.err && !hard.err, warm.err ? String(warm.err) : "");
  check("A3:全状態 1 の毎フレームは drawImage+fillRect だけ(グラデーション生成・画素計算・パス描画なし)",
    glass.n.drawImage === 3 && glass.n.fillRect === 1 && hard.n.drawImage === 3 &&
    ["createLinearGradient", "createRadialGradient", "createImageData", "putImageData", "arc", "ellipse", "lineTo", "fill", "stroke"].every(k => glass.n[k] === 0 && hard.n[k] === 0),
    `ガラス drawImage ${glass.n.drawImage} + fillRect ${glass.n.fillRect} / 岩・流木 drawImage ${hard.n.drawImage}(全部で ${glass.total + hard.total} 命令)`);

  const rot = { g0: null, g1: null };
  ag.setAgingState({ growth: 0 }); rot.g0 = count(() => scene.drawStem(stem, 1));
  ag.setAgingState({ growth: 1 }); rot.g1 = count(() => scene.drawStem(stem, 1));
  const rb0 = (ag.setAgingState({ growth: 0 }), count(() => scene.drawRibbon(ribbon, 1))), rb1 = (ag.setAgingState({ growth: 1 }), count(() => scene.drawRibbon(ribbon, 1)));
  check("A3:growth=1 でロタラは節と葉が増え(背が伸びる)、バリスネリアも例外なく描ける", !rot.g1.err && !rb1.err && rot.g1.n.ellipse > rot.g0.n.ellipse && rb1.total > 0,
    `ロタラの葉 ${rot.g0.n.ellipse / 2}→${rot.g1.n.ellipse / 2} 枚ずつ(左右)`);
  const fl0 = (ag.setAgingState({ growth: 0 }), count(() => scene.drawFloats(1))), fl1 = (ag.setAgingState({ growth: 1 }), count(() => scene.drawFloats(1)));
  check("A3:growth=1 で浮草の葉が約 1.5〜1.7 倍(葉 1 枚 = ellipse 3 回)", !fl1.err && fl1.n.ellipse > fl0.n.ellipse * 1.4 && fl1.n.ellipse < fl0.n.ellipse * 1.75, `ellipse ${fl0.n.ellipse}→${fl1.n.ellipse}(${(fl1.n.ellipse / fl0.n.ellipse).toFixed(2)} 倍)`);
  ag.setAgingState({ ...ALL(0) }); const sw0 = count(() => scene.drawSword(sword, 1));
  ag.setAgingState({ clog: 1, algaeHard: 1 }); const sw1 = count(() => scene.drawSword(sword, 1));
  check("A3:アマゾンソードは clog と algaeHard で例外なく描け、縁の点(arc)が出る(0 のときは arc なし)", !sw1.err && sw0.n.arc === 0 && sw1.n.arc > 0, `arc ${sw0.n.arc}→${sw1.n.arc}`);
  ag.setAgingState({ ...ALL(1), growth: 1 });
  const allErr = count(() => { scene.plants.back.forEach(p => p.type === "ribbon" ? scene.drawRibbon(p, 2) : scene.drawStem(p, 2)); scene.plants.mid.forEach(p => p.type === "sword" ? scene.drawSword(p, 2) : null); scene.drawFloats(2); }).err;
  check("A3:全状態 1 で全水草(後景・中景・浮草)が例外なく描ける", !allErr, allErr ? String(allErr) : "");
  // resize(全画面の代替表示の切り替え)でテクスチャを作り直しても、全状態 1 で描ける
  A.setPseudo(true); frames(10); A.setPseudo(false); frames(10);
  const afterResize = count(() => { scene.drawAgingGlass(); scene.drawAgingHard(); });
  check("A3:resize の後も全状態 1 で描ける", !afterResize.err && afterResize.n.drawImage === 6, `drawImage ${afterResize.n.drawImage}`);
  ag.restoreAging(null, Date.now()); ag.setAgingState({ dirt: savedAging.dirt, algaeHard: savedAging.algaeHard, clog: savedAging.clog, growth: savedAging.growth });
}

/* ---------------- 時間経過の dt(実経過秒) ---------------- */
{
  const step = ms => { now += ms; const q = rafQ; rafQ = []; q.forEach(f => f(now)); };
  ag.restoreAging(null, Date.now()); ag.setAgingOn(true); frames(2);
  const s0 = ag.sinceClean;
  for (let i = 0; i < 50; i++) step(200);
  const s1 = ag.sinceClean;
  step(30000);
  const s2 = ag.sinceClean;
  check("時間経過の dt:フレーム間隔 0.2 秒で 10 秒ぶん回すと 10 秒ぶん進む", Math.abs(s1 - s0 - 10) < 1e-6, `${(s1 - s0).toFixed(3)} 秒`);
  check("時間経過の dt:間隔 30 秒の 1 回は 1 秒ぶんしか進まない(非表示の間を数えない)", Math.abs(s2 - s1 - 1) < 1e-6, `${(s2 - s1).toFixed(3)} 秒`);
  ag.restoreAging(null, Date.now());
}

{
  // なめた跡(N4)と、性能による切り替え(governor.js)
  const gov = await imp("governor.js"), crw = await imp("crawlers.js");
  const save0 = Object.fromEntries(A.ORDER.map(k => [k, A.counts[k]]));
  for (const k of ["oto", "shrimp", "snail"]) A.counts[k] = A.SPECIES[k].def;
  A.syncFish(); frames(5);
  const place = () => { // 貝・オトを前面ガラスに、エビを岩の上でつまんでいる状態に置く(位置は固定)
    A.fishes.forEach(f => {
      if (!f.cr) return;
      if (f.sp === "snail" || f.sp === "oto") { Object.assign(f.cr, { surf: "gF", fx: 0.3 + Math.random() * 0.4, fy: 0.4 + Math.random() * 0.2, fph: null, fade: 1, st: f.sp === "oto" ? "stick" : "rest", t: 1e6, gz: 1, gt: 1e6 }); }
      if (f.sp === "shrimp") Object.assign(f.cr, { surf: "rock", id: 0, s: 0.5, st: "pick", t: 1e6, fph: null });
    });
  };
  const TS = scene.trailState;
  gov.govReset(); ag.setAgingOn(true);
  ag.setAgingState({ dirt: 0.3, algaeGlass: 1, algaeHard: 1 }); // ?aging=algaeGlass:1,algaeHard:1 相当
  place(); frames(60 * 3);
  let st = TS(), err = null;
  try { ["back", "low", "front", "glass"].forEach(l => crw.drawCrawlers(l)); scene.drawAgingGlass(); scene.drawAgingHard(); } catch (e) { err = e; }
  check("なめた跡:?aging=algaeGlass:1,algaeHard:1 相当+前面ガラスの貝・オト・岩の上のエビで、書き足しと描画が例外なし(跡あり版が作られる)",
    !err && st.stamps > 0 && st.glass && st.hard && st.cached && st.rebuilds > 0, err ? String(err) : `書き足し ${st.stamps} 回 / 作り直し ${st.rebuilds} 回`);
  check("なめた跡:マスクの大きさは水槽の 1/4(切り上げ)", st.mw === Math.ceil(core.W / scene.TRAIL.ms) && st.mh === Math.ceil(core.H / scene.TRAIL.ms), `${st.mw}x${st.mh}(水槽 ${core.W}x${core.H})`);
  check("なめた跡:苔の量(algaeGlass・algaeHard)は跡によって変わらない", ag.algaeGlass === 1 && ag.algaeHard === 1 && ag.dirt >= 0.3);
  // 戻り:時間経過オンで世代が進み、オフでは進まない
  const tot0 = scene.trailProgress(); frames(60 * 5); const totOn = scene.trailProgress() - tot0;
  ag.setAgingOn(false); const tot1 = scene.trailProgress(); frames(60 * 5); const totOff = scene.trailProgress() - tot1; ag.setAgingOn(true);
  check("なめた跡:時間経過オンの間だけ苔の増える速さで戻る(オフの間は進まない)", totOn > 0 && totOff === 0, `5 秒で世代 +${totOn.toExponential(2)}(オン)/ +${totOff}(オフ)`);
  // 全世代が過ぎれば跡は消え、元のテクスチャに戻る(life を極端に短くして確認。なめるのをやめさせる)
  const life0 = scene.TRAIL.life; scene.TRAIL.life = 4e-5;
  A.fishes.forEach(f => { if (f.cr && (f.sp === "snail" || f.sp === "oto")) Object.assign(f.cr, { surf: "sand", st: "rest", t: 1e6, fph: null }); if (f.cr && f.sp === "shrimp") Object.assign(f.cr, { surf: "sand", st: "rest", t: 1e6 }); });
  frames(60 * 12); st = TS(); scene.TRAIL.life = life0;
  check("なめた跡:なめるのをやめて全世代が過ぎると跡が消え、作り置きも捨てられる", !st.glass && !st.hard && !st.cached, JSON.stringify(st));
  // 清掃で消える
  place(); frames(60 * 2); const before = TS();
  ag.setAgingState({ lastClean: 0, algaeGlass: 1 }); ag.checkMaintenance(Date.now()); frames(2); st = TS();
  check("なめた跡:清掃(メンテ)で跡が全部消える(ガラスの苔が 0 になるので新しい跡も付かない)", before.glass && !st.glass && ag.algaeGlass === 0, `前 ${before.glass} → 後 ${st.glass}`);
  // resize で消え、マスクが新しい大きさで作り直される
  ag.setAgingState({ algaeGlass: 1, algaeHard: 1 }); place(); frames(60 * 2);
  const b2 = TS(); A.setPseudo(true); frames(2); place(); frames(60 * 2); const r1 = TS(); A.setPseudo(false); frames(2);
  check("なめた跡:resize でマスクが捨てられて作り直され(世代番号が変わる)、大きさが水槽に追従する", b2.glass && r1.id > b2.id && r1.mw === Math.ceil(core.W / scene.TRAIL.ms) && r1.mh === Math.ceil(core.H / scene.TRAIL.ms), `番号 ${b2.id}→${r1.id} / ${b2.mw}x${b2.mh} → ${r1.mw}x${r1.mh}(水槽 ${core.W}x${core.H})`);
  frames(60);

  // 軽量モード:ボタンの切り替えを繰り返して例外なし・aria が追従・保存される/オンのとき跡が出ず(強さ 0)、苔の数値は不変
  const mainM = await imp("main.js");
  const clickLite = () => (ids.litebtn.L.click || []).forEach(f => f({}));
  gov.govReset(); ag.setAgingOn(true); ag.setAgingState({ algaeGlass: 1, algaeHard: 1 }); place(); frames(60 * 3);
  const stOff = TS(), lvOff = mainM.trailLevel();
  let errL = null;
  try { for (let i = 0; i < 6; i++) { clickLite(); frames(3); } } catch (e) { errL = e; }   // 偶数回 → オフに戻る
  check("軽量モード:ボタンを 6 回押して例外なし・オフに戻り、aria-pressed / aria-label が追従する", !errL && core.liteOn === false && ids.litebtn.attrs["aria-pressed"] === "false" && ids.litebtn.attrs["aria-label"] === "軽量モード:オフ。押すとオンにします" && ids.litebtn.textContent === "軽量モード:オフ", errL ? String(errL) : "");
  clickLite();
  check("軽量モード:オンにすると aria が「オン」になり、保存データの lite が true", core.liteOn === true && ids.litebtn.attrs["aria-pressed"] === "true" && ids.litebtn.attrs["aria-label"] === "軽量モード:オン。押すとオフにします" && ids.litebtn.textContent === "軽量モード:オン" && JSON.parse(lsLast).lite === true);
  frames(2); place(); frames(60 * 3); const stOn = TS(), lvOn = mainM.trailLevel();
  check("軽量モード:オフでは跡が出て(強さ > 0)、オンでは跡が出ず(強さ 0・マスクと作り置きなし)", stOff.stamps > 0 && lvOff > 0 && lvOn === 0 && !stOn.glass && !stOn.hard && !stOn.cached && stOn.mw === 0, `オフ 強さ ${lvOff} 書き足し ${stOff.stamps} / オン 強さ ${lvOn} ${JSON.stringify(stOn)}`);
  check("軽量モード:オンの間も苔の量(algaeGlass・algaeHard)は変わらない", ag.algaeGlass === 1 && ag.algaeHard === 1, `glass ${ag.algaeGlass} / hard ${ag.algaeHard}`);
  clickLite(); frames(2); place(); frames(60 * 3);
  check("軽量モード:オフに戻すと跡がまた出る", core.liteOn === false && TS().stamps > 0 && mainM.trailLevel() > 0);
  frames(60);

  // 軽量モード(L2):作り置きの層。600 フレーム回して例外なし・各キャッシュが作られる・描き直しの回数が想定どおり
  ag.setAgingOn(false); ag.setAgingState({ algaeHard: 0.6, algaeGlass: 0.3 }); // 苔の量を固定(時間で変わらない)
  if (!core.liteOn) clickLite();
  scene.liteRelease(); let errC = null;
  try { frames(600); } catch (e) { errC = e; }
  const ls = scene.liteStats(), want = ["hard", "plantsBack", "plantsMid", "plantsFront"];
  check("軽量モード(L2):600 フレーム回して例外なし・作り置きが 4 層(流木岩/奥・中景・前景の水草)できる", !errC && want.every(k => ls[k]) && ls.hard.calls >= 590, errC ? String(errC.stack || errC) : JSON.stringify(ls));
  check("軽量モード(L2a):条件が変わらない間、流木・岩・こけの描き直しは初回の 1 回だけ", ls.hard.redraws === 1, `calls ${ls.hard.calls} / redraws ${ls.hard.redraws}`);
  const hr0 = ls.hard.redraws; ag.setAgingState({ algaeHard: 0.9 }); frames(3);
  const hr1 = scene.liteStats().hard.redraws; frames(3); const hr2 = scene.liteStats().hard.redraws;
  check("軽量モード(L2a):苔の量が変わると描き直し(1 回)、変わらなければまた 0 回", hr1 === hr0 + 1 && hr2 === hr1, `${hr0} → ${hr1} → ${hr2}`);
  check("軽量モード(L2b):水草の描き直しは層ごとにおよそ 1/3 のフレーム", ["plantsBack", "plantsMid", "plantsFront"].every(k => Math.abs(ls[k].redraws - ls[k].calls / 3) <= 1.5), ["plantsBack", "plantsMid", "plantsFront"].map(k => `${k} ${ls[k].redraws}/${ls[k].calls}`).join(" "));
  // 描き直すフレームが層ごとにずれる(3 層が同じフレームに重ならない)
  {
    const before = scene.liteStats(), seen = []; 
    for (let i = 0; i < 12; i++) { frames(1); const st = scene.liteStats(); seen.push(["plantsBack", "plantsMid", "plantsFront"].filter(k => st[k].redraws !== before[k].redraws).length); Object.assign(before, JSON.parse(JSON.stringify(st))); }
    check("軽量モード(L2b):1 フレームに描き直す層は最大 1 つ(負担を平らにする)", Math.max(...seen) <= 1 && seen.reduce((x, y) => x + y, 0) === 12, seen.join(""));
  }
  // 軽量モードと通常モードを行き来して例外なし。通常に戻ると作り置きは捨てられる
  let errT = null;
  try { for (let i = 0; i < 10; i++) { clickLite(); frames(7); } } catch (e) { errT = e; }
  check("軽量モード(L2):軽量・通常を 10 回行き来して例外なし", !errT && core.liteOn === true, errT ? String(errT.stack || errT) : "");
  clickLite(); frames(2);
  check("軽量モード(L2):通常モードに戻ると作り置きが捨てられる", core.liteOn === false && !scene.liteActive());
  clickLite(); frames(2);
  check("軽量モード(L2):もう一度オンにすると作り直される", scene.liteActive() && scene.liteStats().hard.redraws === 1);
  // 1 フレームあたりの描画命令(パスの fill+stroke)を通常と並べる(層ごと。参考値)
  {
    const KEYS = ["fill", "stroke", "drawImage"];
    const n = { fill: 0, stroke: 0, drawImage: 0 }, origCE = document.createElement, cx = core.ctx;
    const inst = g => { for (const k of KEYS) g[k] = () => { n[k]++; }; return g; };
    document.createElement = tag => { const e = origCE(tag); if (tag === "canvas") { const gc = e.getContext; e.getContext = (...a) => inst(gc.apply(e, a)); } return e; };
    const per = (fn, N = 30) => { scene.liteRelease(); fn(); for (const k of KEYS) n[k] = 0; for (let i = 0; i < N; i++) fn(); return { p: (n.fill + n.stroke) / N, d: n.drawImage / N }; };
    inst(cx);
    const T0 = 3, sc = scene, P = sc.plants;
    const fb = () => P.back.forEach(p => p.type === "ribbon" ? sc.drawRibbon(p, T0) : sc.drawStem(p, T0));
    const fm = () => P.mid.forEach(p => p.type === "fern" ? sc.drawFern(p, T0) : p.type === "lotus" ? sc.drawLotus(p, T0) : sc.drawSword(p, T0));
    const ff = () => P.front.forEach(p => { if (p.type === "tuft") p.blades.forEach(b => sc.drawRibbon(b, T0)); else sc.drawCarpet(p, T0); });
    ag.setAgingState({ algaeHard: 1 });
    const rows = {};
    rows["流木・岩・こけ・苔"] = [per(() => { sc.drawWood(); sc.rocks.forEach(sc.drawRock); sc.drawMoss(); sc.drawAgingHard(); }), per(() => sc.drawHardLite())];
    rows["奥の水草"] = [per(fb), per(() => sc.liteLayer("b", { every: 3 }, fb))];
    rows["中景の草"] = [per(fm), per(() => sc.liteLayer("m", { every: 3, phase: 1 }, fm))];
    rows["前景の草"] = [per(ff), per(() => sc.liteLayer("f", { every: 3, phase: 2 }, ff))];
    rows["泡"] = [per(() => sc.drawBubbles()), per(() => sc.drawBubblesLite())];
    document.createElement = origCE; for (const k of KEYS) delete cx[k]; scene.liteRelease();
    const ok = Object.values(rows).every(([a, b]) => b.p < a.p);
    check("軽量モード(L2):1 フレームのパス(fill+stroke)は、どの層でも通常より少ない(参考値)", ok, Object.entries(rows).map(([k, [a, b]]) => `${k} ${a.p.toFixed(1)}→${b.p.toFixed(1)}(drawImage ${a.d.toFixed(1)}→${b.d.toFixed(1)})`).join(" / "));
  }
  // 軽量モード(L2c):個体ごとのスプライト。外接の検査(描画の点・ひれ・尾・触角・揺れの余白込みがキャンバスに収まる)
  {
    const fr = await imp("fish-render.js");
    // 外接を数える記録用の ctx(変換行列を追い、パス・矩形・drawImage の四隅をスプライト内の画素座標で記録する)
    class RecPath {
      constructor() { this.pts = []; }
      moveTo(x, y) { this.pts.push([x, y]); } lineTo(x, y) { this.pts.push([x, y]); }
      quadraticCurveTo(a, b, x, y) { this.pts.push([a, b], [x, y]); } bezierCurveTo(a, b, c, d, x, y) { this.pts.push([a, b], [c, d], [x, y]); }
      arc(x, y, r) { this.pts.push([x - r, y - r], [x + r, y + r], [x - r, y + r], [x + r, y - r]); }
      ellipse(x, y, rx, ry) { const r = Math.max(rx, ry); this.pts.push([x - r, y - r], [x + r, y + r], [x - r, y + r], [x + r, y - r]); }
      rect(x, y, w, h) { this.pts.push([x, y], [x + w, y + h]); } closePath() {} addPath(p) { this.pts.push(...p.pts); }
    }
    const mkTracker = () => {
      let m = [1, 0, 0, 1, 0, 0]; const stack = [], st = { lineWidth: 1 };
      let cur = []; const ext = { x0: 1e9, x1: -1e9, y0: 1e9, y1: -1e9 };
      const mul = (a, b) => [a[0] * b[0] + a[2] * b[1], a[1] * b[0] + a[3] * b[1], a[0] * b[2] + a[2] * b[3], a[1] * b[2] + a[3] * b[3], a[0] * b[4] + a[2] * b[5] + a[4], a[1] * b[4] + a[3] * b[5] + a[5]];
      const tp = ([x, y]) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
      const rec = (pts, pad = 0) => { for (const q of pts) { const [x, y] = tp(q), sc = Math.hypot(m[0], m[1]); ext.x0 = Math.min(ext.x0, x - pad * sc); ext.x1 = Math.max(ext.x1, x + pad * sc); ext.y0 = Math.min(ext.y0, y - pad * sc); ext.y1 = Math.max(ext.y1, y + pad * sc); } };
      const o = {
        ext, resetExt() { ext.x0 = 1e9; ext.x1 = -1e9; ext.y0 = 1e9; ext.y1 = -1e9; },
        save() { stack.push([m.slice(), st.lineWidth]); }, restore() { const t = stack.pop(); if (t) { m = t[0]; st.lineWidth = t[1]; } },
        translate(x, y) { m = mul(m, [1, 0, 0, 1, x, y]); }, rotate(a) { const c = Math.cos(a), s2 = Math.sin(a); m = mul(m, [c, s2, -s2, c, 0, 0]); },
        scale(x, y) { m = mul(m, [x, 0, 0, y, 0, 0]); }, transform(a, b, c, d, e, f) { m = mul(m, [a, b, c, d, e, f]); },
        setTransform(a, b, c, d, e, f) { m = [a, b, c, d, e, f]; }, getTransform() { return { a: m[0], b: m[1], c: m[2], d: m[3], e: m[4], f: m[5] }; },
        beginPath() { cur = []; }, closePath() {},
        moveTo(x, y) { cur.push([x, y]); }, lineTo(x, y) { cur.push([x, y]); },
        quadraticCurveTo(a, b, x, y) { cur.push([a, b], [x, y]); }, bezierCurveTo(a, b, c, d, x, y) { cur.push([a, b], [c, d], [x, y]); },
        arc(x, y, r) { cur.push([x - r, y - r], [x + r, y + r], [x - r, y + r], [x + r, y - r]); }, ellipse(x, y, rx, ry) { const r = Math.max(rx, ry); cur.push([x - r, y - r], [x + r, y + r], [x - r, y + r], [x + r, y - r]); },
        rect(x, y, w, h) { cur.push([x, y], [x + w, y + h]); },
        fill(path) { rec(path && path.pts ? path.pts : cur); }, stroke(path) { rec(path && path.pts ? path.pts : cur, st.lineWidth / 2); }, clip() {},
        fillRect(x, y, w, h) { rec([[x, y], [x + w, y], [x, y + h], [x + w, y + h]]); },
        drawImage(img, ...a) { const [dx, dy, dw, dh] = a.length === 8 ? a.slice(4) : a.length === 4 ? a : [a[0], a[1], img.width, img.height]; rec([[dx, dy], [dx + dw, dy], [dx, dy + dh], [dx + dw, dy + dh]]); },
        clearRect() {}, createLinearGradient: () => ({ addColorStop() {} }), createRadialGradient: () => ({ addColorStop() {} }), createConicGradient: () => ({ addColorStop() {} }),
        createImageData: (w, h) => ({ width: w, height: h, data: new Uint8ClampedArray(4) }),
      };
      return new Proxy(o, { get(t, k) { if (k === "lineWidth") return st.lineWidth; return k in t ? t[k] : () => {}; }, set(t, k, v) { if (k === "lineWidth") st.lineWidth = v; else t[k] = v; return true; } });
    };
    const origCE = document.createElement, origP2D = globalThis.Path2D;
    document.createElement = tag => { const e = origCE(tag); if (tag === "canvas") { const tr = mkTracker(); e.getContext = () => tr; } return e; };
    globalThis.Path2D = RecPath;
    let errX = null;
    const fitFail = [], ratio = {};
    // 直近にスプライトへ描かれた範囲が、キャンバス(2Rd 四方)に収まるか。ratio:原点からの最大距離 / 基準の長さ
    const checkFit = (key, f, L) => {
      const si = fr.liteSpriteOf(f); if (!si) return; const e = si.g.ext, Rd = si.Rd;
      if (e.x1 < e.x0) return;
      const m = Math.max(-(e.x0 - Rd), e.x1 - Rd, -(e.y0 - Rd), e.y1 - Rd) / si.dpr;
      ratio[key] = Math.max(ratio[key] || 0, m / L);
      if (e.x0 < 0 || e.y0 < 0 || e.x1 > 2 * Rd || e.y1 > 2 * Rd) fitFail.push(`${key} (${e.x0.toFixed(1)},${e.y0.toFixed(1)})-(${e.x1.toFixed(1)},${e.y1.toFixed(1)}) / ${2 * Rd}`);
      si.g.resetExt();
    };
    try {
      fr.liteSpritesRelease();
      const nonSolo = A.ORDER.filter(k => !A.SPECIES[k].solo);
      const saveC = Object.fromEntries(A.ORDER.map(k => [k, A.counts[k]]));
      for (const k of A.ORDER) A.counts[k] = Math.max(1, Math.min(6, A.SPECIES[k].max)); A.syncFish(); frames(5);
      // 魚:種 × 向き・傾き・位相(尾の振り)・速さ・奥行き・体調
      for (const sp of nonSolo) {
       for (const f of A.fishes.filter(q => q.sp === sp)) {   // 個体ごと(色の変種・大きさの個体差を含める)
        const keep = { flip: f.flip, pitch: f.pitch, tilt: f.tilt, phase: f.phase, speedNow: f.speedNow, z: f.z, health: f.health, x: f.x, y: f.y };
        for (const flip of [1, -0.4]) for (const pt of [-0.8, 0.8]) for (const z of [0, 1]) for (let ph = 0; ph < 6.3; ph += 1.3) for (const spd of [0, 1e4]) for (const hp of [1, 0.2]) {
          Object.assign(f, { flip, pitch: pt, tilt: 0, phase: ph, speedNow: spd, z, health: hp, x: core.W * 0.5, y: core.H * 0.4 });
          const L = A.SPECIES[sp].len * core.U * f.scale * (0.72 + 0.38 * z);
          fr.liteSpritesRelease(); // 毎回作り直す(前の姿勢の大きめのキャンバスが残って検査が甘くならないように)
          for (let i = 0; i < 3; i++) fr.drawFishLite(f);
          checkFit(sp, f, L);
        }
        Object.assign(f, keep);
       }
      }
      // お掃除生体:種 × 向き・回転・波打ち・大きさ(奥のガラスは 0.8、前面は 1.1、貝の前面は 1.2 倍)
      for (const sp of ["oto", "shrimp", "snail"]) {
       for (const f of A.fishes.filter(q => q.sp === sp)) {
        const L0 = A.SPECIES[sp].len * core.U * f.scale;
        const keep = { phase: f.phase, pale: f.pale, hide: f.hide };
        for (const sx of [1, -1]) for (let rot = -Math.PI; rot <= Math.PI; rot += 0.7) for (const k of [0.8, 1, 1.1, 1.2]) for (const wag of [-0.5, 0, 0.5]) for (let ph = 0; ph < 6.3; ph += 1.6) for (const hide of [0, 1]) {
          f.phase = ph; f.hide = hide; f.pale = 0.5;
          fr.liteSpritesRelease();
          for (let i = 0; i < 3; i++) fr.drawCreatureLite(f, L0, L0 * k, wag, 400, 300, rot, sx, 1);
          checkFit(sp + "(横)", f, L0);
        }
        if (sp === "snail") {
          for (const sx of [1, -1]) for (const p of [0.05, 0.3, 0.5, 0.7, 0.95]) { fr.liteSpritesRelease(); for (let i = 0; i < 3; i++) fr.drawSnailTiltLite(f, L0, 400, 300, sx, p); checkFit("貝の縁", f, L0); }
          for (let rot = -Math.PI; rot <= Math.PI; rot += 0.5) { fr.liteSpritesRelease(); for (let i = 0; i < 3; i++) fr.drawSnailFrontLite(f, L0, L0 * 1.2, 400, 300, rot, 1); checkFit("貝の前面", f, L0); }
        }
        Object.assign(f, keep);
       }
      }
      for (const k of A.ORDER) A.counts[k] = saveC[k]; A.syncFish();
    } catch (e) { errX = e; }
    document.createElement = origCE; globalThis.Path2D = origP2D; fr.liteSpritesRelease();
    check("軽量モード(L2c):スプライトが個体の描画を切らない(魚 6 種・お掃除生体 3 種を、向き・回転・尾の振り・速さ・体調・大きさを変えて外接を検査)", !errX && fitFail.length === 0,
      errX ? String(errX.stack || errX) : (fitFail.length ? fitFail.slice(0, 6).join(" | ") + " || " : "") + "原点からの最大距離/基準の長さ:" + Object.entries(ratio).map(([k, v]) => `${k} ${v.toFixed(2)}`).join(" "));
  }

  // 軽量モード(L2c):600 フレーム(既定の数・全種最大数)で例外なし・個体ごとの描き直しがおよそ 1/3・増減/resize/行き来で例外なし・解放
  {
    const fr = await imp("fish-render.js");
    const saveC = Object.fromEntries(A.ORDER.map(k => [k, A.counts[k]]));
    const setAll = f => { for (const k of A.ORDER) A.counts[k] = f(k); A.syncFish(); };
    if (!core.liteOn) clickLite();
    const perFish = () => A.fishes.map(f => fr.liteSpriteOf(f)).filter(Boolean);
    const runCase = (label, f) => {
      setAll(f); fr.liteSpritesRelease(); let err = null;
      try { frames(600); } catch (e) { err = e; }
      const st = fr.liteSpriteStats(), per = perFish();
      const okCount = per.length === A.fishes.length;
      const okRatio = per.every(s => s.calls >= 590 && s.redraws >= s.calls / 3 - 1 && s.redraws <= s.calls / 3 + 12);
      // 描き直しの山が平らか:1 フレームあたりの描き直し数の最大が N/3 + 3 以下
      let mx = 0; for (let i = 0; i < 12; i++) { const b = fr.liteSpriteStats().redraws; frames(1); mx = Math.max(mx, fr.liteSpriteStats().redraws - b); }
      const okFlat = mx <= Math.ceil(A.fishes.length / 3) + 3;
      check(`軽量モード(L2c):${label}(${A.fishes.length} 匹)で 600 フレーム例外なし・全個体にスプライト・描き直しが約 1/3・1 フレームの描き直しは約 N/3`,
        !err && okCount && okRatio && okFlat && finite(),
        err ? String(err.stack || err) : `スプライト ${st.count} / 描き直し 平均 ${(per.reduce((a, s) => a + s.redraws, 0) / Math.max(1, per.length)).toFixed(0)}/${(per.reduce((a, s) => a + s.calls, 0) / Math.max(1, per.length)).toFixed(0)} / 1 フレーム最大 ${mx} / メモリ ${(st.bytes / 1048576).toFixed(1)}MB(DPR ${core.DPR})`);
    };
    runCase("既定の数", k => A.SPECIES[k].def);
    runCase("全種最大数", k => A.SPECIES[k].max);
    // 個体の増減:減らすと、いなくなった個体のスプライトが捨てられる
    setAll(k => Math.min(1, A.SPECIES[k].max)); frames(3);
    check("軽量モード(L2c):個体を減らすと、いなくなった個体のスプライトが捨てられる", fr.liteSpriteStats().count === A.fishes.length, `スプライト ${fr.liteSpriteStats().count} / 個体 ${A.fishes.length}`);
    setAll(k => A.SPECIES[k].max); frames(3);
    check("軽量モード(L2c):個体を増やすと、新しい個体にスプライトができる", fr.liteSpriteStats().count === A.fishes.length, `スプライト ${fr.liteSpriteStats().count} / 個体 ${A.fishes.length}`);
    // resize(全画面の切り替え)と、軽量・通常の行き来
    let errR = null;
    try { for (let i = 0; i < 3; i++) { A.setPseudo(true); frames(4); A.setPseudo(false); frames(4); } for (let i = 0; i < 6; i++) { clickLite(); frames(5); } } catch (e) { errR = e; }
    check("軽量モード(L2c):resize(全画面の出入り)と軽量・通常の行き来で例外なし", !errR && core.liteOn === true && finite(), errR ? String(errR.stack || errR) : "");
    clickLite(); frames(2);
    check("軽量モード(L2c):通常モードに戻るとスプライトがすべて捨てられる", core.liteOn === false && fr.liteSpriteStats().count === 0, `スプライト ${fr.liteSpriteStats().count}`);
    setAll(k => saveC[k]); frames(10);
    // 1 フレームあたりのパス(fill+stroke)を層ごとに通常と並べる(参考値)
    {
      const KEYS = ["fill", "stroke", "drawImage"], n = { fill: 0, stroke: 0, drawImage: 0 }, origCE = document.createElement, cx = core.ctx;
      const inst = g => { for (const k of KEYS) g[k] = () => { n[k]++; }; return g; };
      document.createElement = tag => { const e = origCE(tag); if (tag === "canvas") { const gc = e.getContext; e.getContext = (...a) => inst(gc.apply(e, a)); } return e; };
      inst(cx);
      const per = (fn, N = 30) => { fr.liteSpritesRelease(); fn(); for (const k of KEYS) n[k] = 0; for (let i = 0; i < N; i++) fn(); return { p: (n.fill + n.stroke) / N, d: n.drawImage / N }; };
      const sorted = A.fishes.filter(f => !A.SPECIES[f.sp].solo).sort((a, b) => a.z - b.z);
      const rows = {};
      core.setLite(false); const nm = { fb: per(() => sorted.forEach(f => { if (f.z < 0.45) fr.drawFish(f); })), ff: per(() => sorted.forEach(f => { if (f.z >= 0.45) fr.drawFish(f); })) };
      for (const l of ["back", "low", "front", "glass"]) nm[l] = per(() => crw.drawCrawlers(l));
      core.setLite(true); const lt = { fb: per(() => sorted.forEach(f => { if (f.z < 0.45) fr.drawFishLite(f); })), ff: per(() => sorted.forEach(f => { if (f.z >= 0.45) fr.drawFishLite(f); })) };
      for (const l of ["back", "low", "front", "glass"]) lt[l] = per(() => crw.drawCrawlers(l));
      core.setLite(false);
      document.createElement = origCE; for (const k of KEYS) delete cx[k]; fr.liteSpritesRelease();
      const names = { fb: "奥の魚", ff: "手前の魚", back: "這う生体(奥のガラス)", low: "這う生体(岩・砂・流木)", front: "這う生体(移動中)", glass: "這う生体(前面ガラス)" };
      const ok = Object.keys(names).every(k => lt[k].p <= nm[k].p);
      check("軽量モード(L2c):1 フレームのパス(fill+stroke)は、どの層でも通常以下(参考値)", ok, Object.entries(names).map(([k, nmx]) => `${nmx} ${nm[k].p.toFixed(0)}→${lt[k].p.toFixed(0)}(drawImage ${nm[k].d.toFixed(1)}→${lt[k].d.toFixed(1)})`).join(" / "));
    }
    if (!core.liteOn) clickLite(); // 以降の「オフへ戻す」の前の状態(オン)にそろえる
  }

  clickLite(); frames(2); // オフへ戻す(以降のテストは通常モード)
  ag.setAgingOn(true);
  frames(60);

  // 性能による切り替え:測定値を GOV.override で与える
  const modeSeq = (ms, n) => { gov.GOV.override = ms; const seq = []; for (let i = 0; i < n; i++) { frames(1); seq.push(gov.govState().mode); } return seq; };
  const firstIdx = (seq, m) => seq.indexOf(m);
  ag.setAgingState({ algaeGlass: 0.7, algaeHard: 0.4 }); ag.setAgingOn(false); // 苔の量が切り替えの前後で同じことを見るため、時間経過を止める
  place(); const g0 = ag.algaeGlass, h0 = ag.algaeHard;
  gov.govReset();
  const OVER = gov.GOV.thresholdMs + 1; // しきい値を確実に超える値
  const seq = modeSeq(OVER, 60 * 9);
  const iFade = firstIdx(seq, "fading"), iOff = firstIdx(seq, "off");
  check(`切り替え:最初の 3 秒はしきい値(${gov.GOV.thresholdMs}ms)超の ${OVER}ms を与えても判定しない(on のまま)`, iFade >= 60 * 3, `fading になったのは ${iFade} フレーム目(= ${(iFade / 60).toFixed(1)} 秒)`);
  check("切り替え:超え続けると、3 秒の平均が超えた時点で fading になり、約 1 秒で off になる", iFade > 0 && iOff > iFade && Math.abs((iOff - iFade) / 60 - gov.GOV.fadeSec) < 0.1, `fading ${(iFade / 60).toFixed(2)} 秒 → off ${(iOff / 60).toFixed(2)} 秒(差 ${((iOff - iFade) / 60).toFixed(2)} 秒)`);
  st = TS();
  check("切り替え:off になると跡の表現が消える(マスク・作り置きなし)", gov.govState().mode === "off" && st.mw === 0 && !st.glass && !st.hard && !st.cached && gov.trailStrength() === 0, JSON.stringify(st));
  check("切り替え:切り替えの前後で苔の量(algaeGlass・algaeHard)が同じ", ag.algaeGlass === g0 && ag.algaeHard === h0, `glass ${g0}→${ag.algaeGlass} / hard ${h0}→${ag.algaeHard}`);
  const seq2 = modeSeq(1.0, 60 * 6);
  check("切り替え:以後 1.0ms を与えても戻らない(そのセッションの間は off)", seq2.every(m => m === "off") && TS().mw === 0);
  // タブが hidden の間は判定しない。表示に戻った直後の 3 秒も判定しない
  gov.govReset(); document.visibilityState = "hidden";
  const seqH = modeSeq(OVER, 60 * 10);
  document.visibilityState = "visible"; (document.L.visibilitychange || []).forEach(f => f());
  const seqV = modeSeq(OVER, 60 * 9);
  const iV = firstIdx(seqV, "fading");
  check(`切り替え:hidden の間は判定しない(10 秒間 ${OVER}ms を与えても on)`, seqH.every(m => m === "on"));
  check("切り替え:表示に戻った直後の 3 秒は判定しない(その後の 3 秒平均で fading)", iV >= 60 * 3 && iV < 60 * 9, `fading は ${(iV / 60).toFixed(1)} 秒後`);
  gov.govReset(); gov.GOV.override = null; ag.setAgingOn(true);
  A.fishes.forEach(f => { if (f.cr) f.cr.t = 0; });
  for (const k of A.ORDER) A.counts[k] = save0[k];
  A.syncFish(); frames(30);
}

console.log(failed ? `\n${failed} 件失敗` : "\nすべて成功");
process.exit(failed ? 1 : 0);
