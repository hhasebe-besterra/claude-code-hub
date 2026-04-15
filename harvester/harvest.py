"""claude-code-hub 日次収集スクリプト.

現時点の実装:
  1. curated.yaml を読み込み
  2. GitHub Trending（REST 検索）で claude-code / mcp-server 関連を取得
  3. items.json に書き出し（hot/flag_huge を計算）

X 収集は後続で追加予定（Playwright + pw_profile を使う）。
"""
from __future__ import annotations
import json, os, sys, urllib.request, urllib.parse, datetime as dt
from pathlib import Path
import yaml

ROOT = Path(__file__).resolve().parents[1]
SOURCES = yaml.safe_load((ROOT / "harvester" / "sources.yaml").read_text(encoding="utf-8"))
CURATED = yaml.safe_load((ROOT / "harvester" / "curated.yaml").read_text(encoding="utf-8")) or []
OUT = ROOT / "data" / "items.json"

HOT = SOURCES["thresholds"]["hot_views"]
HUGE = SOURCES["thresholds"]["flag_huge"]

def today() -> str:
    return dt.datetime.now(dt.timezone(dt.timedelta(hours=9))).strftime("%Y-%m-%d")

def gh_search(q: str, limit: int = 10) -> list[dict]:
    url = f"https://api.github.com/search/repositories?q={urllib.parse.quote(q)}&sort=stars&order=desc&per_page={limit}"
    req = urllib.request.Request(url, headers={"Accept": "application/vnd.github+json"})
    tok = os.environ.get("GITHUB_TOKEN")
    if tok:
        req.add_header("Authorization", f"Bearer {tok}")
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read()).get("items", [])

def gh_items() -> list[dict]:
    out = []
    for src in SOURCES.get("github_trending", []):
        topic = src["topic"]
        repos = gh_search(f"topic:{topic}")
        for repo in repos:
            stars = repo.get("stargazers_count", 0)
            item = {
                "id": f"gh-{repo['full_name'].replace('/', '-')}",
                "title": repo["full_name"],
                "type": "mcp" if "mcp" in (repo.get("description") or "").lower() or "mcp" in repo["name"].lower() else "tip",
                "summary": (repo.get("description") or "")[:300],
                "source": repo["html_url"],
                "author": repo["owner"]["login"],
                "published_at": repo.get("created_at", "")[:10],
                "collected_at": today(),
                "views": stars * 10,   # stars を views相当に換算（便宜）
                "tags": [topic] + (repo.get("topics") or [])[:4],
                "install": {"kind": "note", "dest_note": f"github_trending/{repo['full_name'].replace('/', '_')}.md"}
            }
            out.append(item)
    return out

def mark_hot(item: dict) -> dict:
    v = item.get("views", 0) or 0
    item["hot"] = v >= HOT
    item["collected_at"] = item.get("collected_at") or today()
    return item

def main():
    items = []
    for c in CURATED:
        items.append(mark_hot(c))
    try:
        items.extend(mark_hot(i) for i in gh_items())
    except Exception as e:
        print(f"[warn] GitHub search failed: {e}", file=sys.stderr)

    seen = {}
    for it in items:
        seen[it["id"]] = it
    items = sorted(seen.values(), key=lambda x: (-int(x.get("views") or 0), x["id"]))

    doc = {
        "generated_at": dt.datetime.now(dt.timezone(dt.timedelta(hours=9))).isoformat(timespec="seconds"),
        "generator": "harvest.py",
        "items": items
    }
    OUT.write_text(json.dumps(doc, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"wrote {len(items)} items to {OUT}")

    huge = [i for i in items if (i.get("views") or 0) >= HUGE]
    if huge:
        print(f"\n[!] 表示数が大きいアイテム ({len(huge)}件):")
        for i in huge:
            print(f"  - {i['title']} ({i.get('views'):,} views) {i.get('source')}")

if __name__ == "__main__":
    main()
