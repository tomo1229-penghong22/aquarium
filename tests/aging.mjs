// 時間経過モデル(js/aging.js)の単体テスト(ブラウザ不要)。npm test から smoke.mjs の後に呼ばれる。
// core.js が読み込み時に DOM を触るので、最小のモックだけ置く。TZ・壊れた保存データの検証は、環境を変えた子プロセスで行う。
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";
import { spawnSync } from "node:child_process";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const self = fileURLToPath(import.meta.url);
const noop = () => {};

function installMocks(stored) {
  const written = { v: null };
  const el = { style: {}, getContext: () => new Proxy({}, { get: () => noop }), parentElement: {}, addEventListener: noop };
  const o = {
    document: { getElementById: () => el, createElement: () => el, addEventListener: noop },
    window: { addEventListener: noop },
    localStorage: { getItem: () => stored ?? null, setItem: (k, v) => { written.v = v; } },
  };
  for (const [k, v] of Object.entries(o)) Object.defineProperty(globalThis, k, { value: v, writable: true, configurable: true, enumerable: true });
  return written;
}
const imp = name => import(pathToFileURL(join(root, "js", name)).href);

/* ================= 子プロセス ================= */
const childMode = process.argv.indexOf("--child") > 0 ? process.argv[process.argv.indexOf("--child") + 1] : null;
if (childMode === "sun") {
  installMocks(null);
  const ag = await imp("aging.js");
  const out = [[2026, 5, 21], [2026, 11, 22]].map(([y, m, d]) => ag.sunTimes(new Date(y, m, d, 12, 0)));
  console.log(JSON.stringify(out));
  process.exit(0);
}
if (childMode === "phase") {
  installMocks(null);
  const ag = await imp("aging.js");
  console.log(JSON.stringify([ag.lightPhase(Date.UTC(2026, 5, 20, 23, 30)), ag.lightPhase(Date.UTC(2026, 5, 21, 14, 0))]));
  process.exit(0);
}
if (childMode === "load") {
  installMocks(process.env.AGING_LS);
  const core = await imp("core.js"), ag = await imp("aging.js");
  ag.initAging(1700000000000);
  console.log(JSON.stringify({ aging: ag.serializeAging(), T: core.Tset, counts: core.counts }));
  process.exit(0);
}

if (childMode === "param") { // ?aging 付きで起動 → 状態指定 → 時間経過・ON/OFF 切り替え・保存。保存データの aging が元のままか調べる
  const written = installMocks(process.env.AGING_LS);
  const core = await imp("core.js"), ag = await imp("aging.js");
  ag.initAging(1700000000000);
  const applied = ag.applyAgingParam(process.env.AGING_Q, 1700000000000);
  ag.updateAging(30, { load: 1, T: 25 }); ag.setAgingOn(false); ag.setAgingOn(true); ag.checkMaintenance(1700000000000 + 90 * 86400000);
  core.setTset(30); core.save();
  console.log(JSON.stringify({ stored: JSON.parse(written.v), applied: !!applied, state: { dirt: ag.dirt, algaeGlass: ag.algaeGlass, algaeHard: ag.algaeHard, clog: ag.clog, growth: ag.growth, DO: ag.DO } }));
  process.exit(0);
}

/* ================= 親プロセス ================= */
const written = installMocks(null);
const ag = await imp("aging.js");
const core = await imp("core.js");
const sp = await imp("species.js");
let failed = 0;
function check(name, ok, detail = "") {
  console.log(`${ok ? "✓" : "✗"} ${name}${detail ? "  (" + detail + ")" : ""}`);
  if (!ok) failed++;
}
const child = (mode, env = {}) => {
  const r = spawnSync(process.execPath, [self, "--child", mode], { env: { ...process.env, ...env }, encoding: "utf8" });
  return r.status === 0 ? JSON.parse(r.stdout.trim().split("\n").pop()) : { error: r.stderr || r.stdout };
};

/* --- sunTimes --- */
{
  const jst = (y, m, d, hh, mm) => Date.UTC(y, m, d, hh - 9, mm);
  const exp = [[jst(2026, 5, 21, 4, 25), jst(2026, 5, 21, 19, 0)], [jst(2026, 11, 22, 6, 47), jst(2026, 11, 22, 16, 32)]];
  const a = child("sun", { TZ: "Asia/Tokyo" }), b = child("sun", { TZ: "UTC" });
  if (a.error || b.error) check("sunTimes:子プロセスの実行", false, a.error || b.error);
  else {
    const fmt = ms => new Date(ms + 9 * 3600000).toISOString().slice(11, 16);
    const names = ["2026-06-21", "2026-12-22"];
    exp.forEach((e, i) => {
      const dr = (a[i].sunrise - e[0]) / 60000, ds = (a[i].sunset - e[1]) / 60000;
      check(`sunTimes ${names[i]}(JST):日の出 ${fmt(e[0])}・日没 ${fmt(e[1])} に ±3 分`, Math.abs(dr) <= 3 && Math.abs(ds) <= 3,
        `日の出 ${fmt(a[i].sunrise)}(${dr.toFixed(1)}分)・日没 ${fmt(a[i].sunset)}(${ds.toFixed(1)}分)`);
    });
    check("sunTimes:TZ=UTC と TZ=Asia/Tokyo で同じ瞬間", JSON.stringify(a) === JSON.stringify(b));
  }
}

/* --- lightPhase / autoLightStep / noticeMessage --- */
{
  const jst = (y, m, d, hh, mm) => Date.UTC(y, m, d, hh - 9, mm);
  const H1 = 3600000;
  for (const [y, m, d] of [[2026, 5, 21], [2026, 11, 22]]) {
    const st = ag.sunTimes(new Date(y, m, d, 12)), tag = `${y}-${m + 1}-${d}`;
    check(`lightPhase ${tag}:0時〜日の出+1h は night`, ag.lightPhase(jst(y, m, d, 0, 0)) === "night" && ag.lightPhase(st.sunrise + H1 - 60000) === "night" && ag.lightPhase(st.sunrise) === "night");
    check(`lightPhase ${tag}:日の出+1h 〜 日没+30m は day`, ag.lightPhase(st.sunrise + H1 + 60000) === "day" && ag.lightPhase(jst(y, m, d, 12, 0)) === "day" && ag.lightPhase(st.sunset + 1800000 - 60000) === "day");
    check(`lightPhase ${tag}:日没+30m 以降〜24時は night`, ag.lightPhase(st.sunset + 1800000 + 60000) === "night" && ag.lightPhase(jst(y, m, d, 23, 59)) === "night");
    const a = ag.autoLightStep("night", st.sunrise + H1 - 60000), b = ag.autoLightStep("night", st.sunrise + H1 + 60000), c = ag.autoLightStep("day", st.sunrise + H1 + 120000),
      d2 = ag.autoLightStep("day", st.sunset + 1800000 + 60000), e = ag.autoLightStep(null, jst(y, m, d, 12, 0));
    check(`autoLightStep ${tag}:日の出+1h をまたぐと day へ・その間は apply しない・日没+30m で night へ・null は即適用`,
      a.phase === "night" && !a.apply && b.phase === "day" && b.apply && c.phase === "day" && !c.apply && d2.phase === "night" && d2.apply && e.phase === "day" && e.apply);
  }
  const tz = child("phase", { TZ: "UTC" }), tk = child("phase", { TZ: "Asia/Tokyo" });
  check("lightPhase:TZ=UTC と TZ=Asia/Tokyo で同じ結果(JST 6/21 8:30 は UTC 前日 23:30 でも day、JST 23:00 は night)", !tz.error && !tk.error && JSON.stringify(tz) === JSON.stringify(tk) && tz[0] === "day" && tz[1] === "night", tz.error || tk.error || JSON.stringify(tz));
  const n = (c, f) => ag.noticeMessage({ cleaned: c, filtered: f });
  check("案内の文言:清掃のみ/フィルターのみ/両方/なし",
    n(true, false) === "留守の間に水替えと水槽の清掃をしました" && n(false, true) === "留守の間にフィルターを掃除しました" && n(true, true) === "留守の間に水替え・清掃とフィルターの掃除をしました" && n(false, false) === "" && ag.noticeMessage(null) === "");
}

/* --- DOsat --- */
{
  const s25 = ag.DOsat(25), s18 = ag.DOsat(18), s34 = ag.DOsat(34);
  check("DOsat 25℃ 8.2±0.15", Math.abs(s25 - 8.2) <= 0.15, s25.toFixed(3));
  check("DOsat 18℃ 9.4±0.15", Math.abs(s18 - 9.4) <= 0.15, s18.toFixed(3));
  check("DOsat 34℃ 6.9±0.2", Math.abs(s34 - 6.9) <= 0.2, s34.toFixed(3));
}

/* --- DOeq --- */
{
  const dl = ag.defaultLoad(), ml = ag.maxLoad();
  const a = ag.DOeq({ load: dl, T: 25, clog: 0, dirt: 0, growth: 0 });
  check("DOeq 新品・既定の魚・25℃ ≥7.0 かつ hypoxia=0", a >= 7.0 && ag.hypoxia(a) === 0, `DO ${a.toFixed(2)} / load ${dl.toFixed(1)}`);
  const b = ag.DOeq({ load: ml, T: 25, clog: 0, dirt: 0, growth: 0 });
  check("DOeq 新品・全種最大数・25℃ ≥5.0", b >= 5.0, `DO ${b.toFixed(2)} / load ${ml.toFixed(1)}`);
  const c = ag.DOeq({ load: ml, T: 34, clog: 1, dirt: 1, growth: 0 });
  check("DOeq 全種最大数・34℃・clog=dirt=1 ≤3.5", c <= 3.5, `DO ${c.toFixed(2)}`);
  const d = ag.DOeq({ load: dl, T: 25, clog: 1, dirt: 1, growth: 0 });
  check("DOeq 既定の魚・25℃・clog=dirt=1 が 4〜6.5", d >= 4 && d <= 6.5, `DO ${d.toFixed(2)}`);
  const e = ag.DOeq({ load: ml, T: 34, clog: 1, dirt: 1, growth: 1 });
  check("DOeq は 0 以上(参考:growth=1 でも)", e >= 0 && Number.isFinite(e), `DO ${e.toFixed(2)}`);
}

/* --- メンテ --- */
{
  const NOW = 1800000000000, DAY = 86400000;
  const setup = (cleanAgo, filterAgo, on = true) => {
    ag.restoreAging(null, NOW); ag.setAgingState({ dirt: 0.8, algaeGlass: 0.7, algaeHard: 0.5, clog: 0.6, growth: 0.9, DO: 5, lastClean: NOW - cleanAgo * DAY, lastFilter: NOW - filterAgo * DAY });
    if (!on) ag.setAgingOn(false);
  };
  setup(3, 10); ag.checkMaintenance(NOW, 25);
  check("メンテ:lastClean が 3 日前 → 清掃が適用され lastClean=now",
    ag.dirt === 0 && ag.algaeGlass === 0 && ag.sinceClean === 0 && Math.abs(ag.algaeHard - 0.3) < 1e-9 && Math.abs(ag.DO - ag.DOsat(25)) < 1e-9 && ag.lastClean === NOW && ag.clog === 0.6 && ag.growth === 0.9,
    `dirt ${ag.dirt} glass ${ag.algaeGlass} hard ${ag.algaeHard} DO ${ag.DO.toFixed(2)}`);
  const n = ag.takeNotice();
  check("メンテ:実施内容が記録される(案内用)", n?.cleaned === true && n?.filtered === false && ag.takeNotice() === null);
  setup(1, 10); const r1 = ag.checkMaintenance(NOW, 25);
  check("メンテ:1 日前 → 変化なし", ag.dirt === 0.8 && ag.algaeHard === 0.5 && ag.DO === 5 && ag.lastClean === NOW - DAY && !r1.cleaned && !r1.filtered);
  setup(3, 61, false); const r2 = ag.checkMaintenance(NOW, 25);
  check("メンテ:OFF 中 → 変化なし", r2 === null && ag.dirt === 0.8 && ag.clog === 0.6 && ag.growth === 0.9 && ag.lastClean === NOW - 3 * DAY);
  setup(1, 61); ag.checkMaintenance(NOW, 25);
  check("メンテ:lastFilter が 61 日前 → clog・growth が 0", ag.clog === 0 && ag.growth === 0 && ag.lastFilter === NOW && ag.dirt === 0.8);
  ag.takeNotice();
  ag.restoreAging(null, NOW); // 後続のテストのため既定へ
}

/* --- お掃除生体による苔の抑制(案1) --- */
{
  const H = 3600, ORD = sp.ORDER;
  const countsOf = f => Object.fromEntries(ORD.map(k => [k, f(k)]));
  const zero = countsOf(() => 0), def = countsOf(k => sp.SPECIES[k].def), max = countsOf(k => sp.SPECIES[k].max);
  // 1 に達するまでの時間(時間単位)。dt=30 秒刻み(algaeGlass・algaeHard が両方 1 になるまで)
  const reach = c => {
    ag.restoreAging(null, 0); ag.setAgingOn(true);
    let tg = null, th = null, t = 0; const env = { load: 0, T: 25, counts: c };
    while ((tg === null || th === null) && t < 400 * H) { ag.updateAging(30, env); t += 30; if (tg === null && ag.algaeGlass >= 1) tg = t / H; if (th === null && ag.algaeHard >= 1) th = t / H; }
    return { tg, th, dirt: ag.dirt, clog: ag.clog };
  };
  const z = reach(zero), d = reach(def), m = reach(max), n = reach(undefined);
  check("掃除効果:生体 0 は従来と同一(algaeGlass 16h・algaeHard 48h。counts なしも同じ)", Math.abs(z.tg - 16) < 0.01 && Math.abs(z.th - 48) < 0.01 && n.tg === z.tg && n.th === z.th, `0匹 ${z.tg.toFixed(2)}h / ${z.th.toFixed(2)}h`);
  check("掃除効果:既定の数で algaeGlass が 1 に達する時間 ≥24h(1.5 倍以上)", d.tg >= 24, `${d.tg.toFixed(2)}h(${(d.tg / z.tg).toFixed(2)} 倍)`);
  check("掃除効果:既定の数で algaeHard が 1 に達する時間 ≥67.2h(1.4 倍以上)", d.th >= 67.2, `${d.th.toFixed(2)}h(${(d.th / z.th).toFixed(2)} 倍)`);
  check("掃除効果:全種最大数でも 4 倍以下(ゼロにならない)かつ既定より遅い", m.tg <= 4 * z.tg && m.th <= 4 * z.th && m.tg > d.tg && m.th > d.th, `glass ${m.tg.toFixed(2)}h(${(m.tg / z.tg).toFixed(2)} 倍)/ hard ${m.th.toFixed(2)}h(${(m.th / z.th).toFixed(2)} 倍)`);
  const at2h = c => { ag.restoreAging(null, 0); ag.setAgingOn(true); for (let i = 0; i < 2 * H / 30; i++) ag.updateAging(30, { load: 0, T: 25, counts: c }); return [ag.dirt, ag.clog]; };
  const a2 = at2h(zero), b2 = at2h(max);
  check("掃除効果:dirt と clog は変わらない(生体 0 と最大数で 2 時間後の値が同じ)", a2[0] === b2[0] && a2[1] === b2[1], `dirt ${a2[0].toFixed(4)} / clog ${a2[1].toFixed(4)}`);
  // 減り方は数に対して飽和する(エビ 5→10 と 15→20 で、追加ぶんの効きが後者のほうが小さい)
  const mh = n => ag.hardMult({ shrimp: n });
  check("掃除効果:飽和する(エビを足したときの効き目は数が多いほど小さい。倍率は単調に減る)", mh(0) === 1 && mh(5) > mh(10) && mh(10) > mh(15) && mh(15) > mh(20) && (mh(5) - mh(10)) > (mh(15) - mh(20)) && mh(1000) > 0.25, `0:${mh(0)} 5:${mh(5).toFixed(3)} 10:${mh(10).toFixed(3)} 15:${mh(15).toFixed(3)} 20:${mh(20).toFixed(3)}`);
  // 途中で数を変えても連続(蓄積型):10 時間後に 0 匹→最大数へ切り替え
  ag.restoreAging(null, 0); ag.setAgingOn(true);
  for (let i = 0; i < 10 * H / 30; i++) ag.updateAging(30, { load: 0, T: 25, counts: zero });
  const g1 = ag.algaeGlass, h1 = ag.algaeHard;
  ag.updateAging(30, { load: 0, T: 25, counts: max });
  const g2 = ag.algaeGlass, h2 = ag.algaeHard;
  check("掃除効果:途中で数を変えても値が飛ばない(10 時間後に 0→最大数。1 ステップの変化が 0.01 未満・増加は続く)", g2 >= g1 && h2 >= h1 && g2 - g1 < 0.01 && h2 - h1 < 0.01, `glass ${g1.toFixed(4)}→${g2.toFixed(4)} / hard ${h1.toFixed(5)}→${h2.toFixed(5)}`);
  // 保存・復元(glassAge)・旧形式・メンテ
  ag.restoreAging(null, 0);
  for (let i = 0; i < 20 * H / 30; i++) ag.updateAging(30, { load: 0, T: 25, counts: def });
  const raw = ag.serializeAging(), gBefore = ag.algaeGlass;
  ag.restoreAging(raw, 0);
  const restoredOk = Math.abs(ag.algaeGlass - gBefore) < 1e-9 && ag.glassAge === raw.glassAge && ag.glassAge < ag.sinceClean;
  const { glassAge: _g, ...oldRaw } = raw; ag.restoreAging(oldRaw, 0);
  const oldOk = ag.glassAge === ag.sinceClean && Math.abs(ag.algaeGlass - Math.min(1, Math.max(0, (oldRaw.sinceClean - 7200) / 50400))) < 1e-9;
  check("掃除効果:保存→復元で algaeGlass が一致し、旧形式(glassAge なし)は sinceClean から復元", restoredOk && oldOk, `glass ${gBefore.toFixed(3)} / glassAge ${(raw.glassAge / H).toFixed(2)}h < sinceClean ${(raw.sinceClean / H).toFixed(2)}h`);
  ag.restoreAging(raw, 0); ag.setAgingState({ algaeGlass: 0.5, algaeHard: 0.5 });
  check("掃除効果:?aging の指定値がそのまま反映される(algaeGlass 0.5・algaeHard 0.5)", Math.abs(ag.algaeGlass - 0.5) < 1e-9 && ag.algaeHard === 0.5 && ag.glassAge === ag.sinceClean);
  ag.restoreAging(raw, 1e12 - 3 * 86400000 * 0); ag.setAgingState({ lastClean: 0 });
  ag.checkMaintenance(3 * 86400000);
  check("掃除効果:メンテで glassAge も 0 に戻る", ag.glassAge === 0 && ag.sinceClean === 0 && ag.algaeGlass === 0, `glassAge ${ag.glassAge}`);
  ag.restoreAging(null, 0);
}

/* --- 蓄積 --- */
{
  const run = on => {
    ag.restoreAging(null, 0); ag.setAgingOn(on);
    const env = { load: ag.defaultLoad(), T: 25 };
    for (let i = 0; i < 6 * 3600 * 20; i++) ag.updateAging(0.05, env);
    return { dirt: ag.dirt, glass: ag.algaeGlass, hard: ag.algaeHard, clog: ag.clog, growth: ag.growth, DO: ag.DO };
  };
  const on = run(true);
  check("蓄積:ON で 6 時間 → dirt=0.5±0.01", Math.abs(on.dirt - 0.5) <= 0.01, `dirt ${on.dirt.toFixed(4)} glass ${on.glass.toFixed(3)} hard ${on.hard.toFixed(3)} clog ${on.clog.toFixed(3)} growth ${on.growth.toFixed(3)} DO ${on.DO.toFixed(2)}`);
  check("蓄積:algaeGlass は 6 時間で (6−2)/14、algaeHard は 6/48", Math.abs(on.glass - 4 / 14) < 0.01 && Math.abs(on.hard - 6 / 48) < 0.01);
  const off = run(false);
  check("蓄積:OFF なら全状態が不変(DO も凍結)", off.dirt === 0 && off.glass === 0 && off.hard === 0 && off.clog === 0 && off.growth === 0 && Math.abs(off.DO - ag.DOsat(25)) < 1e-12);
  // 時定数の目安:新品・既定の魚で DO が平衡へ近づく
  ag.restoreAging(null, 0); ag.setAgingState({ DO: 4 });
  let t10 = null; const eq0 = ag.DOeq({ load: ag.defaultLoad(), T: 25 });
  for (let s = 0; s < 3600 * 3 * 20; s++) { ag.updateAging(0.05, { load: ag.defaultLoad(), T: 25 }); if (t10 === null && Math.abs(ag.DO - eq0) < (eq0 - 4) * Math.exp(-1)) t10 = s * 0.05; }
  check("DO が平衡へ近づく(63%到達が 数分〜数十分)", t10 !== null && t10 >= 120 && t10 <= 3600, `63%到達 ${(t10 / 60).toFixed(1)} 分`);
  ag.restoreAging(null, 0);
}

/* --- 保存と復元 --- */
{
  ag.restoreAging(null, 1700000000000);
  ag.setAgingState({ dirt: 0.3, algaeGlass: 0.4, algaeHard: 0.2, clog: 0.1, growth: 0.6, DO: 6.5, lastClean: 1699000000000, lastFilter: 1690000000000 });
  ag.initAging(1700000000000); // 保存の登録(restoreAging の副作用で状態は既定へ戻るため、再設定する)
  ag.setAgingState({ dirt: 0.3, algaeGlass: 0.4, algaeHard: 0.2, clog: 0.1, growth: 0.6, DO: 6.5, lastClean: 1699000000000, lastFilter: 1690000000000 });
  core.save();
  const stored = written.v;
  const before = ag.serializeAging();
  const r = child("load", { AGING_LS: stored });
  check("保存と復元:aging を含めて保存→読み込みで一致", !r.error && JSON.stringify(r.aging) === JSON.stringify(before) && r.T === core.Tset,
    r.error || stored);
  check("保存:既存の counts・T・night が維持される", (() => { const j = JSON.parse(stored); return j.counts && typeof j.T === "number" && "night" in j && j.aging; })());
  const legacy = JSON.stringify({ counts: { neon: 7 }, T: 27, night: true });
  const r2 = child("load", { AGING_LS: legacy });
  check("保存と復元:aging なしの旧形式でも既定値で起動", !r2.error && r2.aging.on === true && r2.aging.dirt === 0 && r2.aging.lastClean === 1700000000000 && r2.aging.lastFilter === 1700000000000 && r2.T === 27 && r2.counts.neon === 7,
    r2.error || JSON.stringify(r2.aging));
  const r3 = child("load", { AGING_LS: "{broken json" });
  check("保存と復元:壊れた JSON でも例外なく起動", !r3.error && r3.aging.dirt === 0 && r3.aging.on === true, r3.error || "");
  const r4 = child("load", { AGING_LS: JSON.stringify({ aging: { on: "x", dirt: "zzz", clog: 9, DO: null, lastClean: "a" } }) });
  check("保存と復元:aging の中身が壊れていても既定値/範囲内で起動", !r4.error && r4.aging.dirt === 0 && r4.aging.clog === 1 && r4.aging.lastClean === 1700000000000, r4.error || JSON.stringify(r4.aging));
  const r5 = child("load", { AGING_LS: JSON.stringify({ aging: "oops" }) });
  check("保存と復元:aging が文字列でも既定値で起動", !r5.error && r5.aging.dirt === 0, r5.error || "");
}

/* --- ?aging(確認用パラメータ) --- */
{
  const P = q => ag.parseAgingParam(q);
  const full = P("?aging=dirt:1,algaeGlass:0.5,algaeHard:1,clog:0.25,growth:1,DO:2");
  check("?aging の解析:全項目(DO は mg/L)", JSON.stringify(full?.values) === JSON.stringify({ dirt: 1, algaeGlass: 0.5, algaeHard: 1, clog: 0.25, growth: 1, DO: 2 }), JSON.stringify(full));
  const part = P("?perf&aging=growth:0.4,dirt:0.1#x");
  check("?aging の解析:部分集合・他のパラメータと併用・ハッシュ付き", JSON.stringify(part?.values) === JSON.stringify({ growth: 0.4, dirt: 0.1 }), JSON.stringify(part));
  check("?aging の解析:URL エンコード(%3A・%2C)", JSON.stringify(P("?aging=dirt%3A1%2Cclog%3A0.5")?.values) === JSON.stringify({ dirt: 1, clog: 0.5 }));
  check("?aging の解析:無指定・名前違いは null(何もしない)", P("") === null && P("?perf") === null && P("?agingx=dirt:1") === null && P("?x=aging") === null && P(undefined) === null);
  const bad = P("?aging=foo:1,dirt:x,clog,growth:0.5:1,:1,algaeHard:,DO:1e3,algaeGlass:0.3");
  check("?aging の解析:不正な項目は項目ごとに無視(未知の名前・数値でない・形式違い・空)", JSON.stringify(bad?.values) === JSON.stringify({ algaeGlass: 0.3 }), JSON.stringify(bad));
  const clamped = P("?aging=dirt:5,clog:-2,DO:99,growth:.5");
  check("?aging の解析:範囲外の数値は範囲内へ丸める(0〜1、DO は 0〜20)", JSON.stringify(clamped?.values) === JSON.stringify({ dirt: 1, clog: 0, DO: 20, growth: 0.5 }), JSON.stringify(clamped));
  check("?aging の解析:値なし(?aging / ?aging=)・壊れたエンコードは指定あり・状態は変えない", JSON.stringify(P("?aging")) === '{"values":{}}' && JSON.stringify(P("?aging=")) === '{"values":{}}' && JSON.stringify(P("?aging=%E0%A4%A")) === '{"values":{}}');
  const q = "?aging=dirt:1,algaeGlass:1,algaeHard:1,clog:1,growth:1,DO:2";
  const orig = { on: false, dirt: 0.25, algaeHard: 0.5, clog: 0.1, growth: 0.3, sinceClean: 5000, DO: 6.5, lastClean: 1699000000000, lastFilter: 1690000000000 };
  const ls = JSON.stringify({ counts: { neon: 7 }, T: 27, night: true, aging: orig });
  const r = child("param", { AGING_LS: ls, AGING_Q: q });
  check("?aging 付き:状態が指定どおりになる", !r.error && r.applied && r.state.dirt === 1 && r.state.algaeGlass === 1 && r.state.clog === 1 && r.state.growth === 1 && r.state.DO > 0, r.error || JSON.stringify(r.state));
  check("?aging 付きで保存しても、保存データの aging は読み込んだ元の値のまま(counts・T は通常どおり保存)",
    !r.error && JSON.stringify(r.stored.aging) === JSON.stringify(orig) && r.stored.T === 30 && r.stored.counts.neon === 7, r.error || JSON.stringify(r.stored.aging));
  const r2 = child("param", { AGING_LS: JSON.stringify({ counts: { neon: 7 } }), AGING_Q: q });
  check("?aging 付き:保存データに aging がなければ、aging は書かれないまま", !r2.error && !("aging" in r2.stored) && r2.stored.T === 30, r2.error || JSON.stringify(r2.stored));
  const r3 = child("param", { AGING_LS: ls, AGING_Q: "?perf" });
  check("?aging なしは従来どおり(状態を保存・指定は無視)", !r3.error && !r3.applied && r3.stored.aging && JSON.stringify(r3.stored.aging) !== JSON.stringify(orig) && r3.state.dirt < 0.3, r3.error || JSON.stringify(r3.stored.aging));
}

console.log(failed ? `\n${failed} 件失敗` : "\nすべて成功");
process.exit(failed ? 1 : 0);
