# コード構成

`index.html` と `js/`(ES Modules)の中身を、Claude Code が迷わず読めるように整理したものです。

---

## モジュール構成

`index.html` は、マークアップと CSS、それに `<script type="module" src="js/main.js">` だけを持つ。JavaScript は素の ES Modules で、ビルドツールは使わない。`file://` では読み込めないので、`npm run serve` などの HTTP サーバ経由で開く。

| ファイル | 中身 |
|---|---|
| `js/species.js` | `SPECIES`、`ORDER`、色バリエーション(`GUPPY_COL`、`PLATY_COL`)、ポップアップの説明文 `NOTES` と体長 `POP_L`。ほかに依存しない |
| `js/core.js` | ユーティリティ(`TAU`、`clamp`、`lerp`、`mulberry`、`noise1`、`mix`)、`W` `H` `U` `DPR` `waterTop`、`ctx`、`Tset` `Tw` `timeScale` `nightOn` `nightT`、`counts`、保存と復元、`sandY` `bottomY` `current`、セッター |
| `js/aging.js` | 時間経過の状態モデル(汚れ・苔・目詰まり・水草の成長・溶存酸素・メンテ・日の出日没)。`agingOn`、`dirt` `algaeGlass` `algaeHard` `clog` `growth` `DO` `lastClean` `lastFilter` `sinceClean`、`updateAging`、`checkMaintenance`、`onVisibility`、`DOsat` `hypoxia` `DOeq`、`sunTimes` `lightPhase` `autoLightStep`、`noticeMessage`。トップレベルで乱数・Canvas・`Date` を使わない |
| `js/fish-render.js` | 描画ヘルパ、`BASE_A`、`EYE`、`PAINT`、`drawFish` |
| `js/fish-behavior.js` | `fishes`、`schools`、`makeFish`、`syncFish`、`baseZone`(種の層を上下に広げる)、`effectiveZone`、`updateHealth`、`updateSchools`、`updateFish` |
| `js/scene.js` | `buildScene`、`makeStatic`、水草・流木・岩・浮草の描画、時間経過の見た目(`buildAging`・`ensureAging`・`drawAgingGlass`・`drawAgingHard`)、コースティクス・光の筋・水面(光の素材は `buildLight` で作り置き)、温度計、24時間計(`clockHourAngle`、`drawClock`、位置を返す `clockGeom`。オフのときはグレー表示)、酸素メーター(`o2NeedleAngle`、`drawO2Meter`、`meterGeom`、作り置きの `buildMeter`)、LED・色調補正・ガラス、エアストーン・泡・粒子 |
| `js/popup.js` | 拡大ポップアップ(`P`、`startAct`、`updatePop`、`drawPop`、`openPop` / `closePop`) |
| `js/ui.js` | パネル、全画面表示、`updatePanel`、時計ボタン(`layoutClockBtn`)・照明の自動化(`autoLightTick`)・メンテの案内(`showNoticeIfAny`)・水槽のリセット |
| `js/perf.js` | `?perf` のときだけ有効な性能計測(`PERF`、`perfBegin` / `perfMark` / `perfEnd` / `perfFrame` / `perfReport`)。ほかに依存しない |
| `js/main.js` | `draw`、`loop`、`resize`、開始処理。エントリポイント |

### import の向き

| モジュール | import するモジュール |
|---|---|
| `species.js` | (なし) |
| `core.js` | species |
| `aging.js` | core、species |
| `fish-render.js` | core、species |
| `scene.js` | core、aging(`agingOn`。酸素メーターの針は `DO`。時計のグレー表示。`dirt`・`algaeGlass`・`algaeHard`・`clog`・`growth`。汚れ・苔・水草の見た目) |
| `fish-behavior.js` | core、species、aging(`DO`、`hypoxia`)、scene(`spawnBubble`) |
| `popup.js` | core、species、fish-render |
| `ui.js` | core、species、aging、fish-render、fish-behavior、popup、scene(`clockGeom`)、**main(`resize`)** |
| `perf.js` | (なし) |
| `main.js` | すべて(`perf.js` を含む) |

- `aging.js` の依存は core と species だけ。scene・fish-behavior・ui・main が aging を import する。core は aging を import せず、保存の統合は登録口(`setExtraSave`)で行う(下の「保存の統合」)。
- 基本は一方向。例外は `ui.js` → `main.js`(`resize`)だけで、ここは循環 import になる。`resize` は関数宣言で、`ui.js` の中では関数の実行時にしか呼ばないので、評価順(TDZ)の問題は起きない。
- エントリは必ず `main.js`。`ui.js` などを先頭から import すると、`main.js` の開始処理が `ui.js` の初期化より前に走ってしまう。

### モジュールの評価順

`main.js` の import 順に、species → core → aging → fish-render → scene → fish-behavior → popup → ui が評価され、最後に `main.js` の本体(開始処理)が走る。これは元の単一ファイルでの実行順(状態 → 情景の Canvas `cc` の生成 → ポップアップ → パネル → 開始)と同じにしてある。トップレベルで Canvas や乱数を使う処理は、この順序に依存する(描画ログの基準と一致させるため)。

### 共有変数の書き換え(セッター)

ES Modules では、import した変数へ代入できない。`ctx` や `U` のように、ほかのモジュールが書き換える変数は、所有モジュールが `export let` とし、書き換え用の関数を export している。読み取り側は import した名前をそのまま使う(ライブバインディングなので、書き換え後の値が見える)。描画コードが素の `ctx` と `U` を使い続けられるのは、このため。

| 所有モジュール | セッター |
|---|---|
| `core.js` | `setCtx`、`setU`、`setW`、`setH`、`setDPR`、`setWaterTop`、`setTset`、`setTw`、`setTimeScale`、`setNightOn`、`setNightT` |
| `fish-render.js` | `setBaseA`、`setEye` |
| `aging.js` | `setAgingOn`、`setAgingState`、`resetAging`、`restoreAging`、`initAging`、`applyAgingParam`(状態は `updateAging`・`checkMaintenance` などの関数が書き換える。ほかのモジュールは直接代入しない) |

---

## PWA(オフライン起動・ホーム画面追加)

GitHub Pages(サブパス配信)に置き、Safari の「ホーム画面に追加」で入れると、以後はオフラインでも起動する。描画には関与しない。

| ファイル | 役割 |
|---|---|
| `manifest.webmanifest` | 名前・`start_url`・`scope`(`./`)・`display: standalone`・`orientation: any`・色・アイコン(192 / 512 の `any`、512 の `maskable`) |
| `sw.js` | Service Worker。ルートに置く(スコープが置き場所で決まる) |
| `icons/*.png` | `apple-touch-icon.png`(180px)、`icon-192.png`、`icon-512.png`、`icon-maskable-512.png`。`tools/make-icons.mjs` が生成する |
| `index.html` | `<link rel="manifest">`、iOS 用メタタグ、`apple-touch-icon`、末尾の登録スクリプト(`load` 後に `./sw.js` を登録。失敗しても握りつぶす) |

- パスはすべて相対(`./` か `js/...`)。ルート絶対パスは使わない。
- `sw.js` の戦略:
  - install で `PRECACHE`(`./`、`index.html`、manifest、`js/*.js`、`icons/*.png`)を `cache: "reload"` で取得して、`aquarium-<CACHE_VERSION>` に入れる。`skipWaiting()`。
  - activate で、`aquarium-` で始まる古いキャッシュを削除する(`aquarium-fonts` は残す)。`clients.claim()`。
  - fetch:同一オリジンはキャッシュ優先、なければネットワーク。ナビゲーションで両方だめなら、キャッシュ済みの `index.html` を返す。Google Fonts は初回にオンラインで取れたものを `aquarium-fonts` に入れる(stale-while-revalidate)。オフラインで未取得なら失敗させ、CSS のフォールバックフォントで表示する。
- 更新の手順:`js/` や `index.html` などを変えてコミットしたら、`npm run release`(確認は `--dry-run`)を実行する。`tools/release.mjs` が、main・未コミットなし・origin より遅れていないことを確認し、前回のリリース(`CACHE_VERSION` の行を最後に変えたコミット)以降にアプリのファイル(`index.html`、`manifest.webmanifest`、`sw.js`、`js/`、`icons/`)の変更があれば、`npm test` → `CACHE_VERSION` を `vN` → `vN+1` に上げる → コミット → push まで行う。ファイルを足したときの `PRECACHE` への追加は引き続き手動で、`npm test` の「sw.js の事前キャッシュに全ファイルが含まれる」が足し忘れを検出する。新しい Service Worker は、次にページを開いたときに入れ替わる(`skipWaiting` と `clients.claim` により待機しない。ただし表示中のページは、再読み込みするまで古いファイルのまま)。
- iOS 向け:`viewport-fit=cover` と `black-translucent` で、standalone 表示では画面全体に描画される。ノッチとホームバーは `env(safe-area-inset-*)` で避ける(`:root` の padding、全画面時の `.ctl` と `.fshint`)。

## 全体の流れ

```
起動
 ├─ 保存データの復元(aquarium-v1。core が counts・T・night を、続けて main の initAging() が aging を復元)
 ├─ パネルの生成(魚の行・アイコン描画・ポップアップの紐づけ)
 ├─ 照明ボタン・全画面の初期化
 └─ 開始:initAging() → checkMaintenance() → resize() → syncFish() → autoLightTick() → updatePanel() → showNoticeIfAny() → requestAnimationFrame(loop)
    (resize() の末尾で layoutClockBtn()。visibilitychange と pagehide のリスナーもここで登録)

loop(毎フレーム)
 ├─ nightT を照明の目標へ補間
 ├─ 水温 Tw を設定温度へ近づける
 ├─ updateSchools → 各魚の updateHealth / updateFish
 ├─ updateBubbles
 ├─ updateAging(dt, { load: 魚の呼吸量の和, T: Tw })   ← 魚の更新の後。オフなら何もしない
 ├─ draw()
 ├─ 15 フレームごとに updatePanel()
 └─ 約 1 秒ごと(経過秒の累計が 1 を超えたとき)に autoLightTick(Date.now())

ポップアップは別ループ(popLoop)。開いている間だけ動く。
```

## 時間の経過(`aging.js`)

- 状態は `aging.js` が所有する。毎フレーム `main.js` の `loop` が、魚の更新の後に `updateAging(dt, { load, T })` を呼ぶ(`load` は `Σ fishLoadOf(種, 個体の大きさ)`)。`dt` は loop が測った実経過秒(`realDt`。上限 1 秒。魚などほかの更新の `dt`(0.05 上限)とは別)で、`timeScale` は掛けない。`agingOn` が false なら何も変えない(`DO` も凍結)。約 10 秒ごと(オン中)に `save()`。
- 溶存酸素は、`dt` の間は係数が一定として線形の微分方程式の厳密解で更新する。`fish-behavior.js` は `DO` と `hypoxia(DO)` を読み取るだけで、`effectiveZone`(暑さ係数との `max`)、`updateFish` の `hot`、`updateHealth`(`DO < 3`)に使う。
- **見た目(`scene.js`)**:`buildScene()` の最後で `buildAging()` を呼ぶ。浮草の追加の葉・ソードの縁の点・岩と流木の苔の毛玉や膜の位置を、**別シード `AG_SEED`(20261002)の `mulberry`** で作る(`buildScene` の乱数列 `r` は消費しないので配置は変わらない)。テクスチャ(ガラスの汚れ・苔 2 枚・岩と流木の苔 3 枚のオフスクリーン Canvas)は `ensureAging()` が**必要になった最初の描画で作る(遅延生成)**。起動時や `resize` のたびに作ると、状態が 0 の新品でも Canvas の作成命令が描画ログに出て、基準と食い違うため。`resize` では `agTex` を捨てる。起動時にすでに状態が 0.002 以上の場合(`?aging` の指定、保存された状態)だけ、`buildAging()` の末尾ですぐ作る。毎フレームは `drawImage` と `globalAlpha` だけ。`drawAgingGlass`・`drawAgingHard` は状態が `AG_EPS`(0.002)未満なら何もしない。水草の成長(`drawStem`・`drawRibbon`・`drawFloats`)とソードの黄ばみ・点(`drawSword`)は、`aging.js` の `growth`・`clog`・`algaeHard` を直接読む。
- **`?aging`**:`main.js` の開始処理で `initAging` の後に `applyAgingParam(location.search)` を呼ぶ(`parseAgingParam` が書式を解析。無指定なら `null` で何もしない)。指定があると `frozenSave` が true になり、`setAgingState` で状態を設定する。`frozenSave` の間は、`setExtraSave` に登録した関数が `serializeAging()` ではなく、`initAging` が読み込んだ元の値 `loadedRaw` を返し(保存データの `aging` を書き換えない)、`checkMaintenance` は何もしない。その後に `checkMaintenance`・`resize` が走る(`resize` の `buildAging` が指定済みの状態を見てテクスチャを作る)。
- **照明の自動化**:`loop` が約 1 秒ごとに `ui.js` の `autoLightTick(Date.now())` を呼ぶ。`aging.js` の `autoLightStep(前回の段階, now)` が、`lightPhase(now)`(東京の日の出+1h〜日没+30m が "day"、それ以外 "night")を求め、段階が変わったときだけ `apply` を返す。`autoLightTick` は `apply` のときだけ `setNight` を呼ぶ。前回の段階 `lastPhase` は `ui.js` が持ち、起動時とオンに戻したとき `null` に戻して必ず適用する。
- **時計ボタン**:`index.html` の `#clockbtn`(透明な `<button>`)を `ui.js` の `layoutClockBtn()` が `scene.js` の `clockGeom()`(`drawClock` と共通の中心・半径)に合わせて配置する。`resize()` の末尾で呼ぶ。クリックで `toggleAging`(`setAgingOn` → 保存、オンに戻したら `checkMaintenance` → `lastPhase = null` → `autoLightTick` → `showNoticeIfAny`)。`dblclick` は `stopPropagation` して全画面切り替えを起こさない。`drawClock` は `agingOn` を読んでグレー表示にする。
- **メンテと案内**:`checkMaintenance(now)` が実日付で状態を戻し、実施内容を `pending` に記録する。`ui.js` の `showNoticeIfAny()` が `takeNotice()` を `noticeMessage` で文言にして、`#notice`(`role="status"`、全画面の案内 `.fshint` と同じ見た目)に約 3 秒表示する。
- **保存の統合**:`core.js` の `save()` が `{ counts, T, night }` に、`setExtraSave(fn)` で登録された `fn()` の結果を混ぜる(循環 import を避けるための登録口)。`aging.js` の `initAging(now)` が `core.js` の `getSavedRaw()` から `aging` を読み、`restoreAging` で復元(欠損・破損は既定値)して、`setExtraSave` で `{ aging: serializeAging() }` を登録する。
- **visibilitychange / pagehide**:`main.js` が登録する。`hidden` になったとき `onVisibility(true, now)` が `checkMaintenance` を実施して `save()`。`visible` に戻ったときは `checkMaintenance` を再度判定し、`showNoticeIfAny()` で案内を出す。`pagehide` では `save()`。

## 座標系と単位

| 名前 | 意味 |
|---|---|
| `W`, `H` | 論理ピクセルでの水槽の幅と高さ。通常は `H = W × 10/16`。全画面では画面の高さ |
| `DPR` | 端末のピクセル比(最大 2)。Canvas の実解像度は `W × DPR` |
| `U` | 長さの単位。`min(W/1000, H/625)`。魚・葉・線幅などはすべて `U` の倍数で書く |
| `waterTop` | 水面の高さ(`H × 0.055`)。その上は部屋(空気) |
| `sandY(x)` | 奥側の砂の上端。ゆるやかにうねる |
| `bottomY(x, z)` | 奥行き `z` での底の高さ。手前ほど下 |
| `z` | 魚の奥行き 0(奥)〜1(手前)。大きさと描画の層が変わる |

## 状態

| 変数 | 内容 |
|---|---|
| `counts` | 種ごとの匹数 |
| `fishes` | 魚オブジェクトの配列(位置、速度、向き `flip`、姿勢、`phase`、`health`、`pale` など) |
| `schools` | 種ごとの群れの目標点 |
| `Tset` / `Tw` | 設定温度 / 現在の水温(`core.js`。書き換えは `setTset` / `setTw`) |
| `timeScale` | 体調変化の早送り倍率 |
| `agingOn` | 時間の経過のオン/オフ(`aging.js`。書き換えは `setAgingOn`) |
| `dirt` / `algaeGlass` / `algaeHard` / `clog` / `growth` | 汚れ・ガラスの苔・岩と流木の苔・目詰まり・水草の成長(0〜1。`aging.js` が所有し、`updateAging` と `checkMaintenance` が更新)。`sinceClean` は清掃からのオン秒数で、`algaeGlass` はここから逆算する |
| `DO` | 溶存酸素 mg/L(`aging.js`) |
| `lastClean` / `lastFilter` | 前回の水替え・清掃/フィルター掃除の実時刻(epoch ms。`aging.js`) |
| `nightOn` / `nightT` | 夜モードの目標 / 補間中の値(0=昼, 1=夜) |
| `plants`, `rocks`, `wood`, `moss`, `floats`, `rays`, `motes`, `glints`, `orbs` | `buildScene()` が作る情景 |
| `staticLayer` / `staticNight` | 昼/夜の静的背景(水のグラデーション、遠景のぼかし、砂)。オフスクリーン Canvas |
| `P` | ポップアップの状態(魚、位置、現在の仕草 `act`、経過 `actT`、泡・文字・粒子など) |

## 描画順(`draw()`)

順番を入れ替えると奥行きや光の当たり方が崩れます。

1. 静的背景(昼。夜は `nightT` で夜の背景を重ねる)
2. 光の筋(5 本。作り置きのスプライトを `screen` 合成)
3. 奥の水草(透明度 0.78)
4. 霞(奥を少しかすませる)
5. エアストーンと泡
6. 奥の魚(`z < 0.45`)
7. 薄い霞
8. 流木 → 岩 → こけ → 岩・流木の苔(`drawAgingHard()`。新品では何も描かない)→ 中景の草(シダ、タイガーロータス、アマゾンソード)
9. 手前の魚(`z ≥ 0.45`)
10. 前景の草(ヘアーグラス、小さな葉の絨毯)
11. 浮草(根と影を含む)
12. 漂う粒子と玉ボケ(玉ボケは作り置きの画像)
13. コースティクス(2 層のテクスチャを流して `screen`。水中全体と、砂の上にもう一度)
14. 水面と部屋、水面のきらめき(20 個)
15. ガラスの汚れ・苔(`drawAgingGlass()`。水面の後・色調補正の前なので、照明の色調がかかる。新品では何も描かない)
16. 色調補正(`grade()`。昼はソフトライトと光だまり。夜は `nightGrade()` で暗幕の乗算 1 回とソフトライト 1 回)
17. LED 照明の器具
18. 温度計
19. 24時間計(温度計とガラスの間。端末のローカル時刻)
20. 酸素メーター(`drawO2Meter()`。時計の直後、ガラスの前。文字盤は `buildMeter()` が作り置き。毎フレームは `drawImage` と針だけ。`?perf` の区間名は `o2meter`)
21. ガラスの映り込みと周辺減光

`?perf` の区間名は `agingGlass`(上の 15。`surface` と `grade` の間)。岩・流木の苔は `midground` に含まれる。水草の成長(ロタラ・バリスネリア・浮草)と、ソードの黄ばみ・縁の点は、各水草の描画関数の中で状態を読み取るだけで、描画順は変わらない。

## 魚の描き方

- `PAINT[種](L, wag, f)` が、原点を体の中心、頭を +x 方向として1匹を描く。
- `drawFish(f)` が、位置・向き(`flip` の符号で左右反転、絶対値で振り向きの薄さ)・傾き(`pitch + tilt`)・透明度(`BASE_A = SPECIES.alpha`)を設定してから `PAINT` を呼ぶ。
- 共通の部品:`bodyPath`、`forkTail`、`fanTail`、`fin`、`withTail`(尾の振りとしなり)、`shade`(上からの光・背中の艶・弱ったときの色あせ・縁の光)、`finRays`、`eye`、`pectoral`。
- 使う変数は `f.phase`、`f.pale`、`f.health`、`f.spots`、`f.variant`、`f.ox`、`f.tailScale`(グッピーのみ)。

## 水草の揺れ

- `current(x, t)`:値ノイズを重ねた水流の場。ゆっくりした大きなうねりと細かな揺らぎを足している。
- `spine(p, t)`:根元から先端へ節ごとに角度を決める。先端ほど水流の影響が大きく(`s^1.25`)、時刻を `s × 1.1` だけ遅らせるので、揺れが根元から先端へ波のように伝わる。

## 光の作り置き

- `buildLight()` が `buildScene()` の最後に呼ばれる(`resize()` のたび)。毎フレームは `drawImage` と、作り置きのグラデーションの `fill` だけで、グラデーションの生成や画素計算はしない。
- 初回のみ作る(大きさに依存しない):コースティクスのタイル(188×188 の周期テクスチャを位相違いで 2 枚。昼用・夜用に色付けし、継ぎ目をまたいでも切れないよう 2×2 に並べる)と、夜の LED 暗幕(128×96。縦と横の暗さを 1 枚に焼いた乗算用)。画素計算は初回の 1 回だけ。
- `resize()` のたびに作る:光の筋のスプライト(昼用・夜用)、玉ボケのスプライト、画面の大きさに依存するグラデーション(空・水面の帯・昼夜のソフトライト・光だまり)。
- コースティクス(`drawCaustics`):2 枚のテクスチャの窓を別方向・別速度でずらし(窓は元画像の一部を拡大して貼る)、`screen` で重ねる。昼夜は `nightT` で 2 色を混ぜる。ループは周期テクスチャなので継ぎ目がない。
- テクスチャ生成は乱数を使わず、`buildScene` の乱数列にも影響しない。筋(7 本ぶん)ときらめき(46 個ぶん)は、以降の配置を動かさないよう乱数を消費してから、5 本・20 個だけ採用している。

## ポップアップ(`P`)

- 論理サイズ 304×190。`ctx` と `U` を一時的に差し替えて `PAINT` を再利用する。
- 仕草は状態機械:`pickAct()` で選び、`startAct(name)` で初期化、`updatePop()` の `switch` で進め、`endAct()` で漂う状態に戻る。
- 視線は `EYE = { dx, dy, roll }` を描画の間だけ設定して `eye()` に渡す。`roll` はコリドラスのウインク用。
- 開閉:`bindPop` がアイコンに紐づける。マウスは pointerenter / pointerleave で開閉し、外に出たら `pointermove` の判定で必ず閉じる。タッチ(iPad/iPhone)はタップで開閉する。Safari では `click` の `pointerType` が当てにならないため、直前の `pointerdown` の種別で判定する(T8。実機で確認済み)。

## 全画面

- `tankEl`(`.tank`)に Fullscreen API を適用する。使えない・拒否された場合は `.pseudo-fs` クラスで固定表示する代替モードにする。
- `onFSChange()` が `.is-fs` の付け外し、ボタンの表示、案内の表示、`resize()` の予約を行う。
- 操作がないと `.idle` を付けてボタンとカーソルを隠す。

## 確認手順

1. `npm test`:ブラウザなしで実行時エラー・NaN・体調モデル・ポップアップの詰まり・餌を食べられるかを確かめる(所要 約 30 秒)。Canvas と DOM のモックをグローバルに置いてから `js/main.js` を import する方式で、内部状態には各モジュールの export 経由でアクセスする。
   - 見た目を変えない変更(分割・整理など)では、`npm run drawlog` も実行する。描画命令の列を `tests/baseline/` の基準ログと比べ、一致すれば描画結果は同一(所要 約 40〜50 秒)。基準の `drawlog.log.gz` はリポジトリ外で、ハッシュ `drawlog.sha256` だけを管理する。
   - `drawlog` は 24時間計が現在時刻に依存するため、`TZ=UTC`・固定時刻 6:30(UTC)で実行する。実行環境のタイムゾーンや時刻に描画ログが左右されない。
   - 群れの形を確かめるときは `npm run school`。
2. `npm run serve` → `http://localhost:8000/`:見た目と操作を確認する(`file://` では開けない)。チェックしたい点の例:
   - 昼と夜の切り替え、18℃・25℃・34℃ での魚の様子
   - 各魚アイコンへのマウスオーバー(タッチ端末ではタップ)と、離したときに閉じること
   - 全画面の出入り(ボタン・F・ダブルクリック・Esc)、横長と縦長の画面
   - ダークモードでのパネルの見え方
