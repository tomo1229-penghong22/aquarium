# 熱帯魚の水槽 — Claude Code 作業ガイド

このファイルは Claude Code が作業を始める前に読む前提の案内です。詳しい仕様は `docs/` にあります。

## プロジェクトの概要

ブラウザで動く、インタラクティブな熱帯魚の水槽です。`index.html`(マークアップと CSS)と、`js/` の ES Modules(素の `<script type="module">`、ビルドなし)で構成しています。Canvas 2D で水槽を毎フレーム描画します。

- 魚6種(ネオンテトラ、ラミーノーズテトラ、グッピー、プラティ、エンゼルフィッシュ、コリドラス・パンダ)の数を選べる
- 水温 18〜34℃。水温に応じて行動と体調が変化する
- 昼(自然光)/夜(白色LED)の照明モード
- 魚アイコンにマウスを重ねると、拡大した魚がポップアップで動く(ときどきユーモラスな仕草をする)
- 全画面モード(ボタン/F キー/ダブルクリック、Esc で戻る)

## ファイル構成

```
index.html            マークアップと CSS。js/main.js を読み込む
js/                   ES Modules(役割ごとに分割。下の「コードの地図」)
sw.js                 Service Worker(全ファイルの事前キャッシュ。オフライン起動用)
manifest.webmanifest  PWA のマニフェスト(名前・アイコン・standalone 表示)
icons/                PWA アイコンの PNG(tools/make-icons.mjs で生成)
tools/make-icons.mjs  アイコン生成スクリプト(Node 標準の zlib のみ。`node tools/make-icons.mjs`)
tests/smoke.mjs       ブラウザ不要のスモークテスト(モックをグローバルに置き、js/main.js を import して実行)
tests/drawlog.mjs     描画命令の記録・比較ハーネス(`npm run drawlog`。分割などの「見た目を変えない変更」の検証用)
docs/SPEC.md          機能仕様とパラメータ
docs/ARCHITECTURE.md  コード構成・描画順・状態・不変条件
docs/HISTORY.md       これまでの依頼と決定の経緯
docs/BACKLOG.md       次の候補と既知の課題
package.json          npm test / npm run serve
```

## 作業の進め方(守ってほしいこと)

1. **変更の前に方針を短く示す。** 見た目に関わる変更は特に、何をどう変えるかを先に共有する。
2. **書き込み・送信系の操作は事前に確認する。** git commit / push、ファイルの削除、外部への公開などは、実行前にユーザーに確認を取る。
3. **変更のたびに `npm test` を実行する。** 全項目が ✓ になることを確認する(所要 約 25 秒)。
4. **見た目はブラウザで確認する。** `npm run serve` → `http://localhost:8000/` を開く。テストは描画結果を見ていないので、見た目の良し悪しはブラウザでしか判断できない。
5. **説明は日本語で。** UI の文言も日本語。

## 絶対に崩さない制約

- **外部リソースは Google Fonts のみ・ビルドツールなし。** 外部から読み込めるのは Google Fonts(`fonts.googleapis.com` / `fonts.gstatic.com`)だけ。ビルドツールや npm の依存(実行時・開発時とも)は追加しない。JavaScript は素の ES Modules のまま `js/` に置く。
- **HTTP サーバ経由で開く(`file://` 不可)。** ES Modules は `file://` では読み込めないため、`npm run serve` などの HTTP サーバから `index.html` を開く。
- **ブラウザストレージは try/catch で囲む。** 保存キーは `aquarium-v1`(内容:`counts`, `T`, `night`)。空でも正常に動くこと。
- **表現の方向性:写実的にしすぎない。** 光と色の調和を重視した、少しイラスト寄りの美しさ。全体にやわらかな半透明感がある。
- **水温の範囲は 18〜34℃。** 下端は「少し冷たすぎる」、上端は「放っておくとひどく弱る」温度。体調モデルの挙動は `docs/SPEC.md` の数値を基準にする。
- **科学的に妥当な説明。** 水温と酸素、代謝の関係など、UI に出す説明は根拠のある内容にする。
- **アクセシビリティ。** ボタンには `aria-label`、キーボード操作(Tab / Esc / F)を維持する。

## コードの地図

`js/` の各ファイルは、元の単一ファイルの区切りコメント(`/* ---------------- 〇〇 ---------------- */`)をそのまま残しています。`grep -n "/\* ---" js/*.js` で探せます。

| ファイル | 区切り | 主な中身 |
|---|---|---|
| `js/core.js` | ユーティリティ / 状態 | `TAU`・`clamp`・`lerp`・`mix`・`noise1`、水槽の大きさ `W` `H` `U` `DPR` `waterTop`、描画先 `ctx`、`Tset` / `Tw` / `timeScale` / `nightOn` / `nightT`、保存と復元、`sandY` / `bottomY` / `current`、セッター |
| `js/species.js` | 魚の種類 | `SPECIES`(種ごとの大きさ・速さ・群れ度・生息層・適温・透明度)、`ORDER`、色バリエーション、ポップアップの説明文 `NOTES` と体長 `POP_L` |
| `js/fish-render.js` | 描画ヘルパ | 体・尾・ひれのパス、`shade`(陰影と縁の光)、`eye`、`BASE_A`、`EYE`、`PAINT`(種ごとの描画関数)、`drawFish` |
| `js/fish-behavior.js` | 魚の生成 / 体調・行動 | `fishes`、`schools`、`makeFish`、`syncFish`、`updateHealth`、`updateFish`(群れ・分離・壁・温度による層の移動) |
| `js/scene.js` | 配置 / 水草の描画 / 光・水面 / 温度計 / ガラスの映り込み / エアストーン・泡・浮遊物 | `buildScene()`(水草・岩・流木・浮草・光の筋などを乱数シード固定で生成)、`makeStatic()`(昼/夜の静的背景)、`spine`(水流で揺れる背骨)と各水草・流木・こけ・浮草の描画、コースティクス、光の筋、水面、夜の照明、LED、色調補正、温度計、泡 |
| `js/popup.js` | 拡大ポップアップ | 小さな水槽の状態 `P`、行動の状態機械(`startAct` / `updatePop`)、描画、開閉 |
| `js/ui.js` | パネル / 全画面表示 | 魚の選択 UI、照明切り替え、全画面 API とその代替表示、`updatePanel` |
| `js/main.js` | メインループ / 開始 | `draw()` の描画順、`loop()`、`resize()`、起動処理(エントリポイント) |

依存の向きは `species` ← `core` ← (`fish-render`, `scene`) ← (`fish-behavior`, `popup`) ← `ui` ← `main` です。例外は `ui.js` が `main.js` の `resize` を使うことだけで、ここは循環 import になります(`resize` は関数の中でしか呼ばないので問題ありません)。エントリは必ず `main.js` にしてください。

## 変更するときの落とし穴

- **`PAINT` の中で `ctx.globalAlpha = 1` と書かない。** 魚の半透明は `BASE_A` を基準にしている。一時的に透明度を下げたら `ctx.globalAlpha = BASE_A` で戻す。
- **`ctx` と `U` は差し替えて使っている。** パネルのアイコンとポップアップは、`ctx` を別の Canvas に、`U`(長さの単位)を別の値に一時的に差し替えて `PAINT` を呼ぶ。描画関数は、`core.js` から import した素の `ctx` と `U` だけを使うこと(`G.ctx` のような書き換えはしない)。
- **import した変数へは代入できない。** 共有の変数(`ctx`・`U`・`W`・`H`・`DPR`・`waterTop`・`Tset`・`Tw`・`timeScale`・`nightOn`・`nightT`、`BASE_A`・`EYE`、`cCol`)は、所有するモジュールで `export let` とし、書き換えは所有モジュールが export するセッター(`setCtx`・`setU`・`setBaseA`・`setEye` など)で行う。読み取りは import した名前をそのまま使う(ライブバインディングなので、差し替え後の値が見える)。
- **長さは `U` を単位に書く。** `U = min(W/1000, H/625)`。全画面では縦横比が変わる。
- **`EYE` はポップアップ専用。** 視線とウインクのために `setEye()` で一時的に設定し、描画後に `null` へ戻す。
- **描画順には意味がある。** 静的背景 → 光の筋 → 奥の水草 → 霞 → 泡 → 奥の魚 → 薄い霞 → 流木・岩・こけ・中景の草 → 手前の魚 → 前景の草 → 浮草 → 粒子 → コースティクス → 水面 → 色調補正 → LED → 温度計 → ガラス。詳細は `docs/ARCHITECTURE.md`。
- **`resize()` で情景を作り直す。** 配置はシード固定の乱数なので、同じサイズなら同じ配置になる。魚の位置は比率で引き継ぐ。
- **新しい行動や仕草を足したら、テストの `ACTS` にも追加する。**(`tests/smoke.mjs` と `tests/drawlog.mjs` の両方)
- **モジュールのトップレベルの実行順を変えない。** `main.js` が import する順(species → core → fish-render → scene → fish-behavior → popup → ui)で各モジュールが評価され、最後に `main.js` の「開始」が走る。トップレベルで乱数や Canvas を使う処理を足すと、描画ログの基準(`tests/baseline/`)と食い違う。
- **ファイルを足したり変えたりしたら、`sw.js` を更新する。** `js/` に .js を足す、`icons/` に PNG を足す、`index.html` などを変える、のどれでも、`sw.js` の `PRECACHE` に手で足す(漏れは `npm test` が検出する)。変更をコミットしたら `npm run release`(確認は `--dry-run`)で `CACHE_VERSION` を上げて公開する(手で上げない)。上げ忘れると、インストール済みの端末(特に iPad/iPhone のホーム画面)が古いキャッシュのまま起動する。
- **パスは相対で書く。** GitHub Pages ではサブパス(`/<repo>/`)で配信される。`/js/...` のようなルート絶対パスは使わず、`./` か `js/...` で書く(`index.html`・`manifest.webmanifest`・`sw.js` とも)。
- **`sw.js` はルートに置く。** スコープは置き場所で決まるため、`js/` などに移すとルートのページを制御できない。
- **`env(safe-area-inset-*)` の余白は消さない。** standalone 表示(`black-translucent`)ではノッチやホームバーの下まで描画されるため、`:root` の padding と全画面時の操作ボタンの位置で避けている。通常のブラウザでは値が 0 になり、見た目は変わらない。
- **見た目を変えない変更は `npm run drawlog` で確かめる。** 描画命令の列を基準ログと比べ、一致すれば描画結果は同一。見た目を変える変更をしたときは、基準ログの取り直し(`node tests/drawlog.mjs --record`)が必要になる。
