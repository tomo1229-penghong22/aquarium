# コード構成

`index.html` と `js/`(ES Modules)の中身を、Claude Code が迷わず読めるように整理したものです。

---

## モジュール構成

`index.html` は、マークアップと CSS、それに `<script type="module" src="js/main.js">` だけを持つ。JavaScript は素の ES Modules で、ビルドツールは使わない。`file://` では読み込めないので、`npm run serve` などの HTTP サーバ経由で開く。

| ファイル | 中身 |
|---|---|
| `js/species.js` | `SPECIES`、`ORDER`、色バリエーション(`GUPPY_COL`、`PLATY_COL`)、ポップアップの説明文 `NOTES` と体長 `POP_L`。ほかに依存しない |
| `js/core.js` | ユーティリティ(`TAU`、`clamp`、`lerp`、`mulberry`、`noise1`、`mix`)、`W` `H` `U` `DPR` `waterTop`、`ctx`、`Tset` `Tw` `timeScale` `nightOn` `nightT`、`counts`、保存と復元、`sandY` `bottomY` `current`、セッター |
| `js/fish-render.js` | 描画ヘルパ、`BASE_A`、`EYE`、`PAINT`、`drawFish` |
| `js/fish-behavior.js` | `fishes`、`schools`、`makeFish`、`syncFish`、`updateHealth`、`updateSchools`、`updateFish` |
| `js/scene.js` | `buildScene`、`makeStatic`、水草・流木・岩・浮草の描画、コースティクス・光の筋・水面、温度計、LED・色調補正・ガラス、エアストーン・泡・粒子 |
| `js/popup.js` | 拡大ポップアップ(`P`、`startAct`、`updatePop`、`drawPop`、`openPop` / `closePop`) |
| `js/ui.js` | パネル、全画面表示、`updatePanel` |
| `js/main.js` | `draw`、`loop`、`resize`、開始処理。エントリポイント |

### import の向き

| モジュール | import するモジュール |
|---|---|
| `species.js` | (なし) |
| `core.js` | species |
| `fish-render.js` | core、species |
| `scene.js` | core |
| `fish-behavior.js` | core、species、scene(`spawnBubble`) |
| `popup.js` | core、species、fish-render |
| `ui.js` | core、species、fish-render、fish-behavior、popup、**main(`resize`)** |
| `main.js` | すべて |

- 基本は一方向。例外は `ui.js` → `main.js`(`resize`)だけで、ここは循環 import になる。`resize` は関数宣言で、`ui.js` の中では関数の実行時にしか呼ばないので、評価順(TDZ)の問題は起きない。
- エントリは必ず `main.js`。`ui.js` などを先頭から import すると、`main.js` の開始処理が `ui.js` の初期化より前に走ってしまう。

### モジュールの評価順

`main.js` の import 順に、species → core → fish-render → scene → fish-behavior → popup → ui が評価され、最後に `main.js` の本体(開始処理)が走る。これは元の単一ファイルでの実行順(状態 → 情景の Canvas `cc` の生成 → ポップアップ → パネル → 開始)と同じにしてある。トップレベルで Canvas や乱数を使う処理は、この順序に依存する(描画ログの基準と一致させるため)。

### 共有変数の書き換え(セッター)

ES Modules では、import した変数へ代入できない。`ctx` や `U` のように、ほかのモジュールが書き換える変数は、所有モジュールが `export let` とし、書き換え用の関数を export している。読み取り側は import した名前をそのまま使う(ライブバインディングなので、書き換え後の値が見える)。描画コードが素の `ctx` と `U` を使い続けられるのは、このため。

| 所有モジュール | セッター |
|---|---|
| `core.js` | `setCtx`、`setU`、`setW`、`setH`、`setDPR`、`setWaterTop`、`setTset`、`setTw`、`setTimeScale`、`setNightOn`、`setNightT` |
| `fish-render.js` | `setBaseA`、`setEye` |
| `scene.js` | `setCCol`(コースティクスの色) |

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
- 更新の手順:`js/` や `index.html` などを変えたら、`sw.js` の `CACHE_VERSION`(`"v1"` → `"v2"`)を上げる。ファイルを足したら `PRECACHE` にも足す。`npm test` の「sw.js の事前キャッシュに全ファイルが含まれる」が、足し忘れを検出する(バージョンの上げ忘れは検出できない)。新しい Service Worker は、次にページを開いたときに入れ替わる(`skipWaiting` と `clients.claim` により待機しない。ただし表示中のページは、再読み込みするまで古いファイルのまま)。
- iOS 向け:`viewport-fit=cover` と `black-translucent` で、standalone 表示では画面全体に描画される。ノッチとホームバーは `env(safe-area-inset-*)` で避ける(`:root` の padding、全画面時の `.ctl` と `.fshint`)。

## 全体の流れ

```
起動
 ├─ 保存データの復元(aquarium-v1)
 ├─ パネルの生成(魚の行・アイコン描画・ポップアップの紐づけ)
 ├─ 照明ボタン・全画面の初期化
 └─ 開始:resize() → syncFish() → updatePanel() → requestAnimationFrame(loop)

loop(毎フレーム)
 ├─ nightT を照明の目標へ補間、コースティクスの色を更新
 ├─ 水温 Tw を設定温度へ近づける
 ├─ updateSchools → 各魚の updateHealth / updateFish
 ├─ updateBubbles
 ├─ draw()
 └─ 15 フレームごとに updatePanel()

ポップアップは別ループ(popLoop)。開いている間だけ動く。
```

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
| `nightOn` / `nightT` | 夜モードの目標 / 補間中の値(0=昼, 1=夜) |
| `plants`, `rocks`, `wood`, `moss`, `floats`, `rays`, `motes`, `glints`, `orbs` | `buildScene()` が作る情景 |
| `staticLayer` / `staticNight` | 昼/夜の静的背景(水のグラデーション、遠景のぼかし、砂)。オフスクリーン Canvas |
| `P` | ポップアップの状態(魚、位置、現在の仕草 `act`、経過 `actT`、泡・文字・粒子など) |

## 描画順(`draw()`)

順番を入れ替えると奥行きや光の当たり方が崩れます。

1. 静的背景(昼。夜は `nightT` で夜の背景を重ねる)
2. 光の筋(`screen` 合成)
3. 奥の水草(透明度 0.78)
4. 霞(奥を少しかすませる)
5. エアストーンと泡
6. 奥の魚(`z < 0.45`)
7. 薄い霞
8. 流木 → 岩 → こけ → 中景の草(シダ、タイガーロータス、アマゾンソード)
9. 手前の魚(`z ≥ 0.45`)
10. 前景の草(ヘアーグラス、小さな葉の絨毯)
11. 浮草(根と影を含む)
12. 漂う粒子と玉ボケ
13. コースティクス(水中全体と、砂の上にもう一度)
14. 水面と部屋、水面のきらめき
15. 色調補正(`grade()`。夜は `nightGrade()` で乗算・スクリーン・ソフトライト)
16. LED 照明の器具
17. 温度計
18. ガラスの映り込みと周辺減光

## 魚の描き方

- `PAINT[種](L, wag, f)` が、原点を体の中心、頭を +x 方向として1匹を描く。
- `drawFish(f)` が、位置・向き(`flip` の符号で左右反転、絶対値で振り向きの薄さ)・傾き(`pitch + tilt`)・透明度(`BASE_A = SPECIES.alpha`)を設定してから `PAINT` を呼ぶ。
- 共通の部品:`bodyPath`、`forkTail`、`fanTail`、`fin`、`withTail`(尾の振りとしなり)、`shade`(上からの光・背中の艶・弱ったときの色あせ・縁の光)、`finRays`、`eye`、`pectoral`。
- 使う変数は `f.phase`、`f.pale`、`f.health`、`f.spots`、`f.variant`、`f.ox`、`f.tailScale`(グッピーのみ)。

## 水草の揺れ

- `current(x, t)`:値ノイズを重ねた水流の場。ゆっくりした大きなうねりと細かな揺らぎを足している。
- `spine(p, t)`:根元から先端へ節ごとに角度を決める。先端ほど水流の影響が大きく(`s^1.25`)、時刻を `s × 1.1` だけ遅らせるので、揺れが根元から先端へ波のように伝わる。

## コースティクス

- 150×90 の小さな画像を 2 フレームに 1 回計算し、拡大して `screen` 合成する。拡大時の補間でやわらかい網目になる。
- 色 `cCol` は昼が暖かい白、夜が青白い白。

## ポップアップ(`P`)

- 論理サイズ 304×190。`ctx` と `U` を一時的に差し替えて `PAINT` を再利用する。
- 仕草は状態機械:`pickAct()` で選び、`startAct(name)` で初期化、`updatePop()` の `switch` で進め、`endAct()` で漂う状態に戻る。
- 視線は `EYE = { dx, dy, roll }` を描画の間だけ設定して `eye()` に渡す。`roll` はコリドラスのウインク用。
- 開閉:`bindPop` がアイコンに紐づける。マウスがアイコンの外に出たら、`pointermove` の判定で必ず閉じる。

## 全画面

- `tankEl`(`.tank`)に Fullscreen API を適用する。使えない・拒否された場合は `.pseudo-fs` クラスで固定表示する代替モードにする。
- `onFSChange()` が `.is-fs` の付け外し、ボタンの表示、案内の表示、`resize()` の予約を行う。
- 操作がないと `.idle` を付けてボタンとカーソルを隠す。

## 確認手順

1. `npm test`:ブラウザなしで実行時エラー・NaN・体調モデル・ポップアップの詰まり・餌を食べられるかを確かめる(所要 2〜3 分)。Canvas と DOM のモックをグローバルに置いてから `js/main.js` を import する方式で、内部状態には各モジュールの export 経由でアクセスする。
   - 見た目を変えない変更(分割・整理など)では、`npm run drawlog` も実行する。描画命令の列を `tests/baseline/` の基準ログと比べ、一致すれば描画結果は同一。
2. `npm run serve` → `http://localhost:8000/`:見た目と操作を確認する(`file://` では開けない)。チェックしたい点の例:
   - 昼と夜の切り替え、18℃・25℃・34℃ での魚の様子
   - 各魚アイコンへのマウスオーバーと、離したときに閉じること
   - 全画面の出入り(ボタン・F・ダブルクリック・Esc)、横長と縦長の画面
   - ダークモードでのパネルの見え方
