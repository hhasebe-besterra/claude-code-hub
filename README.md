# Claude Code Hub

長谷部さん個人用の Claude Code ナレッジ集約ポータル。
X / GitHub / Web で流通する Claude Code 関連情報を自動収集し、気に入ったものをチェック一つでローカル環境（skill / MCP / slash command）に反映する。

- **サイト**: https://hhasebe-besterra.github.io/claude-code-hub/
- **収集頻度**: 毎日 06:00 JST（GitHub Actions）
- **反映方式**: サイトでチェック → `data/selected.json` 更新 → ローカル watcher が検知し自動適用（完全自動 / Option A）

## 構成

```
claude-code-hub/
├── docs/                       GitHub Pages（サイト本体）
│   ├── index.html
│   ├── app.js
│   └── style.css
├── data/
│   ├── items.json              収集済みアイテム一覧
│   └── selected.json           ユーザーが選択したアイテムID
├── payloads/<id>/              インストール用ファイル（skill本体 等）
├── harvester/                  収集スクリプト（X / GitHub / 手動キュレーション）
│   ├── harvest.py
│   ├── sources.yaml
│   └── curated.yaml            手動追加アイテム
├── installer/                  ローカル反映ツール
│   ├── watch.py                常駐 watcher（selected.json を polling）
│   └── apply.py                個別アイテム適用
└── .github/workflows/
    ├── harvest.yml             日次収集
    └── pages.yml               Pages デプロイ
```

## セットアップ（ローカル側）

1. **PAT を用意**: GitHub → Settings → Developer settings → Fine-grained tokens
   - Repository access: `hhasebe-besterra/claude-code-hub` のみ
   - Permissions: Contents (Read and write)
   - 有効期限: 1年
2. **watcher 起動**:
   ```bash
   cd installer
   python -m pip install -r requirements.txt
   export CCHUB_TOKEN=<your PAT>
   python watch.py
   ```
3. サイトを開き、初回のみブラウザに同じ PAT を登録（localStorage 保存）。

## 運用ルール

- 収集ソースに新規追加する場合は `harvester/sources.yaml` を編集
- 手動で追加したいアイテムは `harvester/curated.yaml` に追記
- ビュー数が閾値（10k）を超える投稿はサイトで🔥バッジが付く

## ライセンス

個人運用。外部公開用ではない（repo は public だが内容は自分向け）。
