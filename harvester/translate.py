"""未翻訳アイテムの日本語要約・導入メリットを Claude API で自動生成.

items.json にあるが translations.json にないアイテムを検出し、
Claude API (Haiku) で日本語翻訳を生成して translations.json に追記する。

使い方:
  python translate.py                # 未翻訳分を翻訳
  python translate.py --dry-run      # 翻訳対象のプレビューのみ
  python translate.py --all          # 既存翻訳も含め全件再翻訳
  python translate.py --model haiku  # モデル指定 (haiku/sonnet, default: haiku)

環境変数:
  ANTHROPIC_API_KEY  — Anthropic API キー（必須）
"""
from __future__ import annotations
import argparse, json, os, sys, time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ITEMS_FILE = ROOT / "data" / "items.json"
TRANS_FILE = ROOT / "data" / "translations.json"

MODEL_MAP = {
    "haiku": "claude-haiku-4-5-20251001",
    "sonnet": "claude-sonnet-4-6",
}

SYSTEM_PROMPT = """\
あなたはIT・AI技術の翻訳者です。
GitHub リポジトリやX投稿の説明文を読み、以下の2つを日本語で生成してください。

1. summary_ja: そのツール/情報が「何か」を1-2文で説明（技術者でない人にもわかるように）
2. benefit: 「導入したら業務で何が良くなるか」を1文で具体的に（「〜が楽になる」「〜が不要になる」「〜時間→〜分に短縮」など）

JSON形式で返してください:
{"summary_ja": "...", "benefit": "..."}

注意:
- 英語の専門用語はカタカナにせず、何をするものかを平易に説明する
- benefitは「ベステラ社（プラント解体・建設業）の社員が読む」前提で、業務に結びつける
- 抽象的すぎず、具体的なメリットを書く
"""

def load_items() -> list[dict]:
    return json.loads(ITEMS_FILE.read_text(encoding="utf-8")).get("items", [])

def load_translations() -> dict:
    if TRANS_FILE.exists():
        d = json.loads(TRANS_FILE.read_text(encoding="utf-8"))
        d.pop("_note", None)
        return d
    return {}

def save_translations(trans: dict) -> None:
    out = {"_note": "harvester とは別管理。item ID → 日本語要約・業務メリット。サイトが自動マージする。"}
    out.update(trans)
    TRANS_FILE.write_text(json.dumps(out, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

def translate_item(client, item: dict, model: str) -> dict:
    """1件のアイテムを翻訳."""
    user_msg = f"""タイトル: {item.get('title', '')}
説明文: {item.get('summary', '')}
タイプ: {item.get('type', '')}
タグ: {', '.join(item.get('tags', []))}
ソース: {item.get('source', '')}"""

    resp = client.messages.create(
        model=model,
        max_tokens=300,
        system=SYSTEM_PROMPT,
        messages=[{"role": "user", "content": user_msg}],
    )
    text = resp.content[0].text.strip()

    # JSON 抽出（コードブロック内の場合も対応）
    import re
    json_match = re.search(r'\{[^}]+\}', text, re.DOTALL)
    if json_match:
        return json.loads(json_match.group())
    return json.loads(text)

def main():
    parser = argparse.ArgumentParser(description="未翻訳アイテムを Claude API で日本語化")
    parser.add_argument("--dry-run", action="store_true", help="翻訳対象のプレビューのみ")
    parser.add_argument("--all", action="store_true", help="既存翻訳も含め全件再翻訳")
    parser.add_argument("--model", default="haiku", choices=["haiku", "sonnet"], help="使用モデル")
    args = parser.parse_args()

    items = load_items()
    trans = load_translations()

    if args.all:
        targets = items
    else:
        targets = [i for i in items if i["id"] not in trans]

    print(f"[translate] 全 {len(items)} 件中、翻訳対象: {len(targets)} 件")

    if not targets:
        print("[translate] 翻訳対象なし。終了。")
        return

    if args.dry_run:
        for t in targets:
            print(f"  - {t['id']}: {t.get('title','')[:60]}")
        return

    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        print("[translate] エラー: ANTHROPIC_API_KEY が未設定です。")
        print("  設定方法: setx ANTHROPIC_API_KEY \"sk-ant-...\"")
        sys.exit(1)

    import anthropic
    client = anthropic.Anthropic(api_key=api_key)
    model = MODEL_MAP[args.model]

    success = 0
    errors = 0
    for i, item in enumerate(targets, 1):
        try:
            print(f"[{i}/{len(targets)}] {item['id']}...", end=" ", flush=True)
            result = translate_item(client, item, model)
            trans[item["id"]] = result
            save_translations(trans)  # 1件ごとに保存（中断対策）
            print(f"OK: {result.get('summary_ja','')[:40]}...")
            success += 1
            time.sleep(0.5)  # レートリミット配慮
        except Exception as e:
            print(f"ERROR: {e}")
            errors += 1
            continue

    print(f"\n[translate] 完了: {success} 件成功, {errors} 件エラー")
    if success:
        print("[translate] translations.json 更新済み。push するには:")
        print('  cd claude-code-hub && git add data/translations.json && git commit -m "translate: add ja" && git push')

if __name__ == "__main__":
    main()
