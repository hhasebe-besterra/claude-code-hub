"""個別アイテム適用.

install.kind に応じて:
- skill  : ~/.claude/skills/<slug>/... にファイル配置（Box正本にもコピー）
- mcp    : ~/.claude.json の mcpServers に追記
- command: ~/.claude/commands/<name>.md を配置
- note   : Box\\...\\ClaudeCodeLibrary\\claude-code-hub\\notes\\ に保存
"""
from __future__ import annotations
import json, os, urllib.request
from pathlib import Path

REPO = "hhasebe-besterra/claude-code-hub"
BRANCH = "main"
HOME = Path.home()
SKILLS_DIR = HOME / ".claude" / "skills"
COMMANDS_DIR = HOME / ".claude" / "commands"
CLAUDE_JSON = HOME / ".claude.json"
BOX_MIRROR = Path(r"C:\Users\h.hasebe\Box\999.system_besterra\task\164.ClaudeCodeLibrary\skills")
NOTES_DIR = Path(r"C:\Users\h.hasebe\Box\999.system_besterra\task\164.ClaudeCodeLibrary\claude-code-hub\notes")

def fetch_payload(path: str) -> bytes:
    url = f"https://raw.githubusercontent.com/{REPO}/{BRANCH}/{path}"
    with urllib.request.urlopen(url, timeout=30) as r:
        return r.read()

def apply_item(item: dict) -> None:
    inst = item.get("install", {})
    kind = inst.get("kind")
    if kind == "skill":
        _apply_skill(item, inst)
    elif kind == "mcp":
        _apply_mcp(item, inst)
    elif kind == "command":
        _apply_command(item, inst)
    elif kind == "note":
        _apply_note(item, inst)
    else:
        raise ValueError(f"unknown install.kind: {kind}")

def _apply_skill(item: dict, inst: dict) -> None:
    slug = inst["slug"]
    dests = [SKILLS_DIR / slug, BOX_MIRROR / slug]
    for d in dests:
        d.mkdir(parents=True, exist_ok=True)
    for f in inst.get("files", []):
        data = fetch_payload(f["payload"])
        for d in dests:
            (d / f["dest"]).parent.mkdir(parents=True, exist_ok=True)
            (d / f["dest"]).write_bytes(data)
    print(f"  -> skill {slug} installed (~/.claude/skills/ と Box/skills/)")

def _apply_mcp(item: dict, inst: dict) -> None:
    name = inst["name"]
    cfg = inst["config"]
    doc = {}
    if CLAUDE_JSON.exists():
        doc = json.loads(CLAUDE_JSON.read_text(encoding="utf-8"))
    doc.setdefault("mcpServers", {})[name] = cfg
    CLAUDE_JSON.write_text(json.dumps(doc, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"  -> MCP server '{name}' を ~/.claude.json に追記")

def _apply_command(item: dict, inst: dict) -> None:
    name = inst["name"]
    body = fetch_payload(inst["payload"]).decode("utf-8")
    COMMANDS_DIR.mkdir(parents=True, exist_ok=True)
    (COMMANDS_DIR / f"{name}.md").write_text(body, encoding="utf-8")
    print(f"  -> /{name} を ~/.claude/commands/ に配置")

def _apply_note(item: dict, inst: dict) -> None:
    NOTES_DIR.mkdir(parents=True, exist_ok=True)
    fn = inst.get("dest_note") or f"{item['id']}.md"
    p = NOTES_DIR / fn
    p.parent.mkdir(parents=True, exist_ok=True)
    body = f"# {item['title']}\n\n> {item.get('summary','')}\n\n出典: {item.get('source','')}\n収集: {item.get('collected_at','')}\n"
    p.write_text(body, encoding="utf-8")
    print(f"  -> note saved: {p}")

if __name__ == "__main__":
    import sys
    item = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
    apply_item(item)
