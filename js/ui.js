// パネル(魚の選択・水温・照明)と全画面表示。
// main.js の resize を呼ぶため、main.js とは循環 import になる(関数の中でだけ使うので問題ない)。
import { H, Tset, Tw, U, W, clamp, counts, ctx, cv, nightOn, save, setCtx, setNightOn, setTimeScale, setTset, setU, tankEl } from "./core.js";
import { ORDER, SPECIES } from "./species.js";
import { PAINT, setBaseA } from "./fish-render.js";
import { fishes, syncFish } from "./fish-behavior.js";
import { P, bindPop, closePop } from "./popup.js";
import { agingOn, autoLightStep, checkMaintenance, hasNotice, lastClean, lastFilter, noticeMessage, resetAging, setAgingOn, takeNotice } from "./aging.js";
import { clockGeom } from "./scene.js";
import { resize } from "./main.js";

/* ---------------- パネル ---------------- */
const listEl = document.getElementById("fishlist");
ORDER.forEach(sp => {
  const S = SPECIES[sp];
  const row = document.createElement("div"); row.className = "fishrow";
  const ic = document.createElement("canvas"); ic.width = 112; ic.height = 60; ic.className = "ico";
  ic.tabIndex = 0; ic.setAttribute("role", "button"); ic.setAttribute("aria-label", `${S.name}を拡大表示`);
  row.appendChild(ic);
  const info = document.createElement("div");
  info.innerHTML = `<div class="fname">${S.name}</div><div class="frange">適温の目安 ${S.opt[0]}〜${S.opt[1]}℃・最大${S.max}匹</div>`;
  row.appendChild(info);
  const st = document.createElement("div"); st.className = "step";
  st.innerHTML = `<button type="button" aria-label="${S.name}を1匹減らす">−</button><output aria-live="polite">${counts[sp]}</output><button type="button" aria-label="${S.name}を1匹増やす">＋</button>`;
  const [minus, out, plus] = st.children;
  const set = v => { counts[sp] = clamp(v, 0, S.max); out.textContent = counts[sp]; syncFish(); save(); updatePanel(); };
  minus.onclick = () => set(counts[sp] - 1);
  plus.onclick = () => set(counts[sp] + 1);
  row.appendChild(st);
  listEl.appendChild(row);
  bindPop(sp, ic, info);
  // アイコン
  const g = ic.getContext("2d");
  const prevU = U;
  const f = { phase: 0.6, pale: 0, spots: [[0.5, 0.2, 1], [0.7, -0.2, 1], [0.8, 0.1, 1]], variant: 0, ox: 0 };
  setU(0.9);
  const L = { neon: 46, rummy: 46, guppy: 32, platy: 44, angel: 25, cory: 46, oto: 40, shrimp: 40, snail: 24 }[sp];
  drawIcon(g, sp, L, f);
  setU(prevU);
});
export function drawIcon(g, sp, L, f){
  const orig = ctx; setCtx(g); setBaseA(SPECIES[sp].finAlpha); // ひれ・膜(エビは体全体)の透明度。体は不透明
  g.save(); g.translate(sp === "guppy" ? 70 : sp === "angel" ? 64 : 60, 30);
  PAINT[sp](L, 0, f);
  g.restore();
  setBaseA(1); setCtx(orig);
}

const tempEl = document.getElementById("temp");
tempEl.value = Tset;
tempEl.addEventListener("input", () => { setTset(parseFloat(tempEl.value)); save(); updatePanel(); });
document.querySelectorAll("#speed button").forEach(b => b.addEventListener("click", () => {
  setTimeScale(parseFloat(b.dataset.v));
  document.querySelectorAll("#speed button").forEach(x => x.setAttribute("aria-pressed", String(x === b)));
}));

export function setNight(v){
  setNightOn(v); save();
  document.querySelectorAll("#light button").forEach(x => x.setAttribute("aria-pressed", String((x.dataset.v === "night") === nightOn)));
  const lb = document.getElementById("fslight");
  lb.textContent = nightOn ? "☾ 夜" : "☀ 昼";
  lb.setAttribute("aria-label", nightOn ? "照明:夜(白色LED)。昼に切り替える" : "照明:昼(自然光)。夜に切り替える");
}
document.querySelectorAll("#light button").forEach(b => b.addEventListener("click", () => setNight(b.dataset.v === "night")));
setNight(nightOn);

/* ---------------- 全画面表示 ---------------- */
const fsBtn = document.getElementById("fsbtn"), fsHint = document.getElementById("fshint");
const ICON_IN = fsBtn.innerHTML;
const ICON_OUT = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5"/></svg>';
let pseudoFS = false, idleTimer = 0, hintTimer = 0;
const nativeFS = () => !!(document.fullscreenElement || document.webkitFullscreenElement);
const isFS = () => nativeFS() || pseudoFS;
export function setPseudo(v){ pseudoFS = v; tankEl.classList.toggle("pseudo-fs", v); document.documentElement.style.overflow = v ? "hidden" : ""; onFSChange(); }
function enterFS(){
  const req = tankEl.requestFullscreen || tankEl.webkitRequestFullscreen;
  if (!req) { setPseudo(true); return; }
  try { const pr = req.call(tankEl); if (pr && pr.catch) pr.catch(() => setPseudo(true)); } catch (e) { setPseudo(true); }
}
function exitFS(){
  if (pseudoFS) { setPseudo(false); return; }
  const ex = document.exitFullscreen || document.webkitExitFullscreen;
  if (ex) { try { const pr = ex.call(document); if (pr && pr.catch) pr.catch(() => {}); } catch (e) {} }
}
function toggleFS(){ isFS() ? exitFS() : enterFS(); }
function wake(){
  tankEl.classList.remove("idle");
  clearTimeout(idleTimer);
  if (isFS()) idleTimer = setTimeout(() => { if (isFS() && !tankEl.querySelector(".ctl:focus-within")) tankEl.classList.add("idle"); }, 2600);
}
function onFSChange(){
  const on = isFS();
  tankEl.classList.toggle("is-fs", on);
  fsBtn.innerHTML = on ? ICON_OUT : ICON_IN;
  const label = on ? "全画面表示を終了 (F / Esc)" : "全画面表示 (F)";
  fsBtn.setAttribute("aria-label", label); fsBtn.title = label;
  if (P.open) closePop(0);
  clearTimeout(hintTimer);
  if (on) { fsHint.classList.add("show"); hintTimer = setTimeout(() => fsHint.classList.remove("show"), 2800); }
  else { fsHint.classList.remove("show"); tankEl.classList.remove("idle"); }
  wake();
  requestAnimationFrame(() => requestAnimationFrame(resize));
}
document.addEventListener("fullscreenchange", onFSChange);
document.addEventListener("webkitfullscreenchange", onFSChange);
document.addEventListener("fullscreenerror", () => setPseudo(true));
document.addEventListener("webkitfullscreenerror", () => setPseudo(true));
fsBtn.addEventListener("click", toggleFS);
document.getElementById("fslight").addEventListener("click", () => setNight(!nightOn));
cv.addEventListener("dblclick", toggleFS);
tankEl.addEventListener("pointermove", wake);
tankEl.addEventListener("pointerdown", wake);
document.addEventListener("keydown", e => {
  const tg = e.target, tag = tg && tg.tagName;
  const typing = tg && (tg.isContentEditable || tag === "TEXTAREA" || (tag === "INPUT" && !["range", "button", "checkbox", "radio"].includes(tg.type)));
  if ((e.key === "f" || e.key === "F") && !e.ctrlKey && !e.metaKey && !e.altKey && !typing && !e.repeat) { e.preventDefault(); toggleFS(); }
  else if (e.key === "Escape" && pseudoFS) { setPseudo(false); }
  if (isFS()) wake();
});

/* ---------------- 時間の経過(24時間計のボタン)・照明の自動化・メンテの案内・リセット ---------------- */
const clockBtn = document.getElementById("clockbtn");
/* 24時間計の位置へ透明なボタンを重ねる。論理座標は canvas の CSS サイズと同じ単位なので、canvas の左上(.tank 基準)に足すだけでよい。resize() のたびに呼ぶ */
export function layoutClockBtn(){
  const { x, y, r } = clockGeom(), ox = cv.offsetLeft || 0, oy = cv.offsetTop || 0;
  const s = clockBtn.style;
  s.left = `${ox + x - r}px`; s.top = `${oy + y - r}px`; s.width = s.height = `${2 * r}px`;
}
function syncClockBtn(){
  clockBtn.setAttribute("aria-pressed", String(agingOn));
  clockBtn.setAttribute("aria-label", agingOn ? "時間の経過:オン。押すとオフにします" : "時間の経過:オフ。押すとオンにします");
  clockBtn.title = agingOn ? "時間の経過:オン(押すとオフ)" : "時間の経過:オフ(押すとオン)";
}
let lastPhase = null; // 前回の自動判定("day" / "night")。null なら次の判定で必ず適用する
/* 段階が変わったときだけ照明を切り替える(手動の切り替えは次に段階が変わるまで保たれる)。ON のときだけ動く */
export function autoLightTick(now){
  if (!agingOn) return;
  const { phase, apply } = autoLightStep(lastPhase, now);
  lastPhase = phase;
  if (apply) setNight(phase === "night");
}
const noticeEl = document.getElementById("notice");
let noticeTimer = 0;
/* 未表示のメンテ実施内容があれば、水槽上部に約3秒の案内を出す */
export function showNoticeIfAny(){
  if (!hasNotice()) return;
  const msg = noticeMessage(takeNotice());
  if (!msg) return;
  noticeEl.textContent = msg; noticeEl.classList.add("show");
  clearTimeout(noticeTimer);
  noticeTimer = setTimeout(() => noticeEl.classList.remove("show"), 3000);
}
function toggleAging(){
  setAgingOn(!agingOn); syncClockBtn();
  if (agingOn) { const now = Date.now(); checkMaintenance(now); lastPhase = null; autoLightTick(now); showNoticeIfAny(); }
  updatePanel();
}
clockBtn.addEventListener("click", toggleAging);
clockBtn.addEventListener("dblclick", e => e.stopPropagation()); // 全画面の切り替えを起こさない
syncClockBtn();

const resetBtn = document.getElementById("resetbtn");
let resetArmed = false, resetTimer = 0;
function setResetUI(armed){
  resetArmed = armed;
  resetBtn.textContent = armed ? "もう一度押すとリセット" : "水槽をリセット";
  resetBtn.setAttribute("aria-label", armed ? "もう一度押すと水槽をリセットします" : "水槽をリセット");
}
resetBtn.addEventListener("click", () => {
  clearTimeout(resetTimer);
  if (!resetArmed) { setResetUI(true); resetTimer = setTimeout(() => setResetUI(false), 4000); return; }
  setResetUI(false);
  resetAging(Date.now()); updatePanel();
});
const stateEl = document.getElementById("agingstate"), lcEl = document.getElementById("lastclean"), lfEl = document.getElementById("lastfilter");
const dateJa = ms => { const d = new Date(ms); return `${d.getMonth() + 1}月${d.getDate()}日`; };

function tempStatus(T){
  if (T < 21) return ["冷たすぎます", "代謝が落ちて動きが鈍くなり、底のほうでじっとしがちです。長く続くと体力や抵抗力が落ちやすくなります。", "#dbe6f4"];
  if (T < 23) return ["やや低めです", "動きが少しゆっくりになります。種類によっては物足りない温度です。", "#e0ecef"];
  if (T <= 27.5) return ["適温です", "多くの熱帯魚が落ち着いて過ごしやすい範囲です。", ""];
  if (T <= 29.5) return ["やや高めです", "動きが活発になる一方、水に溶ける酸素は少しずつ減ります。", "#f5ecd6"];
  if (T <= 31.5) return ["高すぎます", "酸素が足りなくなりやすく、水面近くで口をぱくぱくさせる魚が増えます。", "#f6dfcf"];
  return ["危険な高温です", "このままにしておくと、魚はひどく弱ってしまいます。早めに温度を下げてください。", "#f4d2cc"];
}
function condLabel(h){ return h >= 0.8 ? "元気" : h >= 0.6 ? "少し疲れ気味" : h >= 0.4 ? "弱っている" : h >= 0.2 ? "かなり弱っている" : "危険な状態"; }
function condColor(h){ return h >= 0.8 ? "#5fb277" : h >= 0.6 ? "#a8b84a" : h >= 0.4 ? "#e0a53a" : h >= 0.2 ? "#e0703a" : "#c9352b"; }
const statusEl = document.getElementById("status"), condEl = document.getElementById("cond");
const tnowEl = document.getElementById("tnow"), tsetEl = document.getElementById("tset");
export function updatePanel(){
  tnowEl.textContent = `${Tw.toFixed(1)}℃`;
  tsetEl.textContent = `設定 ${Tset.toFixed(1)}℃`;
  const [title, text, bg] = tempStatus(Tw);
  statusEl.innerHTML = `<b>${title}</b>${text}`;
  statusEl.style.background = bg || "";
  statusEl.style.color = bg ? "#2a2a26" : "";
  let html = "";
  ORDER.forEach(sp => {
    const list = fishes.filter(f => f.sp === sp);
    if (!list.length) return;
    const h = list.reduce((s, f) => s + f.health, 0) / list.length;
    html += `<div class="lbl">${SPECIES[sp].name}<small>${condLabel(h)}</small></div><div class="bar"><i style="width:${Math.round(h * 100)}%;background:${condColor(h)}"></i></div>`;
  });
  stateEl.textContent = `時間の経過:${agingOn ? "オン" : "オフ"}(時計を押して切り替え)`;
  lcEl.textContent = `前回の水替え:${dateJa(lastClean)}`;
  lfEl.textContent = `前回のフィルター掃除:${dateJa(lastFilter)}`;
  syncClockBtn();
  condEl.innerHTML = html || `<div class="empty">魚を選ぶと、ここに体調が表示されます。</div>`;
}
