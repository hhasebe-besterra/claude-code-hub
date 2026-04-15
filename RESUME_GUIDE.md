# claude-code-hub 再開ガイド

中断日時: 2026-04-15（PC再起動）

## 完了済み

- リポジトリ作成: https://github.com/hhasebe-besterra/claude-code-hub
- GitHub Pages 有効化: https://hhasebe-besterra.github.io/claude-code-hub/ （`/docs` 配信）
- サイト本体 / 収集スクリプト / ローカルwatcher を初回 push 済み
- 作業ディレクトリ: `C:\Users\h.hasebe\Box\999.system_besterra\task\164.ClaudeCodeLibrary\claude-code-hub\`

## 再開時の最短手順

新しい Claude Code セッションで次のように投げるだけで続きを進められる：

```
claude-code-hub の続きを再開。RESUME_GUIDE.md を見て。
```

### ステップ1: workflow scope 追加（Claude からは不可能。ユーザー作業）

ターミナルで（Claude Code 内なら `!` プレフィックス）：

```
gh auth refresh -h github.com -s workflow
```

ブラウザが開くので承認する。

### ステップ2: workflows を push（Claude に依頼）

以下を投げる：

```
gh auth refresh 完了したので、.github/workflows を push して。
/tmp/cchub_gh_backup に退避してある。
```

Claude 側の作業：
1. `mv /tmp/cchub_gh_backup .github`
2. `git add .github && git commit -m "Add workflows" && git push`

※ PC 再起動で /tmp が消えている場合は、以下のファイルを再作成：
  - `.github/workflows/harvest.yml`
  - `.github/workflows/pages.yml`
  いずれも初回 push 時の内容は git log に残っているため
  `git show a0a2de6^:.github/workflows/harvest.yml` で復元可能。

### ステップ3: PAT 作成（ユーザー作業）

https://github.com/settings/personal-access-tokens/new
- Resource owner: hhasebe-besterra
- Repository access: `claude-code-hub` のみ
- Permissions → Repository permissions → **Contents: Read and write**
- Expiration: 1 year
生成トークンを控える（例: `github_pat_xxxxxxxx`）。

### ステップ4: 環境変数設定（ユーザー作業）

```
setx CCHUB_TOKEN "github_pat_xxxxxxxx"
```

（新しいターミナルを開くと有効）

### ステップ5: watcher 起動

```
cd "C:\Users\h.hasebe\Box\999.system_besterra\task\164.ClaudeCodeLibrary\claude-code-hub\installer"
python watch.py
```

もしくは `start_watcher.bat` をダブルクリック。

PC 起動時自動起動にする場合は、タスクスケジューラに `start_watcher.bat` を登録（Claude に依頼可能）。

### ステップ6: 動作確認

1. サイト https://hhasebe-besterra.github.io/claude-code-hub/ を開く
2. 右上 🔑 に PAT を貼り付け（localStorage 保存）
3. 適当なカードをチェック
4. watcher の標準出力に `[apply] ...` が出て、`~/.claude/skills/` などに反映されることを確認

## 状態ファイル

- watcher の適用済みID: `~/.cchub_state.json`
- PAT（環境変数以外に書くなら）: `~/.cchub_token`

## TODO（優先度順）

1. workflows 再 push（ステップ2）
2. PAT とローカル watcher セットアップ（ステップ3〜5）
3. タスクスケジューラで watcher 自動起動
4. X 収集機能の実装（Playwright + pw_profile）。現状は GitHub Trending + curated.yaml のみ
5. 手動 curated.yaml にベステラ業務用 skill/MCP を追加登録

## 重要な仕組み（忘備）

- **完全自動（Option A）**: サイトでチェック → PAT で `data/selected.json` を直接 PUT → watcher が60秒ごとに polling → 差分を `apply.py` で反映
- **閾値**: views >= 10k で 🔥バッジ、>= 100k で harvest 時ログに「表示数大」を出力
- **三層ミラー**: skill は `~/.claude/skills/<slug>/` と Box 配下の `skills\<slug>\` に両方コピー（CLAUDE.md の既存ルール踏襲）
