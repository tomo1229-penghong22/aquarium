# 熱帯魚の水槽

ブラウザで動く、インタラクティブな熱帯魚の水槽です。`index.html` 1ファイルで完結しています。

## すぐに試す

```bash
npm run serve        # http://localhost:8000/ を開く
npm test             # スモークテスト(ブラウザ不要、2〜3分)
```

`npm run serve` は Python 3 の簡易サーバーを使います。`index.html` をブラウザで直接開いても動きます。

## 資料

- `CLAUDE.md` — Claude Code 向けの作業ガイド(最初に読む)
- `docs/SPEC.md` — 機能仕様とパラメータ
- `docs/ARCHITECTURE.md` — コード構成と描画順
- `docs/HISTORY.md` — これまでの経緯
- `docs/BACKLOG.md` — 次の候補と既知の課題

## 必要なもの

- Node.js 18 以上(テスト用)
- Python 3(簡易サーバー用。任意)
