"""X (Twitter) から Claude Code 関連ポストを収集するローカルスクリプト.

Playwright MCP のブラウザセッションは使わず、独自にブラウザを起動する。
ログイン済みプロファイルを使用して認証済み状態でアクセスする。

使い方:
  python x_harvest.py                    # 全検索ワードで収集
  python x_harvest.py --query "Claude Code tips"  # 特定ワードで収集
  python x_harvest.py --dry-run          # 保存せずプレビュー
"""
from __future__ import annotations
import argparse, json, re, sys, datetime as dt
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "data"
ITEMS_FILE = DATA_DIR / "items.json"
SOURCES_FILE = ROOT / "harvester" / "sources.yaml"

def today() -> str:
    return dt.datetime.now(dt.timezone(dt.timedelta(hours=9))).strftime("%Y-%m-%d")

def load_sources() -> dict:
    import yaml
    return yaml.safe_load(SOURCES_FILE.read_text(encoding="utf-8"))

def search_x(query: str, limit: int = 20, headless: bool = False) -> list[dict]:
    """Playwright で X を検索し、ポスト情報を抽出する."""
    from playwright.sync_api import sync_playwright

    results = []
    search_url = f"https://x.com/search?q={query}&src=typed_query&f=top"

    with sync_playwright() as p:
        # ユーザーデータディレクトリを使ってログイン状態を保持
        user_data = str(Path.home() / ".cchub_x_profile")
        browser = p.chromium.launch_persistent_context(
            user_data,
            headless=headless,
            viewport={"width": 1280, "height": 900},
            locale="ja-JP",
        )
        page = browser.pages[0] if browser.pages else browser.new_page()

        print(f"[x_harvest] 検索: {query}")
        page.goto(search_url, wait_until="domcontentloaded", timeout=60000)
        page.wait_for_timeout(5000)

        # ログインチェック
        if "login" in page.url.lower() or page.query_selector('input[name="text"]'):
            print("[x_harvest] ログインが必要です。ブラウザでログインしてください...")
            print("[x_harvest] ログイン後、Enterキーを押してください。")
            input()
            page.goto(search_url, wait_until="domcontentloaded", timeout=60000)
            page.wait_for_timeout(5000)

        # スクロールしてポストを読み込む
        for _ in range(3):
            page.evaluate("window.scrollBy(0, window.innerHeight)")
            page.wait_for_timeout(1500)

        # ポストを抽出
        tweets = page.query_selector_all('article[data-testid="tweet"]')
        print(f"[x_harvest] {len(tweets)} 件のポストを検出")

        for tweet in tweets[:limit]:
            try:
                item = _extract_tweet(tweet, query)
                if item:
                    results.append(item)
            except Exception as e:
                print(f"[x_harvest] 抽出エラー: {e}")
                continue

        browser.close()

    return results

def _extract_tweet(tweet, query: str) -> dict | None:
    """1つのツイート要素から情報を抽出."""
    # ユーザー名
    user_el = tweet.query_selector('div[data-testid="User-Name"]')
    if not user_el:
        return None
    user_text = user_el.inner_text()
    # @handle を抽出
    handle_match = re.search(r"@(\w+)", user_text)
    handle = handle_match.group(1) if handle_match else "unknown"

    # 本文
    text_el = tweet.query_selector('div[data-testid="tweetText"]')
    text = text_el.inner_text() if text_el else ""
    if not text:
        return None

    # 時刻
    time_el = tweet.query_selector("time")
    published = time_el.get_attribute("datetime")[:10] if time_el else today()

    # リンク（ツイートURL）
    link_el = tweet.query_selector('a[href*="/status/"]')
    tweet_url = ""
    if link_el:
        href = link_el.get_attribute("href")
        if href and "/status/" in href:
            tweet_url = f"https://x.com{href}" if href.startswith("/") else href

    # エンゲージメント（いいね数など）
    views = 0
    metrics = tweet.query_selector_all('div[data-testid$="count"]')
    for m in metrics:
        try:
            val = m.inner_text().replace(",", "").strip()
            if val.endswith("K"):
                views = max(views, int(float(val[:-1]) * 1000))
            elif val.endswith("M"):
                views = max(views, int(float(val[:-1]) * 1000000))
            elif val.isdigit():
                views = max(views, int(val))
        except:
            pass

    # URL抽出（ポスト内のリンク）
    links = tweet.query_selector_all('a[href*="github.com"], a[href*="anthropic"]')
    external_url = ""
    for l in links:
        href = l.get_attribute("href") or ""
        if "github.com" in href or "anthropic" in href:
            external_url = href
            break

    # ID生成
    tweet_id = ""
    if tweet_url:
        match = re.search(r"/status/(\d+)", tweet_url)
        tweet_id = f"x-{handle}-{match.group(1)}" if match else f"x-{handle}-{published}"
    else:
        tweet_id = f"x-{handle}-{published}-{hash(text) % 10000}"

    # タイプ推定
    text_lower = text.lower()
    if "mcp" in text_lower and ("server" in text_lower or "install" in text_lower):
        item_type = "mcp"
    elif "skill" in text_lower or "slash command" in text_lower:
        item_type = "skill"
    elif "command" in text_lower and ("claude" in text_lower):
        item_type = "command"
    else:
        item_type = "tip"

    return {
        "id": tweet_id,
        "title": f"@{handle}: {text[:60]}{'...' if len(text) > 60 else ''}",
        "type": item_type,
        "summary": text[:300],
        "source": tweet_url or f"https://x.com/{handle}",
        "author": f"@{handle}",
        "published_at": published,
        "collected_at": today(),
        "views": views,
        "tags": _extract_tags(text, query),
        "install": {"kind": "note", "dest_note": f"x_posts/{tweet_id}.md"},
    }

def _extract_tags(text: str, query: str) -> list[str]:
    """テキストからタグを推定."""
    tags = []
    text_lower = text.lower()
    keyword_tags = {
        "claude code": "claude-code",
        "mcp": "mcp",
        "skill": "skill",
        "hook": "hooks",
        "agent": "agents",
        "anthropic": "anthropic",
        "prompt": "prompting",
        "context": "context",
    }
    for kw, tag in keyword_tags.items():
        if kw in text_lower:
            tags.append(tag)

    # ハッシュタグ
    hashtags = re.findall(r"#(\w+)", text)
    tags.extend(ht.lower() for ht in hashtags[:3])

    return list(dict.fromkeys(tags))[:5]  # 重複除去、最大5

def merge_items(new_items: list[dict]) -> int:
    """既存 items.json に新規アイテムをマージ."""
    doc = json.loads(ITEMS_FILE.read_text(encoding="utf-8"))
    existing_ids = {i["id"] for i in doc["items"]}

    added = 0
    for item in new_items:
        if item["id"] not in existing_ids:
            # hot 判定
            from harvest import HOT
            item["hot"] = (item.get("views") or 0) >= HOT
            doc["items"].append(item)
            existing_ids.add(item["id"])
            added += 1

    if added:
        doc["items"].sort(key=lambda x: (-int(x.get("views") or 0), x["id"]))
        doc["generated_at"] = dt.datetime.now(dt.timezone(dt.timedelta(hours=9))).isoformat(timespec="seconds")
        ITEMS_FILE.write_text(json.dumps(doc, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    return added

def main():
    parser = argparse.ArgumentParser(description="X から Claude Code 関連ポストを収集")
    parser.add_argument("--query", help="検索クエリ（省略時は sources.yaml の全キーワード）")
    parser.add_argument("--limit", type=int, default=15, help="各クエリの最大取得件数")
    parser.add_argument("--dry-run", action="store_true", help="保存せずプレビュー")
    parser.add_argument("--headless", action="store_true", help="ヘッドレスモードで実行")
    args = parser.parse_args()

    queries = [args.query] if args.query else load_sources().get("x_search_terms", ["Claude Code"])
    all_items = []

    for q in queries:
        items = search_x(q, limit=args.limit, headless=getattr(args, 'headless', False))
        all_items.extend(items)
        print(f"  [{q}] → {len(items)} 件")

    # 重複除去
    seen = {}
    for it in all_items:
        seen[it["id"]] = it
    all_items = list(seen.values())
    print(f"\n[x_harvest] 合計: {len(all_items)} 件（重複除去済み）")

    if args.dry_run:
        for it in all_items[:10]:
            print(f"  {it['id']}: {it['title']}")
        return

    added = merge_items(all_items)
    print(f"[x_harvest] {added} 件を items.json に追加")

    if added:
        print("[x_harvest] git commit & push するには:")
        print('  cd claude-code-hub && git add data/items.json && git commit -m "x_harvest: add posts" && git push')

if __name__ == "__main__":
    main()
