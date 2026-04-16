# claude-code-hub 再開ガイド

最終更新: 2026-04-16

## 稼働状況

| 機能 | 状態 | 備考 |
|------|------|------|
| サイト (GitHub Pages) | ✅ 稼働中 | https://hhasebe-besterra.github.io/claude-code-hub/ |
| 日次 harvest (GH Actions) | ✅ 稼働中 | 毎朝 06:00 JST、GitHub Trending 自動収集 |
| 日本語翻訳表示 | ✅ 稼働中 | translations.json で管理、導入メリット帯付き |
| 次回収集タイマー | ✅ 稼働中 | ヘッダーにカウントダウン表示 |
| watcher (ローカル) | ✅ 稼働中 | スタートアップ自動起動、60秒 polling |
| X 収集 | ⚠️ 初回ログイン要 | x_login.py で認証後に x_harvest.py |
| 自動翻訳 (Claude API) | ⚠️ API キー未設定 | ANTHROPIC_API_KEY を設定すれば即稼働 |

## 作業ディレクトリ

`C:\Users\h.hasebe\Box\999.system_besterra\task\164.ClaudeCodeLibrary\claude-code-hub\`

## 残セットアップ

### 1. X 収集の初回ログイン

```bash
cd harvester
python x_login.py
```
ブラウザが開くので X にログイン → ブラウザを閉じる → プロファイル保存完了。
以後は `python x_harvest.py` で自動収集可能。

### 2. ANTHROPIC_API_KEY の設定

ローカル用:
```
setx ANTHROPIC_API_KEY "sk-ant-api03-..."
```

GitHub Actions 用（自動翻訳を cron で回す場合）:
```
cd claude-code-hub
gh secret set ANTHROPIC_API_KEY
```
プロンプトに API キーを貼り付ける。

### 3. 手動で翻訳を実行

```bash
cd harvester
python translate.py --dry-run   # プレビュー
python translate.py              # 実行
```

### 4. 手動で X 収集を実行

```bash
cd harvester
python x_harvest.py --dry-run   # プレビュー
python x_harvest.py              # 実行＆保存
# 保存後:
cd .. && git add data/items.json && git commit -m "x_harvest: add posts" && git push
```

## watcher の状態確認

```powershell
Get-Process python*   # watch.py が動いているか
```

停止していたら:
```
wscript.exe "C:\Users\h.hasebe\Box\...\claude-code-hub\installer\start_watcher_silent.vbs"
```

スタートアップ登録先:
`%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\ClaudeCodeHub_Watcher.lnk`

## ファイル構成

```
claude-code-hub/
├── docs/                    # GitHub Pages
│   ├── index.html
│   ├── app.js              # 翻訳マージ + タイマー
│   └── style.css           # 導入メリット帯スタイル
├── data/
│   ├── items.json           # 収集済み全アイテム（harvest.py が更新）
│   ├── translations.json    # 日本語翻訳（translate.py が更新）
│   └── selected.json        # ユーザー選択（サイトから PUT）
├── harvester/
│   ├── harvest.py           # GitHub Trending 収集（GH Actions cron）
│   ├── x_harvest.py         # X 収集（ローカル実行）
│   ├── x_login.py           # X ログインプロファイル初期化
│   ├── translate.py         # Claude API 自動翻訳
│   ├── sources.yaml         # 収集ソース定義
│   └── curated.yaml         # 手動キュレーション
├── installer/
│   ├── watch.py             # ローカル watcher
│   ├── apply.py             # アイテム適用
│   ├── start_watcher.bat    # 手動起動用
│   └── start_watcher_silent.vbs  # 非表示自動起動
└── .github/workflows/
    ├── harvest.yml          # 日次収集 + 翻訳
    └── pages.yml            # Pages デプロイ
```
