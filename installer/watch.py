"""claude-code-hub ローカル watcher.

data/selected.json を polling し、新規選択アイテムを apply.py 経由で導入する。
PAT は環境変数 CCHUB_TOKEN もしくは ~/.cchub_token ファイル。
"""
from __future__ import annotations
import json, os, sys, time, traceback, urllib.request
from pathlib import Path

REPO = "hhasebe-besterra/claude-code-hub"
BRANCH = "main"
POLL_SEC = int(os.environ.get("CCHUB_POLL", "60"))
STATE = Path.home() / ".cchub_state.json"

RAW = lambda p: f"https://raw.githubusercontent.com/{REPO}/{BRANCH}/{p}"

def token() -> str:
    t = os.environ.get("CCHUB_TOKEN")
    if t: return t
    f = Path.home() / ".cchub_token"
    if f.exists(): return f.read_text(encoding="utf-8").strip()
    return ""

def fetch_json(path: str) -> dict:
    req = urllib.request.Request(RAW(path))
    tok = token()
    if tok:
        req.add_header("Authorization", f"token {tok}")
    with urllib.request.urlopen(req, timeout=20) as r:
        return json.loads(r.read())

def load_state() -> dict:
    if STATE.exists():
        return json.loads(STATE.read_text(encoding="utf-8"))
    return {"applied": []}

def save_state(s: dict) -> None:
    STATE.write_text(json.dumps(s, ensure_ascii=False, indent=2), encoding="utf-8")

def tick():
    items = fetch_json("data/items.json").get("items", [])
    items_by_id = {i["id"]: i for i in items}
    sel = set(fetch_json("data/selected.json").get("selected", []))
    state = load_state()
    applied = set(state.get("applied", []))
    todo = sel - applied
    if not todo:
        return
    import apply as applier  # local import
    for iid in sorted(todo):
        item = items_by_id.get(iid)
        if not item:
            print(f"[skip] {iid}: item 定義なし")
            continue
        try:
            print(f"[apply] {iid}: {item.get('title')}")
            applier.apply_item(item)
            applied.add(iid)
            state["applied"] = sorted(applied)
            save_state(state)
        except Exception:
            print(f"[error] {iid}")
            traceback.print_exc()

def main():
    print(f"cchub watcher: polling {POLL_SEC}s -- ctrl-c で停止")
    while True:
        try:
            tick()
        except Exception:
            traceback.print_exc()
        time.sleep(POLL_SEC)

if __name__ == "__main__":
    main()
