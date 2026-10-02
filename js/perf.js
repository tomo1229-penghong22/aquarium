// 性能計測(?perf を付けて開いたときだけ有効)。描画・乱数・DOM には、有効時のオーバーレイ以外は触れない。
// 使い方は README の「性能計測」を参照。無効時は PERF が false で、呼び出し側の if (PERF) が全て素通りする。
// ?perf&skip=a,b,... :層の描画を飛ばす(計測専用)。?perf&bench :条件を自動で切り替えて計測し、表にする。
import { govState, GOV } from "./governor.js";

/* 層の名前(main.js の perfMark の名前と同じ)と、特別な名前 */
export const LAYERS = ["static", "rays", "backPlants", "haze", "bubbles", "backFish", "midground", "frontFish", "frontPlants", "floats", "motes", "caustics", "surface", "agingGlass", "grade", "led", "thermometer", "clock", "o2meter", "glass"];
export const SPECIAL = ["dpr1", "shadow", "trails", "gradeDay", "gradeNight"]; // dpr1:DPR の上限 1 / shadow:shadowBlur なし / trails:なめた跡なし / gradeDay・gradeNight:色調補正の昼・夜の側だけ飛ばす
/* URL の検索文字列を解析する(純粋関数。node でも確かめられる)。skip の未知の名前は unknown に集める */
export function parsePerfParams(search){
  const s = search || "";
  const perf = /[?&]perf(=|&|$)/.test(s);
  const bench = perf && /[?&]bench(=|&|$)/.test(s);
  const m = /[?&]skip=([^&]*)/.exec(s);
  let raw = m ? m[1] : "";
  try { raw = decodeURIComponent(raw); } catch (e) {}
  const skip = [], unknown = [];
  for (const n of raw.split(",").map(x => x.trim()).filter(Boolean)) {
    if (LAYERS.includes(n) || SPECIAL.includes(n)) { if (!skip.includes(n)) skip.push(n); }
    else if (!unknown.includes(n)) unknown.push(n);
  }
  return { perf, bench, skip: perf ? skip : [], unknown: perf ? unknown : [] };
}
const PARAMS = parsePerfParams(typeof location !== "undefined" ? location.search : "");
export const PERF = PARAMS.perf;
const URL_SKIP = PARAMS.skip;
const SKIP = new Set(URL_SKIP);                      // ?perf のときだけ中身が入る。空なら何も飛ばさない
export const skipOn = name => SKIP.size !== 0 && SKIP.has(name);
export const dprCap = () => skipOn("dpr1") ? 1 : 2;  // resize の DPR の上限(通常は 2 = 従来どおり)
function setSkip(names){ SKIP.clear(); names.forEach(n => SKIP.add(n)); }
if (PERF && PARAMS.unknown.length) console.warn("[perf] 未知の skip 名:" + PARAMS.unknown.join(","));

const N = 120;
const rings = {};   // 名前 → 直近 N 件の ms
const pos = {};
let t0 = 0, tm = 0, lastFrame = 0, lastShow = 0, el = null;
let info = { fishes: 0 };

function push(k, v){
  const r = rings[k] || (rings[k] = []);
  const i = pos[k] || 0;
  r[i % N] = v; pos[k] = i + 1;
}
export function stat(r){                 // avg・中央値・p95
  const a = r.slice().sort((x, y) => x - y);
  const n = a.length;
  return { avg: a.reduce((s, x) => s + x, 0) / n, med: n % 2 ? a[(n - 1) / 2] : (a[n / 2 - 1] + a[n / 2]) / 2, p95: a[Math.min(n - 1, Math.floor(n * 0.95))] };
}

const STALL_MS = 500;   // これを超えるフレーム間隔は「停止」と見なす
export function perfFrame(now){          // loop の先頭で。rAF の間隔を記録
  if (lastFrame && now - lastFrame <= STALL_MS) push("frame", now - lastFrame); // 停止(背面のタブなど)の長い間隔は統計に入れない
  if (B) benchFrame(now);
  lastFrame = now;
}
export function perfBegin(){ t0 = tm = performance.now(); }             // 区間の開始
export function perfMark(name){                                          // 前回の印からの時間を name に加算
  const t = performance.now(); push(name, t - tm); tm = t;
}
export function perfEnd(name){                                           // 開始からの合計を name に記録
  const v = performance.now() - t0; push(name, v);
  if (B && B.phase === "meas" && (name === "logic" || name === "draw")) { B.js += v; if (name === "draw") B.jsN++; }
}

/* ---------------- ?perf&bench:条件を自動で切り替えて計測 ---------------- */
const BENCH = { initMs: 3000, warmMs: 1500, measMs: 10000 };
let B = null;   // 実行中の状態。bench でなければ null
export const benchOn = () => !!B && B.phase !== "done"; // 実行中は main が照明の自動切り替えを止める
/* 条件の一覧(昼・夜の順に、基準 → 各層 1 つずつ → 特別な名前 → static 以外すべて) */
export function benchConditions(){
  const out = [];
  for (const night of [false, true]) {
    out.push({ name: "base", night, skip: [] });
    for (const n of LAYERS) out.push({ name: n, night, skip: [n] });
    for (const n of SPECIAL) out.push({ name: n, night, skip: [n] });
    out.push({ name: "allButStatic", night, skip: LAYERS.filter(n => n !== "static") });
  }
  return out;
}
/* main.js から呼ぶ。hooks:{ fx():FX フラグを SKIP に合わせる, resize(), night(v):照明を切り替える(保存しない), isNight(), freezeSave() } */
export function perfBenchInit(hooks){
  if (!PARAMS.bench || B) return;
  if (typeof document !== "undefined" && document.addEventListener) document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden" && B && (B.phase === "warm" || B.phase === "meas")) B.dirty = true; });
  hooks.freezeSave();               // 保存データを書き換えない(計測が終わっても解除しない)
  GOV.override = 0;                 // 性能による「なめた跡」の自動オフを止める(条件間で状態が変わらないように)
  const conds = benchConditions();
  B = { retries: 0, dirty: false, hooks, conds, i: -1, phase: "init", t0: performance.now(), mStart: 0, frames: [], js: 0, jsN: 0, results: [], origNight: hooks.isNight() };
}
function benchStart(i){
  const c = B.conds[i], h = B.hooks;
  B.i = i;
  if (c.night !== h.isNight()) h.night(c.night);
  const before = dprCap();
  setSkip(c.skip); h.fx();
  if (dprCap() !== before) h.resize();   // 作り直しの後から数える(t0 は resize の後)
  B.retries = 0; B.dirty = false;
  B.phase = "warm"; B.t0 = performance.now(); B.frames = []; B.js = 0; B.jsN = 0;
}
function benchFrame(now){
  const t = performance.now(), prev = lastFrame;
  if (B.phase === "init") { if (t - B.t0 >= BENCH.initMs) benchStart(0); return; }
  if ((B.phase === "warm" || B.phase === "meas") && (B.dirty || (prev && now - prev > STALL_MS))) { // 停止または hidden:この条件の計測を捨て、捨て時間からやり直す
    B.dirty = false; B.retries++; B.phase = "warm"; B.t0 = t; B.frames = []; B.js = 0; B.jsN = 0; return;
  }
  if (B.phase === "warm") { if (t - B.t0 >= BENCH.warmMs) { B.phase = "meas"; B.mStart = t; } return; }
  if (B.phase !== "meas") return;
  if (prev && prev >= B.mStart) B.frames.push(now - prev);
  if (t - B.mStart < BENCH.measMs) return;
  const c = B.conds[B.i], st = B.frames.length ? stat(B.frames) : { avg: NaN, med: NaN, p95: NaN };
  B.results.push({ cond: c.name, mode: c.night ? "night" : "day", skip: c.skip.slice(), median: st.med, p95: st.p95, mean: st.avg, jsMs: B.jsN ? B.js / B.jsN : NaN, frames: B.frames.length, retries: B.retries });
  if (B.i + 1 < B.conds.length) benchStart(B.i + 1); else benchFinish();
}
function benchFinish(){
  const h = B.hooks;
  B.phase = "done";
  setSkip(URL_SKIP); h.fx();                // URL で指定した状態へ戻す
  h.resize();                               // DPR の上限も URL の指定へ戻す
  if (h.isNight() !== B.origNight) h.night(B.origNight);
  for (const r of B.results) {              // 基準(同じ昼夜の base)との中央値の差
    const base = B.results.find(x => x.mode === r.mode && x.cond === "base");
    r.diffMedian = base ? r.median - base.median : NaN;
  }
  const out = { env: { canvas: info.canvas, dpr: info.dpr, ua: typeof navigator !== "undefined" ? navigator.userAgent : "", warmMs: BENCH.warmMs, measMs: BENCH.measMs }, results: B.results };
  window.__bench = out;
  console.log("[bench] " + JSON.stringify(out));
  showBenchTable(out);
}
function showBenchTable(out){
  const day = out.results.filter(r => r.mode === "day"), night = out.results.filter(r => r.mode === "night");
  const f = v => (Number.isFinite(v) ? v.toFixed(1) : "-").padStart(6);
  const d = v => (Number.isFinite(v) ? (v >= 0 ? "+" : "") + v.toFixed(1) : "-").padStart(6);
  const lines = [`bench 完了(フレーム間隔 ms。差=基準との中央値の差、再=停止でやり直した回数)`, `${"条件".padEnd(13)}| 昼 中央${" p95".padStart(6)}${" 差".padStart(6)} 再 | 夜 中央${" p95".padStart(6)}${" 差".padStart(6)} 再`];
  day.forEach((r, i) => { const n = night[i]; lines.push(`${r.cond.padEnd(13)}|${f(r.median)}${f(r.p95)}${d(r.diffMedian)} ${String(r.retries).padStart(2)} |${n ? f(n.median) + f(n.p95) + d(n.diffMedian) + " " + String(n.retries).padStart(2) : ""}`); });
  const tb = document.createElement("pre");
  tb.setAttribute("aria-hidden", "true");
  tb.style.cssText = "position:fixed;right:4px;top:4px;z-index:99999;margin:0;padding:4px 6px;background:rgba(0,0,0,.75);color:#ff9;font:10px/1.25 ui-monospace,Menlo,Consolas,monospace;pointer-events:none;white-space:pre";
  tb.textContent = lines.join("\n");
  document.body.appendChild(tb);
}
function benchLine(){
  if (!B) return "";
  if (B.phase === "init") return "\nbench 開始待ち";
  if (B.phase === "done") return "\nbench 完了";
  const c = B.conds[B.i];
  return `\nbench 条件 ${B.i + 1}/${B.conds.length} ${c.night ? "夜" : "昼"} ${c.name} (${B.phase === "warm" ? "捨て" : "計測"})`;
}

export function perfReport(cv, dpr, fishCount){                          // 0.5 秒ごとに集計とオーバーレイ更新
  const now = performance.now();
  if (now - lastShow < 500) return;
  lastShow = now;
  const s = {};
  for (const k in rings) s[k] = stat(rings[k]);
  const fps = s.frame ? 1000 / s.frame.avg : 0;
  info = { fps, fishes: fishCount, canvas: `${cv.width}x${cv.height}`, dpr, stats: s };
  window.__perf = info;
  if (!el) {
    el = document.createElement("pre");
    el.setAttribute("aria-hidden", "true");
    el.style.cssText = "position:fixed;left:4px;top:4px;z-index:99999;margin:0;padding:4px 6px;background:rgba(0,0,0,.6);color:#9f9;font:10px/1.25 ui-monospace,Menlo,Consolas,monospace;pointer-events:none;white-space:pre";
    document.body.appendChild(el);
  }
  const f = v => " " + v.toFixed(2).padStart(8);
  const rows = Object.keys(s).map(k => `${k.padEnd(11)}${f(s[k].avg)}${f(s[k].med)}${f(s[k].p95)}`);
  const gv = govState();
  const fr = s.frame ? `frame 中央値 ${s.frame.med.toFixed(1)}ms  p95 ${s.frame.p95.toFixed(1)}ms` : "";
  el.textContent = `FPS ${fps.toFixed(1)}  fish ${fishCount}\n${fr}\ncanvas ${info.canvas}  dpr ${dpr}\ntrail ${gv.mode}  3s avg ${gv.avg.toFixed(2)}ms (しきい値 ${GOV.thresholdMs})\n` +
    (SKIP.size ? `skip ${[...SKIP].join(",")}\n` : "") + `${"ms".padEnd(11)}${"avg".padStart(9)}${"med".padStart(9)}${"p95".padStart(9)}\n` + rows.join("\n") + benchLine();
}
