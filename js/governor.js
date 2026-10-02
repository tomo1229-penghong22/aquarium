// 性能による表現の切り替え(なめた跡)。依存なし。
// 毎フレームの logic+draw の所要時間(ms、JS の処理時間だけ)を main.js が測って govTick に渡す。
// 3 秒の移動平均が GOV.thresholdMs(16.67ms の約 24% = 4ms)を超えたら、跡の表現を GOV.fadeSec かけて消し("fading" → "off")、そのセッションの間は戻さない。
// 起動・resize・タブが表示に戻った直後の GOV.graceSec 秒と、タブが hidden の間は判定しない(テクスチャ生成の引っかかりや停止を数えない)。
// 苔の量(状態)には一切触れない。見た目の層だけを切り替える。
export const GOV = {
  thresholdMs: 4, windowSec: 3, graceSec: 3, fadeSec: 1,
  override: null, // テスト専用:数値を入れると実測の代わりに使う(本番では常に null)
};
let mode = "on", fade = 1, grace = GOV.graceSec, avg = 0;
let samples = [], span = 0; // 直近の { ms, dt }。span:その dt の合計(秒)

/* resize・タブが表示に戻ったとき・起動時:直後の graceSec 秒は判定しない(平均もやり直す) */
export function govGrace(){ grace = GOV.graceSec; samples = []; span = 0; avg = 0; }
/* ms:今フレームの logic+draw(ms)、dt:実経過秒 */
export function govTick(ms, dt){
  if (GOV.override !== null) ms = GOV.override;
  if (mode === "off") return;
  if (mode === "fading") { fade = Math.max(0, fade - dt / GOV.fadeSec); if (fade <= 0) mode = "off"; return; }
  if (typeof document !== "undefined" && document.visibilityState === "hidden") { govGrace(); return; }
  if (grace > 0) { grace -= dt; return; }
  if (!(ms >= 0) || !(dt > 0)) return;
  samples.push({ ms, dt }); span += dt;
  while (samples.length > 1 && span - samples[0].dt >= GOV.windowSec) { span -= samples.shift().dt; }
  let sw = 0, sm = 0; for (const s of samples) { sw += s.dt; sm += s.ms * s.dt; }
  avg = sm / sw;
  if (span >= GOV.windowSec && avg > GOV.thresholdMs) { mode = "fading"; fade = 1; }
}
export const govState = () => ({ mode, fade, avg });
/* 跡の表現の強さ(0〜1)。on は 1、fading は 1→0、off は 0 */
export const trailStrength = () => mode === "off" ? 0 : fade;
/* テスト用:初期状態へ戻す */
export function govReset(){ mode = "on"; fade = 1; govGrace(); GOV.override = null; }
