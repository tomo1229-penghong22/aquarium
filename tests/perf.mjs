// ?perf&skip= / ?perf&bench の URL 解析と、bench の条件一覧の確認(ブラウザ不要)。npm test に含む。
import { LAYERS, SPECIAL, parsePerfParams, benchConditions, cumConditions, cumSummary, PERF, skipOn, dprCap } from "../js/perf.js";
let fail = 0;
const eq = (name, a, b) => { const ok = JSON.stringify(a) === JSON.stringify(b); if (!ok) fail++; console.log(`${ok ? "✓" : "✗"} ${name}${ok ? "" : `  実際 ${JSON.stringify(a)} / 期待 ${JSON.stringify(b)}`}`); };
eq("?perf なし:何も有効にならない(skip を付けても無視)", parsePerfParams("?skip=grade"), { perf: false, bench: false, benchCum: false, skip: [], unknown: [] });
eq("?perf のみ", parsePerfParams("?perf"), { perf: true, bench: false, benchCum: false, skip: [], unknown: [] });
eq("?perf&skip=a,b", parsePerfParams("?perf&skip=grade,caustics"), { perf: true, bench: false, benchCum: false, skip: ["grade", "caustics"], unknown: [] });
eq("特別な名前と順不同・重複・空白・空要素", parsePerfParams("?x=1&skip=dpr1, shadow,,gradeDay,dpr1&perf"), { perf: true, bench: false, benchCum: false, skip: ["dpr1", "shadow", "gradeDay"], unknown: [] });
eq("未知の名前は unknown(大文字小文字を区別)", parsePerfParams("?perf&skip=Grade,nope,led"), { perf: true, bench: false, benchCum: false, skip: ["led"], unknown: ["Grade", "nope"] });
eq("URL エンコード(%2C)", parsePerfParams("?perf&skip=rays%2Cmotes"), { perf: true, bench: false, benchCum: false, skip: ["rays", "motes"], unknown: [] });
eq("?perf&bench", parsePerfParams("?perf&bench"), { perf: true, bench: true, benchCum: false, skip: [], unknown: [] });
eq("?bench だけ(perf なし)は無効", parsePerfParams("?bench").bench, false);
eq("?perfx は perf と見なさない", parsePerfParams("?perfx&skip=grade").perf, false);
eq("全層名がすべて受理される", parsePerfParams("?perf&skip=" + [...LAYERS, ...SPECIAL].join(",")).skip.length, LAYERS.length + SPECIAL.length);
eq("perf.js 読み込み時(location なし):PERF=false・skipOn=false・dprCap=2", [PERF, skipOn("grade"), dprCap()], [false, false, 2]);
const c = benchConditions();
eq("bench の条件数(昼夜 × (基準 1 + 層 20 + 特別 5 + 下限 1))", c.length, 2 * (1 + LAYERS.length + SPECIAL.length + 1));
eq("bench 先頭は昼の基準・最後は夜の static 以外すべて", [c[0].name, c[0].night, c.at(-1).name, c.at(-1).night, c.at(-1).skip.includes("static"), c.at(-1).skip.length], ["base", false, "allButStatic", true, false, LAYERS.length - 1]);
eq("?perf&bench=cum", parsePerfParams("?perf&bench=cum"), { perf: true, bench: true, benchCum: true, skip: [], unknown: [] });
eq("?perf&bench=cumx は cum と見なさない", parsePerfParams("?perf&bench=cumx").benchCum, false);
const cc = cumConditions();
eq("cum の条件数(昼夜 × 往復 × 20)", cc.length, 80);
eq("cum の昼の往路は k=0..19、復路は 19..0", [cc.slice(0, 20).map(c => c.k).join(), cc.slice(20, 40).map(c => c.k).join()], [Array.from({ length: 20 }, (_, i) => i).join(), Array.from({ length: 20 }, (_, i) => 19 - i).join()]);
eq("cum:k=0 は static 以外すべて skip、k=19 は何も skip しない、static は skip しない", [cc[0].skip.length, cc[19].skip.length, cc.every(c => !c.skip.includes("static")), cc[0].name, cc[3].name, cc[3].skip.includes("haze"), cc[2].skip.includes("haze")], [19, 0, true, "static", "haze", false, true]);
const fake = cc.map(c => ({ cond: c.name, mode: c.night ? "night" : "day", dir: c.dir, k: c.k, mean: 10 + c.k * 2 + (c.dir === "fwd" ? 1 : -1), median: 0, p95: 0, jsMs: 1 }));
const sm = cumSummary(fake);
eq("cumSummary:往復平均と増分", [sm.length, sm[0].meanAvg, sm[5].meanAvg, sm[5].increment, sm[20].mode, sm[20].k], [40, 10, 20, 2, "night", 0]);
if (fail) { console.log(`\n${fail} 件失敗`); process.exit(1); }
