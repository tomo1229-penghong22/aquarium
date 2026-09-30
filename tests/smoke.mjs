// 水槽ページのスモークテスト(ブラウザ不要)
// index.html の <script> を取り出し、Canvas と DOM を最小限モックして Node の vm 上で実行します。
// 目的:実行時エラー・NaN・行動の詰まり・体調モデルの退行を早期に見つけること。
// 見た目の確認はブラウザで行ってください(docs/ARCHITECTURE.md「確認手順」)。
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import vm from "node:vm";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const html = readFileSync(join(root, "index.html"), "utf8");
const m = html.match(/<script>([\s\S]*?)<\/script>/);
if (!m) throw new Error("<script> が見つかりません");
const MARK = "/* ---------------- 開始 ---------------- */";
if (!m[1].includes(MARK)) throw new Error(`開始マーカー「${MARK}」が見つかりません`);
// テスト用フック:開始マーカーの直前で内部状態を globalThis.__aq に公開する
const js = m[1].replace(MARK, `globalThis.__aq = { fishes, P, SPECIES, ORDER, counts, syncFish, popReset, updatePop, drawPop, startAct, setPseudo,
  setT: v => { Tset = v; }, getT: () => Tw, setTimeScale: v => { timeScale = v; }, setNight: v => { nightOn = v; }, getNightT: () => nightT };\n${MARK}`);

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
function mkcanvas() {
  const c = mkel({ width: 0, height: 0, clientWidth: 900, clientHeight: 0, getContext: () => mkctx() });
  c.parentElement = mkel();
  return c;
}
const ids = {};
let rafQ = [];
const sandbox = {
  console, Math, JSON, Date, Set, Map, Proxy, Uint8ClampedArray, Number, String, Array, Object, Error, parseFloat, parseInt, isFinite,
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
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext(js, sandbox, { filename: "index.html<script>" });
const A = sandbox.__aq;

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

console.log(failed ? `\n${failed} 件失敗` : "\nすべて成功");
process.exit(failed ? 1 : 0);
