// 描画順(draw)・毎フレームの更新(loop)・リサイズ・開始処理。
// このファイルがエントリポイント。全モジュールの評価が終わってから、末尾の「開始」が実行される。
import { DPR, counts, H, save, Tset, Tw, W, clamp, ctx, cv, nightOn, nightT, setDPR, setH, setNightT, setTw, setU, setW, setWaterTop, tankEl, timeScale, waterTop } from "./core.js";
import { ORDER, SPECIES } from "./species.js";
import { applyAgingParam, checkMaintenance, fishLoadOf, initAging, onVisibility, updateAging } from "./aging.js";
import { drawFish } from "./fish-render.js";
import { drawCrawlers, grazers, relayout, updateCrawler } from "./crawlers.js";
import { govGrace, govTick, trailStrength } from "./governor.js";
import { fishes, schools, syncFish, updateFish, updateHealth, updateSchools } from "./fish-behavior.js";
import { bubbles, buildMeter, buildScene, drawBubbles, drawCarpet, drawAgingGlass, drawAgingHard, drawCaustics, drawClock, drawFern, drawFixture, drawFloats, drawGlass, drawLotus, drawMoss, drawMotes, drawO2Meter, drawPuffs, drawRays, drawRibbon, drawRock, drawStem, drawSurface, drawSword, drawThermometer, drawWood, grade, plants, rocks, staticLayer, staticNight, updateBubbles, updatePuffs, updateTrails } from "./scene.js";
import { autoLightTick, layoutClockBtn, showNoticeIfAny, updatePanel } from "./ui.js";
import { PERF, perfBegin, perfEnd, perfFrame, perfMark, perfReport } from "./perf.js";

/* ---------------- メインループ ---------------- */
let last = performance.now(), T = 0, frameNo = 0, lightAcc = 0;
function draw(){
  if (PERF) perfBegin();
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  ctx.drawImage(staticLayer, 0, 0, W, H);
  if (nightT > 0.001) { ctx.globalAlpha = nightT; ctx.drawImage(staticNight, 0, 0, W, H); ctx.globalAlpha = 1; }
  if (PERF) perfMark("static");
  drawRays(T);
  if (PERF) perfMark("rays");
  plants.back.forEach(p => p.type === "ribbon" ? drawRibbon(p, T) : drawStem(p, T));
  if (PERF) perfMark("backPlants");
  // 奥の水草は不透明(後ろの草が透けない)。奥行きの淡さは、この霞(水の色の薄い重ね。以前の水草の半透明 0.78 の分を引き受ける)で表す
  ctx.fillStyle = nightT > 0.5 ? "rgba(70,120,140,0.2)" : "rgba(130,200,190,0.19)"; ctx.fillRect(0, waterTop, W, H * 0.82 - waterTop);
  if (PERF) perfMark("haze");
  drawBubbles();
  if (PERF) perfMark("bubbles");
  const sorted = fishes.filter(f => !SPECIES[f.sp].solo).sort((a, b) => a.z - b.z);
  sorted.forEach(f => { if (f.z < 0.45) drawFish(f); });
  drawCrawlers("back"); // 奥のガラスに吸いついたオト
  if (PERF) perfMark("backFish");
  ctx.fillStyle = "rgba(110,180,175,0.045)"; ctx.fillRect(0, waterTop, W, H * 0.82 - waterTop);
  drawWood();                 // 流木・岩は不透明(層の透明度なし)
  rocks.forEach(drawRock);
  drawMoss();
  drawAgingHard();
  drawCrawlers("low"); // 岩・砂・流木の上の貝・エビ・オト
  plants.mid.forEach(p => p.type === "fern" ? drawFern(p, T) : p.type === "lotus" ? drawLotus(p, T) : drawSword(p, T));
  if (PERF) perfMark("midground");
  ctx.fillStyle = nightT > 0.5 ? "rgba(70,120,140,0.07)" : "rgba(130,200,190,0.07)"; ctx.fillRect(0, waterTop, W, H * 0.82 - waterTop); // 中景の草・岩・流木の淡さ(手前の魚の後ろ)
  sorted.forEach(f => { if (f.z >= 0.45) drawFish(f); });
  drawCrawlers("front"); // 移動中のオト
  drawPuffs();           // コリドラスの砂煙
  if (PERF) perfMark("frontFish");
  plants.front.forEach(p => { if (p.type === "tuft") p.blades.forEach(b => drawRibbon(b, T)); else drawCarpet(p, T); });
  if (PERF) perfMark("frontPlants");
  drawFloats(T);
  if (PERF) perfMark("floats");
  ctx.globalAlpha = 1;
  drawMotes(T);
  if (PERF) perfMark("motes");
  // 揺らめく光の網目(魚にも水草にも砂にも落ちる)
  drawCaustics(T);
  if (PERF) perfMark("caustics");
  drawSurface(T);
  if (PERF) perfMark("surface");
  drawAgingGlass(); // ガラスの汚れ・苔(色調補正の前:照明の色調がかかる)
  drawCrawlers("glass"); // 前面ガラスの貝・オト(汚れ・苔の上、色調補正の前)
  if (PERF) perfMark("agingGlass");
  grade();
  if (PERF) perfMark("grade");
  drawFixture(T);
  if (PERF) perfMark("led");
  drawThermometer();
  if (PERF) perfMark("thermometer");
  drawClock();
  if (PERF) perfMark("clock");
  drawO2Meter();
  if (PERF) perfMark("o2meter");
  drawGlass();
  if (PERF) { perfMark("glass"); perfEnd("draw"); }
}

function loop(now){
  if (PERF) perfFrame(now);
  const tStart = performance.now(); // logic+draw の所要時間を測る(性能による切り替え。?perf の有無にかかわらず)
  const dt = Math.min(0.05, (now - last) / 1000), realDt = Math.min(1, (now - last) / 1000); last = now; T += dt; frameNo++;
  // realDt:時間経過用の実経過秒(低 fps でも 1:1。非表示で rAF が止まった間は 1 秒までしか数えない)。他の更新は従来の dt
  const rate = 0.6 * Math.sqrt(timeScale);
  if (Math.abs(Tset - Tw) > 0.001) setTw(Tw + clamp(Tset - Tw, -rate * dt, rate * dt));
  setNightT(clamp(nightT + (nightOn ? dt : -dt) / 1.4, 0, 1));
  if (PERF) perfBegin();
  updateSchools(dt);
  fishes.forEach(f => { updateHealth(f, dt); if (SPECIES[f.sp].solo) updateCrawler(f, dt); else updateFish(f, dt); });
  updateBubbles(dt, T); updatePuffs(dt, T);
  let load = 0; for (const f of fishes) load += fishLoadOf(f.sp, f.scale);
  updateAging(realDt, { load, T: Tw, counts });
  updateTrails(dt, grazers(), trailStrength()); // なめた跡(見た目の層)
  if (PERF) perfEnd("logic");
  draw();
  govTick(performance.now() - tStart, realDt);
  if (PERF) perfReport(cv, DPR, fishes.length);
  if (frameNo % 15 === 0) updatePanel();
  lightAcc += dt; if (lightAcc >= 1) { lightAcc = 0; autoLightTick(Date.now()); } // 照明の自動判定は約1秒ごと
  requestAnimationFrame(loop);
}

export function resize(){
  const oldW = W, oldH = H;
  const fsOn = tankEl.classList.contains("is-fs");
  setW(cv.clientWidth || 800); setH(fsOn ? (cv.clientHeight || W * 10 / 16) : W * 10 / 16);
  setDPR(Math.min(window.devicePixelRatio || 1, 2));
  cv.width = Math.round(W * DPR); cv.height = Math.round(H * DPR);
  setU(Math.min(W / 1000, H / 625)); setWaterTop(H * 0.055);
  if (oldW) fishes.forEach(f => { f.x *= W / oldW; f.y *= H / oldH; f.tx *= W / oldW; f.ty *= H / oldH; });
  bubbles.length = 0;
  ORDER.forEach(k => schools[k].timer = 0);
  buildScene();
  relayout();
  layoutClockBtn();
  govGrace(); // 作り直し直後の 3 秒は性能を判定しない
}

/* ---------------- 開始 ---------------- */
initAging(Date.now());
applyAgingParam(typeof location !== "undefined" ? location.search : ""); // ?aging=... のときだけ状態を指定(無指定は何もしない)
checkMaintenance(Date.now());
resize();
document.fonts?.ready?.then(() => buildMeter()); // Web フォント読み込み後に、作り置きの「O₂」を正しい字体で作り直す(fonts がない環境では何もしない)
syncFish();
autoLightTick(Date.now());
updatePanel();
showNoticeIfAny();
let rt = 0;
window.addEventListener("resize", () => { clearTimeout(rt); rt = setTimeout(resize, 120); });
document.addEventListener("visibilitychange", () => {
  const hidden = document.visibilityState === "hidden";
  onVisibility(hidden, Date.now());
  if (!hidden) { govGrace(); checkMaintenance(Date.now()); showNoticeIfAny(); } // 非表示の間に期日が来た分は「非表示中に実施した」扱い
});
window.addEventListener("pagehide", () => save());
requestAnimationFrame(t => { last = t; requestAnimationFrame(loop); });
