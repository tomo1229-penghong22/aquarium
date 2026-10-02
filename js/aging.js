// 時間経過の状態モデル(汚れ・苔・目詰まり・水草の成長・溶存酸素・メンテ・日の出日没)。
// 依存は core.js と species.js のみ。トップレベルでは乱数・Canvas・Date を使わない(初期化は initAging() を main.js の「開始」から呼ぶ)。
// 時間の進み方:ページを開いていて ON の間だけ、実時間(秒)dt で進む。timeScale は掛けない。
import { Tw, clamp, getSavedRaw, save, setExtraSave } from "./core.js";
import { ORDER, SPECIES } from "./species.js";

/* ---------------- 蓄積の速さ(実時間) ---------------- */
const H = 3600;
export const RATE = {
  dirtSec: 12 * H,          // dirt:12 時間で 0→1(線形)
  glassLagSec: 2 * H,       // algaeGlass:清掃からの ON 時間が 2 時間までは増えない
  glassRiseSec: 14 * H,     //   その後 14 時間かけて 1(=16 時間で 1)
  hardSec: 48 * H,          // algaeHard:48 時間で 0→1
  clogSec: 72 * H,          // clog:72 時間で 0→1
  growthSec: 24 * H,        // growth:24 時間で 0→1
};
export const CLEAN_INTERVAL_MS = 2 * 86400000;    // 水替え・清掃:2 日
export const FILTER_INTERVAL_MS = 60 * 86400000;  // フィルター掃除:60 日
const SAVE_EVERY = 10; // 秒(ON 中)

/* ---------------- 溶存酸素(DO)モデル ----------------
   単位:DO は mg/L、時間は「時間(h)」。
   dDO/dt = kA·(DOsat − DO) + P − R           [mg/L/h]
   kA = K_AIR + K_FILTER·(1 − clog)            [1/h]   エアストーン(一定)+フィルター流量(目詰まりで低下)
   P  = P_BASE + P_GROWTH·growth               [mg/L/h] 水草の光合成(照明は昼夜とも点灯なので一定)
   R  = Q10係数 × (R_FISH·load + R_DIRT·dirt)  [mg/L/h] 魚の呼吸+汚れの分解。Q10係数 = 2^((T−25)/10)
   load = Σ ((体長 × 個体の大きさ) / 40)³   (体長 40 の魚 1 匹で 1)
   時定数 = 1/kA:新品 10 分、目詰まり(clog=1)で 20 分。 */
export const DO_K = { air: 3.0, filter: 3.0, pBase: 1.0, pGrowth: 0.5, rFish: 0.1, rDirt: 4.0, refLen: 40 };

export function DOsat(T){ return 14.652 - 0.41022 * T + 0.007991 * T * T - 0.000077774 * T * T * T; }
export const q10 = T => Math.pow(2, (T - 25) / 10);
export const hypoxia = d => clamp((4.5 - d) / 2.5, 0, 1);
export const INVERT_RESP = 0.4; // 無脊椎動物(エビ・貝)は同じ体長の魚より代謝が低い(呼吸量の係数)
export const fishLoadOf = (sp, scale = 1) => Math.pow(SPECIES[sp].len * scale / DO_K.refLen, 3) * (SPECIES[sp].invert ? INVERT_RESP : 1);
/* 種ごとの数 { neon: n, ... } から load を計算(個体の大きさは 1.0 とみなす) */
export function loadFromCounts(c){ return ORDER.reduce((s, k) => s + (c[k] || 0) * fishLoadOf(k), 0); }
export function defaultLoad(){ return loadFromCounts(Object.fromEntries(ORDER.map(k => [k, SPECIES[k].def]))); }
export function maxLoad(){ return loadFromCounts(Object.fromEntries(ORDER.map(k => [k, SPECIES[k].max]))); }
const kAOf = clog => DO_K.air + DO_K.filter * (1 - clog);
const netOf = (load, T, dirt, growth) => DO_K.pBase + DO_K.pGrowth * growth - q10(T) * (DO_K.rFish * load + DO_K.rDirt * dirt);
/* 平衡値(0 未満にはならない) */
export function DOeq({ load, T, clog = 0, dirt = 0, growth = 0 }){
  return Math.max(0, DOsat(T) + netOf(load, T, dirt, growth) / kAOf(clog));
}

/* ---------------- お掃除生体による苔の抑制 ----------------
   苔の増える速さの倍率 m = 1 − R_MAX·(1 − exp(−e / E0))(e:お掃除の効き目の合計。数が増えるほど鈍る。生体 0 なら e=0 で m=1 で従来と同一。
   完全には止まらない(m ≥ 1 − R_MAX)。ガラスの苔:石巻貝・オト。岩・流木・葉の苔:ヤマト・オト。dirt・clog には効かない。 */
export const CLEAN = { rMax: 0.7, e0: 5, glass: { snail: 0.5, oto: 1.0 }, hard: { shrimp: 0.4, oto: 0.5 } };
const effort = (w, c) => { let e = 0; if (c) for (const k in w) e += w[k] * Math.max(0, +c[k] || 0); return e; };
export const algaeMult = (w, c) => 1 - CLEAN.rMax * (1 - Math.exp(-effort(w, c) / CLEAN.e0));
export const glassMult = c => algaeMult(CLEAN.glass, c);
export const hardMult = c => algaeMult(CLEAN.hard, c);

/* ---------------- 日の出・日没(東京、NOAA の式、太陽高度 −0.833°) ---------------- */
const LAT = 35.6895, LON = 139.6917, RAD = Math.PI / 180;
function solarMinutesUTC(ms){ // ms 時点の太陽の赤緯・均時差から、その UTC 日の日の出・日没(UTC 0:00 からの分)を返す
  const jd = ms / 86400000 + 2440587.5, T = (jd - 2451545) / 36525;
  const L0 = (280.46646 + T * (36000.76983 + T * 0.0003032)) % 360;
  const M = 357.52911 + T * (35999.05029 - 0.0001537 * T);
  const e = 0.016708634 - T * (0.000042037 + 0.0000001267 * T);
  const Mr = M * RAD;
  const C = Math.sin(Mr) * (1.914602 - T * (0.004817 + 0.000014 * T)) + Math.sin(2 * Mr) * (0.019993 - 0.000101 * T) + Math.sin(3 * Mr) * 0.000289;
  const om = 125.04 - 1934.136 * T;
  const lam = L0 + C - 0.00569 - 0.00478 * Math.sin(om * RAD);
  const eps0 = 23 + (26 + (21.448 - T * (46.815 + T * (0.00059 - T * 0.001813))) / 60) / 60;
  const eps = eps0 + 0.00256 * Math.cos(om * RAD);
  const decl = Math.asin(Math.sin(eps * RAD) * Math.sin(lam * RAD));
  const y = Math.tan(eps * RAD / 2) ** 2, L0r = L0 * RAD;
  const eqt = 4 / RAD * (y * Math.sin(2 * L0r) - 2 * e * Math.sin(Mr) + 4 * e * y * Math.sin(Mr) * Math.cos(2 * L0r) - 0.5 * y * y * Math.sin(4 * L0r) - 1.25 * e * e * Math.sin(2 * Mr));
  const ha = Math.acos(Math.cos(90.833 * RAD) / (Math.cos(LAT * RAD) * Math.cos(decl)) - Math.tan(LAT * RAD) * Math.tan(decl)) / RAD;
  return { rise: 720 - 4 * (LON + ha) - eqt, set: 720 - 4 * (LON - ha) - eqt };
}
/* その日(端末のローカル日付を、東京の日付とみなす)の日の出・日没を epoch ms で返す。端末の TZ には依存しない(年月日の取り出し以外) */
export function sunTimes(date){
  const base = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()); // その日の UTC 0:00
  const tokyoNoon = base + 3 * 3600000;                                       // 東京の正午(UTC 3:00)
  let rise = tokyoNoon, set = tokyoNoon; // 初期推定 → 事象時刻の太陽位置で 2 回補正
  for (let i = 0; i < 3; i++) {
    rise = base + solarMinutesUTC(rise).rise * 60000;
    set = base + solarMinutesUTC(set).set * 60000;
  }
  return { sunrise: rise, sunset: set };
}

/* ---------------- 状態(このモジュールが所有。書き換えは関数経由) ---------------- */
export let agingOn = true;
export let dirt = 0, algaeGlass = 0, algaeHard = 0, clog = 0, growth = 0;
export let DO = 8.2;                  // initAging() で DOsat(25) に設定
export let lastClean = 0, lastFilter = 0; // epoch ms(initAging() で起動時刻に設定)
export let sinceClean = 0;            // 清掃からの ON 秒数
export let glassAge = 0;              // ガラスの苔の「実効」秒数(dt × glassMult の積算。algaeGlass はここから逆算。生体 0 なら sinceClean と同じ)
let saveAcc = 0, pending = null;      // pending:メンテを実施したときの案内用({cleaned, filtered})
let frozenSave = false, loadedRaw;    // ?aging 付きで開いている間は、保存データの aging を読み込んだ元の値のまま書き戻す

const glassOf = s => clamp((s - RATE.glassLagSec) / RATE.glassRiseSec, 0, 1);
const num = (v, d, a, b) => typeof v === "number" && Number.isFinite(v) ? clamp(v, a, b) : d;

function setDefaults(now){
  dirt = algaeGlass = algaeHard = clog = growth = 0; sinceClean = glassAge = 0;
  DO = DOsat(25); lastClean = lastFilter = now; saveAcc = 0;
}
/* 保存用の生オブジェクト */
export function serializeAging(){
  return { on: agingOn, dirt, algaeHard, clog, growth, sinceClean, glassAge, DO, lastClean, lastFilter };
}
/* 保存された生オブジェクトを読み込む(欠けている・壊れている項目は既定値)。now は既定の last* に使う */
export function restoreAging(raw, now){
  setDefaults(now); agingOn = true;
  if (!raw || typeof raw !== "object") return;
  try {
    agingOn = raw.on !== false;
    dirt = num(raw.dirt, 0, 0, 1); algaeHard = num(raw.algaeHard, 0, 0, 1); clog = num(raw.clog, 0, 0, 1); growth = num(raw.growth, 0, 0, 1);
    sinceClean = num(raw.sinceClean, 0, 0, 1e9); glassAge = num(raw.glassAge, sinceClean, 0, 1e9); algaeGlass = glassOf(glassAge); // 旧保存データ(glassAge なし)は sinceClean と同じ
    DO = num(raw.DO, DOsat(25), 0, 20);
    lastClean = num(raw.lastClean, now, 0, 1e15); lastFilter = num(raw.lastFilter, now, 0, 1e15);
  } catch (e) { setDefaults(now); agingOn = true; }
}
/* 起動処理(main.js の「開始」から呼ぶ)。core の保存に aging を載せる */
export function initAging(now){
  let raw = null;
  try { raw = getSavedRaw()?.aging; } catch (e) {}
  restoreAging(raw, now);
  loadedRaw = raw; frozenSave = false;
  setExtraSave(() => ({ aging: frozenSave ? loadedRaw : serializeAging() }));
}
/* 状態を直接指定(確認用パラメータ・テスト用)。algaeGlass を指定したら sinceClean を逆算 */
export function setAgingState(p){
  if ("dirt" in p) dirt = clamp(p.dirt, 0, 1);
  if ("algaeHard" in p) algaeHard = clamp(p.algaeHard, 0, 1);
  if ("clog" in p) clog = clamp(p.clog, 0, 1);
  if ("growth" in p) growth = clamp(p.growth, 0, 1);
  if ("DO" in p) DO = Math.max(0, p.DO);
  if ("lastClean" in p) lastClean = p.lastClean;
  if ("lastFilter" in p) lastFilter = p.lastFilter;
  if ("algaeGlass" in p) { algaeGlass = clamp(p.algaeGlass, 0, 1); sinceClean = RATE.glassLagSec + algaeGlass * RATE.glassRiseSec; if (algaeGlass === 0) sinceClean = 0; glassAge = sinceClean; }
}
/* ---------------- 確認用パラメータ ?aging=dirt:1,algaeGlass:1,algaeHard:1,clog:1,growth:1,DO:2 ----------------
   項目は任意の部分集合。dirt・algaeGlass・algaeHard・clog・growth は 0〜1、DO は mg/L(0〜20)。範囲外の数値は範囲内へ丸め、
   不正な項目(未知の名前・数値でない・形式違い)は項目ごとに無視する。aging の指定がなければ null を返す(?perf と同様、無指定時は何もしない) */
const PARAM_KEYS = { dirt: [0, 1], algaeGlass: [0, 1], algaeHard: [0, 1], clog: [0, 1], growth: [0, 1], DO: [0, 20] };
export function parseAgingParam(search){
  const m = /[?&]aging(?:=([^&#]*))?(?=[&#]|$)/.exec(typeof search === "string" ? search : "");
  if (!m) return null;
  const values = {};
  let body = m[1] || "";
  try { body = decodeURIComponent(body); } catch (e) { return { values }; }
  for (const item of body.split(",")) {
    const kv = item.split(":");
    if (kv.length !== 2) continue;
    const key = kv[0].trim(), val = kv[1].trim();
    if (!Object.prototype.hasOwnProperty.call(PARAM_KEYS, key) || !/^[+-]?(\d+\.?\d*|\.\d+)$/.test(val)) continue;
    values[key] = clamp(Number(val), PARAM_KEYS[key][0], PARAM_KEYS[key][1]);
  }
  return { values };
}
/* 起動時(initAging の後)に呼ぶ。?aging があれば状態を指定し、以後 aging の保存は読み込んだ元の値のまま。
   メンテ(checkMaintenance)は ?aging 付きの間は何もしない(指定した状態が消えないように)。指定がなければ null */
export function applyAgingParam(search, now = Date.now()){
  const p = parseAgingParam(search);
  if (!p) return null;
  frozenSave = true;
  setAgingState(p.values);
  return p;
}
export function setAgingOn(v){ agingOn = !!v; save(); }
/* 全状態を初期値に(A2 のリセットボタンから) */
export function resetAging(now){ const on = agingOn; setDefaults(now); agingOn = on; pending = null; save(); }

/* ---------------- 毎フレームの更新 ---------------- */
/* dt:実時間の秒。env = { load, T, counts }(load:魚の呼吸量、T:水温、counts:種ごとの数(省略なら生体 0 とみなす))。OFF なら何も変えない(DO も凍結) */
export function updateAging(dt, env){
  if (!agingOn || !(dt > 0)) return;
  dirt = Math.min(1, dirt + dt / RATE.dirtSec);
  const c = env && env.counts;
  sinceClean += dt; glassAge += dt * glassMult(c); algaeGlass = glassOf(glassAge);
  algaeHard = Math.min(1, algaeHard + dt * hardMult(c) / RATE.hardSec);
  clog = Math.min(1, clog + dt / RATE.clogSec);
  growth = Math.min(1, growth + dt / RATE.growthSec);
  if (env && Number.isFinite(env.load) && Number.isFinite(env.T)) {
    // 線形の微分方程式の厳密解(dt が大きくても安定)。平衡値は状態が dt の間一定として計算
    const k = kAOf(clog), eq = DOsat(env.T) + netOf(env.load, env.T, dirt, growth) / k;
    DO = Math.max(0, eq + (DO - eq) * Math.exp(-k * dt / H));
  }
  saveAcc += dt;
  if (saveAcc >= SAVE_EVERY) { saveAcc = 0; save(); }
}

/* ---------------- メンテ(実日付) ---------------- */
/* now:epoch ms。実施した内容 { cleaned, filtered } を返し、案内用に pending へも記録する。OFF 中は何もしない(null を返す) */
export function checkMaintenance(now, T = Tw){
  if (!agingOn || frozenSave) return null; // ?aging 付きの間は、指定した状態がメンテで消えないよう何もしない
  const done = { cleaned: false, filtered: false };
  if (now - lastClean >= CLEAN_INTERVAL_MS) {
    dirt = 0; algaeGlass = 0; sinceClean = 0; glassAge = 0; algaeHard *= 0.6; DO = DOsat(T); lastClean = now; done.cleaned = true;
  }
  if (now - lastFilter >= FILTER_INTERVAL_MS) {
    clog = 0; growth = 0; lastFilter = now; done.filtered = true;
  }
  if (done.cleaned || done.filtered) { pending = { cleaned: done.cleaned || pending?.cleaned || false, filtered: done.filtered || pending?.filtered || false }; save(); }
  return done;
}
/* visibilitychange から。hidden になったときにメンテを実施して保存。visible に戻ったときは何もしない(pending があれば案内を出せる) */
export function onVisibility(hidden, now){
  if (hidden) { checkMaintenance(now); save(); }
}
/* 案内用:未表示のメンテ実施内容を取り出す(なければ null) */
export function takeNotice(){ const p = pending; pending = null; return p; }
export function hasNotice(){ return !!pending; }

/* ---------------- 照明の自動化(日の出+1h 〜 日没+30m が昼) ---------------- */
const HOUR_MS = 3600000;
/* now:epoch ms。東京の日付で日の出・日没を求める(端末の TZ に依存しない)。
   0 時〜日の出+1h は前日の日没の後なので "night"、日没+30m 以降も "night" */
export function lightPhase(now){
  const t = new Date(now + 9 * HOUR_MS); // UTC フィールドが東京の暦日時
  const { sunrise, sunset } = sunTimes(new Date(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate(), 12));
  return now >= sunrise + HOUR_MS && now < sunset + 30 * 60000 ? "day" : "night";
}
/* 段階が変わったときだけ apply=true。prevPhase が null(起動時・ON に戻した時)なら常に apply=true */
export function autoLightStep(prevPhase, now){
  const phase = lightPhase(now);
  return { phase, apply: phase !== prevPhase };
}

/* ---------------- メンテの案内文 ---------------- */
export function noticeMessage(n){
  if (!n || (!n.cleaned && !n.filtered)) return "";
  if (n.cleaned && n.filtered) return "留守の間に水替え・清掃とフィルターの掃除をしました";
  return n.cleaned ? "留守の間に水替えと水槽の清掃をしました" : "留守の間にフィルターを掃除しました";
}
