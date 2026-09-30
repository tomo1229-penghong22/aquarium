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
      if (k === "createLinearGradient" || k === "createRadialGradient") return () => grad;
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
    classList: classList(), appendChild(c) { this.children.push(c); }, addEventListener: noop, setAttribute: noop,
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
    querySelectorAll: () => [], addEventListener: noop, documentElement: mkel(), fullscreenElement: null,
  },
  window: { devicePixelRatio: 2, addEventListener: noop },
  localStorage: { getItem: () => null, setItem: noop },
  performance: { now: () => 0 },
  requestAnimationFrame: f => { rafQ.push(f); return rafQ.length; },
  setTimeout: f => { f(); return 0; }, clearTimeout: noop,
  innerWidth: 1280, innerHeight: 800,
};
// モックをグローバルに置いてから、エントリ(js/main.js)を読み込む。読み込み=起動。
for (const [k, v] of Object.entries(sandbox)) Object.defineProperty(globalThis, k, { value: v, writable: true, configurable: true, enumerable: true });
const imp = name => import(pathToFileURL(join(root, "js", name)).href);
await imp("main.js");
const [core, sp, beh, pop, ui] = await Promise.all([imp("core.js"), imp("species.js"), imp("fish-behavior.js"), imp("popup.js"), imp("ui.js")]);
const scene = await imp("scene.js");
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

console.log(failed ? `\n${failed} 件失敗` : "\nすべて成功");
process.exit(failed ? 1 : 0);
