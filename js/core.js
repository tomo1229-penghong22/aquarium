// 共有の状態とユーティリティ(水槽の大きさ・水温・照明・保存と復元・描画先 ctx)。
// 値を書き換えるモジュールは、末尾のセッター関数(setCtx など)を使う。
import { ORDER, SPECIES } from "./species.js";

/* ---------------- ユーティリティ ---------------- */
export const TAU = Math.PI * 2;
export const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
export const lerp = (a, b, t) => a + (b - a) * t;
export function mulberry(seed){ return function(){ seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function hash(n){ const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); }
export function noise1(x){ const i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f); return hash(i) * (1 - u) + hash(i + 1) * u; }
function hexRgb(h){ const n = parseInt(h.slice(1), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; }
export function mix(c1, c2, t){ const a = hexRgb(c1), b = hexRgb(c2); return `rgb(${Math.round(lerp(a[0], b[0], t))},${Math.round(lerp(a[1], b[1], t))},${Math.round(lerp(a[2], b[2], t))})`; }

/* ---------------- 状態 ---------------- */
export const counts = {}; ORDER.forEach(k => counts[k] = SPECIES[k].def);
export let Tset = 25, Tw = 25, timeScale = 1, nightOn = false, nightT = 0;
let savedRaw = null; // 読み込んだ保存データの生オブジェクト(aging.js が自分の項目を読む口)
try {
  const saved = JSON.parse(localStorage.getItem("aquarium-v1") || "null");
  savedRaw = saved && typeof saved === "object" ? saved : null;
  if (saved) { ORDER.forEach(k => { if (typeof saved.counts?.[k] === "number") counts[k] = clamp(saved.counts[k], 0, SPECIES[k].max); });
    if (typeof saved.T === "number") { Tset = Tw = clamp(saved.T, 18, 34); }
    if (saved.night) { nightOn = true; nightT = 1; } }
} catch (e) {}
export function getSavedRaw(){ return savedRaw; }
/* 追加の保存項目:fn() が返すオブジェクトを、保存データへ混ぜる(循環 import を避けるための登録口) */
let extraSave = null;
export function setExtraSave(fn){ extraSave = fn; }
let saveFrozen = false;
/* ?perf&bench の間だけ呼ぶ:以後 save() は何も書かない(計測のために照明を切り替えても保存データを変えない) */
export function freezeSave(){ saveFrozen = true; }
export function save(){
  if (saveFrozen) return;
  try {
    let extra = null; try { extra = extraSave ? extraSave() : null; } catch (e) {}
    localStorage.setItem("aquarium-v1", JSON.stringify({ counts, T: Tset, night: nightOn, ...extra }));
  } catch (e) {}
}

export const cv = document.getElementById("tank");
export const tankEl = cv.parentElement;
export let ctx = cv.getContext("2d");
export let W = 0, H = 0, U = 1, DPR = 1, waterTop = 0;

export function sandY(x){ return H * (0.80 + 0.022 * Math.sin(x / W * 3.2 + 0.8) + 0.011 * Math.sin(x / W * 9.1 + 2)); }
export function bottomY(x, z){ return sandY(x) + z * 30 * U; }

/* 水流:ゆっくりした大きなうねり+小さな揺らぎ(値ノイズの重ね合わせ) */
export function current(x, t){
  const xs = x / U;
  const n1 = noise1(t * 0.16 + xs * 0.0016) * 2 - 1;
  const n2 = noise1(t * 0.52 + xs * 0.0042 + 37.7) * 2 - 1;
  return n1 * 0.55 + n2 * 0.2 + Math.sin(t * 0.42 + xs * 0.004) * 0.16 + 0.1;
}

/* ---- セッター ----
   ES Modules では、import した変数へ代入できない。値を書き換える側はこの関数を呼ぶ(読み取りは import した名前をそのまま使う)。 */
export function setCtx(c){ ctx = c; }
export function setU(v){ U = v; }
export function setW(v){ W = v; }
export function setH(v){ H = v; }
export function setDPR(v){ DPR = v; }
export function setWaterTop(v){ waterTop = v; }
export function setTset(v){ Tset = v; }
export function setTw(v){ Tw = v; }
export function setTimeScale(v){ timeScale = v; }
export function setNightOn(v){ nightOn = v; }
export function setNightT(v){ nightT = v; }
