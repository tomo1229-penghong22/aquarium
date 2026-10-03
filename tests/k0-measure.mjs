// issue #7 K0:魚の「急に消える」「回転せずに反転する」の変更前の挙動の計測(コードは変えない。npm test には未組み込み)
// 使い方: node tests/k0-measure.mjs [--minutes=5] [--seeds=1,2,3]     (親:def/max × 各シードを子プロセスで走らせて表にする)
//         node tests/k0-measure.mjs --child --cfg=def|max --seed=N --minutes=5   (子:JSON を 1 行で出力)
// AQUARIUM_JS_ROOT で別の版の js/ を対象にできる(K1・K2 の前後比較用)。
// 計測:smoke.mjs と同じモックで js/main.js を読み込み、Math.random をシード固定にして、dt=1/60 で minutes 分進める。
//  (a) z が 0.45 をまたいだ回数と、そのときの魚の外接と物(流木・岩・中景の草)の重なり
//  (b) 反転(flip の符号変化)の所要時間・途中停止・逆戻り
//  (c) |flip|<0.3 の区間
//  (d) NaN・画面外・描画されなかったフレーム
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";
import { spawn } from "node:child_process";

const args = Object.fromEntries(process.argv.slice(2).map(a => { const m = a.match(/^--([^=]+)(?:=(.*))?$/); return [m[1], m[2] ?? true]; }));
const SELF = fileURLToPath(import.meta.url);
const root = join(dirname(SELF), "..");
const MINUTES = Number(args.minutes ?? 5);


/* ================= 親:子を走らせて集計 ================= */
async function parent() {
  const seeds = String(args.seeds ?? "1,2,3").split(",").map(Number);
  if (args.from) { // --from=保存した --json の出力 を表にする(--check なら判定も)
    const { readFileSync } = await import("node:fs"); const rs = JSON.parse(readFileSync(args.from, "utf8")); report(rs, seeds);
    if (args.check) { const bad = check(rs); console.log(bad.length ? "\n✗ 基準 B を満たさない項目 " + bad.length + " 件:\n  " + bad.join("\n  ") : "\n✓ 基準 B(K1・K2)の全項目を満たす"); process.exit(bad.length ? 1 : 0); }
    return;
  }
  const jobs = [];
  for (const cfg of ["def", "max"]) for (const seed of seeds) jobs.push(new Promise((res, rej) => {
    const p = spawn(process.execPath, [SELF, "--child", `--cfg=${cfg}`, `--seed=${seed}`, `--minutes=${MINUTES}`], { stdio: ["ignore", "pipe", "inherit"] });
    let out = ""; p.stdout.on("data", d => out += d); p.on("close", c => c ? rej(new Error("child " + c)) : res(JSON.parse(out.trim().split("\n").pop())));
  }));
  const rs = await Promise.all(jobs);
  if (args.json) { console.log(JSON.stringify(rs)); return; }
  report(rs, seeds);
  if (args.check) {
    const bad = check(rs);
    console.log(bad.length ? "\n✗ 基準 B を満たさない項目 " + bad.length + " 件:\n  " + bad.join("\n  ") : "\n✓ 基準 B(K1・K2)の全項目を満たす");
    process.exit(bad.length ? 1 : 0);
  }
}
/* 基準 B(PLAN.md):--check で判定。重なった状態での層の入れ替え 0・途中停止/逆戻り 0・横幅 30% 未満が 0.4 秒超の区間 0・反転の所要時間 0.6〜1.0 秒・NaN/画面外/描画なし 0 */
function check(rs) {
  const bad = [];
  for (const r of rs) for (const s of SP) {
    const a = r.sp[s], tag = `${r.cfg} seed${r.seed} ${s}`;
    if (a.ovLoosePoly) bad.push(`${tag}: 外接(FISH_R)が輪郭と重なった層の入れ替え ${a.ovLoosePoly} 回`);
    if (a.stall || a.backNoCross || a.backCross) bad.push(`${tag}: 途中停止 ${a.stall}・逆戻り ${a.backNoCross + a.backCross}`);
    if (a.thinGt04) bad.push(`${tag}: 横幅 30% 未満が 0.4 秒超 ${a.thinGt04} 回`);
    if (a.revDur.some(d => d < 0.6 - 1e-9 || d > 1.0 + 1e-9)) bad.push(`${tag}: 反転の所要時間が範囲外 ${Math.min(...a.revDur).toFixed(2)}〜${Math.max(...a.revDur).toFixed(2)}`);
    if (a.nan || a.off || a.notDrawn || a.widthMismatch) bad.push(`${tag}: NaN ${a.nan}・画面外 ${a.off}・未描画 ${a.notDrawn}・幅の食い違い ${a.widthMismatch}`);
  }
  return bad;
}
const SP = ["neon", "rummy", "guppy", "platy", "angel", "cory"];
const sum = a => a.reduce((x, y) => x + y, 0);
const f1 = v => Number.isFinite(v) ? (Math.abs(v) >= 100 ? v.toFixed(0) : v.toFixed(2)) : "-";
const q = (a, p) => { if (!a.length) return NaN; const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p * (s.length - 1) + 0.5))]; };
function report(rs, seeds) {
  for (const cfg of ["def", "max"]) {
    const R = rs.filter(r => r.cfg === cfg);
    console.log(`\n## 構成 ${cfg === "def" ? "既定の数" : "全種最大数"}(${MINUTES} 分 × シード ${seeds.join(",")}。W=${R[0].W} U=${R[0].U.toFixed(3)} 水槽の魚 ${JSON.stringify(R[0].n)})`);
    const row = (title, fn) => { console.log(`| ${title} | ` + SP.map(s => (R[0].n[s] ? fn(s) : "-")).join(" | ") + " |"); };
    console.log("| 指標 | " + SP.join(" | ") + " |\n|---|" + SP.map(() => "---").join("|") + "|");
    const per = (s, k) => R.map(r => r.sp[s][k]);
    const mean = (s, k) => { const a = per(s, k); return `${f1(sum(a) / a.length)} [${f1(Math.min(...a))}–${f1(Math.max(...a))}]`; };
    row("魚の数", s => R[0].n[s]);
    row("(a) z が 0.45 をまたいだ回数(平均 [幅])", s => mean(s, "cross"));
    row("(a)   うち 奥→手前(急に現れる側)", s => mean(s, "crossFwd"));
    row("(a)   うち 手前→奥(急に隠れる側)", s => mean(s, "crossBack"));
    row("(a) 重なり:外接 大(L×FISH_R の正方形)× 物の外接箱", s => mean(s, "ovLooseBox"));
    row("(a) 重なり:外接 小(±0.5L×±0.25L)× 物の外接箱", s => mean(s, "ovTightBox"));
    row("(a) 重なり:外接 小 × 物の輪郭(多角形)", s => mean(s, "ovTightPoly"));
    row("(a) 重なり:外接 大(FISH_R の正方形)× 物の輪郭(多角形)【K1 の基準】", s => mean(s, "ovLoosePoly"));
    row("(a) 重なり(輪郭)かつ 手前→奥(その場で隠れる側)", s => mean(s, "ovTightPolyBack"));
    row("(a) 参考:z<0.45 の間に物の輪郭の内側へ中心がある時間の割合 %", s => `${f1(100 * sum(per(s, "behindFrames")) / Math.max(1, sum(per(s, "zBackFrames"))))}`);
    row("(b) 反転の回数(完了)", s => mean(s, "rev"));
    const dur = s => R.flatMap(r => r.sp[s].revDur);
    row("(b) 反転の所要時間 秒 最小/中央/p95/最大", s => { const d = dur(s); return d.length ? [Math.min(...d), q(d, .5), q(d, .95), Math.max(...d)].map(v => v.toFixed(2)).join(" / ") : "-"; });
    row("(b) 途中停止(|flip|<0.9 で 0.3 秒以上 flip 不変)の回数", s => mean(s, "stall"));
    row("(b) 逆戻り:ゼロを越える前に元へ", s => mean(s, "backNoCross"));
    row("(b) 逆戻り:ゼロを越えたあと元へ", s => mean(s, "backCross"));
    row("(b) 反転の開始時に |vx|≤4U だった回数(開始=|flip|<0.9)", s => mean(s, "revStartSlow"));
    row("(c) |flip|<0.3 の区間の回数", s => mean(s, "thinRuns"));
    row("(c)   合計時間 秒", s => mean(s, "thinSec"));
    row("(c)   最長 秒(全シード最大)", s => f1(Math.max(...per(s, "thinMax"))));
    const th = s => R.flatMap(r => r.sp[s].thinDur);
    row("(c)   区間長 中央/p95 秒", s => { const d = th(s); return d.length ? `${q(d, .5).toFixed(2)} / ${q(d, .95).toFixed(2)}` : "-"; });
    row("(c)   区間長が 0.3 秒超の回数", s => mean(s, "thinGt03"));
    row("(c)   区間長が 0.4 秒超の回数【基準】", s => mean(s, "thinGt04"));
    row("(c)   区間長が 1 秒超の回数", s => mean(s, "thinGt1"));
    row("(c)   区間中に |vx|≤4U だった時間の割合 %", s => f1(100 * sum(per(s, "thinSlowSec")) / Math.max(1e-9, sum(per(s, "thinSec")))));
    row("(c)   区間中の |vx| 平均(U 単位)", s => f1(sum(per(s, "thinVxSum")) / Math.max(1, sum(per(s, "thinFrames")))));
    row("(c)   長い区間(>0.3 秒)の終端の |vx| 中央(U 単位)", s => { const a = R.flatMap(r => r.sp[s].thinLongVx); return a.length ? f1(q(a, .5)) : "-"; });
    row("(c)   描画幅 0.1(下限)に張りついたフレーム数", s => mean(s, "w01Frames"));
    row("(d) NaN のフレーム数", s => mean(s, "nan"));
    row("(d) 画面外(x が 0〜W、y が水面〜H の外)のフレーム数", s => mean(s, "off"));
    row("(d) drawFish が呼ばれなかった魚フレーム数", s => mean(s, "notDrawn"));
    row("(d) 描画幅と max(0.1,|flip|) が食い違ったフレーム数", s => mean(s, "widthMismatch"));
    row("(d) 魚どうしの中心が L×0.15 未満(完全に重なる)フレーム数", s => mean(s, "stack"));
    const st = R[0].sp.cory.thinState;
    if (R[0].n.cory) console.log(`(c) コリドラスの |flip|<0.3 のフレームの状態内訳(全シード合計): ${JSON.stringify(R.reduce((o, r) => { for (const [k, v] of Object.entries(r.sp.cory.thinState)) o[k] = (o[k] || 0) + v; return o; }, {}))}`);
  }
  const r0 = rs[0];
  console.log(`\n物の外接(${r0.obst.n} 多角形。奥の水草・前景・浮草は対象外):流木の枝 ${r0.obst.wood}、岩 ${r0.obst.rock}、中景の草(アマゾンソード・ロータス・シダ) ${r0.obst.mid}。`);
}

/* ================= 子:1 構成・1 シードの計測 ================= */
async function child() {
  const cfg = args.cfg, seed = Number(args.seed);
  // シード固定(mulberry32)
  { let s = seed | 0; Math.random = () => { s = s + 0x6D2B79F5 | 0; let t = Math.imul(s ^ s >>> 15, 1 | s); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

  /* ---- モック(tests/smoke.mjs と同じ作り) ---- */
  const noop = () => {}, grad = { addColorStop: noop };
  const mkctx = () => new Proxy({}, { get(o, k) { if (k in o) return o[k]; if (k === "createLinearGradient" || k === "createRadialGradient" || k === "createConicGradient") return () => grad; if (k === "createImageData") return (w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }); return noop; }, set(o, k, v) { o[k] = v; return true; } });
  const classList = () => { const s = new Set(); return { add: c => s.add(c), remove: c => s.delete(c), contains: c => s.has(c), toggle: (c, v) => ((v ?? !s.has(c)) ? s.add(c) : s.delete(c)) }; };
  const mkel = (extra = {}) => ({ children: [], style: {}, dataset: { v: "1" }, value: 25, textContent: "", innerHTML: "", title: "", classList: classList(), appendChild(c) { this.children.push(c); }, L: {}, addEventListener(t, f) { (this.L[t] ??= []).push(f); }, attrs: {}, setAttribute(k, v) { this.attrs[k] = String(v); }, querySelector: () => null, matches: () => false, getBoundingClientRect: () => ({ left: 0, top: 0, right: 304, bottom: 190, width: 304, height: 190 }), offsetWidth: 320, offsetHeight: 260, ...extra });
  const mkcanvas = () => { const c = mkel({ width: 0, height: 0, clientWidth: 900, clientHeight: 0, getContext: () => mkctx() }); c.parentElement = mkel(); c.L = {}; c.addEventListener = (t, f) => { (c.L[t] ??= []).push(f); }; return c; };
  const ids = {}; let rafQ = [];
  const sandbox = {
    Path2D: class { moveTo() {} lineTo() {} bezierCurveTo() {} quadraticCurveTo() {} closePath() {} },
    document: { getElementById: id => (ids[id] ??= (id === "tank" || id === "popcv") ? mkcanvas() : mkel()),
      createElement: t => { if (t === "canvas") return mkcanvas(); const d = mkel(); Object.defineProperty(d, "innerHTML", { set() { d.children = [mkel(), mkel(), mkel()]; }, get() { return ""; } }); return d; },
      querySelectorAll: () => [], L: {}, addEventListener(t, f) { (this.L[t] ??= []).push(f); }, visibilityState: "visible", documentElement: mkel(), fullscreenElement: null },
    window: { devicePixelRatio: 2, addEventListener: noop }, localStorage: { getItem: () => null, setItem: noop }, performance: { now: () => 0 },
    requestAnimationFrame: f => { rafQ.push(f); return rafQ.length; }, setTimeout: (f) => { f(); return 0; }, clearTimeout: noop, innerWidth: 1280, innerHeight: 800,
  };
  for (const [k, v] of Object.entries(sandbox)) Object.defineProperty(globalThis, k, { value: v, writable: true, configurable: true, enumerable: true });
  const JSROOT = process.env.AQUARIUM_JS_ROOT || root;
  const imp = n => import(pathToFileURL(join(JSROOT, "js", n)).href);
  await imp("main.js");
  const [core, species, beh, scene, fr] = await Promise.all([imp("core.js"), imp("species.js"), imp("fish-behavior.js"), imp("scene.js"), imp("fish-render.js")]);
  const { SPECIES, ORDER } = species;
  let now = 0;
  const frame = () => { now += 1000 / 60; const q = rafQ; rafQ = []; q.forEach(f => f(now)); };

  /* ---- 物の外接(drawWood / drawRock / drawSword / drawFern / drawLotus を記録用 ctx で実際に呼び、塗られた多角形を集める) ---- */
  const polys = []; // { kind, pts:[[x,y]..], bb:[x0,y0,x1,y1] }
  {
    const origCtx = core.ctx;
    let m = [1, 0, 0, 1, 0, 0]; const stack = [];
    const tp = (x, y) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
    class PathRec {
      constructor(tf) { this.tf = tf; this.subs = []; }
      add(x, y) { const p = this.tf ? this.tf(x, y) : [x, y]; (this.subs.at(-1) ?? (this.subs.push([]), this.subs.at(-1))).push(p); this.last = [x, y]; }
      moveTo(x, y) { this.subs.push([]); this.add(x, y); }
      lineTo(x, y) { this.add(x, y); }
      bezierCurveTo(a, b, c, d, e, f) { const [x0, y0] = this.last ?? [a, b]; for (let i = 1; i <= 8; i++) { const t = i / 8, u = 1 - t; this.add(u * u * u * x0 + 3 * u * u * t * a + 3 * u * t * t * c + t * t * t * e, u * u * u * y0 + 3 * u * u * t * b + 3 * u * t * t * d + t * t * t * f); } }
      quadraticCurveTo(a, b, c, d) { const [x0, y0] = this.last ?? [a, b]; for (let i = 1; i <= 8; i++) { const t = i / 8, u = 1 - t; this.add(u * u * x0 + 2 * u * t * a + t * t * c, u * u * y0 + 2 * u * t * b + t * t * d); } }
      arc(x, y, r, a0, a1) { this.subs.push([]); for (let i = 0; i <= 12; i++) { const a = a0 + (a1 - a0) * i / 12; this.add(x + Math.cos(a) * r, y + Math.sin(a) * r); } }
      ellipse(x, y, rx, ry, rot, a0, a1) { this.subs.push([]); for (let i = 0; i <= 12; i++) { const a = a0 + (a1 - a0) * i / 12, ex = Math.cos(a) * rx, ey = Math.sin(a) * ry; this.add(x + ex * Math.cos(rot) - ey * Math.sin(rot), y + ex * Math.sin(rot) + ey * Math.cos(rot)); } }
      rect(x, y, w, h) { this.subs.push([]); this.add(x, y); this.add(x + w, y); this.add(x + w, y + h); this.add(x, y + h); }
      closePath() {}
    }
    let cur = new PathRec(tp), kind = "";
    const emit = p => { for (const s of p.subs) { if (s.length < 3) continue; const pts = s.map(([x, y]) => (p.tf ? [x, y] : tp(x, y))); let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9; for (const [x, y] of pts) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); } polys.push({ kind, pts, bb: [x0, y0, x1, y1] }); } };
    const rec = {
      save() { stack.push(m.slice()); }, restore() { m = stack.pop() ?? m; },
      translate(x, y) { m = [m[0], m[1], m[2], m[3], m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]]; },
      rotate(a) { const c = Math.cos(a), s = Math.sin(a); m = [m[0] * c + m[2] * s, m[1] * c + m[3] * s, -m[0] * s + m[2] * c, -m[1] * s + m[3] * c, m[4], m[5]]; },
      scale(x, y) { m = [m[0] * x, m[1] * x, m[2] * y, m[3] * y, m[4], m[5]]; },
      setTransform(a, b, c, d, e, f) { m = [a, b, c, d, e, f]; }, transform(a, b, c, d, e, f) { m = [m[0] * a + m[2] * b, m[1] * a + m[3] * b, m[0] * c + m[2] * d, m[1] * c + m[3] * d, m[0] * e + m[2] * f + m[4], m[1] * e + m[3] * f + m[5]]; },
      beginPath() { cur = new PathRec(tp); },
      moveTo(x, y) { cur.moveTo(x, y); }, lineTo(x, y) { cur.lineTo(x, y); }, bezierCurveTo(...a) { cur.bezierCurveTo(...a); }, quadraticCurveTo(...a) { cur.quadraticCurveTo(...a); },
      arc(...a) { cur.arc(...a); }, ellipse(...a) { cur.ellipse(...a); }, rect(...a) { cur.rect(...a); }, closePath() {},
      fill(p) { if (p instanceof PathRec) { const t = new PathRec(null); t.subs = p.subs; emit(t); } else emit(cur); },
      createLinearGradient: () => grad, createRadialGradient: () => grad, createConicGradient: () => grad,
    };
    const recCtx = new Proxy({}, { get(o, k) { if (k in rec) return rec[k]; if (k in o) return o[k]; return noop; }, set(o, k, v) { o[k] = v; return true; } });
    // Path2D(drawLotus が new Path2D() を使う):座標は素のまま持ち、fill 時に現在の変換をかける
    const OrigPath2D = globalThis.Path2D;
    globalThis.Path2D = class extends PathRec { constructor() { super(null); } };
    // fill(p) で p.tf が null の PathRec は、素の座標を現在の変換で写す必要がある(emit は p.tf===null で tp を適用)
    core.setCtx(recCtx);
    try {
      const tList = [0, 7.3, 15.1, 23.9]; // 水流での揺れの位相(中景の草は揺れる)
      for (const t of tList) {
        if (t === 0) {
          kind = "wood"; m = [1, 0, 0, 1, 0, 0]; scene.drawWood();
          kind = "rock"; scene.rocks.forEach(r => { m = [1, 0, 0, 1, 0, 0]; scene.drawRock(r); });
        }
        kind = "mid";
        scene.plants.mid.forEach(p => { m = [1, 0, 0, 1, 0, 0]; stack.length = 0; (p.type === "fern" ? scene.drawFern : p.type === "lotus" ? scene.drawLotus : scene.drawSword)(p, t); });
      }
    } finally { core.setCtx(origCtx); globalThis.Path2D = OrigPath2D; }
  }
  const polyKinds = polys.reduce((o, p) => (o[p.kind] = (o[p.kind] || 0) + 1, o), {});
  const inPoly = (x, y, pts) => { let c = false; for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) { const [xi, yi] = pts[i], [xj, yj] = pts[j]; if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) c = !c; } return c; };
  const boxHit = (b, x0, y0, x1, y1) => !(b[2] < x0 || b[0] > x1 || b[3] < y0 || b[1] > y1);
  const polyHit = (p, x0, y0, x1, y1) => {
    if (!boxHit(p.bb, x0, y0, x1, y1)) return false;
    for (const [x, y] of p.pts) if (x >= x0 && x <= x1 && y >= y0 && y <= y1) return true; // 物の頂点が魚の箱の中
    for (let i = 0; i <= 6; i++) for (let j = 0; j <= 4; j++) if (inPoly(x0 + (x1 - x0) * i / 6, y0 + (y1 - y0) * j / 4, p.pts)) return true; // 魚の箱の格子点が物の中
    // 箱の辺と多角形の辺の交差
    const E = [[x0, y0, x1, y0], [x1, y0, x1, y1], [x1, y1, x0, y1], [x0, y1, x0, y0]];
    const cross = (a, b, c, d) => { const o = (p, q, r) => (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]); return (o(a, b, c) > 0) !== (o(a, b, d) > 0) && (o(c, d, a) > 0) !== (o(c, d, b) > 0); };
    for (const e of E) for (let i = 0, j = p.pts.length - 1; i < p.pts.length; j = i++) if (cross([e[0], e[1]], [e[2], e[3]], p.pts[i], p.pts[j])) return true;
    return false;
  };

  /* ---- 構成 ---- */
  for (const k of ORDER) core.counts[k] = cfg === "max" ? SPECIES[k].max : SPECIES[k].def;
  beh.syncFish();
  for (let i = 0; i < 120; i++) frame(); // 立ち上がり(新しく入れた魚の最初の動き)
  const fishes = beh.fishes.filter(f => !SPECIES[f.sp].solo);
  for (let i = 0; i < 600 && fishes.some(f => Math.abs(f.flip) < 1); i++) frame(); // 計測の開始時に反転の途中の魚がいると、その反転の所要時間が途中からの値になる(計測の都合)。全員が向きを定めてから始める

  /* ---- 描画の記録:drawFish が魚ごとに translate(f.x,f.y) → scale(±幅,1) を呼ぶのを数える ---- */
  const origCtx = core.ctx;
  let calls = []; // { x, y, sx }
  const cnt = new Proxy({}, { get(o, k) {
    if (k === "translate") return (x, y) => { calls.push({ x, y, sx: null }); };
    if (k === "scale") return (x, y) => { const c = calls.at(-1); if (c && c.sx === null && y === 1) c.sx = x; };
    if (k in o) return o[k];
    if (k === "createLinearGradient" || k === "createRadialGradient" || k === "createConicGradient") return () => grad;
    return noop; }, set(o, k, v) { o[k] = v; return true; } });
  core.setCtx(cnt);

  const dt = 1 / 60, Wd = core.W, Hd = core.H, U = core.U;
  const FR = Math.round(MINUTES * 60 / dt);
  const mkS = () => ({ cross: 0, crossFwd: 0, crossBack: 0, ovLooseBox: 0, ovTightBox: 0, ovTightPoly: 0, ovTightPolyBack: 0, ovLoosePoly: 0, ovLoosePolyBack: 0, thinGt04: 0, behindFrames: 0, zBackFrames: 0,
    rev: 0, revDur: [], stall: 0, backNoCross: 0, backCross: 0, revStartSlow: 0,
    thinRuns: 0, thinSec: 0, thinMax: 0, thinDur: [], thinGt03: 0, thinGt1: 0, thinSlowSec: 0, thinVxSum: 0, thinFrames: 0, thinLongVx: [], thinState: {}, w01Frames: 0,
    nan: 0, off: 0, notDrawn: 0, widthMismatch: 0, stack: 0 });
  const S = Object.fromEntries(SP.map(s => [s, mkS()]));
  const st = new Map(); // 魚ごとの追跡
  for (const f of fishes) st.set(f, { side: f.flip >= 0 ? 1 : -1, rev: null, thin: null, layer: f.z >= 0.45 ? 1 : 0, prevFlip: f.flip });
  const FISH_R = fr.FISH_R;
  const dMin = 1e-9;

  for (let n = 0; n < FR; n++) {
    calls = [];
    frame();
    const drawn = new Map();
    for (const c of calls) drawn.set(c.x + "," + c.y, c);
    for (const f of fishes) {
      const a = S[f.sp], t = st.get(f), speed = Math.abs(f.vx) / U;
      const L = SPECIES[f.sp].len * U * f.scale * (0.72 + 0.38 * f.z);
      // (d)
      const bad = ![f.x, f.y, f.z, f.flip, f.vx, f.vy].every(Number.isFinite);
      if (bad) { a.nan++; continue; }
      if (f.x < 0 || f.x > Wd || f.y < core.waterTop || f.y > Hd) a.off++;
      const dc = drawn.get(f.x + "," + f.y);
      if (!dc) a.notDrawn++;
      else if (dc.sx !== null && Math.abs(Math.abs(dc.sx) - Math.max(fr.FLIP_MIN ?? 0.1, Math.abs(f.flip))) > 1e-9) a.widthMismatch++;
      for (const o of fishes) if (o !== f && o.sp === f.sp && Math.hypot(o.x - f.x, o.y - f.y) < L * 0.15) { a.stack++; if (process.env.K0_STACK) console.error('stack', n, f.sp, f.x.toFixed(0), f.y.toFixed(0), 'turn', f.turnT > 0, o.turnT > 0, 'vx', f.vx.toFixed(0), o.vx.toFixed(0)); if (f.turnT > 0 || o.turnT > 0) a.stackTurn = (a.stackTurn || 0) + 1; break; }
      // (a)
      const layer = f.z >= 0.45 ? 1 : 0;
      const box = (hw, hh) => [f.x - hw, f.y - hh, f.x + hw, f.y + hh];
      const loose = box(L * FISH_R[f.sp], L * FISH_R[f.sp]), tight = box(L * 0.5, L * 0.25);
      if (layer === 0) { a.zBackFrames++; if (polys.some(p => inPoly(f.x, f.y, p.pts))) a.behindFrames++; }
      if (layer !== t.layer) {
        a.cross++; if (layer === 1) a.crossFwd++; else a.crossBack++;
        if (polys.some(p => boxHit(p.bb, ...loose))) a.ovLooseBox++;
        if (polys.some(p => boxHit(p.bb, ...tight))) a.ovTightBox++;
        if (polys.some(p => polyHit(p, ...tight))) { a.ovTightPoly++; if (layer === 0) a.ovTightPolyBack++; }
        if (polys.some(p => polyHit(p, ...loose))) { a.ovLoosePoly++; if (layer === 0) a.ovLoosePolyBack++;
          if (process.env.K0_DEBUG) { const hit = polys.filter(p => polyHit(p, ...loose)).map(p => p.kind + p.bb.map(v => v.toFixed(0)).join(",")); console.error(`overlap-cross frame ${n} ${f.sp} x=${f.x.toFixed(1)} y=${f.y.toFixed(1)} z=${f.z} L=${L.toFixed(1)} R=${(L * FISH_R[f.sp]).toFixed(1)} layer->${layer} hits ${hit.slice(0, 3).join(" ")} obstacles=${scene.obstacles?.length} gameSays=${beh.overlapsObstacle?.(f.x, f.y, SPECIES[f.sp].len * U * f.scale * (0.72 + 0.38 * 0.45) * FISH_R[f.sp])} gameSaysR2=${beh.overlapsObstacle?.(f.x, f.y, L * FISH_R[f.sp])}`); } }
        t.layer = layer;
      }
      // (b) 反転:|flip| が 0.9 を切ったら開始。反対側で 0.9 以上で完了、元の側で 0.9 以上へ戻れば逆戻り
      const af = Math.abs(f.flip), sg = f.flip >= 0 ? 1 : -1, unchanged = Math.abs(f.flip - t.prevFlip) < dMin;
      if (!t.rev && af < 0.9) { t.rev = { t0: n, from: t.side, crossed: false, still: 0, stalled: false }; if (speed <= 4) a.revStartSlow++; }
      if (t.rev) {
        const r = t.rev;
        if (sg !== r.from) r.crossed = true;
        if (unchanged) { r.still++; if (r.still * dt >= 0.3 && !r.stalled) { r.stalled = true; a.stall++; } } else r.still = 0;
        if (af >= 0.9) {
          if (sg !== r.from) { a.rev++; a.revDur.push((n - r.t0) * dt); t.side = sg; }
          else if (r.crossed) a.backCross++; else a.backNoCross++;
          t.rev = null;
        }
      }
      t.prevFlip = f.flip;
      // (c) |flip|<0.3
      if (af < 0.3) {
        a.thinFrames++; a.thinVxSum += speed; if (speed <= 4) a.thinSlowSec += dt;
        if (Math.max(0.1, af) === 0.1) a.w01Frames++;
        if (f.sp === "cory") a.thinState[f.state] = (a.thinState[f.state] || 0) + 1;
        if (!t.thin) { t.thin = { n: 0 }; a.thinRuns++; }
        t.thin.n++; t.thin.vx = speed;
      } else if (t.thin) {
        const d = t.thin.n * dt; a.thinDur.push(d); a.thinSec += d; a.thinMax = Math.max(a.thinMax, d);
        if (d > 0.3) { a.thinGt03++; a.thinLongVx.push(t.thin.vx); } if (d > 0.4) a.thinGt04++; if (d > 1) a.thinGt1++; t.thin = null;
      }
    }
  }
  for (const f of fishes) { const t = st.get(f), a = S[f.sp]; if (t.thin) { const d = t.thin.n * dt; a.thinDur.push(d); a.thinSec += d; a.thinMax = Math.max(a.thinMax, d); if (d > 0.3) { a.thinGt03++; a.thinLongVx.push(t.thin.vx); } if (d > 0.4) a.thinGt04++; if (d > 1) a.thinGt1++; } }
  core.setCtx(origCtx);
  const nCount = Object.fromEntries(SP.map(s => [s, fishes.filter(f => f.sp === s).length]));
  console.log(JSON.stringify({ cfg, seed, minutes: MINUTES, W: Wd, U, n: nCount, sp: S, obst: { n: polys.length, wood: polyKinds.wood || 0, rock: polyKinds.rock || 0, mid: polyKinds.mid || 0 } }));
}
if (!args.child) await parent(); else await child();
