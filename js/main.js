// 描画順(draw)・毎フレームの更新(loop)・リサイズ・開始処理。
// このファイルがエントリポイント。全モジュールの評価が終わってから、末尾の「開始」が実行される。
import { DPR, H, Tset, Tw, W, clamp, ctx, cv, lerp, nightOn, nightT, sandY, setDPR, setH, setNightT, setTw, setU, setW, setWaterTop, tankEl, timeScale, waterTop } from "./core.js";
import { ORDER } from "./species.js";
import { drawFish } from "./fish-render.js";
import { fishes, schools, syncFish, updateFish, updateHealth, updateSchools } from "./fish-behavior.js";
import { bubbles, buildScene, cc, computeCaustics, drawBubbles, drawCarpet, drawFern, drawFixture, drawFloats, drawGlass, drawLotus, drawMoss, drawMotes, drawRays, drawRibbon, drawRock, drawStem, drawSurface, drawSword, drawThermometer, drawWood, grade, plants, rocks, setCCol, staticLayer, staticNight, updateBubbles } from "./scene.js";
import { updatePanel } from "./ui.js";
import { PERF, perfBegin, perfEnd, perfFrame, perfMark, perfReport } from "./perf.js";

/* ---------------- メインループ ---------------- */
let last = performance.now(), T = 0, frameNo = 0;
function draw(){
  if (PERF) perfBegin();
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  ctx.drawImage(staticLayer, 0, 0, W, H);
  if (nightT > 0.001) { ctx.globalAlpha = nightT; ctx.drawImage(staticNight, 0, 0, W, H); ctx.globalAlpha = 1; }
  if (PERF) perfMark("static");
  drawRays(T);
  if (PERF) perfMark("rays");
  ctx.globalAlpha = 0.78;
  plants.back.forEach(p => p.type === "ribbon" ? drawRibbon(p, T) : drawStem(p, T));
  if (PERF) perfMark("backPlants");
  ctx.globalAlpha = 1;
  ctx.fillStyle = nightT > 0.5 ? "rgba(70,120,140,0.11)" : "rgba(130,200,190,0.1)"; ctx.fillRect(0, waterTop, W, H * 0.82 - waterTop);
  if (PERF) perfMark("haze");
  drawBubbles();
  if (PERF) perfMark("bubbles");
  const sorted = fishes.slice().sort((a, b) => a.z - b.z);
  sorted.forEach(f => { if (f.z < 0.45) drawFish(f); });
  if (PERF) perfMark("backFish");
  ctx.fillStyle = "rgba(110,180,175,0.045)"; ctx.fillRect(0, waterTop, W, H * 0.82 - waterTop);
  ctx.globalAlpha = 0.94; drawWood();
  ctx.globalAlpha = 0.9; rocks.forEach(drawRock);
  drawMoss();
  ctx.globalAlpha = 0.84;
  plants.mid.forEach(p => p.type === "fern" ? drawFern(p, T) : p.type === "lotus" ? drawLotus(p, T) : drawSword(p, T));
  if (PERF) perfMark("midground");
  ctx.globalAlpha = 1;
  sorted.forEach(f => { if (f.z >= 0.45) drawFish(f); });
  if (PERF) perfMark("frontFish");
  ctx.globalAlpha = 0.86;
  plants.front.forEach(p => { if (p.type === "tuft") p.blades.forEach(b => drawRibbon(b, T)); else drawCarpet(p, T); });
  if (PERF) perfMark("frontPlants");
  ctx.globalAlpha = 0.88;
  drawFloats(T);
  if (PERF) perfMark("floats");
  ctx.globalAlpha = 1;
  drawMotes(T);
  if (PERF) perfMark("motes");
  // 揺らめく光の網目(魚にも水草にも砂にも落ちる)
  if (frameNo % 2 === 0) computeCaustics(T * 0.45 + 23);
  ctx.save(); ctx.globalCompositeOperation = "screen";
  ctx.globalAlpha = lerp(0.25, 0.34, nightT); ctx.drawImage(cc, 0, waterTop, W, H - waterTop);
  ctx.beginPath(); ctx.moveTo(0, H);
  for (let x = 0; x <= W; x += 10) ctx.lineTo(x, sandY(x));
  ctx.lineTo(W, H); ctx.closePath(); ctx.clip();
  ctx.globalAlpha = lerp(0.32, 0.42, nightT); ctx.drawImage(cc, -W * 0.1, H * 0.7, W * 1.2, H * 0.3);
  ctx.restore();
  if (PERF) perfMark("caustics");
  drawSurface(T);
  if (PERF) perfMark("surface");
  grade();
  if (PERF) perfMark("grade");
  drawFixture(T);
  if (PERF) perfMark("led");
  drawThermometer();
  if (PERF) perfMark("thermometer");
  drawGlass();
  if (PERF) { perfMark("glass"); perfEnd("draw"); }
}

function loop(now){
  if (PERF) perfFrame(now);
  const dt = Math.min(0.05, (now - last) / 1000); last = now; T += dt; frameNo++;
  const rate = 0.6 * Math.sqrt(timeScale);
  if (Math.abs(Tset - Tw) > 0.001) setTw(Tw + clamp(Tset - Tw, -rate * dt, rate * dt));
  setNightT(clamp(nightT + (nightOn ? dt : -dt) / 1.4, 0, 1));
  const cn = nightT;
  setCCol([Math.round(lerp(255, 228, cn)), Math.round(lerp(248, 240, cn)), Math.round(lerp(222, 255, cn))]);
  if (PERF) perfBegin();
  updateSchools(dt);
  fishes.forEach(f => { updateHealth(f, dt); updateFish(f, dt); });
  updateBubbles(dt, T);
  if (PERF) perfEnd("logic");
  draw();
  if (PERF) perfReport(cv, DPR, fishes.length);
  if (frameNo % 15 === 0) updatePanel();
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
}

/* ---------------- 開始 ---------------- */
resize();
syncFish();
updatePanel();
let rt = 0;
window.addEventListener("resize", () => { clearTimeout(rt); rt = setTimeout(resize, 120); });
requestAnimationFrame(t => { last = t; requestAnimationFrame(loop); });
