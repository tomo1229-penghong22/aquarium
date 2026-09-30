# 熱帯魚の水槽

ブラウザで動く、インタラクティブな熱帯魚の水槽です。`index.html` と `js/` の ES Modules(ビルドツールなし)で構成しています。

## すぐに試す

```bash
npm run serve        # http://localhost:8000/ を開く
npm test             # スモークテスト(ブラウザ不要、2〜3分)
npm run drawlog      # 描画命令の列を基準ログと比較(見た目を変えない変更の検証用)
```

`npm run serve` は Python 3 の簡易サーバーを使います。ES Modules を使っているため、`index.html` を `file://` で直接開いても動きません。必ず HTTP サーバー経由で開いてください。

## iPad / iPhone で使う(PWA)

GitHub Pages などの HTTPS のサーバーに置くと、ホーム画面に追加して、PC や LAN なしで遊べます。

1. iPad / iPhone の Safari でページを開く
2. 共有ボタン → 「ホーム画面に追加」
3. 以後は、ホーム画面のアイコンから起動する。最初に開いたあとは、機内モードでも起動します(Google Fonts だけは、初回にオンラインで開いたときに保存されます。取れていなければ、標準のフォントで表示されます)

アプリのファイルを変えてコミットしたら、`npm run release` で公開します(事前の確認だけなら `npm run release -- --dry-run`)。main ブランチ・未コミットなし・origin より遅れていない、を確認し、`npm test` を通したうえで、`sw.js` の `CACHE_VERSION`(例:`"v2"` → `"v3"`)を上げてコミットし、push します。`CACHE_VERSION` を上げないと、インストール済みの端末が古いキャッシュのまま起動するため、手では上げず、このコマンドを使ってください。ファイルを足したときの `sw.js` の `PRECACHE` への追加は手作業です(漏れは `npm test` で分かります)。アイコンを作り直すときは `node tools/make-icons.mjs` を実行します。

## 資料

- `CLAUDE.md` — Claude Code 向けの作業ガイド(最初に読む)
- `docs/SPEC.md` — 機能仕様とパラメータ
- `docs/ARCHITECTURE.md` — コード構成と描画順
- `docs/HISTORY.md` — これまでの経緯
- `docs/BACKLOG.md` — 次の候補と既知の課題

## 性能計測(開発者向け)

URL に `?perf` を付けて開く(例:`http://localhost:8000/?perf`)と、画面左上に計測オーバーレイが出ます。描画順の区間ごと(static, rays, backPlants, haze, bubbles, backFish, midground, frontFish, frontPlants, floats, motes, caustics, surface, grade, led, thermometer, glass)、draw 全体、ロジック更新(logic)、フレーム間隔(frame)について、直近 120 フレームの平均と p95(ms)を 0.5 秒ごとに更新して表示し、FPS・魚の匹数・canvas の実ピクセルサイズ・devicePixelRatio も併記します。最新の集計は `window.__perf` でも読めます。`?perf` が無いときは計測コードは一切動きません。DevTools が使えない iPad / iPhone の Safari でも数値を読めます。

## 必要なもの

- Node.js 18 以上(テスト用)
- Python 3(簡易サーバー用。任意。ほかの HTTP サーバーでもよい)
