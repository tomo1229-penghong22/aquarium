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
| `js/fish-render.js` | 描画ヘルパ、`BASE_A`、`EYE`、`PAINT`(お掃除生体の横向きの姿を含む)、`drawFish`、お掃除生体用の `GROUND`・`drawCreature`・`drawSnailFront`・`paintSnailFront`(前面ガラスの貝の足の裏) |
| `js/fish-behavior.js` | `fishes`、`schools`、`makeFish`、`syncFish`、`baseZone`(種の層を上下に広げる)、`effectiveZone`、`updateHealth`、`updateSchools`(`solo` の種は飛ばす)、`updateFish`、`activity`(コリドラスの砂つつき=砂煙もここ) |
| `js/crawlers.js` | お掃除生体(オト・エビ・貝)の這える面(砂・岩・流木・ガラス)、位置と動きの状態機械 `updateCrawler`、描画の呼び出し `drawCrawlers(layer)`、`relayout`、読み取り用の `grazers`(なめた跡の位置)・`crawlerPos`・`glassBand`、数値 `CRAWL`。トップレベルで乱数・Canvas・`Date` を使わない |
| `js/governor.js` | 性能による切り替え(`GOV`、`govTick`、`govGrace`、`govState`、`trailStrength`、テスト用の `govReset`)。ほかに依存しない |
| `js/scene.js` | `buildScene`、`makeStatic`、水草・流木・岩・浮草の描画、時間経過の見た目(`buildAging`・`ensureAging`・`drawAgingGlass`・`drawAgingHard`)、なめた跡(`updateTrails`・`TRAIL`・`trailState`)、コリドラスの砂煙(`FX`・`spawnPuff`・`updatePuffs`・`drawPuffs`)、`getWood`(流木の点列の読み取り)、コースティクス・光の筋・水面(光の素材は `buildLight` で作り置き)、温度計、24時間計(`clockHourAngle`、`drawClock`、位置を返す `clockGeom`。オフのときはグレー表示)、酸素メーター(`o2NeedleAngle`、`drawO2Meter`、`meterGeom`、作り置きの `buildMeter`)、LED・色調補正・ガラス、エアストーン・泡・粒子 |
| `js/popup.js` | 拡大ポップアップ(`P`、`startAct`、`updatePop`、`drawPop`、`openPop` / `closePop`) |
| `js/ui.js` | パネル、全画面表示、`updatePanel`、時計ボタン(`layoutClockBtn`)・照明の自動化(`autoLightTick`)・メンテの案内(`showNoticeIfAny`)・水槽のリセット |
| `js/perf.js` | `?perf` のときだけ有効な性能計測(`PERF`、`perfBegin` / `perfMark` / `perfEnd` / `perfFrame` / `perfReport`。表示に `governor.js` の状態 `trail on/fading/off`・3 秒平均・`lite on/off` を出す)と、層の無効化 `?perf&skip=`(`parsePerfParams`・`skipOn`・`dprCap`)、自動計測 `?perf&bench` / `?perf&bench=cum`(`benchConditions`・`cumConditions`・`cumSummary`・`perfBenchInit`)。`governor.js` にだけ依存する |
| `js/main.js` | `draw`、`loop`、`resize`、開始処理。エントリポイント |

### import の向き

| モジュール | import するモジュール |
|---|---|
| `species.js` | (なし) |
| `core.js` | species |
| `aging.js` | core、species |
| `fish-render.js` | core、species |
| `scene.js` | core(`counts` も)、aging(`agingOn`。酸素メーターの針は `DO`。時計のグレー表示。`dirt`・`algaeGlass`・`algaeHard`・`clog`・`growth`。汚れ・苔・水草の見た目。なめた跡の戻りは `glassMult`・`hardMult`・`RATE`・`sinceClean`) |
| `fish-behavior.js` | core、species、aging(`DO`、`hypoxia`)、scene(`spawnBubble`、`spawnPuff`、`FX`) |
| `crawlers.js` | core、species、aging(`DO`、`hypoxia`)、scene(`rocks`、`getWood`)、fish-render、fish-behavior(`fishes`、`activity`) |
| `governor.js` | (なし) |
| `popup.js` | core、species、fish-render |
| `ui.js` | core、species、aging、fish-render、fish-behavior、popup、scene(`clockGeom`)、**main(`resize`)** |
| `perf.js` | governor |
| `main.js` | すべて(`crawlers.js`・`governor.js`・`perf.js` を含む) |

- `aging.js` の依存は core と species だけ。scene・fish-behavior・ui・main が aging を import する。core は aging を import せず、保存の統合は登録口(`setExtraSave`)で行う(下の「保存の統合」)。
- 基本は一方向。例外は `ui.js` → `main.js`(`resize`)だけで、ここは循環 import になる。`resize` は関数宣言で、`ui.js` の中では関数の実行時にしか呼ばないので、評価順(TDZ)の問題は起きない。
- エントリは必ず `main.js`。`ui.js` などを先頭から import すると、`main.js` の開始処理が `ui.js` の初期化より前に走ってしまう。

### モジュールの評価順

`main.js` の import 順に、species → core → aging → fish-render → scene → fish-behavior → crawlers → governor → popup → ui が評価され(`crawlers.js` を最初に import する `main.js` の行が、その依存の scene・fish-behavior を先に評価させる)、最後に `main.js` の本体(開始処理)が走る。これは元の単一ファイルでの実行順(状態 → 情景の Canvas `cc` の生成 → ポップアップ → パネル → 開始)と同じにしてある。トップレベルで Canvas や乱数を使う処理は、この順序に依存する(描画ログの基準と一致させるため)。

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
- 更新の手順:`js/` や `index.html` などを変えてコミットしたら、`npm run release`(確認は `--dry-run`)を実行する。`tools/release.mjs` が、main・未コミットなし・origin より遅れていないことを確認し、前回のリリース(`CACHE_VERSION` の行を最後に変えたコミット)以降にアプリのファイル(`index.html`、`manifest.webmanifest`、`sw.js`、`js/`、`icons/`)の変更があれば、`CACHE_VERSION` を `vN` → `vN+1` に上げる → コミット → push まで行う(`npm test` は含まないので、コミット前に通しておく)。ファイルを足したときの `PRECACHE` への追加は引き続き手動で、`npm test` の「sw.js の事前キャッシュに全ファイルが含まれる」が足し忘れを検出する。新しい Service Worker は、次にページを開いたときに入れ替わる(`skipWaiting` と `clients.claim` により待機しない。ただし表示中のページは、再読み込みするまで古いファイルのまま)。
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
 ├─ updateSchools → 各魚の updateHealth と、updateFish(お掃除生体は updateCrawler)
 ├─ updateBubbles、updatePuffs(砂煙)
 ├─ updateAging(dt, { load: 魚の呼吸量の和, T: Tw, counts })   ← 魚の更新の後。オフなら何もしない
 ├─ updateTrails(dt, grazers(), trailStrength())   ← なめた跡(見た目の層)
 ├─ draw()
 ├─ govTick(logic+draw の所要 ms, 実経過秒)   ← 性能による切り替え。loop の先頭から ここまでを performance.now() で測る
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

## お掃除生体(`crawlers.js`・`governor.js`)

- オト・エビ・貝(`SPECIES` の `solo: true`)は `fishes` に入る(数・体調・呼吸量・パネルは魚と同じ)が、`loop` は `updateFish` の代わりに `updateCrawler` を呼び、`draw()` の魚の描画ループ(奥・手前)にも入れない(`sorted` は `solo` を除く)。各個体の状態は `f.cr`(面の種類 `surf`・面の番号・位置・状態 `st`・タイマ・フェードなど)に持つ。
- 面は `relayout()`(`resize()` の `buildScene()` の後)が `scene.js` の `rocks`・`getWood()` の点列から作る。位置は「面の種類・番号・位置(0〜1)」で持つので、resize 後もそのまま使える。
- **描画は 4 つの層**(`drawCrawlers(layer)`):`back`(奥のガラスのオト)、`low`(岩・砂・流木の上の 3 種)、`front`(移動中のオト)、`glass`(前面ガラスの貝とオト)。差し込み位置は下の「描画順」。砂煙(`drawPuffs`)は手前の魚の直後。
- 前面ガラスの貝とオトの「いま」は `grazers()` で読める(なめた跡用)。位置を知りたいときは `crawlerPos(f)`。
- **なめた跡**(`scene.js`):状態 `tr`(`mw`・`mh`:マスクの大きさ、`glass`・`hard`:世代マスク `{ b: 世代ごとのキャンバス, head, prog, any, quiet }`、`cache`:跡あり版の作り置き `{ gA, gB, h[3] }`)。マスクは水槽の 1/4 の解像度で、新品では作らず、跡を付ける最初のときに作る。`buildAging()`(resize)で捨てる。苔の状態が下がったとき(清掃・リセット・`?aging` 後の変更)、`trailStrength()` が 0 になったとき(off)にも捨てる。
- **性能による切り替え**(`governor.js`):状態は `mode`(`on` → `fading` → `off`)・`fade`(強さ)・猶予・3 秒窓の標本。`off` は戻らない。`updateTrails` は強さ(`trailStrength()`)を受け取り、`fading` の間は跡あり版を濃さを下げて作り直す。
- **重なり・移動(R2)**:`occupants(self, key)` が、同じ面(`keyOf`:砂 / `r` + 番号 / `w` + 番号 / `gF` / `gB`)にいる個体の位置・半径と、ほかの個体の行き先の予約 `res` を返す。`blocked()`(動く先が近すぎる=半径の和 × `CRAWL.sep` 未満で、いまより近づくか)、`clearance()`(新しい居場所の余裕)、`freeSpot()`(空いた居場所を選ぶ)、`stepSurf` / `stepSand` / `stepGlass`(重ならない移動。脇へよける)が使う。エビの跳躍は放物線、オトの泳ぎは離れる向きを足してよける。貝のガラスへの往復は状態機械(`toSand` / `toRock` / `toEdge` / `tilt` / `climb` / `glass` / `descend` / `untilt` / `return`)。縁での連続的な変形は `fish-render.js` の `paintSnailTilt`。
- **U ターンと姿勢の連続(issue #7 K4・K5)**:各個体の `f.cr` に、描いている向き `vs`(±1)・目標 `vt`・回りの進み `vp`(0〜1。0 = 回っていない)・食い違いが続いた秒数 `vq`・回っている/待っている `trn`・描く横の倍率(符号つき。テストが読む)`vw` を持つ。`turnMgr(c, dt)` が毎フレーム更新(横向きの姿のときだけ。ガラスの足の裏・縁の遷移中は `trn = false`)、`turnView(c)` が `[符号, 横幅]` を返し、`drawTurned(c, x, y, rot, call)` が体の向き `rot` の x 軸だけを縮めて `call(符号)` を呼ぶ(`PAINT` は変えない)。目標は `faceWant`。面の乗り換えは `swapSurface`(差を `c.rx c.ry c.rr` に残して `decayRes` で消す)、エビの跳躍の姿勢は `hopPose`、オトの泳ぎの着く姿勢は `otoGoal`・描く姿勢は `c.pose`。数値は `CRAWL.turnT`・`turnMin`・`turnHold`(`docs/SPEC.md` の「13.」)。
- **連続性の計測**:`node tests/crawl-continuity.mjs [--minutes=5] [--seeds=1,2,3]`(`--json`、`--child`、`AQUARIUM_JS_ROOT` は k0-measure と同じ。お掃除生体は最大数、魚は既定)。基準 E(状態の切り替わりのフレームで描く位置・角度が、ふだんの 1 フレームの最大変化を超えない。位置は 1.1 倍まで許容)と基準 F(1 フレームで左右が反転する回数 0、向きの変化の所要時間、重なりの延べ時間)を表にする。`npm test` には入れていない(約 6 分)。
- **不変条件**
  - 跡は見た目だけの層で、苔の量(`algaeGlass`・`algaeHard`)を一切変えない。保存もしない。
  - 跡の更新で `getImageData` / `putImageData` を使わない(マスクはキャンバスへの描画と `drawImage` だけ)。新品(苔 0.002 未満)では、マスクもキャッシュも作らず、描画命令を出さない。
  - 性能による `off` はそのセッションの間は戻さない。起動・resize・表示復帰の直後 3 秒と hidden の間は判定しない。
  - 新しい種の数が 0 のとき、お掃除生体の更新・描画で乱数も描画命令も出ない(既存の描画ログと一致する)。砂煙は `FX.puff` が false なら乱数も使わない。
- 状態(`aging.js`):ガラスの苔は実効秒 `glassAge`(`dt × glassMult` の積算)から逆算する。`sinceClean` は従来どおり実秒。`updateAging` の `env` に `counts` を渡す(省略は生体 0 とみなす)。

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
| `glassAge` | ガラスの苔の実効秒(`aging.js`。お掃除生体で遅くなる。保存する) |
| `lastClean` / `lastFilter` | 前回の水替え・清掃/フィルター掃除の実時刻(epoch ms。`aging.js`) |
| `f.cr` | お掃除生体の位置・状態(`crawlers.js`) |
| `obstacles` | 流木・岩・中景の草の塗られる輪郭の多角形(`scene.js`。`buildScene()` の末尾で作り置き。魚の層の入れ替えの判定用。保存しない) |
| なめた跡 `tr` | 跡マスク(世代ごとのキャンバス)と跡あり版の作り置き(`scene.js`。保存しない) |
| `GOV` の `mode` / `fade` | 性能による切り替えの状態(`governor.js`。保存しない) |
| `nightOn` / `nightT` | 夜モードの目標 / 補間中の値(0=昼, 1=夜) |
| `plants`, `rocks`, `wood`, `moss`, `floats`, `rays`, `motes`, `glints`, `orbs` | `buildScene()` が作る情景 |
| `staticLayer` / `staticNight` | 昼/夜の静的背景(水のグラデーション、遠景のぼかし、砂)。オフスクリーン Canvas |
| `P` | ポップアップの状態(魚、位置、現在の仕草 `act`、経過 `actT`、泡・文字・粒子など) |

## 描画順(`draw()`)

順番を入れ替えると奥行きや光の当たり方が崩れます。

1. 静的背景(昼。夜は `nightT` で夜の背景を重ねる)
2. 光の筋(5 本。作り置きのスプライトを `screen` 合成)
3. 奥の水草(不透明)
4. 霞(水の色の薄い重ね 0.19。奥の水草・光の筋の淡さを受け持つ。夜は 0.2)
5. エアストーンと泡
6. 奥の魚(`z < 0.45`)→ **奥のガラスに吸いついたオト**(`drawCrawlers("back")`)
7. 薄い霞(0.045)
8. 流木 → 岩 → こけ → 岩・流木の苔(`drawAgingHard()`。新品では何も描かない)→ **岩・砂・流木の上の貝・エビ・オト**(`drawCrawlers("low")`)→ 中景の草(シダ、タイガーロータス、アマゾンソード)
9. 手前の魚(`z ≥ 0.45`)→ **移動中のオト**(`drawCrawlers("front")`)→ **コリドラスの砂煙**(`drawPuffs()`)
10. 前景の草(ヘアーグラス、小さな葉の絨毯)
11. 浮草(根と影を含む)
12. 漂う粒子と玉ボケ(玉ボケは作り置きの画像)
13. コースティクス(2 層のテクスチャを流して `screen`。水中全体と、砂の上にもう一度)
14. 水面と部屋、水面のきらめき(20 個)
15. ガラスの汚れ・苔(`drawAgingGlass()`。水面の後・色調補正の前なので、照明の色調がかかる。新品では何も描かない。なめた跡があれば、跡あり版の苔を描く)→ **前面ガラスの貝・オト**(`drawCrawlers("glass")`。苔の上、色調補正の前)
16. 色調補正(`grade()`。昼はソフトライトと光だまり。夜は `nightGrade()` で暗幕の乗算 1 回とソフトライト 1 回)
17. LED 照明の器具
18. 温度計
19. 24時間計(温度計とガラスの間。端末のローカル時刻)
20. 酸素メーター(`drawO2Meter()`。時計の直後、ガラスの前。文字盤は `buildMeter()` が作り置き。毎フレームは `drawImage` と針だけ。`?perf` の区間名は `o2meter`)
21. ガラスの映り込みと周辺減光

`?perf` の区間名は `agingGlass`(上の 15。`surface` と `grade` の間。前面ガラスの貝・オトの描画を含む)。お掃除生体の描画 `low` `back` `front` は、それぞれ `midground` `backFish` `frontFish` に含まれる。岩・流木の苔は `midground` に含まれる。水草の成長(ロタラ・バリスネリア・浮草)と、ソードの黄ばみ・縁の点は、各水草の描画関数の中で状態を読み取るだけで、描画順は変わらない。

岩・流木・水草(奥・中景・前景)・浮草は**不透明**で描く(層ごとの `globalAlpha` はかけない)。奥行きの淡さは、描画順で重なる霞の層で表す(上の 4・7 と、中景の草の後・手前の魚の前の霞 0.07)。葉の色は `scene.js` の `lt()` で水の澄んだ色へ少し寄せてある。`npm test` の監査が、`main.js` の `draw()` を上から読んで、これらを描く時点の `globalAlpha` が 1 であることと、描画関数自身がアルファを使わないことを確かめる。

## 魚の描き方

- `PAINT[種](L, wag, f)` が、原点を体の中心、頭を +x 方向として1匹を描く。
- `drawFish(f)` が、位置・向き(`flip` の符号で左右反転、絶対値で振り向きの薄さ。横幅は `max(FLIP_MIN, |flip|)`、`FLIP_MIN` = 0.2)・尾の振り(`fishWag(f, S)`:U ターン中は強く片側へ曲げる)・傾き(`pitch + tilt`)・透明度(`BASE_A = SPECIES.finAlpha`:ひれ・膜、`BODY_A = 1`:体)を設定してから `PAINT` を呼ぶ。
- 共通の部品:`bodyPath`、`forkTail`、`fanTail`、`fin`、`withTail`(尾の振りとしなり)、`shade`(上からの光・背中の艶・弱ったときの色あせ・縁の光)、`finRays`、`eye`、`pectoral`。
- 使う変数は `f.phase`、`f.pale`、`f.health`、`f.spots`、`f.variant`、`f.ox`、`f.tailScale`(グッピーのみ)。
- **透明度の規則**:体は不透明(`BODY_A`。ふだん 1。出現・消滅のフェードの間だけ下がる)、ひれ・尾の膜だけ半透明(`BASE_A` = `finAlpha` × フェード)。`PAINT` の中は `finOn()`(= `ctx.globalAlpha = BASE_A`)と `bodyOn()`(= `BODY_A`)で切り替える。尾(`withTail`)と胸びれ(`pectoral`)は自分で切り替える。体の奥のひれ・尾は体より先に描く(体で隠れる)。体の色むらは `globalAlpha` ではなく `rgba` で重ねる。`AUDIT.hook` は、切り替えのたびに種類("fin" / "finNear" / "body")をテストの監査へ知らせる(通常は `null` で何もしない)。奥行きの淡さは透明度ではなく、描画順で後から重なる霞の層が受け持つ。
- **ヤマトヌマエビ**:`paintShrimpParts` が、共用のオフスクリーン(`shrimpBuffer`。全員で 1 枚。必要な大きさが増えたときだけ作り直す。毎フレームの生成なし)にすべて不透明で描き、メインの `ctx` には `BASE_A`(= `finAlpha` × フェード)で `drawImage` 1 回だけ出す。オフスクリーンの解像度は、そのときの変換の拡大率(`ctx.getTransform()`)に合わせる。`ctx` を一時的にオフスクリーンの `ctx` へ差し替えて描く(パネルのアイコン・ポップアップと同じ方法)。
- お掃除生体の `PAINT`(`oto`・`shrimp`・`snail`)も横向き(頭が +x)。足元までの距離は `GROUND`(体長の倍率)。`drawCreature` が位置・角度・向き・透明度を設定して呼ぶ。エビは `f.pick`・`f.clawT`・`f.wash`・`f.hold`(前脚の動き)、貝は `f.hide`(殻に引っこむ度合い)を読む(ポップアップが設定する)。前面ガラスの貝は別の描画 `paintSnailFront`(足の裏と口)。

## 魚の向きと層の入れ替え(issue #7。`fish-behavior.js`・`fish-render.js`・`scene.js`)

- **向きの状態**(`makeFish` が初期化、`updateFish` の末尾が更新):`f.flip`(±1。回る間は +側 → 0 → −側)、`f.turnT`(0 = 回っていない。回る間は経過秒)、`f.turnSide`(回り始めの向き ±1)、`f.turnV0`(回り始めの `|vx|`)、`f.turnDir`(縦に逃げる向き +1 下 / −1 上)、`f.turnS`(0〜1 = `sin(π·smoothstep(p))`。描画の尾の曲げに使う)、`f.turnHold`(開始条件を満たしている秒数)。定数は `fish-behavior.js` の `TURN_START`(5)・`TURN_HOLD`(0.15)・`TURN_T`(0.95)・`TURN_ARC`(0.5)、`fish-render.js` の `FLIP_MIN`(0.2)・`TURN_AMP`(0.4)・`TURN_BEND`(0.3)。回る間は `updateFish` が速度の積分の前に `f.vx` を上書きし(`v0·cos(π·smoothstep(p))` + 分離)、位置の更新で縦の弧(`yArc`)を足す。`f.vy` は通常どおり更新する。回りきったら `flip = −turnSide`、`turnT = 0`。
- **層の入れ替えの判定**:`updateFish` の `z` の更新で、`z` が `LAYER_Z`(0.45)をまたぐ更新のときだけ `overlapsObstacle(x, y, R)`(`R` = `FISH_R[種] × 体長 × (0.72 + 0.38 max(z0, z1))`)を呼ぶ。重なっていれば `z` を `LAYER_Z − 1e-6`(奥側)か `LAYER_Z`(手前側)で止める。コリドラスは対象外。
- **`obstacles`**(`scene.js`。`{ pts, bb }` の配列):`buildScene()` の末尾で `buildObstacles()` が作る。流木・岩・中景の草(`plants.mid`)の描画関数(`drawWood`・`drawRock`・`drawSword`・`drawFern`・`drawLotus`)を、塗る多角形を記録するだけの `ctx` に差し替えて実際に呼んで集める(描画の式と食い違わない)。中景の草は揺れの位相 4 つ(`OBST_T`)の輪郭の和。`Path2D`(`drawLotus` が `new Path2D()` を使う)は、作成中だけ `globalThis.Path2D` を記録用のクラスに差し替え、`finally` で戻す(元がなければ `delete`)。`ctx` の差し替えも `finally` で戻す。毎フレームは作らない。描画命令は一切出さないので、描画ログには影響しない。
- 計測:`npm run fishcheck`(`tests/k0-measure.mjs --check --minutes=2 --seeds=1`、約 3 分)。基準 B(重なった状態での層の入れ替え 0、途中停止・逆戻り 0、横幅 30% 未満が 0.4 秒超続く区間 0、反転の所要時間 0.6〜1.0 秒、NaN・画面外・描画されない 0)を判定する。`node tests/k0-measure.mjs [--minutes=5] [--seeds=1,2,3]` は既定の数と全種最大数の表を出す(`--json` で生データ、`--from=ファイル` で表に戻す、`--child` は 1 構成・1 シード)。`AQUARIUM_JS_ROOT` で別の版の `js/` を対象にできる(変更の前後比較)。`K0_DEBUG=1`(重なった層の入れ替えの詳細)・`K0_STACK=1`(魚どうしの完全重なり)は標準エラー出力に出す。完全重なり(中心が体長の 0.15 倍未満)は起動直後の配置に左右され、シードごとのばらつきが大きい(0〜575 フレーム)ので、比較には 8 シード以上要る。

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
- お掃除生体は、底を這う(貝・エビ)・水中に吸いつく(オト)動きと、種ごとの仕草の候補(`POOLS`)を使い、魚用の泳ぎ回りは当てない。固有の仕草は `hide`・`flip`・`glassview`(貝)、`wash`・`backhop`・`hug`(エビ)、`graze`・`flow`・`pakupaku`(オト)。貝の `glassview` は `P.gv`(クロスフェード)で前面ガラスの姿へ切り替える。
- 仕草は状態機械:`pickAct()` で選び、`startAct(name)` で初期化、`updatePop()` の `switch` で進め、`endAct()` で漂う状態に戻る。
- 視線は `EYE = { dx, dy, roll }` を描画の間だけ設定して `eye()` に渡す。`roll` はコリドラスのウインク用。
- 開閉:`bindPop` がアイコンに紐づける。マウスは pointerenter / pointerleave で開閉し、外に出たら `pointermove` の判定で必ず閉じる。タッチ(iPad/iPhone)はタップで開閉する。Safari では `click` の `pointerType` が当てにならないため、直前の `pointerdown` の種別で判定する(T8。実機で確認済み)。

## 全画面

- `tankEl`(`.tank`)に Fullscreen API を適用する。使えない・拒否された場合は `.pseudo-fs` クラスで固定表示する代替モードにする。
- `onFSChange()` が `.is-fs` の付け外し、ボタンの表示、案内の表示、`resize()` の予約を行う。
- 操作がないと `.idle` を付けてボタンとカーソルを隠す。

## 確認手順

1. `npm test`:ブラウザなしで(不透明化の「監査」を含む:`AUDIT.hook` で体・ひれの区間を記録用のコンテキストに知らせ、体の塗りの `globalAlpha` が 1、ひれの膜だけ半透明、エビは共用の 1 枚から 1 回だけ貼ることを確かめる)実行時エラー・NaN・体調モデル・ポップアップの詰まり・餌を食べられるか・お掃除生体の動き(2 分間のシミュレーションを含む)・なめた跡と性能による切り替えを確かめる(所要 約 80 秒)。Canvas と DOM のモックをグローバルに置いてから `js/main.js` を import する方式で、内部状態には各モジュールの export 経由でアクセスする。
   - 見た目を変えない変更(分割・整理など)では、`npm run drawlog` も実行する。描画命令の列を `tests/baseline/` の基準ログと比べ、一致すれば描画結果は同一(所要 約 40〜50 秒)。基準の `drawlog.log.gz` はリポジトリ外で、ハッシュ `drawlog.sha256` だけを管理する。
   - 現在の `npm run drawlog` は、基準ログ(issue #7 の U ターン・層の入れ替えの後に取り直したもの)と一致する(軽量モードはオフが既定で、`liteOn=false` の描画命令は変えない)。ハーネスは性能の測定を固定している(`governor.GOV.override = 0`)。お掃除生体を持たない旧版との比較をするときだけ、新種を ORDER から外し(`species.ORDER.length = 6`)、砂煙を切る(`scene.FX.puff = false`)(CLAUDE.md の落とし穴のとおり)。基準の取り直しは、見た目を人間が了承した後に行う(`node tests/drawlog.mjs --record`)。
   - `drawlog` は 24時間計が現在時刻に依存するため、`TZ=UTC`・固定時刻 6:30(UTC)で実行する。実行環境のタイムゾーンや時刻に描画ログが左右されない。
   - 群れの形を確かめるときは `npm run school`。
   - 魚の向き・層の入れ替えを確かめるときは `npm run fishcheck`(約 3 分)。お掃除生体の位置・角度の連続性と U ターンは `node tests/crawl-continuity.mjs`(約 6 分)。どちらも `npm test` には入れていない。魚やお掃除生体の動き・向き・描く位置を変えたら実行する。
2. 不透明化の画素確認:`npm run serve` → `http://localhost:8000/tests/pixels.html` を実際のブラウザで開く。魚 6 種・オト・エビ・貝を赤と緑の背景に描き、体の画素が背景に影響されない(差 ≤ 2/255)、ひれの膜は背景が見える、エビは背景がうっすら見えて重なりで濃くならない、貝の殻・足は不透明、を判定して表示する(結果は `window.__pixels`)。背景の物体(岩・流木・水草・浮草の葉)も、内部の画素が背景に影響されないことを判定する(3 倍の解像度で描き、周囲 2 画素がすべて塗られた内部の画素のうち、別々の不透明な図形のあいだから背景が見える「すき間」を除いた「面状」の透けた画素が 0)。浮草の細い根(`rgba(225,215,185,0.55)` の線)は、ひれの膜と同じく物理的に透ける部分として許容し、その線を描かずに判定する。水槽全体(背景・水草・岩・流木・霞)と物体ごとの平均の明度・彩度も表示する(判定ではない。`?layout=old` を付けると、変更前の層の透明度と霞の値で描く。6599b24 のチェックアウトにこのファイルをコピーして `?layout=old` で開けば、変更前の見え方と比べられる)。`sw.js` の `PRECACHE` には入れない(テスト用。`npm test` の検出は `js/`・`icons/`・manifest・`index.html` だけを見るので `tests/` は対象外)。
3. `npm run serve` → `http://localhost:8000/`:見た目と操作を確認する(`file://` では開けない)。チェックしたい点の例:
   - 昼と夜の切り替え、18℃・25℃・34℃ での魚の様子
   - 各魚アイコンへのマウスオーバー(タッチ端末ではタップ)と、離したときに閉じること
   - 全画面の出入り(ボタン・F・ダブルクリック・Esc)、横長と縦長の画面
   - ダークモードでのパネルの見え方

## 軽量モード(issue #6)

`core.js` の `liteOn`(`setLite(v)`、保存キー `lite`)を、描画側が読んで分岐するだけ。`liteOn` が false のときの描画命令は変えない(`npm run drawlog` で確認する)。**描画順(上の `draw()`)と各層の位置は軽量モードでも変わらない**(作り置きを貼る位置が、元の描画の位置)。

- **全面の作り置き**(`scene.js` の `liteLayer(name, { key, every, phase }, fn)`):`W·DPR × H·DPR` のオフスクリーンを `name` ごとに 1 枚持ち、毎フレームは `drawImage(c, 0, 0, W, H)`(1:1・`globalAlpha` 1)。描き直しは、初回・`every` 指定なら `every` 回に 1 回(`phase` は最初の位置のずらし)・`every` なしなら `key` が変わったとき。描き直すときだけ `setCtx` でオフスクリーンへ差し替えて `fn()` を呼ぶ(`try/finally` で戻す)。使うのは、`hard`(`drawHardLite()`。流木・岩・こけ・岩流木の苔。`key` = `round(algaeHard × 512)`)、`plantsBack` / `plantsMid` / `plantsFront`(`main.js`。`every` = 3、`phase` = 0 / 1 / 2)。
- **泡**(`drawBubblesLite()`):大きさ 5 段階(`BUB_K` = 1.2・1.8・2.7・4・6 U)の小さな泡の画像(`bubbleSprites()` が初回に作る)から、半径の対数が最も近いものを拡縮して貼る。
- **個体ごとのスプライト**(`fish-render.js` の `liteSprite(f, R, x, y, fn)`):個体 `f` ごとに、原点が中央の `2Rd` 四方(`Rd` は DPR 込みの半径画素)のオフスクリーンを `Map` に持つ。描き直しは初回と 3 フレームに 1 回(`LITE_EVERY`。個体の通し番号でずれる)。貼る位置は毎フレーム、device 画素に丸める(拡大縮小なし)。スプライトの中で `rotate` / `scale`(向き・傾き・反転)と `PAINT` を従来どおり呼ぶので、`BASE_A`・`BODY_A`・エビの 1 枚の半透明・フェードはそのまま成り立つ。`drawFishLite`(魚。足元の影はスプライトの外に毎フレーム描く)、`drawCreatureLite` / `drawSnailTiltLite` / `drawSnailFrontLite`(お掃除生体。`crawlers.js` の `dCreature` / `dTilt` / `dFront` が `liteOn` で振り分ける)。
- **外接の半径** `R`:魚は体長 `L` × `FISH_R`(ネオン 1.1・ラミー 1.1・グッピー 1.7・プラティ 1.3・エンゼル 2.1・コリドラス 1.2)、お掃除生体は `max(L, 1.2·L0)` × `CREATURE_R`(1.2)。実測(制御点まで含む保守的な外接)の最大値に余白を付けた値で、さらにキャンバスに約 1.1 倍 + 2px の余白がある。`tests/smoke.mjs` が、種・向き・回転・尾の位相・速さ・体調・大きさを変えて「描画がキャンバスに収まる」ことを検査する。**描画関数(`PAINT` や水草・岩の描画)を変えたら、この検査を確認する。**
- **作り直しと解放**:スプライトは、必要な半径が足りない・大きすぎる(必要の 1.4 倍 + 8 超)・DPR が変わったときだけ作り直す。個体が消えると `litePrune(fishes)` が捨てる。全面の作り置きとバブルの画像は `buildScene()`(resize)の最後の `liteRelease()` で捨て、必要になったとき作り直す。通常モードに戻ったら、`main.js` が `liteRelease()` と `liteSpritesRelease()` で全部捨てる(通常モードでは何も保持しない)。
- **メモリの概算**:全面の作り置き 4 枚で約 `4 × W·DPR × H·DPR × 4B`(1140×713・DPR 1.25 で約 20MB)。スプライトは、既定の数(37 匹)で DPR 2 のとき約 5.8MB、全種最大数(135 匹)で約 21.7MB(DPR 1.25 では約 0.39 倍)。
- **なめた跡**:`main.js` の `trailLevel()`(`liteOn` か `?perf&skip=trails` なら 0、それ以外は `trailStrength()`)を `updateTrails` に渡す。苔の状態は変えない。
- **パス数の目安**(smoke の既定の数、1 フレーム、通常 → 軽量):岩・流木・こけ・苔 213 → 0、奥の水草 669 → 223、中景の草 444 → 148、前景の草 379 → 126、泡 455 → 2(+ `drawImage` 151)、奥の魚 362 → 124、手前の魚 187 → 62。
- **不変条件**:`liteOn` が false のとき描画命令・乱数消費は変わらない。物体は不透明、貼り付けは `globalAlpha` 1。トップレベルで Canvas を作らない(必要になった最初の呼び出しで作る)。

## 計測の口(`perf.js`。`?perf` のときだけ)

- `?perf&skip=a,b,...`:指定した層の描画を飛ばす(計測専用)。層名は `draw()` の `perfMark` の名前(`static`・`rays`・`backPlants`・`haze`(3 か所の全面の霞をまとめて)・`bubbles`・`backFish`・`midground`・`frontFish`・`frontPlants`・`floats`・`motes`・`caustics`・`surface`・`agingGlass`・`grade`・`led`・`thermometer`・`clock`・`o2meter`・`glass`)と、特別な名前 `dpr1`(`resize` の DPR の上限を 1 に)・`shadow`(温度計の `shadowBlur` なし)・`trails`(なめた跡なし)・`gradeDay` / `gradeNight`(色調補正の昼・夜の側だけ)。`main.js` が各層の呼び出しを `skipOn(名前)` の `if` で包む(`?perf` なしでは常に false)。`shadow` / `gradeDay` / `gradeNight` は `scene.js` の `FX` のフラグで、通常は true。
- `?perf&bench`:昼・夜それぞれで「基準 → 各層を 1 つずつ skip → 特別な名前 → static 以外すべて skip」を自動で切り替え、1 条件 = 捨て 1.5 秒 + 計測 10 秒(54 条件・約 10 分半)。`?perf&bench=cum`:層を `draw()` の順に積み上げ、昼夜それぞれ往路(static だけ → 全層)・復路(全層 → static だけ)を計測して往復平均を取り、層ごとの増分を出す(1 条件 = 捨て 1.5 秒 + 計測 6 秒・80 条件・約 10 分)。主指標はフレーム間隔の平均(中央値は 16.7ms 刻みに量子化されるため)。結果はオーバーレイの表・`window.__bench`(JSON)・`console.log("[bench] …")` に出す。
- bench の間は、`freezeSave()`(`core.js`。以後 `save()` は何も書かない)で保存を凍結し、照明は `setNight` で切り替え(自動の照明切り替えは止める)、`GOV.override = 0` で性能による跡の自動 off を止める。bench 中は `liteOn` を切り替えない(開始時の値のまま計測する)。
- フレーム間隔が 500ms を超える(背面のタブなどで `requestAnimationFrame` が止まった)間隔は、通常の `?perf` の統計に入れない。bench では、500ms 超または hidden になったら、その条件の計測を捨てて捨て時間からやり直し、回数を `retries` に記録する。
- 通常の `?perf` の表示は、各行に avg・med(中央値)・p95 を出す。
- `?perf` なしでは、描画命令・乱数消費・保存・DOM は一切変わらない。
