# 熱帯魚の水槽

ブラウザで動く、インタラクティブな熱帯魚の水槽です。`index.html` と `js/` の ES Modules(ビルドツールなし)で構成し、GitHub Pages(https://tomo1229-penghong22.github.io/aquarium/)から PWA として配信しています。魚のアイコンにマウスを重ねる(タッチ端末ではタップ)と、拡大した魚がポップアップで動きます。

## すぐに試す

```bash
npm run serve        # http://localhost:8000/ を開く
npm test             # スモークテスト(ブラウザ不要、約 30 秒)
npm run drawlog      # 描画命令の列を基準ログと比較(見た目を変えない変更の検証用、約 40〜50 秒)
npm run school       # 群れの形(一列に見えないか)を計測
```

`npm run serve` は Python 3 の簡易サーバーを使います。ES Modules を使っているため、`index.html` を `file://` で直接開いても動きません。必ず HTTP サーバー経由で開いてください。

## iPad / iPhone で使う(PWA)

GitHub Pages などの HTTPS のサーバーに置くと、ホーム画面に追加して、PC や LAN なしで遊べます。

1. iPad / iPhone の Safari でページを開く
2. 共有ボタン → 「ホーム画面に追加」
3. 以後は、ホーム画面のアイコンから起動する。最初に開いたあとは、機内モードでも起動します(Google Fonts だけは、初回にオンラインで開いたときに保存されます。取れていなければ、標準のフォントで表示されます)

アプリのファイルを変えてコミットしたら、`npm run release` で公開します(事前の確認だけなら `npm run release -- --dry-run`)。main ブランチ・未コミットなし・origin より遅れていない、を確認し、`sw.js` の `CACHE_VERSION`(例:`"v2"` → `"v3"`)を上げてコミットし、push します。テストは含まないので、コミットの前に `npm test` を通しておいてください。`CACHE_VERSION` を上げないと、インストール済みの端末が古いキャッシュのまま起動するため、手では上げず、このコマンドを使ってください。ファイルを足したときの `sw.js` の `PRECACHE` への追加は手作業です(漏れは `npm test` で分かります)。アイコンを作り直すときは `node tools/make-icons.mjs` を実行します。

描画ログの基準 `tests/baseline/drawlog.log.gz` は容量が大きいためリポジトリに含めず、ハッシュ(`tests/baseline/drawlog.sha256`)だけを管理しています。基準を取り直すには `node tests/drawlog.mjs --record` を実行します。

## 資料

- `CLAUDE.md` — Claude Code 向けの作業ガイド(最初に読む)
- `docs/SPEC.md` — 機能仕様とパラメータ
- `docs/ARCHITECTURE.md` — コード構成と描画順
- `docs/HISTORY.md` — これまでの経緯
- `docs/BACKLOG.md` — 次の候補と既知の課題

## 軽量モード

古い端末で動きが重いときは、パネルの「表示」の「軽量モード」ボタンで切り替えます(手動のみ・ブラウザに保存)。岩・流木・水草・泡・魚・お掃除生体を作り置きの画像にして、水草と魚の姿勢の更新を 3 フレームに 1 回にし、なめた跡を出さずに描画を軽くします(機能は変わりません。Core i5-8265U / Intel UHD 620 の実測で、`?perf&bench=cum` の全層でフレーム間隔 約 100ms → 約 40ms。普段の `?perf` 表示では約 20fps)。

## 性能計測(開発者向け)

URL に `?perf` を付けて開く(例:`http://localhost:8000/?perf`)と、画面左上に計測オーバーレイが出ます。描画順の区間ごと(static, rays, backPlants, haze, bubbles, backFish, midground, frontFish, frontPlants, floats, motes, caustics, surface, grade, led, thermometer, glass)、draw 全体、ロジック更新(logic)、フレーム間隔(frame)について、直近 120 フレームの平均と p95(ms)を 0.5 秒ごとに更新して表示し、FPS・魚の匹数・canvas の実ピクセルサイズ・devicePixelRatio も併記します。各行に avg・中央値(med)・p95 を出し、先頭付近に「frame 中央値・p95」も出します。`?perf&skip=a,b,...` で指定した層の描画を飛ばせます(計測専用。層名は上の区間名のほか、`dpr1`=DPR の上限を 1 に、`shadow`=温度計の shadowBlur なし、`trails`=なめた跡なし、`gradeDay`・`gradeNight`=色調補正の昼・夜の側だけ。`haze` は 3 か所の全面の霞をまとめて、`static` は静的背景の貼り付けを飛ばします)。`?perf&bench` を付けると、昼・夜それぞれで「基準 → 各層を 1 つずつ skip → 特別な名前 → static 以外すべて skip」を自動で切り替え、1 条件ごとに 1.5 秒捨てて 10 秒計測します(全 54 条件、約 10 分半。進行は「条件 i/n」で表示)。この間は保存を凍結し(保存データは変わりません)、なめた跡の自動オフも止めます。終了後、画面右上に表(フレーム間隔の中央値・p95・基準との差)を出し、`window.__bench` に JSON で置き、`console.log("[bench] …")` にも 1 回出力します。`?perf&bench=cum` は積み上げ式です。層を draw の順に足していき(static は常に描く。grade は昼・夜の色調補正を含めて 1 層。dpr1 などの特別な名前は対象外)、昼を「往路(static だけ → 全層)→ 復路(全層 → static だけ)」、続けて夜も同様に計測し、往路と復路の同じ条件を平均して時間の揺れ(発熱など)を相殺します。1 条件は捨て 1.5 秒 + 計測 6 秒、全 80 条件で約 10 分。主指標はフレーム間隔の平均(中央値は 16.7ms 刻みに量子化されるため)で、表には層ごとの累積平均と増分(その層を足した分)を出します。`window.__bench` には往路・復路ごとの値(平均・中央値・p95・JS の logic+draw 平均・フレーム数・やり直し回数)と、往復平均の `summary` が入ります。最新の集計は `window.__perf` でも読めます。`?perf` が無いときは計測コードは一切動きません。DevTools が使えない iPad / iPhone の Safari でも数値を読めます。

## 動きの確認(開発者向け)

魚やお掃除生体の動き・向き・描く位置を変えたときは、`npm test` のほかに次を実行します(どちらも `npm test` には入っていません)。
- `npm run fishcheck`(約 3 分):魚の向きの変え方(U ターン)と層の入れ替えを確かめます。既定の数と全種最大数を 2 分間シミュレーションし、基準(重なった状態での層の入れ替え 0、途中停止・逆戻り 0、細い線の区間 0、反転の所要時間 0.6〜1.0 秒、NaN・画面外 0)を判定します。表だけ欲しいときは `node tests/k0-measure.mjs --minutes=5 --seeds=1,2,3`。
- `node tests/crawl-continuity.mjs`(約 4〜6 分):お掃除生体の描く位置・角度の連続性と U ターンを表にします。
- `npm run school`:群れの形、`npm run drawlog`:描画命令の列(見た目を変えない変更の確認)。

## 必要なもの

- Node.js 18 以上(テスト用)
- Python 3(簡易サーバー用。任意。ほかの HTTP サーバーでもよい)
