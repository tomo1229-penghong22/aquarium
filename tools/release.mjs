// リリース補助:確認 → CACHE_VERSION を上げる → コミット → push。
//   npm run release              実行
//   npm run release -- --dry-run 判定と表示だけ(書き換え・コミット・push はしない)
// Node 標準のみ。実行するのは人間。
import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SW = resolve(ROOT, "sw.js");
const PAGES_URL = "https://tomo1229-penghong22.github.io/aquarium/";
const APP_FILES = ["index.html", "manifest.webmanifest", "sw.js"];
const APP_DIRS = ["js/", "icons/"];
const VERSION_RE = /(CACHE_VERSION = ")([^"]*)(")/;

/* ---- 純粋なロジック(単体確認用に export) ---- */

// アプリのファイルか
export function isAppFile(path) {
  return APP_FILES.includes(path) || APP_DIRS.some(d => path.startsWith(d));
}

// 変更ファイル一覧(改行区切り)からアプリのファイルだけを取り出す
export function appChanges(nameOnlyOutput) {
  return nameOnlyOutput.split("\n").map(s => s.trim()).filter(Boolean).filter(isAppFile);
}

// sw.js の本文から現在の版を返す。"v数字" でなければ null
export function currentVersion(swText) {
  const m = swText.match(VERSION_RE);
  if (!m) return null;
  const n = m[2].match(/^v(\d+)$/);
  return n ? { text: m[2], num: Number(n[1]) } : null;
}

// 版を上げた sw.js の本文を返す。書き換えられなければ null
export function bumpSw(swText) {
  const cur = currentVersion(swText);
  if (!cur) return null;
  const next = `v${cur.num + 1}`;
  return { from: cur.text, to: next, text: swText.replace(VERSION_RE, `$1${next}$3`) };
}

/* ---- git 操作 ---- */

const git = (...args) => execFileSync("git", args, { cwd: ROOT, encoding: "utf8" }).trim();

let swWritten = false; // このスクリプトが sw.js を書き換えた場合のみ、失敗時に戻す

class Abort extends Error {
  constructor(msg, code = 1) { super(msg); this.exitCode = code; }
}

function main(argv) {
  const dry = argv.includes("--dry-run");
  const log = s => console.log(s);
  if (dry) log("[dry-run] 書き換え・コミット・push はしません。");

  // 1. ブランチ
  const branch = git("rev-parse", "--abbrev-ref", "HEAD");
  if (branch !== "main") throw new Abort(`中止:現在のブランチは "${branch}" です。main で実行してください。`);
  log("✓ ブランチ: main");

  // 2. 未コミットの変更
  const dirty = git("status", "--porcelain");
  if (dirty) throw new Abort(`中止:未コミットの変更があります。コミットするか退避してください。\n${dirty}`);
  log("✓ 未コミットの変更なし");

  // 3. origin との関係
  try { git("fetch", "origin"); } catch (e) { throw new Abort(`中止:git fetch origin に失敗しました。\n${e.message}`); }
  const [ahead, behind] = git("rev-list", "--left-right", "--count", "HEAD...origin/main").split(/\s+/).map(Number);
  if (behind > 0) {
    throw new Abort(`中止:ローカルが origin/main より ${behind} コミット遅れています${ahead > 0 ? `(先行 ${ahead}、分岐)` : ""}。先に取り込んでください。`);
  }
  log(`✓ origin/main と同期(先行 ${ahead} コミット、遅れなし)`);

  // 4. 前回のリリースからの変更
  const last = git("log", "-1", "--format=%H", "-G", "CACHE_VERSION =", "--", "sw.js");
  if (!last) throw new Abort("中止:sw.js の CACHE_VERSION を変更したコミットが見つかりません。");
  const files = appChanges(git("diff", "--name-only", last, "HEAD"));
  if (files.length === 0) {
    log(`リリースする変更はありません(前回のリリース ${last.slice(0, 7)} 以降、アプリのファイルの変更なし)。`);
    return 0;
  }
  log(`前回のリリース: ${last.slice(0, 7)}\nリリースする変更(${files.length} ファイル):\n${files.map(f => "  " + f).join("\n")}`);

  // 5. テスト
  log("\nnpm test を実行します(2〜3 分)...");
  const t = spawnSync("npm", ["test"], { cwd: ROOT, stdio: "inherit", shell: true });
  if (t.status !== 0) throw new Abort("中止:npm test が失敗しました。");
  log("✓ npm test 成功");

  // 6. 版を上げる
  const original = readFileSync(SW, "utf8");
  const bumped = bumpSw(original);
  if (!bumped) throw new Abort('中止:sw.js の CACHE_VERSION が "v数字" の形ではありません。手で確認してください(推測で直しません)。');
  if (dry) {
    log(`\n[dry-run] CACHE_VERSION を ${bumped.from} → ${bumped.to} に上げる予定です。`);
    return 0;
  }
  writeFileSync(SW, bumped.text);
  swWritten = true;
  log(`\nCACHE_VERSION: ${bumped.from} → ${bumped.to}`);

  // 7. コミット
  const message = `chore: release ${bumped.to}\n\n${files.map(f => "- " + f).join("\n")}\n`;
  try {
    git("add", "sw.js");
    git("commit", "-m", message);
  } catch (e) {
    try { git("reset", "-q", "HEAD", "--", "sw.js"); git("checkout", "--", "sw.js"); } catch {}
    throw new Abort(`失敗:コミットできませんでした。sw.js は元に戻しました(${bumped.from})。\n${e.message}`);
  }
  log(`✓ コミット: chore: release ${bumped.to}`);

  // 8. push(force なし)
  try {
    git("push", "origin", "main");
  } catch (e) {
    throw new Abort(
      `失敗:git push origin main に失敗しました。リリースのコミットはローカルに残っています。\n${e.message}\n` +
      "復旧:\n  - 再試行するとき: git push origin main\n" +
      "  - やめるとき: git reset --hard HEAD~1  (リリースのコミットを取り消し、sw.js を元に戻す)");
  }

  // 9. 完了
  log(`\n完了:${bumped.to} を公開しました。\n  URL: ${PAGES_URL}\n  iPhone ではアプリを2回起動すると反映されます(1回目で新しい版を取得し、2回目で切り替わる)。`);
  return 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  let code = 0;
  try { code = main(process.argv.slice(2)); }
  catch (e) {
    console.error(e instanceof Abort ? e.message : `予期しないエラー:${e.message}`);
    code = e instanceof Abort ? e.exitCode : 1;
    // 安全策:sw.js だけが書き換わったまま残っていたら戻す
    try { if (swWritten && git("status", "--porcelain", "--", "sw.js")) { git("checkout", "--", "sw.js"); console.error("sw.js を元に戻しました。"); } } catch {}
  }
  process.exit(code);
}
