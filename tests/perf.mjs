// ?perf&skip= / ?perf&bench の URL 解析と、bench の条件一覧の確認(ブラウザ不要)。npm test に含む。
import { LAYERS, SPECIAL, parsePerfParams, benchConditions, PERF, skipOn, dprCap } from "../js/perf.js";
let fail = 0;
const eq = (name, a, b) => { const ok = JSON.stringify(a) === JSON.stringify(b); if (!ok) fail++; console.log(`${ok ? "✓" : "✗"} ${name}${ok ? "" : `  実際 ${JSON.stringify(a)} / 期待 ${JSON.stringify(b)}`}`); };
eq("?perf なし:何も有効にならない(skip を付けても無視)", parsePerfParams("?skip=grade"), { perf: false, bench: false, skip: [], unknown: [] });
eq("?perf のみ", parsePerfParams("?perf"), { perf: true, bench: false, skip: [], unknown: [] });
eq("?perf&skip=a,b", parsePerfParams("?perf&skip=grade,caustics"), { perf: true, bench: false, skip: ["grade", "caustics"], unknown: [] });
eq("特別な名前と順不同・重複・空白・空要素", parsePerfParams("?x=1&skip=dpr1, shadow,,gradeDay,dpr1&perf"), { perf: true, bench: false, skip: ["dpr1", "shadow", "gradeDay"], unknown: [] });
eq("未知の名前は unknown(大文字小文字を区別)", parsePerfParams("?perf&skip=Grade,nope,led"), { perf: true, bench: false, skip: ["led"], unknown: ["Grade", "nope"] });
eq("URL エンコード(%2C)", parsePerfParams("?perf&skip=rays%2Cmotes"), { perf: true, bench: false, skip: ["rays", "motes"], unknown: [] });
eq("?perf&bench", parsePerfParams("?perf&bench"), { perf: true, bench: true, skip: [], unknown: [] });
eq("?bench だけ(perf なし)は無効", parsePerfParams("?bench").bench, false);
eq("?perfx は perf と見なさない", parsePerfParams("?perfx&skip=grade").perf, false);
eq("全層名がすべて受理される", parsePerfParams("?perf&skip=" + [...LAYERS, ...SPECIAL].join(",")).skip.length, LAYERS.length + SPECIAL.length);
eq("perf.js 読み込み時(location なし):PERF=false・skipOn=false・dprCap=2", [PERF, skipOn("grade"), dprCap()], [false, false, 2]);
const c = benchConditions();
eq("bench の条件数(昼夜 × (基準 1 + 層 20 + 特別 5 + 下限 1))", c.length, 2 * (1 + LAYERS.length + SPECIAL.length + 1));
eq("bench 先頭は昼の基準・最後は夜の static 以外すべて", [c[0].name, c[0].night, c.at(-1).name, c.at(-1).night, c.at(-1).skip.includes("static"), c.at(-1).skip.length], ["base", false, "allButStatic", true, false, LAYERS.length - 1]);
if (fail) { console.log(`\n${fail} 件失敗`); process.exit(1); }
