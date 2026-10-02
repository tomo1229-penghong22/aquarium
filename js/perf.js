// 性能計測(?perf を付けて開いたときだけ有効)。描画・乱数・DOM には、有効時のオーバーレイ以外は触れない。
// 使い方は README の「性能計測」を参照。無効時は PERF が false で、呼び出し側の if (PERF) が全て素通りする。
import { govState } from "./governor.js";
export const PERF = typeof location !== "undefined" && /[?&]perf(=|&|$)/.test(location.search || "");

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
function stat(r){
  const a = r.slice().sort((x, y) => x - y);
  const n = a.length;
  return { avg: a.reduce((s, x) => s + x, 0) / n, p95: a[Math.min(n - 1, Math.floor(n * 0.95))] };
}

export function perfFrame(now){          // loop の先頭で。rAF の間隔を記録
  if (lastFrame) push("frame", now - lastFrame);
  lastFrame = now;
}
export function perfBegin(){ t0 = tm = performance.now(); }             // 区間の開始
export function perfMark(name){                                          // 前回の印からの時間を name に加算
  const t = performance.now(); push(name, t - tm); tm = t;
}
export function perfEnd(name){ push(name, performance.now() - t0); }    // 開始からの合計を name に記録

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
  const rows = Object.keys(s).map(k => `${k.padEnd(11)}${f(s[k].avg)}${f(s[k].p95)}`);
  const gv = govState();
  el.textContent = `FPS ${fps.toFixed(1)}  fish ${fishCount}\ncanvas ${info.canvas}  dpr ${dpr}\ntrail ${gv.mode}  3s avg ${gv.avg.toFixed(2)}ms (しきい値 2.5)\n${"ms".padEnd(11)}${"avg".padStart(9)}${"p95".padStart(9)}\n` + rows.join("\n");
}
