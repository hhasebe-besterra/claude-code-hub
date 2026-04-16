"""claude-code-hub ローカル watcher (v2 - 進捗 GitHub 送信対応).

data/selected.json を polling し、新規選択アイテムを apply.py で導入する。
導入状態を data/applied.json に PUT してサイトから見えるようにする。

PAT は環境変数 CCHUB_TOKEN もしくは ~/.cchub_token ファイル。
"""
from __future__ import annotations
import base64
import datetime as dt
import json
import os
import time
import traceback
import urllib.error
import urllib.request
from pathlib import Path

REPO = "hhasebe-besterra/claude-code-hub"
BRANCH = "main"
POLL_SEC = int(os.environ.get("CCHUB_POLL", "30"))
STATE = Path.home() / ".cchub_state.json"
JST = dt.timezone(dt.timedelta(hours=9))

RAW = lambda p: f"https://raw.githubusercontent.com/{REPO}/{BRANCH}/{p}"
API = lambda p: f"https://api.github.com/repos/{REPO}/contents/{p}"


def token() -> str:
    t = os.environ.get("CCHUB_TOKEN")
    if t:
        return t
    f = Path.home() / ".cchub_token"
    if f.exists():
        return f.read_text(encoding="utf-8").strip()
    return ""


def fetch_raw_json(path: str) -> dict:
    req = urllib.request.Request(RAW(path) + "?t=" + str(int(time.time())))
    tok = token()
    if tok:
        req.add_header("Authorization", f"token {tok}")
    with urllib.request.urlopen(req, timeout=20) as r:
        return json.loads(r.read())


def get_sha(path: str) -> str | None:
    tok = token()
    if not tok:
        return None
    req = urllib.request.Request(API(path) + "?ref=" + BRANCH)
    req.add_header("Authorization", f"token {tok}")
    req.add_header("Accept", "application/vnd.github+json")
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            return json.loads(r.read()).get("sha")
    except urllib.error.HTTPError as e:
        if e.code == 404:
            return None
        raise


def put_json(path: str, body: dict, message: str) -> None:
    tok = token()
    if not tok:
        print("[watch] CCHUB_TOKEN 未設定、進捗の GitHub 送信はスキップ")
        return
    content = base64.b64encode((json.dumps(body, ensure_ascii=False, indent=2) + "\n").encode("utf-8")).decode()
    sha = get_sha(path)
    payload = {"message": message, "content": content, "branch": BRANCH}
    if sha:
        payload["sha"] = sha
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(API(path), data=data, method="PUT")
    req.add_header("Authorization", f"token {tok}")
    req.add_header("Accept", "application/vnd.github+json")
    req.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            r.read()
    except urllib.error.HTTPError as e:
        print(f"[watch] put_json 失敗 {path}: {e.code} {e.read()[:200]}")


def load_state() -> dict:
    if STATE.exists():
        return json.loads(STATE.read_text(encoding="utf-8"))
    return {"applied": []}


def save_state(s: dict) -> None:
    STATE.write_text(json.dumps(s, ensure_ascii=False, indent=2), encoding="utf-8")


def push_applied_snapshot(state: dict, progress: dict | None = None, last_result: dict | None = None) -> None:
    body = {
        "updated_at": dt.datetime.now(JST).isoformat(timespec="seconds"),
        "applied": sorted(state.get("applied", [])),
        "progress": progress or {},
        "last_result": last_result or state.get("last_result") or {},
    }
    if last_result:
        state["last_result"] = last_result
        save_state(state)
    put_json("data/applied.json", body, "watcher: apply snapshot")


def tick():
    items = fetch_raw_json("data/items.json").get("items", [])
    items_by_id = {i["id"]: i for i in items}
    sel = set(fetch_raw_json("data/selected.json").get("selected", []))
    state = load_state()
    applied = set(state.get("applied", []))

    # 解除リクエスト：selected から外れているのに applied に残っているもの
    removed = applied - sel
    for iid in list(removed):
        applied.discard(iid)
    if removed:
        state["applied"] = sorted(applied)
        save_state(state)
        push_applied_snapshot(
            state,
            last_result={"action": "removed", "ids": sorted(list(removed)), "at": dt.datetime.now(JST).isoformat(timespec="seconds")},
        )

    todo = sel - applied
    if not todo:
        # 進捗プレースホルダを定期更新（タイムスタンプ確認用）
        push_applied_snapshot(state, progress={})
        return

    import apply as applier  # local import

    todo_sorted = sorted(todo)
    total = len(todo_sorted)
    for idx, iid in enumerate(todo_sorted, 1):
        item = items_by_id.get(iid)
        if not item:
            print(f"[skip] {iid}: item 定義なし")
            continue
        # 処理開始をプッシュ
        progress = {
            "current_id": iid,
            "current_title": item.get("title", ""),
            "current_kind": (item.get("install") or {}).get("kind", ""),
            "index": idx,
            "total": total,
            "started_at": dt.datetime.now(JST).isoformat(timespec="seconds"),
        }
        push_applied_snapshot(state, progress=progress)
        try:
            print(f"[apply {idx}/{total}] {iid}: {item.get('title')}")
            applier.apply_item(item)
            applied.add(iid)
            state["applied"] = sorted(applied)
            save_state(state)
            push_applied_snapshot(
                state,
                progress={"index": idx, "total": total},
                last_result={"action": "applied", "id": iid, "at": dt.datetime.now(JST).isoformat(timespec="seconds"), "kind": progress["current_kind"]},
            )
        except Exception as e:
            print(f"[error] {iid}")
            traceback.print_exc()
            push_applied_snapshot(
                state,
                last_result={"action": "error", "id": iid, "error": str(e)[:200], "at": dt.datetime.now(JST).isoformat(timespec="seconds")},
            )

    # 完了後に進捗クリア
    push_applied_snapshot(state, progress={})


def main():
    print(f"cchub watcher v2: polling {POLL_SEC}s -- ctrl-c で停止")
    while True:
        try:
            tick()
        except Exception:
            traceback.print_exc()
        time.sleep(POLL_SEC)


if __name__ == "__main__":
    main()
