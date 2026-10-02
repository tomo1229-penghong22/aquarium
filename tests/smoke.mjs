// 水槽ページのスモークテスト(ブラウザ不要)
// Canvas と DOM を最小限モックしてグローバルに置き、js/main.js(ES Modules のエントリ)を dynamic import して実行します。
// 内部状態へは、各モジュールの export 経由でアクセスします(本番コードにテスト用の記述はありません)。
// 目的:実行時エラー・NaN・行動の詰まり・体調モデルの退行を早期に見つけること。
// 見た目の確認はブラウザで行ってください(docs/ARCHITECTURE.md「確認手順」)。
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";
import { readFileSync, readdirSync } from "node:fs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

/* ---------------- モック ---------------- */
const noop = () => {};
const grad = { addColorStop: noop };
function mkctx() {
  return new Proxy({}, {
    get(o, k) {
      if (k in o) return o[k];
      if (k === "createLinearGradient" || k === "createRadialGradient" || k === "createConicGradient") return () => grad;
      if (k === "createImageData") return (w, h) => ({ data: new Uint8ClampedArray(w * h * 4) });
      return noop;
    },
    set(o, k, v) { o[k] = v; return true; },
  });
}
function classList() {
  const s = new Set();
  return { add: c => s.add(c), remove: c => s.delete(c), contains: c => s.has(c),
    toggle: (c, v) => ((v ?? !s.has(c)) ? s.add(c) : s.delete(c)) };
}
function mkel(extra = {}) {
  return {
    children: [], style: {}, dataset: { v: "1" }, value: 25, textContent: "", innerHTML: "", title: "",
    classList: classList(), appendChild(c) { this.children.push(c); },
    L: {}, addEventListener(t, f) { (this.L[t] ??= []).push(f); },
    attrs: {}, setAttribute(k, v) { this.attrs[k] = String(v); },
    querySelector: () => null, matches: () => false,
    getBoundingClientRect: () => ({ left: 0, top: 0, right: 304, bottom: 190, width: 304, height: 190 }),
    offsetWidth: 320, offsetHeight: 260, ...extra,
  };
}
const canvases = [];
function mkcanvas() {
  const c = mkel({ width: 0, height: 0, clientWidth: 900, clientHeight: 0, getContext: () => mkctx() });
  c.parentElement = mkel();
  // アイコン(className "ico")のリスナーだけ保持して、テストから発火できるようにする
  c.L = {}; c.addEventListener = (t, f) => { (c.L[t] ??= []).push(f); }; canvases.push(c);
  return c;
}
const ids = {};
let rafQ = [];
let lsLast = null;                 // localStorage.setItem で最後に書かれた値
let vtimers = null, vclock = 0;    // 仮想タイマ(null の間は setTimeout を即時実行する従来の動作)
const sandbox = {
  Path2D: class { moveTo() {} lineTo() {} bezierCurveTo() {} quadraticCurveTo() {} closePath() {} },
  document: {
    getElementById: id => (ids[id] ??= (id === "tank" || id === "popcv") ? mkcanvas() : mkel()),
    createElement: t => {
      if (t === "canvas") return mkcanvas();
      const d = mkel();
      // パネル行の innerHTML 代入後に children[0..2] を参照するため、それらしく用意する
      Object.defineProperty(d, "innerHTML", { set() { d.children = [mkel(), mkel(), mkel()]; }, get() { return ""; } });
      return d;
    },
    querySelectorAll: () => [], L: {}, addEventListener(t, f) { (this.L[t] ??= []).push(f); }, visibilityState: "visible", documentElement: mkel(), fullscreenElement: null,
  },
  window: { devicePixelRatio: 2, addEventListener: noop },
  localStorage: { getItem: () => null, setItem: (k, v) => { lsLast = v; } },
  performance: { now: () => 0 },
  requestAnimationFrame: f => { rafQ.push(f); return rafQ.length; },
  setTimeout: (f, ms) => { if (vtimers) { vtimers.push({ f, at: vclock + (ms || 0), on: true }); return vtimers.length; } f(); return 0; },
  clearTimeout: id => { if (vtimers && vtimers[id - 1]) vtimers[id - 1].on = false; },
  innerWidth: 1280, innerHeight: 800,
};
// モックをグローバルに置いてから、エントリ(js/main.js)を読み込む。読み込み=起動。
for (const [k, v] of Object.entries(sandbox)) Object.defineProperty(globalThis, k, { value: v, writable: true, configurable: true, enumerable: true });
const imp = name => import(pathToFileURL(join(root, "js", name)).href);
await imp("main.js");
const [core, sp, beh, pop, ui] = await Promise.all([imp("core.js"), imp("species.js"), imp("fish-behavior.js"), imp("popup.js"), imp("ui.js")]);
const scene = await imp("scene.js");
const ag = await imp("aging.js");
const A = { fishes: beh.fishes, P: pop.P, SPECIES: sp.SPECIES, ORDER: sp.ORDER, counts: core.counts, syncFish: beh.syncFish,
  popReset: pop.popReset, updatePop: pop.updatePop, drawPop: pop.drawPop, startAct: pop.startAct, setPseudo: ui.setPseudo,
  setT: v => core.setTset(v), getT: () => core.Tw, setTimeScale: v => core.setTimeScale(v), setNight: v => core.setNightOn(v), getNightT: () => core.nightT };

/* ---------------- ヘルパ ---------------- */
let now = 0;
function frames(n) { for (let i = 0; i < n; i++) { now += 1000 / 60; const q = rafQ; rafQ = []; q.forEach(f => f(now)); } }
const finite = () => A.fishes.every(f => Number.isFinite(f.x) && Number.isFinite(f.y) && Number.isFinite(f.health));
let failed = 0;
function check(name, ok, detail = "") {
  console.log(`${ok ? "✓" : "✗"} ${name}${detail ? "  (" + detail + ")" : ""}`);
  if (!ok) failed++;
}

/* ---------------- テスト ---------------- */
frames(300);
check("起動して描画ループが回る", finite(), `魚 ${A.fishes.length} 匹`);

A.ORDER.forEach(sp => { A.counts[sp] = A.SPECIES[sp].max; });
A.syncFish(); frames(120);
check("全種を最大数にしても安定", finite(), `魚 ${A.fishes.length} 匹`);
A.ORDER.forEach(sp => { A.counts[sp] = A.SPECIES[sp].def; });
A.syncFish(); // 以降は既定の数で(テスト時間短縮のため)

A.setT(34); A.setTimeScale(20); frames(60 * 10);
const hotMax = Math.max(...A.fishes.map(f => f.health));
check("34℃で放置するとひどく弱る", Math.abs(A.getT() - 34) < 0.01 && hotMax < 0.2, `最大体調 ${hotMax.toFixed(2)}`);

A.setT(25); frames(60 * 10);
check("適温に戻すと回復する", Math.min(...A.fishes.map(f => f.health)) > 0.9);

A.setT(18); frames(60 * 12);
const coldMin = Math.min(...A.fishes.map(f => f.health));
check("18℃では弱るが下限0.38で止まる", finite() && coldMin >= 0.379 && coldMin < 0.6, `最小体調 ${coldMin.toFixed(2)}`);
A.setT(25); A.setTimeScale(1);

A.setNight(true); frames(120);
check("夜モードへ遷移", A.getNightT() === 1);
A.setNight(false); frames(120);
check("昼モードへ遷移", A.getNightT() === 0);

A.setPseudo(true); frames(10); A.setPseudo(false); frames(10);
check("全画面(代替表示)の切り替え", finite());

const ACTS = ["turn", "food", "bubble", "wiggle", "spin", "startle", "peek", "dash", "showoff", "bow", "wink", "nibble"];
for (const sp of A.ORDER) {
  A.popReset(sp);
  for (const a of ACTS) { A.startAct(a); for (let i = 0; i < 300; i++) { A.updatePop(1 / 60); if (i % 10 === 0) A.drawPop(); } }
  let maxAct = 0;
  for (let i = 0; i < 60 * 90; i++) { A.updatePop(1 / 60); if (A.P.act) maxAct = Math.max(maxAct, A.P.actT); }
  check(`ポップアップが詰まらない:${A.SPECIES[sp].name}`, Number.isFinite(A.P.x) && Number.isFinite(A.P.y) && maxAct < 9.5, `最長アクション ${maxAct.toFixed(1)}秒`);
}
for (const sp of A.ORDER) {
  let ok = 0;
  for (let k = 0; k < 10; k++) {
    A.popReset(sp); A.startAct("food");
    let i = 0; while (A.P.act === "food" && i < 60 * 12) { A.updatePop(1 / 60); i++; }
    if (A.P.d.eaten) ok++;
  }
  check(`餌を食べられる:${A.SPECIES[sp].name}`, ok === 10, `${ok}/10`);
}

{
  // お掃除生体(oto・shrimp・snail):既定・上限、増減、保存と復元
  const NEW = ["oto", "shrimp", "snail"], want = { oto: [3, 10], shrimp: [5, 20], snail: [3, 10] };
  const specOk = NEW.every(k => A.SPECIES[k] && A.SPECIES[k].def === want[k][0] && A.SPECIES[k].max === want[k][1])
    && A.ORDER.slice(-3).join() === NEW.join() && A.ORDER.slice(0, 6).join() === "neon,rummy,guppy,platy,angel,cory";
  check("新しい3種のデータ:既定(3/5/3)・上限(10/20/10)・ORDER の末尾(既存6種の順は不変)", specOk);
  check("パネルの種の一覧が 9 種", A.ORDER.length === 9, `${A.ORDER.length} 種`);
  let err = null;
  try {
    for (const k of NEW) {
      for (const n of [0, 1, A.SPECIES[k].max, 0, A.SPECIES[k].def]) {
        A.counts[k] = n; A.syncFish(); frames(20);
        if (A.fishes.filter(f => f.sp === k).length !== n) throw new Error(`${k} を ${n} にしても数が合わない`);
      }
    }
    A.setT(34); frames(60); A.setT(18); frames(60); A.setT(25);
    if (!finite()) throw new Error("NaN");
  } catch (e) { err = e; }
  check("新しい3種を 0〜上限で増減しても例外なし(水温を変えても安定)", !err, err ? String(err) : "");

  // 保存の復元:core.js をクエリ付きで読み直す(モジュールの再評価)。localStorage を一時的に差し替える
  const origLS = globalThis.localStorage;
  const reload = async (data, tag) => {
    globalThis.localStorage = { getItem: () => data === null ? null : JSON.stringify(data), setItem: noop };
    try { return await import(pathToFileURL(join(root, "js", "core.js")).href + "?" + tag); } finally { globalThis.localStorage = origLS; }
  };
  try {
    const old = await reload({ counts: { neon: 7, rummy: 0, guppy: 5, platy: 3, angel: 2, cory: 4 }, T: 26 }, "old");
    const defOk = NEW.every(k => old.counts[k] === A.SPECIES[k].def) && old.counts.neon === 7;
    check("古い保存データ(新しい種のキーなし)→ 新しい種は既定の数", defOk, NEW.map(k => `${k}=${old.counts[k]}`).join(" "));
    const nw = await reload({ counts: { oto: 7, shrimp: 12, snail: 0, neon: 9 }, T: 25 }, "new");
    check("保存した新しい種の数が再読み込み後に復元される(oto 7 / shrimp 12 / snail 0)", nw.counts.oto === 7 && nw.counts.shrimp === 12 && nw.counts.snail === 0 && nw.counts.neon === 9,
      NEW.map(k => `${k}=${nw.counts[k]}`).join(" "));
    const big = await reload({ counts: { oto: 99, shrimp: -3, snail: "x" } }, "big");
    check("範囲外・不正な保存値は丸める/無視する(oto 99→10、shrimp -3→0、snail 文字列→既定)", big.counts.oto === 10 && big.counts.shrimp === 0 && big.counts.snail === 3,
      NEW.map(k => `${k}=${big.counts[k]}`).join(" "));
    // 実際の保存(save)が新しい種の数を含むこと
    A.counts.shrimp = 8; core.save();
    check("save() の保存データに新しい種の数が入る", JSON.parse(lsLast).counts.shrimp === 8);
    A.counts.shrimp = A.SPECIES.shrimp.def; A.syncFish();
  } catch (e) { check("保存の復元テストが例外なく動く", false, String(e)); }
}

{
  // お掃除生体の動きと描画(N2)
  const cr = await imp("crawlers.js");
  const NEW = ["oto", "shrimp", "snail"], save0 = Object.fromEntries(A.ORDER.map(k => [k, A.counts[k]]));
  const bounds = () => {
    let bad = null, n = 0;
    for (const f of A.fishes) {
      if (!A.SPECIES[f.sp].solo) continue;
      const p = cr.crawlerPos(f); if (!p) continue; n++;
      const ok = Number.isFinite(p.x) && Number.isFinite(p.y) && p.x >= 0 && p.x <= core.W && p.y >= core.waterTop && p.y <= (core.sandY(p.x) + 30 * core.U + 1);
      if (!ok && !bad) bad = `${f.sp} ${p.surf} (${p.x.toFixed(1)}, ${p.y.toFixed(1)}) 水面 ${core.waterTop.toFixed(1)} 砂 ${core.sandY(p.x).toFixed(1)}`;
    }
    return { bad, n };
  };
  for (const k of NEW) A.counts[k] = A.SPECIES[k].max;
  A.syncFish();
  const kinds = new Set(); let badAll = null, nSeen = 0;
  for (let i = 0; i < 60 * 120; i++) { // 2 分(60fps)
    frames(1);
    if (i % 20 === 0) { const b = bounds(); nSeen = Math.max(nSeen, b.n); if (b.bad && !badAll) badAll = b.bad; A.fishes.forEach(f => { if (A.SPECIES[f.sp].solo && f.cr) kinds.add(f.sp + ":" + cr.crawlerPos(f).surf); }); }
  }
  check("お掃除生体(全種最大数)の位置が 2 分間つねに水槽の中(水面より下・砂の下端より上・横は水槽内)", !badAll && nSeen === 40 && finite(), badAll || `${nSeen} 匹 / 面 ${[...kinds].sort().join(" ")}`);
  // 水温・照明・全画面サイズ・低酸素で、更新と描画(全レイヤ)が例外なく呼べる
  let err = null;
  const drawAll = () => ["back", "low", "front", "glass"].forEach(l => cr.drawCrawlers(l));
  try {
    const conds = [[25, false, false, 8], [18, false, false, 8], [34, true, false, 8], [25, false, true, 8], [25, true, false, 0.5], [34, false, true, 1]];
    for (const [T, night, fs, doV] of conds) {
      A.setT(T); A.setNight(night); A.setPseudo(fs); ag.setAgingState({ DO: doV });
      for (let i = 0; i < 400; i++) { frames(1); if (i % 40 === 0) { drawAll(); cr.grazers(); } }
      if (!finite() || bounds().bad) throw new Error(`T=${T} night=${night} fs=${fs} DO=${doV}: ${bounds().bad || "NaN"}`);
    }
    A.setPseudo(false); A.setNight(false); A.setT(25);
    for (const f of A.fishes) if (A.SPECIES[f.sp].solo) f.health = 1;
  } catch (e) { err = e; }
  check("お掃除生体:水温 18/34℃・昼夜・全画面サイズ・低酸素(DO 0.5/1)で更新と描画が例外なし・位置が範囲内", !err, err ? String(err.stack || err) : "");
  // 低酸素・高温でオトは水面近くのガラスへ寄る(寄っていることの確認:平均の高さが通常より上)
  const meanY = sp => { const l = A.fishes.filter(f => f.sp === sp && f.cr).map(f => cr.crawlerPos(f).y); return l.reduce((a, b) => a + b, 0) / l.length; };
  const grazersOk = Array.isArray(cr.grazers()) && cr.grazers().every(g => ["glassF", "hard"].includes(g.kind) && Number.isFinite(g.x) && Number.isFinite(g.y));
  check("お掃除生体:grazers() が前面ガラス(glassF)・岩流木(hard)の位置を返す", grazersOk, `${cr.grazers().length} 件`);
  // 低酸素:DO 固定でしばらく回す。オト・エビは水面側へ寄る(平均 y が通常時より小さい)
  const settle = (doV, n) => { for (let i = 0; i < n; i++) { ag.setAgingState({ DO: doV }); frames(1); } };
  settle(8, 60 * 20); const yOtoN = meanY("oto"), ySrN = meanY("shrimp"), ySnN = meanY("snail");
  settle(0.5, 60 * 45); const yOtoL = meanY("oto"), ySrL = meanY("shrimp"), ySnL = meanY("snail");
  check("低酸素でオト・エビは水面側へ寄る(平均の高さが上がる)。貝は水面へ寄らず、オトより下にいる", yOtoL < yOtoN && ySrL < ySrN && ySnL > yOtoL,
    `オト ${yOtoN.toFixed(0)}→${yOtoL.toFixed(0)} / エビ ${ySrN.toFixed(0)}→${ySrL.toFixed(0)} / 貝 ${ySnN.toFixed(0)}→${ySnL.toFixed(0)}`);
  ag.setAgingState({ DO: 8 });
  // 砂煙:フラグ on で粒が出て、off では出ない(描画命令なし)
  const puffRun = on => {
    scene.FX.puff = false; frames(60 * 3); scene.FX.puff = on; A.counts.cory = 12; A.syncFish(); // 先に既存の粒を消す
    let mx = 0; for (let i = 0; i < 60 * 20; i++) { frames(1); mx = Math.max(mx, scene.puffCount()); }
    scene.FX.puff = true; return mx;
  };
  const pOff = puffRun(false), pOn = puffRun(true);
  check("砂煙:フラグ off では粒が出ず、on ではコリドラスが砂煙の粒を上げる", pOff === 0 && pOn > 0 && scene.FX.puff === true, `off 最大 ${pOff} 粒 / on 最大 ${pOn} 粒`);
  for (const k of A.ORDER) A.counts[k] = save0[k];
  A.syncFish(); frames(30);
}

{
  // sw.js の事前キャッシュのリストに、js/ の全 .js・icons/ の全 PNG・manifest が含まれていること
  const sw = readFileSync(join(root, "sw.js"), "utf8");
  const list = ((sw.match(/PRECACHE\s*=\s*\[([\s\S]*?)\]/) || [])[1] || "").match(/"[^"]+"/g)?.map(s => s.slice(1, -1).replace(/^\.\//, "")) ?? [];
  const need = [...readdirSync(join(root, "js")).filter(f => f.endsWith(".js")).map(f => `js/${f}`),
    ...readdirSync(join(root, "icons")).filter(f => f.endsWith(".png")).map(f => `icons/${f}`), "manifest.webmanifest", "index.html"];
  const missing = need.filter(f => !list.includes(f));
  check("sw.js の事前キャッシュに全ファイルが含まれる", need.length > 0 && missing.length === 0, missing.length ? `不足: ${missing.join(", ")}` : `${need.length} ファイル`);
}

{
  // タップでポップアップが開閉する(click の pointerType に依存しない)
  const ic = canvases.find(c => c.className === "ico" && c.L.click);
  const fire = (t, e) => (ic.L[t] || []).forEach(f => f(e));
  A.P.open = false; A.P.owner = null;
  fire("pointerdown", { pointerType: "touch" }); fire("click", { pointerType: "mouse" });
  const c1 = A.P.open === true;
  fire("pointerdown", { pointerType: "touch" }); fire("click", {});
  const c2 = A.P.open === false;
  fire("pointerdown", { pointerType: "mouse" }); fire("click", { pointerType: "mouse" });
  const c3 = A.P.open === false;
  check("タップでポップアップが開閉する(click の pointerType に依存しない)", !!ic && c1 && c2 && c3, `開く ${c1} / 閉じる ${c2} / マウス無視 ${c3}`);
}

{
  // 24時間計:時針の角度(純粋関数)と描画関数
  const a = (h, m) => scene.clockHourAngle(h, m);
  const near = (x, y) => Math.abs(x - y) < 1e-9;
  check("24時間計の角度:0:00→0 / 6:00→90 / 12:00→180 / 18:00→270 / 6:30→97.5",
    near(a(0, 0), 0) && near(a(6, 0), 90) && near(a(12, 0), 180) && near(a(18, 0), 270) && near(a(6, 30), 97.5),
    `${a(0, 0)} / ${a(6, 0)} / ${a(12, 0)} / ${a(18, 0)} / ${a(6, 30)}`);
  check("24時間計の角度:23:59 は 360 未満で 359 超", a(23, 59) < 360 && a(23, 59) > 359, `${a(23, 59)}`);
  let err = null;
  try { scene.drawClock(); } catch (e) { err = e; }
  check("24時間計の描画関数が例外なく呼べる", !err, err ? String(err) : "");
}

{
  // 酸素メーター:針の角度(純粋関数)・描画関数・毎フレームの命令
  const f = d => scene.o2NeedleAngle(d), near = (x, y) => Math.abs(x - y) < 1e-9;
  check("酸素メーターの針:DO 0→135 / 5→270 / 10→405 / 7.9→348.3 / 範囲外は丸める(-1→135、12→405)",
    near(f(0), 135) && near(f(5), 270) && near(f(10), 405) && near(f(7.9), 348.3) && near(f(-1), 135) && near(f(12), 405),
    `${f(0)} / ${f(5)} / ${f(10)} / ${f(7.9)} / ${f(-1)} / ${f(12)}`);
  const savedDO = ag.DO;
  let err = null;
  for (let d = 0; d <= 10; d += 0.5) { ag.setAgingState({ DO: d }); try { scene.drawO2Meter(); } catch (e) { err = e; } }
  ag.setAgingState({ DO: 25 }); try { scene.drawO2Meter(); } catch (e) { err = e; }
  check("酸素メーターの描画関数が DO 0〜10(と 25)で例外なく呼べる", !err, err ? String(err) : "");
  const g = scene.meterGeom(), c = scene.clockGeom();
  check("酸素メーターの位置:中心は時計の 66U 右・同じ高さ・同じ半径", Math.abs(g.x - c.x - 66 * core.U) < 1e-9 && g.y === c.y && g.r === c.r, `x ${g.x.toFixed(2)} (時計 ${c.x.toFixed(2)} + 66U ${(66 * core.U).toFixed(2)})`);
  const KEYS = ["createLinearGradient", "createRadialGradient", "createConicGradient", "createImageData", "putImageData", "drawImage", "fill", "stroke"];
  const n = Object.fromEntries(KEYS.map(k => [k, 0])), cx = core.ctx;
  for (const k of KEYS) cx[k] = () => { n[k]++; return { addColorStop() {}, data: new Uint8ClampedArray(4) }; };
  ag.setAgingState({ DO: 4 }); let e2 = null; try { scene.drawO2Meter(); } catch (e) { e2 = e; }
  for (const k of KEYS) delete cx[k];
  ag.setAgingState({ DO: savedDO });
  check("酸素メーターの毎フレーム:グラデーション生成・画素計算なし(drawImage 1 回+針の線・点だけ)",
    !e2 && n.createLinearGradient + n.createRadialGradient + n.createConicGradient + n.createImageData + n.putImageData === 0 && n.drawImage === 1,
    `drawImage ${n.drawImage} / stroke ${n.stroke} / fill ${n.fill} / グラデーション生成 ${n.createLinearGradient + n.createRadialGradient + n.createConicGradient}`);
}

{
  // 時計ボタン(時間経過の ON/OFF)・リセットの2段階・照明の自動化
  const fire = (id, t, e = {}) => (ids[id].L[t] || []).forEach(f => f(e));
  const savedOn = () => JSON.parse(lsLast).aging.on;
  const lab = () => ids.clockbtn.attrs["aria-label"];
  ag.restoreAging(null, Date.now()); core.save();
  const on0 = ag.agingOn;
  fire("clockbtn", "click"); const off1 = !ag.agingOn && savedOn() === false && ids.clockbtn.attrs["aria-pressed"] === "false" && lab() === "時間の経過:オフ。押すとオンにします";
  fire("clockbtn", "click"); const on2 = ag.agingOn && savedOn() === true && ids.clockbtn.attrs["aria-pressed"] === "true" && lab() === "時間の経過:オン。押すとオフにします";
  check("時計ボタンのクリックで agingOn が反転し、保存データの aging.on が変わる", on0 && off1 && on2, `既定 ${on0} / 1回目 ${off1} / 2回目 ${on2}`);
  let stopped = false; fire("clockbtn", "dblclick", { stopPropagation() { stopped = true; } });
  check("時計ボタンの dblclick は伝播を止める(全画面にならない)", stopped);
  check("時計ボタンの位置・大きさが設定される(中心 (0.045W, H-46U)、直径 56U)", (() => {
    const g = scene.clockGeom(), st = ids.clockbtn.style;
    return parseFloat(st.width) === 2 * g.r && parseFloat(st.height) === 2 * g.r && Math.abs(parseFloat(st.left) + g.r - core.W * 0.045) < 1e-6 && Math.abs(parseFloat(st.top) + g.r - (core.H - 46 * core.U)) < 1e-6;
  })(), `left ${ids.clockbtn.style.left} top ${ids.clockbtn.style.top} size ${ids.clockbtn.style.width}`);
  let e1 = null; ag.setAgingOn(false); try { scene.drawClock(); } catch (e) { e1 = e; } ag.setAgingOn(true);
  check("24時間計の描画(OFF)が例外なく呼べる", !e1, e1 ? String(e1) : "");

  // リセットの2段階(仮想タイマ)
  vtimers = []; vclock = 0;
  const adv = ms => { vclock += ms; vtimers.filter(t => t.on && t.at <= vclock).forEach(t => { t.on = false; t.f(); }); };
  const OLD = Date.now() - 5 * 86400000;
  ag.setAgingState({ dirt: 0.7, algaeGlass: 0.5, algaeHard: 0.4, clog: 0.6, growth: 0.8, lastClean: OLD, lastFilter: OLD });
  const label0 = "水槽をリセット";
  fire("resetbtn", "click");
  const step1 = ag.dirt === 0.7 && ag.clog === 0.6 && ag.lastClean === OLD && ids.resetbtn.textContent === "もう一度押すとリセット" && ids.resetbtn.attrs["aria-label"] === "もう一度押すと水槽をリセットします";
  adv(3900); const still = ids.resetbtn.textContent === "もう一度押すとリセット";
  adv(200); const back = ids.resetbtn.textContent === label0 && ids.resetbtn.attrs["aria-label"] === "水槽をリセット" && ag.dirt === 0.7;
  check("リセット:1回目は状態不変で文言が変わり、4秒で元に戻る", step1 && still && back, `1回目 ${step1} / 3.9秒 ${still} / 4.1秒 ${back}`);
  const nFish = A.fishes.length, T0 = core.Tset, t1 = Date.now();
  fire("resetbtn", "click"); fire("resetbtn", "click");
  check("リセット:2回目で dirt・clog 等が 0、last* が now(魚の数・水温は不変)",
    ag.dirt === 0 && ag.algaeGlass === 0 && ag.algaeHard === 0 && ag.clog === 0 && ag.growth === 0 && ag.lastClean >= t1 && ag.lastFilter >= t1 && A.fishes.length === nFish && core.Tset === T0 && ids.resetbtn.textContent === label0,
    `dirt ${ag.dirt} clog ${ag.clog} lastClean-now ${ag.lastClean - t1}ms`);
  vtimers = null;

  // 照明の自動化(ui.autoLightTick:前回の段階を覚え、変わったときだけ setNight)
  const jst = (y, m, d, hh, mm) => Date.UTC(y, m, d, hh - 9, mm);
  const st = ag.sunTimes(new Date(2026, 5, 21, 12)); // 6/21(東京)
  const nightNow = () => core.nightOn;
  ag.setAgingOn(true);
  fire("clockbtn", "click"); fire("clockbtn", "click"); // 前回の段階を null に戻す(OFF→ON)
  ui.autoLightTick(jst(2026, 5, 21, 3, 0)); const s1 = nightNow() === true;                 // 起動時:夜を即適用
  A.setNight(false); ui.autoLightTick(jst(2026, 5, 21, 3, 30)); const s2 = nightNow() === false; // 同じ段階 → 手動の昼を保つ
  ui.autoLightTick(st.sunrise + 3600000 - 60000); const s3 = nightNow() === false;            // まだ夜の段階 → 保つ
  A.setNight(true); ui.autoLightTick(st.sunrise + 3600000 + 60000); const s4 = nightNow() === false; // 日の出+1h をまたぐ → 昼
  A.setNight(true); ui.autoLightTick(st.sunset + 1800000 - 60000); const s5 = nightNow() === true;   // 昼の間は apply しない
  A.setNight(false); ui.autoLightTick(st.sunset + 1800000 - 30000); const s6 = nightNow() === false;
  ui.autoLightTick(st.sunset + 1800000 + 60000); const s7 = nightNow() === true;              // 日没+30m をまたぐ → 夜
  check("autoLightTick:起動時に適用/段階が変わるまで手動を保つ/日の出+1h で昼へ/日没+30m で夜へ", s1 && s2 && s3 && s4 && s5 && s6 && s7, [s1, s2, s3, s4, s5, s6, s7].join(","));
  // hidden 中に期日をまたいで visible に戻ると、清掃が実施され案内が出る
  vtimers = [];
  ag.setAgingOn(true); ag.takeNotice(); ids.notice.textContent = ""; ids.notice.classList.remove("show");
  ag.setAgingState({ dirt: 0.6, lastClean: Date.now() - 3 * 86400000, lastFilter: Date.now() });
  document.visibilityState = "visible";
  (document.L.visibilitychange || []).forEach(f => f());
  check("hidden 中に期日をまたいで visible に戻ると清掃が実施され案内が出る", ag.dirt === 0 && Date.now() - ag.lastClean < 5000 && ids.notice.textContent === "留守の間に水替えと水槽の清掃をしました" && ids.notice.classList.contains("show"),
    `dirt ${ag.dirt} 案内「${ids.notice.textContent}」`);
  vtimers = null;
  A.setNight(false); ag.setAgingOn(false);
  ui.autoLightTick(jst(2026, 5, 21, 23, 0)); const offOK = nightNow() === false;
  check("autoLightTick:OFF 中は動かない", offOK);
  ag.setAgingOn(true); A.setNight(false);
}

/* ---------------- A4:低酸素の行動と体調 ---------------- */
{
  const S = A.SPECIES.neon, hyp = v => beh.effectiveZone(S, v);
  const prevT = A.getT();
  A.setT(25); frames(60 * 10); // Tw を 25 に落ち着かせる
  const bz = beh.baseZone(S), z0 = hyp(0), z1 = hyp(1), zh = hyp(0.5), zDef = beh.effectiveZone(S);
  const bMax = Math.max(...A.ORDER.map(k => beh.effectiveZone(A.SPECIES[k], 1)[1]));
  A.setTimeScale(20); A.setT(34); frames(60 * 30);
  const zHot = hyp(0); // 34℃(暑さ最大)での値
  A.setTimeScale(1);
  check("effectiveZone:25℃で hypoxia=0 は種の層を広げたもの(baseZone)と同じ・既定引数は現在の DO、hypoxia=1 は 34℃ と同じ水面寄り",
    Math.abs(core.Tw - 34) < 0.05 && z0[0] === bz[0] && z0[1] === bz[1] && bz[0] < S.zone[0] && bz[1] > S.zone[1] && bz[1] <= 0.95 && zDef[0] === z0[0] && zDef[1] === z0[1]
      && z1[0] === zHot[0] && z1[1] === zHot[1] && z1[0] <= 0.16 && zh[1] < z0[1] && zh[1] > z1[1],
    `hyp0 [${z0.map(v => v.toFixed(3))}] / hyp0.5 [${zh.map(v => v.toFixed(3))}] / hyp1 [${z1.map(v => v.toFixed(3))}] / 全種 hyp1 の下端 最大 ${bMax.toFixed(3)}`);
  const savedDO = ag.DO;
  A.setTimeScale(20); A.setT(25); frames(60 * 10); A.setTimeScale(1); // Tw を 25 に落ち着かせる
  const tw25 = Math.abs(core.Tw - 25) < 0.05;
  const secTo = (doVal, target, maxSec, sp = "neon") => {
    const f = beh.makeFish(sp); f.hardy = 1; ag.setAgingState({ DO: doVal });
    const o = A.SPECIES[sp].opt; let t = 0;
    while (f.health >= target && t < maxSec) { beh.updateHealth(f, 1); t++; }
    return { t, h: f.health, opt: o };
  };
  const hoursAt = (doVal, sec) => { const f = beh.makeFish("neon"); f.hardy = 1; ag.setAgingState({ DO: doVal }); for (let i = 0; i < sec; i++) beh.updateHealth(f, 1); return f.health; };
  const r1 = secTo(1.0, 0.4, 3600), h25 = hoursAt(2.5, 300), h3 = hoursAt(3.0, 300), h45 = hoursAt(7.9, 300);
  check("体調:DO=1.0 で 1.0→0.4 未満まで 2〜5 分", tw25 && r1.t >= 120 && r1.t <= 300, `${(r1.t / 60).toFixed(2)} 分(${r1.t} 秒)`);
  check("体調:DO=2.5 で 5 分後も 0.6 以上", h25 >= 0.6, `5 分後 ${h25.toFixed(3)}`);
  check("体調:DO ≥ 3.0 では変化なし(1.0 のまま。弱った魚は従来どおり回復)", h3 === 1 && h45 === 1 && tw25 && (() => {
    const f = beh.makeFish("neon"); f.hardy = 1; f.health = 0.5; ag.setAgingState({ DO: 3.0 }); beh.updateHealth(f, 10); return Math.abs(f.health - 0.58) < 1e-9;
  })(), `DO3.0→${h3} DO7.9→${h45}`);
  check("体調:DO<3.0 では適温でも回復しない", (() => {
    const f = beh.makeFish("neon"); f.hardy = 1; f.health = 0.5; ag.setAgingState({ DO: 2.9 }); beh.updateHealth(f, 1); return f.health < 0.5;
  })());
  const r0 = secTo(0, 0.05, 3600);
  A.setTimeScale(20); A.setT(34); frames(60 * 30); A.setTimeScale(1);
  const fh = beh.makeFish("neon"); fh.hardy = 1; ag.setAgingState({ DO: 7.9 }); let th = 0; while (fh.health > 0.0401 && th < 3600) { beh.updateHealth(fh, 1); th++; }
  check("体調:DO=0 でも暴走しない(34℃ のネオンと同程度以下の速さ)", r0.t >= th * 0.9 && Math.abs(core.Tw - 34) < 0.05, `DO=0 で 0.04 まで ${r0.t} 秒 / 34℃ ネオン ${th} 秒(Tw ${core.Tw.toFixed(2)})`);
  A.setTimeScale(20); A.setT(prevT); frames(60 * 10); A.setTimeScale(1); ag.setAgingState({ DO: savedDO });
}

/* ---------------- A3:時間経過の見た目(汚れ・苔・水草の成長) ---------------- */
{
  // tank の ctx に呼び出し回数を数える関数を一時的に載せる(モックの Proxy は、載せた関数をそのまま返す)
  const KEYS = ["fill", "stroke", "drawImage", "fillRect", "clip", "arc", "ellipse", "moveTo", "lineTo", "quadraticCurveTo", "bezierCurveTo", "beginPath", "putImageData", "createImageData", "createLinearGradient", "createRadialGradient"];
  const cx = core.ctx;
  const count = fn => {
    const n = Object.fromEntries(KEYS.map(k => [k, 0]));
    for (const k of KEYS) cx[k] = () => { n[k]++; return k.startsWith("create") ? (k === "createImageData" ? { data: new Uint8ClampedArray(4) } : { addColorStop() {} }) : undefined; };
    let err = null; try { fn(); } catch (e) { err = e; }
    for (const k of KEYS) delete cx[k];
    return { n, err, total: Object.values(n).reduce((a, b) => a + b, 0) };
  };
  const ALL = v => ({ dirt: v, algaeGlass: v, algaeHard: v, clog: v, growth: v });
  const sword = scene.plants.mid.find(p => p.type === "sword"), stem = scene.plants.back.find(p => p.type === "stem"), ribbon = scene.plants.back.find(p => p.type === "ribbon");
  const savedAging = ag.serializeAging();

  ag.setAgingState(ALL(0));
  const z = count(() => { scene.drawAgingGlass(); scene.drawAgingHard(); });
  check("A3:全状態 0 では、ガラスの汚れ・苔と岩・流木の苔の描画命令が 1 つも出ない", !z.err && z.total === 0, z.err ? String(z.err) : `命令 ${z.total}`);
  ag.setAgingState(ALL(0.001));
  const z2 = count(() => { scene.drawAgingGlass(); scene.drawAgingHard(); });
  check("A3:0.002 未満の値でも描画命令が出ない", !z2.err && z2.total === 0, `命令 ${z2.total}`);

  ag.setAgingState(ALL(1));
  const warm = count(() => { scene.drawAgingGlass(); scene.drawAgingHard(); }); // 初回はテクスチャを作る
  const glass = count(() => scene.drawAgingGlass()), hard = count(() => scene.drawAgingHard());
  check("A3:全状態 1 で、新しい描画関数が例外なく呼ばれる", !warm.err && !glass.err && !hard.err, warm.err ? String(warm.err) : "");
  check("A3:全状態 1 の毎フレームは drawImage+fillRect だけ(グラデーション生成・画素計算・パス描画なし)",
    glass.n.drawImage === 3 && glass.n.fillRect === 1 && hard.n.drawImage === 3 &&
    ["createLinearGradient", "createRadialGradient", "createImageData", "putImageData", "arc", "ellipse", "lineTo", "fill", "stroke"].every(k => glass.n[k] === 0 && hard.n[k] === 0),
    `ガラス drawImage ${glass.n.drawImage} + fillRect ${glass.n.fillRect} / 岩・流木 drawImage ${hard.n.drawImage}(全部で ${glass.total + hard.total} 命令)`);

  const rot = { g0: null, g1: null };
  ag.setAgingState({ growth: 0 }); rot.g0 = count(() => scene.drawStem(stem, 1));
  ag.setAgingState({ growth: 1 }); rot.g1 = count(() => scene.drawStem(stem, 1));
  const rb0 = (ag.setAgingState({ growth: 0 }), count(() => scene.drawRibbon(ribbon, 1))), rb1 = (ag.setAgingState({ growth: 1 }), count(() => scene.drawRibbon(ribbon, 1)));
  check("A3:growth=1 でロタラは節と葉が増え(背が伸びる)、バリスネリアも例外なく描ける", !rot.g1.err && !rb1.err && rot.g1.n.ellipse > rot.g0.n.ellipse && rb1.total > 0,
    `ロタラの葉 ${rot.g0.n.ellipse / 2}→${rot.g1.n.ellipse / 2} 枚ずつ(左右)`);
  const fl0 = (ag.setAgingState({ growth: 0 }), count(() => scene.drawFloats(1))), fl1 = (ag.setAgingState({ growth: 1 }), count(() => scene.drawFloats(1)));
  check("A3:growth=1 で浮草の葉が約 1.5〜1.7 倍(葉 1 枚 = ellipse 3 回)", !fl1.err && fl1.n.ellipse > fl0.n.ellipse * 1.4 && fl1.n.ellipse < fl0.n.ellipse * 1.75, `ellipse ${fl0.n.ellipse}→${fl1.n.ellipse}(${(fl1.n.ellipse / fl0.n.ellipse).toFixed(2)} 倍)`);
  ag.setAgingState({ ...ALL(0) }); const sw0 = count(() => scene.drawSword(sword, 1));
  ag.setAgingState({ clog: 1, algaeHard: 1 }); const sw1 = count(() => scene.drawSword(sword, 1));
  check("A3:アマゾンソードは clog と algaeHard で例外なく描け、縁の点(arc)が出る(0 のときは arc なし)", !sw1.err && sw0.n.arc === 0 && sw1.n.arc > 0, `arc ${sw0.n.arc}→${sw1.n.arc}`);
  ag.setAgingState({ ...ALL(1), growth: 1 });
  const allErr = count(() => { scene.plants.back.forEach(p => p.type === "ribbon" ? scene.drawRibbon(p, 2) : scene.drawStem(p, 2)); scene.plants.mid.forEach(p => p.type === "sword" ? scene.drawSword(p, 2) : null); scene.drawFloats(2); }).err;
  check("A3:全状態 1 で全水草(後景・中景・浮草)が例外なく描ける", !allErr, allErr ? String(allErr) : "");
  // resize(全画面の代替表示の切り替え)でテクスチャを作り直しても、全状態 1 で描ける
  A.setPseudo(true); frames(10); A.setPseudo(false); frames(10);
  const afterResize = count(() => { scene.drawAgingGlass(); scene.drawAgingHard(); });
  check("A3:resize の後も全状態 1 で描ける", !afterResize.err && afterResize.n.drawImage === 6, `drawImage ${afterResize.n.drawImage}`);
  ag.restoreAging(null, Date.now()); ag.setAgingState({ dirt: savedAging.dirt, algaeHard: savedAging.algaeHard, clog: savedAging.clog, growth: savedAging.growth });
}

/* ---------------- 時間経過の dt(実経過秒) ---------------- */
{
  const step = ms => { now += ms; const q = rafQ; rafQ = []; q.forEach(f => f(now)); };
  ag.restoreAging(null, Date.now()); ag.setAgingOn(true); frames(2);
  const s0 = ag.sinceClean;
  for (let i = 0; i < 50; i++) step(200);
  const s1 = ag.sinceClean;
  step(30000);
  const s2 = ag.sinceClean;
  check("時間経過の dt:フレーム間隔 0.2 秒で 10 秒ぶん回すと 10 秒ぶん進む", Math.abs(s1 - s0 - 10) < 1e-6, `${(s1 - s0).toFixed(3)} 秒`);
  check("時間経過の dt:間隔 30 秒の 1 回は 1 秒ぶんしか進まない(非表示の間を数えない)", Math.abs(s2 - s1 - 1) < 1e-6, `${(s2 - s1).toFixed(3)} 秒`);
  ag.restoreAging(null, Date.now());
}

{
  // なめた跡(N4)と、性能による切り替え(governor.js)
  const gov = await imp("governor.js"), crw = await imp("crawlers.js");
  const save0 = Object.fromEntries(A.ORDER.map(k => [k, A.counts[k]]));
  for (const k of ["oto", "shrimp", "snail"]) A.counts[k] = A.SPECIES[k].def;
  A.syncFish(); frames(5);
  const place = () => { // 貝・オトを前面ガラスに、エビを岩の上でつまんでいる状態に置く(位置は固定)
    A.fishes.forEach(f => {
      if (!f.cr) return;
      if (f.sp === "snail" || f.sp === "oto") { Object.assign(f.cr, { surf: "gF", fx: 0.3 + Math.random() * 0.4, fy: 0.4 + Math.random() * 0.2, fph: null, fade: 1, st: f.sp === "oto" ? "stick" : "rest", t: 1e6, gz: 1, gt: 1e6 }); }
      if (f.sp === "shrimp") Object.assign(f.cr, { surf: "rock", id: 0, s: 0.5, st: "pick", t: 1e6, fph: null });
    });
  };
  const TS = scene.trailState;
  gov.govReset(); ag.setAgingOn(true);
  ag.setAgingState({ dirt: 0.3, algaeGlass: 1, algaeHard: 1 }); // ?aging=algaeGlass:1,algaeHard:1 相当
  place(); frames(60 * 3);
  let st = TS(), err = null;
  try { ["back", "low", "front", "glass"].forEach(l => crw.drawCrawlers(l)); scene.drawAgingGlass(); scene.drawAgingHard(); } catch (e) { err = e; }
  check("なめた跡:?aging=algaeGlass:1,algaeHard:1 相当+前面ガラスの貝・オト・岩の上のエビで、書き足しと描画が例外なし(跡あり版が作られる)",
    !err && st.stamps > 0 && st.glass && st.hard && st.cached && st.rebuilds > 0, err ? String(err) : `書き足し ${st.stamps} 回 / 作り直し ${st.rebuilds} 回`);
  check("なめた跡:マスクの大きさは水槽の 1/4(切り上げ)", st.mw === Math.ceil(core.W / scene.TRAIL.ms) && st.mh === Math.ceil(core.H / scene.TRAIL.ms), `${st.mw}x${st.mh}(水槽 ${core.W}x${core.H})`);
  check("なめた跡:苔の量(algaeGlass・algaeHard)は跡によって変わらない", ag.algaeGlass === 1 && ag.algaeHard === 1 && ag.dirt >= 0.3);
  // 戻り:時間経過オンで世代が進み、オフでは進まない
  const tot0 = scene.trailProgress(); frames(60 * 5); const totOn = scene.trailProgress() - tot0;
  ag.setAgingOn(false); const tot1 = scene.trailProgress(); frames(60 * 5); const totOff = scene.trailProgress() - tot1; ag.setAgingOn(true);
  check("なめた跡:時間経過オンの間だけ苔の増える速さで戻る(オフの間は進まない)", totOn > 0 && totOff === 0, `5 秒で世代 +${totOn.toExponential(2)}(オン)/ +${totOff}(オフ)`);
  // 全世代が過ぎれば跡は消え、元のテクスチャに戻る(life を極端に短くして確認。なめるのをやめさせる)
  const life0 = scene.TRAIL.life; scene.TRAIL.life = 4e-5;
  A.fishes.forEach(f => { if (f.cr && (f.sp === "snail" || f.sp === "oto")) Object.assign(f.cr, { surf: "sand", st: "rest", t: 1e6, fph: null }); if (f.cr && f.sp === "shrimp") Object.assign(f.cr, { surf: "sand", st: "rest", t: 1e6 }); });
  frames(60 * 12); st = TS(); scene.TRAIL.life = life0;
  check("なめた跡:なめるのをやめて全世代が過ぎると跡が消え、作り置きも捨てられる", !st.glass && !st.hard && !st.cached, JSON.stringify(st));
  // 清掃で消える
  place(); frames(60 * 2); const before = TS();
  ag.setAgingState({ lastClean: 0, algaeGlass: 1 }); ag.checkMaintenance(Date.now()); frames(2); st = TS();
  check("なめた跡:清掃(メンテ)で跡が全部消える(ガラスの苔が 0 になるので新しい跡も付かない)", before.glass && !st.glass && ag.algaeGlass === 0, `前 ${before.glass} → 後 ${st.glass}`);
  // resize で消え、マスクが新しい大きさで作り直される
  ag.setAgingState({ algaeGlass: 1, algaeHard: 1 }); place(); frames(60 * 2);
  const b2 = TS(); A.setPseudo(true); frames(2); place(); frames(60 * 2); const r1 = TS(); A.setPseudo(false); frames(2);
  check("なめた跡:resize でマスクが捨てられて作り直され(世代番号が変わる)、大きさが水槽に追従する", b2.glass && r1.id > b2.id && r1.mw === Math.ceil(core.W / scene.TRAIL.ms) && r1.mh === Math.ceil(core.H / scene.TRAIL.ms), `番号 ${b2.id}→${r1.id} / ${b2.mw}x${b2.mh} → ${r1.mw}x${r1.mh}(水槽 ${core.W}x${core.H})`);
  frames(60);

  // 性能による切り替え:測定値を GOV.override で与える
  const modeSeq = (ms, n) => { gov.GOV.override = ms; const seq = []; for (let i = 0; i < n; i++) { frames(1); seq.push(gov.govState().mode); } return seq; };
  const firstIdx = (seq, m) => seq.indexOf(m);
  ag.setAgingState({ algaeGlass: 0.7, algaeHard: 0.4 }); ag.setAgingOn(false); // 苔の量が切り替えの前後で同じことを見るため、時間経過を止める
  place(); const g0 = ag.algaeGlass, h0 = ag.algaeHard;
  gov.govReset();
  const seq = modeSeq(5, 60 * 9);
  const iFade = firstIdx(seq, "fading"), iOff = firstIdx(seq, "off");
  check("切り替え:最初の 3 秒は 2.5ms 超を与えても判定しない(on のまま)", iFade >= 60 * 3, `fading になったのは ${iFade} フレーム目(= ${(iFade / 60).toFixed(1)} 秒)`);
  check("切り替え:超え続けると、3 秒の平均が超えた時点で fading になり、約 1 秒で off になる", iFade > 0 && iOff > iFade && Math.abs((iOff - iFade) / 60 - gov.GOV.fadeSec) < 0.1, `fading ${(iFade / 60).toFixed(2)} 秒 → off ${(iOff / 60).toFixed(2)} 秒(差 ${((iOff - iFade) / 60).toFixed(2)} 秒)`);
  st = TS();
  check("切り替え:off になると跡の表現が消える(マスク・作り置きなし)", gov.govState().mode === "off" && st.mw === 0 && !st.glass && !st.hard && !st.cached && gov.trailStrength() === 0, JSON.stringify(st));
  check("切り替え:切り替えの前後で苔の量(algaeGlass・algaeHard)が同じ", ag.algaeGlass === g0 && ag.algaeHard === h0, `glass ${g0}→${ag.algaeGlass} / hard ${h0}→${ag.algaeHard}`);
  const seq2 = modeSeq(1.0, 60 * 6);
  check("切り替え:以後 1.0ms を与えても戻らない(そのセッションの間は off)", seq2.every(m => m === "off") && TS().mw === 0);
  // タブが hidden の間は判定しない。表示に戻った直後の 3 秒も判定しない
  gov.govReset(); document.visibilityState = "hidden";
  const seqH = modeSeq(5, 60 * 10);
  document.visibilityState = "visible"; (document.L.visibilitychange || []).forEach(f => f());
  const seqV = modeSeq(5, 60 * 9);
  const iV = firstIdx(seqV, "fading");
  check("切り替え:hidden の間は判定しない(10 秒間 5ms を与えても on)", seqH.every(m => m === "on"));
  check("切り替え:表示に戻った直後の 3 秒は判定しない(その後の 3 秒平均で fading)", iV >= 60 * 3 && iV < 60 * 9, `fading は ${(iV / 60).toFixed(1)} 秒後`);
  gov.govReset(); gov.GOV.override = null; ag.setAgingOn(true);
  A.fishes.forEach(f => { if (f.cr) f.cr.t = 0; });
  for (const k of A.ORDER) A.counts[k] = save0[k];
  A.syncFish(); frames(30);
}

console.log(failed ? `\n${failed} 件失敗` : "\nすべて成功");
process.exit(failed ? 1 : 0);
