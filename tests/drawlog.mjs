// 描画ログの比較ハーネス(ブラウザ不要)
//
//   node tests/drawlog.mjs --record   現行版の描画命令列を基準ログとして保存する
//   node tests/drawlog.mjs            現状のログを取り、基準と比較する(一致なら exit 0、不一致なら exit 1)
//
// 構成(上から順に独立):
//   1. 読み込み部  loadApp()     … js/main.js(エントリ)を import する。フック(app オブジェクト)は、各モジュールの export から組み立てる
//   2. モック・記録部            … 決定的な環境(シード乱数・固定刻み・仮想タイマ)と、Canvas 描画命令の記録
//   3. 手順部      runScenario() … 固定手順。フック(app オブジェクト)経由でのみアプリに触る
//   4. 実行部                    … 記録・比較・差分表示
//
// 記録するフレーム:全フレームをシミュレーションするが、ログに書くのは各段階の下記フレームだけ(LOG_FRAMES)。
// 起動時(モジュール読み込み中:静的背景の生成とパネルアイコン描画を含む)は全命令を記録する。
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";
import { gzipSync, gunzipSync } from "node:zlib";
import { createHash } from "node:crypto";

// getHours などはローカル時刻を返すため、実行環境のタイムゾーンに描画ログが依存しないよう、TZ を固定する(24時間計の針が変わる)
process.env.TZ = "UTC";
const hostNow = Date.now.bind(Date); // 実時間(サンドボックス側で Date を固定する前に取っておく)
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const BASE_DIR = join(root, "tests", "baseline");
const BASE_GZ = join(BASE_DIR, "drawlog.log.gz");
const BASE_SUM = join(BASE_DIR, "drawlog.sha256");

/* ================= 1. 読み込み部 ================= */
// モック(グローバル)を置いた後に、通常の dynamic import でアプリを読み込む。
// load():エントリ js/main.js を import する(モジュールの評価=起動。ここで起動時の描画命令が出る)
// hooks():手順部が使うフック(app.*)。各モジュールの export から組み立てる。本番コードにテスト用の記述はない。
function loadApp() {
  const imp = name => import(pathToFileURL(join(root, "js", name)).href);
  return {
    load: () => imp("main.js"),
    hooks: async () => {
      const [core, sp, beh, pop, ui] = await Promise.all([imp("core.js"), imp("species.js"), imp("fish-behavior.js"), imp("popup.js"), imp("ui.js")]);
      return { counts: core.counts, ORDER: sp.ORDER, SPECIES: sp.SPECIES, syncFish: beh.syncFish, setNight: ui.setNight, setPseudo: ui.setPseudo,
        openPop: pop.openPop, closePop: pop.closePop, drawIcon: ui.drawIcon, startAct: pop.startAct, P: pop.P,
        setU: core.setU, getU: () => core.U, getNightT: () => core.nightT };
    },
  };
}

/* ================= 2. モック・記録部 ================= */
const FRAME_MS = 1000 / 60;
const SEED = 20240611;

function mulberry32(a) {
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function createEnv() {
  const lines = [];
  let rec = false;
  const log = s => { if (rec) lines.push(s); };
  let only = null; // 指定すると、その名前の canvas の命令だけを記録する(Path2D は対象外)
  const setRec = (v, onlyName = null) => { rec = v; only = onlyName; };
  const on = n => rec && (!only || only === n);

  /* 数値・値の直列化(丸めない) */
  const fnv = data => { let h = 0x811c9dc5; for (let i = 0; i < data.length; i++) { h ^= data[i]; h = Math.imul(h, 0x01000193) >>> 0; } return h.toString(16); };
  let pathSeq = 0;
  const canvasName = c => {
    if (!c.__name) {
      if (c.__id) c.__name = c.__id;
      else if (c.className === "ico") c.__name = `icon#${++canvasName.ico}`;
      else c.__name = `offscreen#${++canvasName.off}`;
    }
    return c.__name;
  };
  canvasName.ico = 0; canvasName.off = 0;
  function fmt(v) {
    if (typeof v === "number") return Object.is(v, -0) ? "-0" : String(v);
    if (typeof v === "string") return JSON.stringify(v);
    if (v === null || v === undefined || typeof v === "boolean") return String(v);
    if (typeof v === "function") return "function";
    if (v.__grad) return `grad:${v.kind}(${v.args.map(fmt).join(",")})[${v.stops.map(s => `${fmt(s[0])}:${fmt(s[1])}`).join(",")}]`;
    if (v.__path) { dumpPath(v); return `path#${v.id}`; }
    if (v.__isCanvas) return `canvas:${canvasName(v)}`;
    if (v.data && v.data.length !== undefined) return `ImageData(${v.width},${v.height},fnv=${fnv(v.data)})`;
    if (Array.isArray(v)) return `[${v.map(fmt).join(",")}]`;
    return `obj:${JSON.stringify(v)}`;
  }

  /* Path2D:構築命令を記録。記録が止まっている間に作られたパスは、初めて使われたときに定義を展開する */
  class Path2D {
    constructor() {
      this.__path = true; this.id = ++pathSeq; this.cmds = []; this.dumped = false; this.fullyLogged = rec;
      log(`path#${this.id} new`);
    }
    __rec(name, a) {
      const s = `${name}(${a.map(fmt).join(",")})`;
      this.cmds.push(s);
      if (rec) log(`path#${this.id} ${s}`);
      else this.fullyLogged = false;
    }
  }
  for (const k of ["moveTo", "lineTo", "bezierCurveTo", "quadraticCurveTo", "closePath", "arc", "arcTo", "ellipse", "rect", "roundRect", "addPath"]) {
    Path2D.prototype[k] = function (...a) { this.__rec(k, a); };
  }
  function dumpPath(p) {
    if (p.fullyLogged || p.dumped || !rec) return;
    p.dumped = true;
    log(`path#${p.id} definition-at-first-use [${p.cmds.join("; ")}]`);
  }

  /* Canvas 2D コンテキスト */
  function mkgrad(kind, args) { return { __grad: true, kind, args, stops: [], addColorStop(o, c) { this.stops.push([o, c]); } }; }
  function mkctx(canvas) {
    const state = {}, methods = {};
    const name = () => canvasName(canvas);
    return new Proxy(state, {
      get(o, k) {
        if (typeof k === "symbol") return o[k];
        if (k in o) return o[k];
        if (k === "createLinearGradient" || k === "createRadialGradient" || k === "createConicGradient") {
          const kind = k === "createLinearGradient" ? "linear" : k === "createRadialGradient" ? "radial" : "conic";
          return (...a) => mkgrad(kind, a);
        }
        if (k === "createImageData") return (w, h) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) });
        return methods[k] ??= (...a) => { if (on(name())) lines.push(`${name()} ${k}(${a.map(fmt).join(",")})`); };
      },
      set(o, k, v) { if (on(name())) lines.push(`${name()} ${k} = ${fmt(v)}`); o[k] = v; return true; },
    });
  }

  /* DOM モック(smoke.mjs と同等) */
  const noop = () => {};
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
  function mkcanvas(id) {
    const c = mkel({ clientHeight: 0 });
    c.__isCanvas = true; c.__id = id || "";
    let w = 0, h = 0, ctx2d = null;
    Object.defineProperty(c, "width", { get: () => w, set: v => { w = v; if (rec) lines.push(`canvas:${canvasName(c)} width = ${fmt(v)}`); }, enumerable: true });
    Object.defineProperty(c, "height", { get: () => h, set: v => { h = v; if (rec) lines.push(`canvas:${canvasName(c)} height = ${fmt(v)}`); }, enumerable: true });
    c.getContext = () => (ctx2d ??= mkctx(c));
    c.parentElement = mkel();
    return c;
  }

  /* 決定的な環境:仮想時計・仮想タイマ・rAF */
  let now = 0, rafQ = [], timers = [], timerSeq = 0;
  const win = { devicePixelRatio: 2, listeners: {}, addEventListener(t, f) { (this.listeners[t] ??= []).push(f); } };
  const ids = {};
  // モックはグローバルに置く(モジュールは素の名前 document / window などで参照する)。sandbox はグローバルそのもの。
  const sandbox = globalThis;
  const install = o => { for (const [k, v] of Object.entries(o)) Object.defineProperty(globalThis, k, { value: v, writable: true, configurable: true, enumerable: true }); };
  install({
    Path2D,
    document: {
      getElementById: id => (ids[id] ??= (id === "tank" || id === "popcv") ? mkcanvas(id) : mkel()),
      createElement: t => {
        if (t === "canvas") return mkcanvas();
        const d = mkel();
        Object.defineProperty(d, "innerHTML", { set() { d.children = [mkel(), mkel(), mkel()]; }, get() { return ""; } });
        return d;
      },
      querySelectorAll: () => [], addEventListener: noop, documentElement: mkel(), fullscreenElement: null,
    },
    window: win,
    localStorage: { getItem: () => null, setItem: noop },
    performance: { now: () => now },
    requestAnimationFrame: f => { rafQ.push(f); return rafQ.length; },
    setTimeout: (f, ms) => { const id = ++timerSeq; timers.push({ id, t: now + (ms || 0), f }); return id; },
    clearTimeout: id => { timers = timers.filter(x => x.id !== id); },
    innerWidth: 1280, innerHeight: 800,
  });
  // Math.random をシード付きにする(このプロセスでアプリ以外は Math.random を使わない)
  Math.random = mulberry32(SEED);
  // Date は 24時間計(new Date().getHours())が使う。時刻依存を防ぐため固定する
  const FIXED_T = Date.UTC(2024, 0, 1, 6, 30); // 6:30(UTC)。時計の針が分も含めて動く時刻
  install({ Date: class extends Date { constructor(...a) { super(...(a.length ? a : [FIXED_T])); } static now() { return FIXED_T; } } });
  // tank の CSS 幅・高さは innerWidth/innerHeight から決める(resize の手順で効くように)
  const tank = mkcanvas("tank"); ids.tank = tank;
  Object.defineProperty(tank, "clientWidth", { get: () => Math.round(sandbox.innerWidth * 0.7), enumerable: true });
  Object.defineProperty(tank, "clientHeight", { get: () => sandbox.innerHeight, enumerable: true });

  /* 1 フレーム進める:仮想時刻を進め、期限の来たタイマ → rAF コールバックの順に実行 */
  function tick() {
    now += FRAME_MS;
    const due = timers.filter(x => x.t <= now).sort((a, b) => a.t - b.t || a.id - b.id);
    timers = timers.filter(x => x.t > now);
    due.forEach(x => x.f());
    const q = rafQ; rafQ = []; q.forEach(f => f(now));
  }
  return { sandbox, lines, log, setRec, tick, getNow: () => now, win, mkel };
}

/* ================= 3. 手順部 ================= */
// 各段階で「ログに書くフレーム」(段階内の 1 始まりの番号)。全フレームはシミュレーションする。
// 描画は 2 フレームおきに変わる処理(コースティクス)があるので、偶数・奇数の両方を含める。
const LOG_FRAMES = {
  "1-boot":         { total: 180, log: [2, 3, 4, 90, 180] },
  "2-night-in":     { total: 100, log: [1, 2, 50, 100] },
  "2-night-out":    { total: 100, log: [1, 2, 50, 100] },
  "3-max-counts":   { total: 120, log: [1, 2, 60, 120] },
  "4-resize":       { total: 10,  log: [1, 7, 8, 9, 10] },     // 120ms のタイマで resize が走るのは 8 フレーム目
  "5-pseudo-fs-on": { total: 10,  log: [1, 2, 3, 4, 10] },     // resize は rAF 2 段後(3 フレーム目)
  "5-pseudo-fs-off":{ total: 10,  log: [1, 2, 3, 4, 10] },
  "6-popup":        { total: 30,  log: [1, 2, 3, 15, 30] },    // 種ごと
};

const ACTS = ["turn", "food", "bubble", "wiggle", "spin", "startle", "peek", "dash", "showoff", "bow", "wink", "nibble"]; // smoke.mjs と同じ
const ACT_LOG_FRAMES = [1, 2, 20, 40]; // 開始直後と中盤(仕草の開始からの番号)
const ACT_MAX_FRAMES = 600;

function runScenario(env, app) {
  const { lines, log, setRec, tick } = env;
  const stageLines = []; // { name, start, end, frames }
  let cur = null;
  const stage = name => {
    if (cur) cur.end = lines.length;
    cur = { name, start: lines.length, end: 0, frames: [] };
    stageLines.push(cur);
    lines.push(`===== STAGE ${name} =====`);
  };
  const run = (key, label = key) => {
    const { total, log: lf } = LOG_FRAMES[key];
    const set = new Set(lf);
    for (let i = 1; i <= total; i++) {
      setRec(set.has(i));
      log(`--- frame ${i}/${total} t=${env.getNow().toFixed(6)} ---`);
      if (set.has(i)) cur.frames.push(`${i}`);
      tick();
    }
    setRec(false);
  };
  const A = app;

  // 起動(読み込み時の記録は呼び出し側で "0-load" 段階として済んでいる)
  stage("1-boot"); run("1-boot");

  // 夜 → 遷移完了 → 昼
  stage("2-night-in"); setRec(true); log("setNight(true)"); A.setNight(true); setRec(false); run("2-night-in");
  if (A.getNightT() !== 1) throw new Error("夜への遷移が完了していません");
  stage("2-night-out"); setRec(true); log("setNight(false)"); A.setNight(false); setRec(false); run("2-night-out");
  if (A.getNightT() !== 0) throw new Error("昼への遷移が完了していません");

  // 全種を最大数
  stage("3-max-counts");
  A.ORDER.forEach(sp => { A.counts[sp] = A.SPECIES[sp].max; });
  A.syncFish();
  run("3-max-counts");

  // resize
  stage("4-resize");
  env.sandbox.innerWidth = 1000; env.sandbox.innerHeight = 700;
  (env.win.listeners.resize || []).forEach(f => f());
  run("4-resize");

  // 全画面の代替表示 ON → OFF
  stage("5-pseudo-fs-on"); A.setPseudo(true); run("5-pseudo-fs-on");
  stage("5-pseudo-fs-off"); A.setPseudo(false); run("5-pseudo-fs-off");

  // 全種のポップアップ
  const anchor = env.mkel();
  for (const sp of A.ORDER) {
    stage(`6-popup-${sp}`);
    A.openPop(sp, anchor);
    run("6-popup");
    A.closePop(0);
    env.tick(); // 閉じるタイマを消化(記録なし)
  }

  // パネルのアイコン描画(起動時にも描かれている。ここで改めて全種を記録する)
  stage("7-icons"); cur.frames.push("all"); setRec(true);
  for (const sp of A.ORDER) {
    const g = env.sandbox.document.createElement("canvas");
    g.className = "ico"; g.width = 112; g.height = 60;
    const gctx = g.getContext("2d");
    const f = { phase: 0.6, pale: 0, spots: [[0.5, 0.2, 1], [0.7, -0.2, 1], [0.8, 0.1, 1]], variant: 0, ox: 0 };
    const prevU = A.getU(); A.setU(0.9);
    const L = { neon: 46, rummy: 46, guppy: 32, platy: 44, angel: 25, cory: 46 }[sp];
    log(`drawIcon(${sp}, L=${L})`);
    A.drawIcon(gctx, sp, L, f);
    A.setU(prevU);
  }
  setRec(false);

  // ポップアップの仕草(ウインク・視線 EYE・餌・泡など。仕草を実行したときだけ通る描画を確認する)
  // neon で、ACTS 12 種それぞれについて startAct → 仕草が終わるまで(最大 ACT_MAX_FRAMES)回す。
  // 記録するのは各仕草の ACT_LOG_FRAMES 番目のフレームで、popcv の命令だけ(tank は段階 6 までで記録済み)。
  stage("8-popup-acts");
  A.openPop("neon", anchor);
  for (const act of ACTS) {
    A.startAct(act);
    let n = 0, ended = false;
    while (n < ACT_MAX_FRAMES && !ended) {
      n++;
      const logged = ACT_LOG_FRAMES.includes(n);
      setRec(logged, "popcv");
      if (logged) { lines.push(`--- act ${act} frame ${n} t=${env.getNow().toFixed(6)} ---`); cur.frames.push(`${act}:${n}`); }
      tick();
      setRec(false);
      if (!A.P.act) ended = true;
    }
    lines.push(`--- act ${act} ended=${ended} frames=${n} ---`);
  }
  A.closePop(0);
  env.tick();
  cur.end = lines.length;
  return stageLines;
}

async function generate() {
  const env = createEnv();
  const appLoader = loadApp();
  // 起動(読み込み)中は全命令を記録する
  env.lines.push("===== STAGE 0-load =====");
  env.setRec(true);
  await appLoader.load();
  env.setRec(false);
  const loadEnd = env.lines.length;
  const app = await appLoader.hooks();
  const stages = [{ name: "0-load", start: 0, end: loadEnd, frames: ["all"] }, ...runScenario(env, app)];
  return { lines: env.lines, stages };
}

/* ================= 4. 実行部 ================= */
function stageOf(stages, idx) {
  let s = stages[0];
  for (const st of stages) if (st.start <= idx) s = st;
  return s;
}
function show(lines, from, to, mark) {
  const out = [];
  for (let i = Math.max(0, from); i < Math.min(lines.length, to); i++) {
    out.push(`${i === mark ? ">>" : "  "} ${String(i + 1).padStart(8)}: ${lines[i].length > 240 ? lines[i].slice(0, 240) + "…" : lines[i]}`);
  }
  return out.join("\n");
}
const sha = text => createHash("sha256").update(text).digest("hex");

const t0 = hostNow();
const record = process.argv.includes("--record");
const { lines, stages } = await generate();
const text = lines.join("\n") + "\n";
const hash = sha(text);
console.log(`ログ生成: ${lines.length} 行, ${(text.length / 1e6).toFixed(1)} MB(非圧縮), sha256 ${hash.slice(0, 16)}…  (${((hostNow() - t0) / 1000).toFixed(1)} 秒)`);
console.log("段階ごとの行数(記録したフレーム番号):");
for (const s of stages) console.log(`  ${s.name.padEnd(18)} ${String(s.end - s.start).padStart(9)} 行  [${s.frames.join(", ")}]`);

if (record) {
  mkdirSync(BASE_DIR, { recursive: true });
  const gz = gzipSync(text, { level: 9 });
  writeFileSync(BASE_GZ, gz);
  writeFileSync(BASE_SUM, `${hash}  ${lines.length} lines  ${text.length} bytes(uncompressed)  gz ${gz.length} bytes\n`);
  console.log(`基準ログを保存: ${BASE_GZ} (${(gz.length / 1e6).toFixed(2)} MB gz)`);
  console.log(`ハッシュを保存: ${BASE_SUM}`);
  if (gz.length > 10 * 1e6) console.log("注意: 10MB を超えています。.gitignore に追加し、ハッシュのみをリポジトリに残してください。");
  process.exit(0);
}

if (!existsSync(BASE_SUM) && !existsSync(BASE_GZ)) { console.error("基準ログがありません。先に --record を実行してください。"); process.exit(2); }
const baseHash = existsSync(BASE_SUM) ? readFileSync(BASE_SUM, "utf8").split(/\s+/)[0] : null;
if (baseHash === hash) { console.log("✓ 基準ログと一致"); process.exit(0); }

console.log("✗ 基準ログと不一致");
if (!existsSync(BASE_GZ)) {
  console.log(`基準ログ本体(${BASE_GZ})がないため、食い違い位置は特定できません(ハッシュのみ比較)。`);
  console.log(`基準 ${baseHash}\n現状 ${hash}`);
  process.exit(1);
}
const baseLines = gunzipSync(readFileSync(BASE_GZ)).toString("utf8").split("\n");
if (baseLines[baseLines.length - 1] === "") baseLines.pop();
let i = 0;
const n = Math.min(baseLines.length, lines.length);
while (i < n && baseLines[i] === lines[i]) i++;
const st = stageOf(stages, i);
console.log(`最初の食い違い: 行 ${i + 1}  段階 ${st.name}(段階内 ${i - st.start + 1} 行目)`);
if (i >= n) console.log(`(片方が先に終わっています:基準 ${baseLines.length} 行 / 現状 ${lines.length} 行)`);
let fr = ""; for (let j = i; j >= st.start; j--) if (lines[j] && lines[j].startsWith("--- frame")) { fr = lines[j]; break; }
if (fr) console.log(`直前のフレーム見出し: ${fr}`);
console.log("--- 基準 ---\n" + show(baseLines, i - 5, i + 6, i));
console.log("--- 現状 ---\n" + show(lines, i - 5, i + 6, i));
process.exit(1);
