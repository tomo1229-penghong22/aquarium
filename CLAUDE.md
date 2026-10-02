# 熱帯魚の水槽 — Claude Code 作業ガイド

このファイルは Claude Code が作業を始める前に読む前提の案内です。詳しい仕様は `docs/` にあります。

## プロジェクトの概要

ブラウザで動く、インタラクティブな熱帯魚の水槽です。`index.html`(マークアップと CSS)と、`js/` の ES Modules(素の `<script type="module">`、ビルドなし)で構成しています。GitHub Pages(https://tomo1229-penghong22.github.io/aquarium/)から PWA として配信します。Canvas 2D で水槽を毎フレーム描画します。

- 魚6種(ネオンテトラ、ラミーノーズテトラ、グッピー、プラティ、エンゼルフィッシュ、コリドラス・パンダ)とお掃除生体3種(オトシンクルス、ヤマトヌマエビ、石巻貝)の、計9種の数を選べる
- 水温 18〜34℃。水温に応じて行動と体調が変化する
- 昼(自然光)/夜(白色LED)の照明モード
- 魚アイコンにマウスを重ねる(iPad/iPhone などタッチ端末ではタップする)と、拡大した魚がポップアップで動く(ときどきユーモラスな仕草をする)
- 水槽の左下にアナログの24時間計(端末のローカル時刻、時針のみ)と、その右隣に溶存酸素を示す酸素メーター(針と、青→黄→赤の扇形)
- 全画面モード(ボタン/F キー/ダブルクリック、Esc で戻る)
- 時間の経過(issue #2):24時間計(`#clockbtn`)のタップ/クリックでオン/オフ(既定オン)。オンの間は実時間で、ガラスの汚れ・苔・水草・フィルターの目詰まり・溶存酸素(低酸素で魚が水面に集まる)が変わり、東京の日の出・日没で照明が自動で切り替わる。水替え・清掃(2日)とフィルター掃除(60日)は実日付で数える。パネルから水槽をリセットできる。詳細は `docs/SPEC.md` の「11. 時間の経過」
- お掃除生体(issue #3):オト・エビ・貝は泳ぎ回らず、砂・岩・流木・ガラスに吸いついて這う・歩く(石巻貝はときどき前面ガラスに貼りつき、足の裏と口が見える)。いる数に応じて苔が増える速さが遅くなり(数値の効果。どの端末でも)、前面ガラスの貝・オトや岩の上のエビが通った所の苔がその場で薄くなる「なめた跡」が見える(見た目だけ。CPU の負荷が高い端末では実行時に自動で消し、数値の効果だけにする)。コリドラスは砂煙を上げる。ポップアップに固有の仕草がある。詳細は `docs/SPEC.md` の「13. お掃除生体」

## ファイル構成

```
index.html            マークアップと CSS。js/main.js を読み込む
js/                   ES Modules(役割ごとに分割。下の「コードの地図」)。11 モジュールと、`?perf` 用の `perf.js`
sw.js                 Service Worker(全ファイルの事前キャッシュ。オフライン起動用)
manifest.webmanifest  PWA のマニフェスト(名前・アイコン・standalone 表示)
icons/                PWA アイコンの PNG(tools/make-icons.mjs で生成)
tools/make-icons.mjs  アイコン生成スクリプト(Node 標準の zlib のみ。`node tools/make-icons.mjs`)
tools/release.mjs     リリース補助(`npm run release`。CACHE_VERSION を上げてコミット・push)
tests/smoke.mjs       ブラウザ不要のスモークテスト(モックをグローバルに置き、js/main.js を import して実行。約 80 秒)
tests/drawlog.mjs     描画命令の記録・比較ハーネス(`npm run drawlog`、約 40〜50 秒。分割などの「見た目を変えない変更」の検証用)
tests/school-metric.mjs 群れの形の計測(`npm run school`)
tests/baseline/       描画ログの基準。`drawlog.log.gz` はリポジトリ外(ハッシュ `drawlog.sha256` だけを管理)
docs/SPEC.md          機能仕様とパラメータ
docs/ARCHITECTURE.md  コード構成・描画順・状態・不変条件
docs/HISTORY.md       これまでの依頼と決定の経緯
docs/BACKLOG.md       次の候補と既知の課題
package.json          npm test / drawlog / school / release / serve
```

## 作業の進め方(守ってほしいこと)

1. **変更の前に方針を短く示す。** 見た目に関わる変更は特に、何をどう変えるかを先に共有する。
2. **書き込み・送信系の操作の扱い。** 合格したタスクのローカルコミットは確認なしで行ってよい。push と GitHub Pages への公開は、人間が `npm run release` で行う(Claude は push しない)。ファイルの削除、履歴の書き換え、その他の外部への公開は、実行前にユーザーに確認を取る。
3. **変更のたびに `npm test` を実行する。** 全項目が ✓ になることを確認する(所要 約 80 秒)。
4. **見た目はブラウザで確認する。** `npm run serve` → `http://localhost:8000/` を開く。テストは描画結果を見ていないので、見た目の良し悪しはブラウザでしか判断できない。
5. **説明は日本語で。** UI の文言も日本語。

## 絶対に崩さない制約

- **外部リソースは Google Fonts のみ・ビルドツールなし。** 外部から読み込めるのは Google Fonts(`fonts.googleapis.com` / `fonts.gstatic.com`)だけ。ビルドツールや npm の依存(実行時・開発時とも)は追加しない。JavaScript は素の ES Modules のまま `js/` に置く。
- **HTTP サーバ経由で開く(`file://` 不可)。** ES Modules は `file://` では読み込めないため、`npm run serve` などの HTTP サーバから `index.html` を開く。
- **ブラウザストレージは try/catch で囲む。** 保存キーは `aquarium-v1`(内容:`counts`, `T`, `night`, `aging`)。空でも正常に動くこと。
- **表現の方向性:写実的にしすぎない。** 光と色の調和を重視した、少しイラスト寄りの美しさ。**半透明は個々の物体に掛けるものではなく、映像全体の柔らかさの表現。** 物体(魚の体・貝・岩・流木・水草の葉・浮草)は不透明に描き、全体の色が重くならず澄んだ感じにする(明度を保ち、水の澄んだ色へ寄せる。灰色に濁らせない)。半透明にしてよいのは、物理的に透けるもの(ひれ・尾の膜、ヤマトヌマエビの体、浮草の細い根、光・霞・ガラスの汚れなどの効果)だけ。**半透明が正しいのは、ひれの膜・エビの体・浮草の細い根。**柔らかさと澄んだ感じは、光の筋・コースティクス・水の霞・色調補正・奥行きの色の寄せ方で出す。不透明な物体は後ろを透かさず、手前が奥を隠す(描く順は z 順)。ヤマトヌマエビは 1 匹を 1 枚の半透明の物体として描く(脚・節の重なりで濃くならない)。出現・消滅のフェードの間だけは体も透けてよい。
- **水温の範囲は 18〜34℃。** 下端は「少し冷たすぎる」、上端は「放っておくとひどく弱る」温度。体調モデルの挙動は `docs/SPEC.md` の数値を基準にする。
- **科学的に妥当な説明。** 水温と酸素、代謝の関係など、UI に出す説明は根拠のある内容にする。
- **アクセシビリティ。** ボタンには `aria-label`、キーボード操作(Tab / Esc / F)を維持する。

## コードの地図

`js/` の各ファイルは、元の単一ファイルの区切りコメント(`/* ---------------- 〇〇 ---------------- */`)をそのまま残しています。`grep -n "/\* ---" js/*.js` で探せます。

| ファイル | 区切り | 主な中身 |
|---|---|---|
| `js/core.js` | ユーティリティ / 状態 | `TAU`・`clamp`・`lerp`・`mix`・`noise1`、水槽の大きさ `W` `H` `U` `DPR` `waterTop`、描画先 `ctx`、`Tset` / `Tw` / `timeScale` / `nightOn` / `nightT`、保存と復元、`sandY` / `bottomY` / `current`、セッター |
| `js/species.js` | 魚の種類 | `SPECIES`(種ごとの大きさ・速さ・群れ度・生息層・適温・`finAlpha`(ひれ・膜の透明度。エビは体全体)。お掃除生体は `solo`、エビと貝は `invert` のフラグ)、`ORDER`(9 種。新しい 3 種は末尾)、色バリエーション、ポップアップの説明文 `NOTES` と体長 `POP_L` |
| `js/aging.js` | 時間経過の状態 | `agingOn`、`dirt` `algaeGlass` `algaeHard` `clog` `growth` `DO` `lastClean` `lastFilter`、`glassAge`(ガラスの苔の実効秒)、`updateAging`(毎フレーム。`env.counts` でお掃除生体の数を受け取り、苔の増える速さの倍率 `glassMult` / `hardMult` を掛ける)、`fishLoadOf`(無脊椎動物は呼吸量 ×0.4)、`checkMaintenance`(メンテ)、`DOsat` `hypoxia`、`sunTimes` `lightPhase`(日の出日没)、保存の登録(`initAging`)、確認用パラメータ(`parseAgingParam`・`applyAgingParam`。`?aging` 中は保存を凍結)。トップレベルで乱数・Canvas・`Date` を使わない |
| `js/fish-render.js` | 描画ヘルパ | 体・尾・ひれのパス、`shade`(陰影と縁の光)、`eye`、`BASE_A`(ひれの膜の透明度)、`BODY_A`(体の透明度。ふだん 1)、`EYE`、`AUDIT`(テストの監査用フック)、`PAINT`(種ごとの描画関数。エビは共用のオフスクリーンに不透明で描いてから半透明で 1 回貼る。お掃除生体の横向きの姿を含む)、`drawFish`、お掃除生体用の `GROUND`・`drawCreature`・`drawSnailFront` |
| `js/fish-behavior.js` | 魚の生成 / 体調・行動 | `fishes`、`schools`、`makeFish`、`syncFish`、`baseZone`(種の層を上下に広げる。魚は水槽全体を泳ぐ)、`effectiveZone`、`updateHealth`(DO < 3 で体調低下)、`updateFish`(群れ・分離・壁・温度と低酸素による層の移動。`solo` の種は使わない)。群れる種(ネオン・ラミー)は縦の散らばり 1.0、前後に楕円の分離(1.3)、速度が基準の 10% 未満なら円形の分離。コリドラスの砂つつき(砂煙)もここ |
| `js/crawlers.js` | お掃除生体の位置・動き | オト・エビ・貝の這える面(砂・岩・流木の描かれている輪郭・前面/奥のガラス)、状態機械 `updateCrawler`(同じ面の個体どうしは重ならない=近づく動きをしない・脇へよける・行き先を予約。貝は砂の手前の縁からガラスを這い上がる。瞬間移動・フェードなし)、描画の呼び出し `drawCrawlers(layer)`(層は `back` `low` `front` `glass`)、`relayout`(resize 後)、読み取り用の `grazers`(なめた跡の位置)・`crawlerPos`・`glassBand`、数値 `CRAWL`。トップレベルで乱数・Canvas を使わない |
| `js/governor.js` | 性能による切り替え | 毎フレームの logic+draw の所要時間(ms)の 3 秒移動平均が 2.5ms を超えたら、なめた跡を約 1 秒かけて消し(`on` → `fading` → `off`)、以後は戻さない。起動・resize・表示復帰の直後 3 秒と hidden の間は判定しない。`GOV.override` はテスト専用。ほかに依存しない |
| `js/scene.js` | 配置 / 水草の描画 / 光・水面 / 温度計 / 24時間計 / 酸素メーター / ガラスの映り込み / エアストーン・泡・浮遊物 | `buildScene()`(水草・岩・流木・浮草・光の筋などを乱数シード固定で生成)、`makeStatic()`(昼/夜の静的背景)、`spine`(水流で揺れる背骨)と各水草・流木・こけ・浮草の描画、コースティクス・光の筋・水面・玉ボケ(光の素材は `buildLight()` が作り置き。buildScene の最後に呼ばれる)、時間経過の見た目(`buildAging()`・`ensureAging()` がテクスチャを遅延生成、`drawAgingGlass`・`drawAgingHard`。乱数は別シード `AG_SEED`)、なめた跡(`updateTrails`。低解像度の世代マスク+跡あり版の作り置き。見た目だけで苔の状態は変えない)、コリドラスの砂煙(`FX.puff`・`spawnPuff`・`drawPuffs`)、夜の照明、LED、色調補正、温度計、24時間計(`clockHourAngle`・`drawClock`・`clockGeom`。時間経過オフのときはグレー)、酸素メーター(`o2NeedleAngle`・`drawO2Meter`・`meterGeom`。文字盤は `buildMeter()` が作り置き)、泡 |
| `js/popup.js` | 拡大ポップアップ | 小さな水槽の状態 `P`、行動の状態機械(`startAct` / `updatePop`。お掃除生体は種ごとの仕草 `POOLS`)、描画、開閉 |
| `js/ui.js` | パネル / 全画面表示 / 時間経過の操作 | 魚の選択 UI、照明切り替え、全画面 API とその代替表示、`updatePanel`、時計ボタン(`layoutClockBtn`)、照明の自動化(`autoLightTick`)、メンテの案内、水槽のリセット |
| `js/perf.js` | 性能計測 | `?perf` を付けて開いたときだけ有効。描画の区間ごとの所要時間と、なめた跡の状態(`trail on/fading/off`)・3 秒平均を表示(お掃除生体を入れる前の計測:iPhone では 95 匹でも 60fps、draw 約 4ms)。無効時は何もしない。確認用の `?aging=dirt:1,algaeGlass:1,algaeHard:1,clog:1,growth:1`(`aging.js`)は時間経過の状態を指定して開く(保存せず、メンテも止める。無指定時は何もしない。詳細は `docs/SPEC.md` の「11. 時間の経過」) |
| `js/main.js` | メインループ / 開始 | `draw()` の描画順、`loop()`、`resize()`、起動処理(エントリポイント) |

依存の向きは `species` ← `core` ← `aging` ← (`fish-render`, `scene`) ← `fish-behavior` ← `crawlers`、`popup`、`ui` ← `main` です(`aging` は core と species だけに依存し、scene・fish-behavior・crawlers・ui・main から import される。厳密には `fish-render` と `popup` は aging を使わない。`crawlers` は scene・fish-render・fish-behavior を使う)。`governor.js` は依存なしで、`main.js` と `perf.js` から使われます(`perf.js` は governor にだけ依存し、`main.js` から呼ばれます)。例外は `ui.js` が `main.js` の `resize` を使うことだけで(`ui.js` は `scene.js` の `clockGeom` も使う)、ここは循環 import になります(`resize` は関数の中でしか呼ばないので問題ありません)。エントリは必ず `main.js` にしてください。

## 変更するときの落とし穴

- **背景の物体(岩・流木・水草・浮草)にも、層ごとの `globalAlpha` をかけない。** 奥行きの淡さは霞の層(`main.js` の `draw()` の水の色の薄い `fillRect`)で出す。`npm test` の監査が確かめる。
- **`PAINT` の中で、体を半透明にしない。** 体を描く部分は `ctx.globalAlpha = BODY_A`(ふだん 1)、ひれ・尾の膜を描く部分だけ `ctx.globalAlpha = BASE_A`(= `finAlpha` × フェード)にする(`finOn()` / `bodyOn()`。尾は `withTail`、胸びれは `pectoral` が自動で切り替える)。体の色むらは `globalAlpha` ではなく色の `rgba` で重ねる。自分の体の奥にあるひれは、体より先に描いて体で隠す。透明度を 1 や任意の値に決め打ちしない。エビは `paintShrimpParts` の中をすべて不透明に描き、貼るときだけ `BASE_A` を掛ける(脚・節・触角の重なりで濃くならない)。変更したら `npm test`(監査)と `tests/pixels.html`(実ブラウザの画素)で確かめる。
- **`ctx` と `U` は差し替えて使っている。** パネルのアイコンとポップアップは、`ctx` を別の Canvas に、`U`(長さの単位)を別の値に一時的に差し替えて `PAINT` を呼ぶ。描画関数は、`core.js` から import した素の `ctx` と `U` だけを使うこと(`G.ctx` のような書き換えはしない)。
- **import した変数へは代入できない。** 共有の変数(`ctx`・`U`・`W`・`H`・`DPR`・`waterTop`・`Tset`・`Tw`・`timeScale`・`nightOn`・`nightT`、`BASE_A`・`EYE`、時間経過の状態の `agingOn`・`dirt`・`algaeGlass`・`algaeHard`・`clog`・`growth`・`DO`・`lastClean`・`lastFilter`)は、所有するモジュールで `export let` とし、書き換えは所有モジュールが export するセッターや関数(`setCtx`・`setU`・`setBaseA`・`setEye`・`setAgingOn`・`resetAging`・`updateAging`・`checkMaintenance` など)で行う。aging の状態を他のモジュールから直接代入しない。読み取りは import した名前をそのまま使う(ライブバインディングなので、差し替え後の値が見える)。
- **長さは `U` を単位に書く。** `U = min(W/1000, H/625)`。全画面では縦横比が変わる。
- **`EYE` はポップアップ専用。** 視線とウインクのために `setEye()` で一時的に設定し、描画後に `null` へ戻す。
- **描画順には意味がある。** 静的背景 → 光の筋 → 奥の水草 → 霞 → 泡 → 奥の魚(直後に奥のガラスのオト)→ 薄い霞 → 流木・岩・こけ・中景の草 → 霞(中景の草の後)→ 手前の魚(直後に移動中のオトと砂煙)→ 前景の草 → 浮草 → 粒子 → コースティクス → 水面 → ガラスの汚れ・苔(`drawAgingGlass`)→ 前面ガラスの貝・オト → 色調補正 → LED → 温度計 → 時計 → 酸素メーター → ガラス。流木・岩・こけの直後に岩・流木の苔(`drawAgingHard`)と、岩・砂・流木の上の貝・エビ・オトも入る(中景の草の前)。詳細は `docs/ARCHITECTURE.md`。
- **`resize()` で情景を作り直す。** 配置はシード固定の乱数なので、同じサイズなら同じ配置になる。魚の位置は比率で引き継ぐ。
- **新しい行動や仕草を足したら、テストの `ACTS` にも追加する。**(`tests/smoke.mjs` と `tests/drawlog.mjs` の両方。お掃除生体の固有の仕草は、種ごとの辞書 `ACTS_NEW` に足す。新種を持たない ORDER のハーネスでは実行されないので、既存の仕草の順・乱数消費は変わらない)
- **お掃除生体は `fishes` に入るが、`updateFish` と `drawFish` は使わない。** `solo` の種は `crawlers.js` の `updateCrawler` と `drawCrawlers` が担当する。魚の描画ループやパネルの集計に新しい種を足すときは、`solo` の扱いに気をつける。
- **なめた跡は見た目だけ。** 苔の状態(`algaeGlass` など)を変えない・保存しない・`getImageData` / `putImageData` を使わない。性能による `off` は、そのセッションの間は戻さない。
- **描画ログのハーネスは、性能の測定を固定する。** `governor.js` の `GOV.override = 0`(実測のゆらぎで跡の有無が変わらないように)。新種のいない比較をするときは、`species.ORDER.length = 6`、`scene.FX.puff = false` も設定する。基準ログの取り直しは、見た目を人間が了承した後。
- **`npm test` は約 80 秒かかる。** お掃除生体の 2 分間のシミュレーションなどを含む。途中で結果を見たいときは、`node tests/smoke.mjs` の出力を絞って待つ。
- **モジュールのトップレベルの実行順を変えない。** `main.js` が import する順(species → core → aging → fish-render → scene → fish-behavior → crawlers → governor → popup → ui)で各モジュールが評価され、最後に `main.js` の「開始」が走る。トップレベルで乱数や Canvas を使う処理を足すと、描画ログの基準(`tests/baseline/`)と食い違う。
- **ファイルを足したり変えたりしたら、`sw.js` を更新する。** `js/` に .js を足す、`icons/` に PNG を足す、`index.html` などを変える、のどれでも、`sw.js` の `PRECACHE` に手で足す(漏れは `npm test` が検出する)。変更をコミットしたら `npm run release`(確認は `--dry-run`)で `CACHE_VERSION` を上げて公開する(手で上げない)。上げ忘れると、インストール済みの端末(特に iPad/iPhone のホーム画面)が古いキャッシュのまま起動する。
- **パスは相対で書く。** GitHub Pages ではサブパス(`/<repo>/`)で配信される。`/js/...` のようなルート絶対パスは使わず、`./` か `js/...` で書く(`index.html`・`manifest.webmanifest`・`sw.js` とも)。
- **`sw.js` はルートに置く。** スコープは置き場所で決まるため、`js/` などに移すとルートのページを制御できない。
- **`env(safe-area-inset-*)` の余白は消さない。** standalone 表示(`black-translucent`)ではノッチやホームバーの下まで描画されるため、`:root` の padding と全画面時の操作ボタンの位置で避けている。通常のブラウザでは値が 0 になり、見た目は変わらない。
- **見た目を変えない変更は `npm run drawlog` で確かめる。** 描画命令の列を基準ログと比べ、一致すれば描画結果は同一。見た目を変える変更をしたときは、基準ログの取り直し(`node tests/drawlog.mjs --record`)が必要になる。
