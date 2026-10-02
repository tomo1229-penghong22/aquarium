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
if (childMode === "load") {
  installMocks(process.env.AGING_LS);
  const core = await imp("core.js"), ag = await imp("aging.js");
  ag.initAging(1700000000000);
  console.log(JSON.stringify({ aging: ag.serializeAging(), T: core.Tset, counts: core.counts }));
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

console.log(failed ? `\n${failed} 件失敗` : "\nすべて成功");
process.exit(failed ? 1 : 0);
