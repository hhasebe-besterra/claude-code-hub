const REPO = "hhasebe-besterra/claude-code-hub";
const BRANCH = "main";
const ITEMS_URL = `https://raw.githubusercontent.com/${REPO}/${BRANCH}/data/items.json`;
const TRANS_URL = `https://raw.githubusercontent.com/${REPO}/${BRANCH}/data/translations.json`;
const SELECTED_PATH = "data/selected.json";
const API = `https://api.github.com/repos/${REPO}/contents/${SELECTED_PATH}`;

let ITEMS = [];
let TRANS = {};
let SELECTED_ORIGINAL = new Set();  // 最後に保存された状態（=実際に導入済み）
let SELECTED = new Set();            // 画面での現在の選択（未反映含む）
let SELECTED_SHA = null;

const $ = sel => document.querySelector(sel);
const cardsEl = $("#cards");

function toast(msg, ms = 2500) {
  let el = $("#toast");
  if (!el) {
    el = document.createElement("div");
    el.id = "toast";
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.classList.add("show");
  clearTimeout(toast._t);
  toast._t = setTimeout(() => el.classList.remove("show"), ms);
}

function getToken() { return localStorage.getItem("cchub_pat") || ""; }
function setToken(t) {
  if (t) localStorage.setItem("cchub_pat", t);
  else localStorage.removeItem("cchub_pat");
}
function getSortBy() { return localStorage.getItem("cchub_sort") || "hot"; }
function setSortBy(v) { localStorage.setItem("cchub_sort", v); }

async function loadItems() {
  const r = await fetch(ITEMS_URL + "?t=" + Date.now());
  const j = await r.json();
  ITEMS = j.items || [];
  const genAt = j.generated_at || "?";
  try {
    const d = new Date(genAt);
    const jst = d.toLocaleString("ja-JP", { timeZone: "Asia/Tokyo", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
    $("#lastUpdate").textContent = "最終収集: " + jst;
  } catch {
    $("#lastUpdate").textContent = "最終収集: " + genAt;
  }
}

async function loadTranslations() {
  try {
    const r = await fetch(TRANS_URL + "?t=" + Date.now());
    if (r.ok) {
      TRANS = await r.json();
      delete TRANS._note;
    }
  } catch { /* translations optional */ }
}

async function loadSelected() {
  const token = getToken();
  const headers = token ? { Authorization: `token ${token}` } : {};
  const r = await fetch(API + "?ref=" + BRANCH + "&t=" + Date.now(), { headers });
  if (!r.ok) { SELECTED_ORIGINAL = new Set(); SELECTED = new Set(); return; }
  const j = await r.json();
  SELECTED_SHA = j.sha;
  const body = JSON.parse(atob(j.content.replace(/\n/g, "")));
  SELECTED_ORIGINAL = new Set(body.selected || []);
  SELECTED = new Set(SELECTED_ORIGINAL);
}

async function pushSelected() {
  const token = getToken();
  if (!token) {
    const t = prompt("GitHub PAT（Contents:write, リポジトリ限定）を入力：");
    if (!t) return false;
    setToken(t);
  }
  const body = {
    updated_at: new Date().toISOString(),
    selected: Array.from(SELECTED).sort()
  };
  const content = btoa(unescape(encodeURIComponent(JSON.stringify(body, null, 2) + "\n")));
  const r = await fetch(API, {
    method: "PUT",
    headers: {
      Authorization: `token ${getToken()}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      message: `selected: ${body.selected.length} items`,
      content, sha: SELECTED_SHA, branch: BRANCH
    })
  });
  if (!r.ok) {
    const e = await r.text();
    toast("保存失敗: " + r.status);
    console.error(e);
    return false;
  }
  const j = await r.json();
  SELECTED_SHA = j.content.sha;
  SELECTED_ORIGINAL = new Set(SELECTED);
  return true;
}

function pendingChanges() {
  const toAdd = [];
  const toRemove = [];
  for (const id of SELECTED) if (!SELECTED_ORIGINAL.has(id)) toAdd.push(id);
  for (const id of SELECTED_ORIGINAL) if (!SELECTED.has(id)) toRemove.push(id);
  return { toAdd, toRemove };
}

function matchesFilter(item) {
  const types = Array.from(document.querySelectorAll(".f:checked")).map(e => e.value);
  if (!types.includes(item.type)) return false;
  if ($("#hotOnly").checked && !item.hot) return false;
  if ($("#hideInstalled").checked && SELECTED_ORIGINAL.has(item.id)) return false;
  const q = $("#q").value.trim().toLowerCase();
  if (q) {
    const tr = TRANS[item.id] || {};
    const hay = [item.title, item.summary, tr.summary_ja, tr.benefit, (item.tags || []).join(" ")].join(" ").toLowerCase();
    if (!hay.includes(q)) return false;
  }
  return true;
}

function stateOf(id) {
  const orig = SELECTED_ORIGINAL.has(id);
  const cur = SELECTED.has(id);
  if (orig && cur) return "installed";     // 導入済み（変更なし）
  if (!orig && cur) return "pending_add";  // 導入予約
  if (orig && !cur) return "pending_rm";   // 解除予約
  return "none";                           // 未導入
}

function sortItems(items) {
  const by = $("#sortBy").value;
  const arr = items.slice();
  const pad = s => (s || "").padStart(10, "0");
  const dateKey = x => x.collected_at || x.published_at || "0000-00-00";

  if (by === "date") {
    arr.sort((a, b) => pad(dateKey(b)).localeCompare(pad(dateKey(a))) || (b.views || 0) - (a.views || 0));
  } else if (by === "views") {
    arr.sort((a, b) => (b.views || 0) - (a.views || 0) || pad(dateKey(b)).localeCompare(pad(dateKey(a))));
  } else if (by === "type") {
    const tOrder = { mcp: 0, skill: 1, command: 2, tip: 3 };
    arr.sort((a, b) => (tOrder[a.type] ?? 99) - (tOrder[b.type] ?? 99) || (b.views || 0) - (a.views || 0));
  } else {
    arr.sort((a, b) => {
      if (!!b.hot - !!a.hot) return !!b.hot - !!a.hot;
      const dc = pad(dateKey(b)).localeCompare(pad(dateKey(a)));
      if (dc) return dc;
      return (b.views || 0) - (a.views || 0);
    });
  }
  // 導入済みを末尾へ（予約カードは上位に残す）
  arr.sort((a, b) => {
    const sa = stateOf(a.id) === "installed" ? 1 : 0;
    const sb = stateOf(b.id) === "installed" ? 1 : 0;
    return sa - sb;
  });
  return arr;
}

function renderSortInfo() {
  const by = $("#sortBy").value;
  const total = ITEMS.length;
  const installed = ITEMS.filter(i => SELECTED_ORIGINAL.has(i.id)).length;
  const labels = {
    hot: "🔥ホットな投稿を先頭 → 新しい日付順 → 視聴数が多い順",
    date: "📅 収集日が新しい順 → 視聴数が多い順",
    views: "⭐ 視聴数が多い順 → 収集日が新しい順",
    type: "🗂 種別（MCP → Skill → Command → Tip）→ 視聴数が多い順"
  };
  const el = $("#sortInfo");
  el.innerHTML = `
    <strong>表示順:</strong> ${labels[by]}
    　｜　<strong>導入済みは末尾＋グレーアウト</strong>
    　｜　件数: ${total} 件（うち導入済み ${installed} 件）
  `;
}

function renderApplyBar() {
  const { toAdd, toRemove } = pendingChanges();
  const pending = toAdd.length + toRemove.length;
  const btn = $("#applyBtn");
  const cancel = $("#cancelBtn");
  const bar = $("#applyBar");
  const info = $("#applyInfo");

  if (pending === 0) {
    bar.classList.remove("active");
    btn.disabled = true;
    cancel.disabled = true;
    info.innerHTML = "変更なし（チェックを入れ替えると「反映」ボタンが有効になります）";
    btn.textContent = "反映する";
  } else {
    bar.classList.add("active");
    btn.disabled = false;
    cancel.disabled = false;
    const parts = [];
    if (toAdd.length) parts.push(`<span class="badge-add">➕ 導入予約 ${toAdd.length} 件</span>`);
    if (toRemove.length) parts.push(`<span class="badge-rm">➖ 解除予約 ${toRemove.length} 件</span>`);
    info.innerHTML = parts.join(" ／ ");
    btn.textContent = `反映する（${pending} 件）`;
  }
}

function render() {
  cardsEl.innerHTML = "";
  const visible = sortItems(ITEMS.filter(matchesFilter));
  renderSortInfo();
  renderApplyBar();
  if (!visible.length) {
    cardsEl.innerHTML = `<div style="padding:40px;color:#57606a;font-size:15px">該当なし</div>`;
    return;
  }
  for (const it of visible) {
    const tr = TRANS[it.id] || {};
    const summaryJa = tr.summary_ja || "";
    const benefit = tr.benefit || "";
    const summaryEn = it.summary || "";
    const state = stateOf(it.id);
    const card = document.createElement("article");
    card.className = `card ${it.type} state-${state}`;
    const isChecked = SELECTED.has(it.id);
    const viewStr = it.views ? (it.views >= 1000 ? (it.views / 1000).toFixed(1) + "k" : it.views) : "—";

    const stateBadge = ({
      installed:   '<span class="state-badge b-installed">✅ 導入済み</span>',
      pending_add: '<span class="state-badge b-pending-add">⏳ 導入予約（未反映）</span>',
      pending_rm:  '<span class="state-badge b-pending-rm">↩ 解除予約（未反映）</span>',
      none:        ''
    })[state];

    const labelText = ({
      installed:   "☑ 選択中（導入済み）",
      pending_add: "☑ 選択中（未反映）",
      pending_rm:  "☐ 解除対象（未反映）",
      none:        "☐ 導入する"
    })[state];

    card.innerHTML = `
      <div class="row">
        <h3>${escapeHtml(it.title)}</h3>
        <span class="type">${it.type}</span>
      </div>
      ${stateBadge}
      <div class="summary-ja">${escapeHtml(summaryJa || summaryEn)}</div>
      ${benefit ? `<div class="benefit"><span class="benefit-label">導入メリット</span>${escapeHtml(benefit)}</div>` : ""}
      ${summaryJa && summaryEn ? `<details class="en-detail"><summary>原文（英語）</summary><div class="summary-en">${escapeHtml(summaryEn)}</div></details>` : ""}
      <div class="tags">${(it.tags || []).map(t => `<span>#${escapeHtml(t)}</span>`).join("")}</div>
      <div class="foot">
        <label class="select">
          <input type="checkbox" data-id="${it.id}" ${isChecked ? "checked" : ""}>
          <span>${labelText}</span>
        </label>
        <div>
          ${it.hot ? '<span class="hot">🔥</span> ' : ""}
          ★ ${viewStr} ・
          <a href="${it.source}" target="_blank" rel="noopener">出典</a> ・
          ${it.collected_at || ""}
        </div>
      </div>`;
    cardsEl.appendChild(card);
  }
  cardsEl.querySelectorAll("input[data-id]").forEach(cb => {
    cb.addEventListener("change", e => {
      const id = e.target.dataset.id;
      if (e.target.checked) SELECTED.add(id); else SELECTED.delete(id);
      render();
    });
  });
}

function escapeHtml(s) {
  return (s || "").replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[c]));
}

async function applyPending() {
  const { toAdd, toRemove } = pendingChanges();
  if (!toAdd.length && !toRemove.length) return;
  $("#applyBtn").disabled = true;
  $("#cancelBtn").disabled = true;
  const ok = await pushSelected();
  if (ok) {
    toast(`反映完了（+${toAdd.length} / -${toRemove.length}）watcherが60秒以内に適用します`);
  }
  render();
}

function cancelPending() {
  SELECTED = new Set(SELECTED_ORIGINAL);
  render();
  toast("未反映の変更を破棄しました");
}

// --- タイマー: 毎時 00 分に収集 ---
function updateTimer() {
  const el = $("#nextUpdate");
  if (!el) return;
  const now = new Date();
  const nextHour = new Date(now);
  nextHour.setUTCMinutes(0, 0, 0);
  nextHour.setUTCHours(nextHour.getUTCHours() + 1);
  const diffSec = Math.max(0, Math.floor((nextHour - now) / 1000));
  const m = Math.floor(diffSec / 60);
  const s = diffSec % 60;
  el.textContent = `次回収集: ${m}分${s.toString().padStart(2,"0")}秒後`;
  el.title = "毎時 00 分に GitHub Actions で自動収集";
}

document.querySelectorAll(".f, #hotOnly, #hideInstalled").forEach(el => el.addEventListener("change", render));
$("#q").addEventListener("input", render);
$("#sortBy").addEventListener("change", () => { setSortBy($("#sortBy").value); render(); });
$("#refreshBtn").addEventListener("click", async () => { await init(); toast("再読込完了"); });
$("#authBtn").addEventListener("click", () => {
  const cur = getToken();
  const t = prompt("PAT（空で削除）:", cur ? "(保存済み)" : "");
  if (t === null) return;
  if (t === "" || t === "(保存済み)") { if (t === "") { setToken(""); toast("PAT削除"); } return; }
  setToken(t); toast("PAT保存");
});
$("#applyBtn").addEventListener("click", applyPending);
$("#cancelBtn").addEventListener("click", cancelPending);

window.addEventListener("beforeunload", (e) => {
  const { toAdd, toRemove } = pendingChanges();
  if (toAdd.length + toRemove.length > 0) {
    e.preventDefault();
    e.returnValue = "未反映の変更があります。反映せずに閉じますか？";
    return e.returnValue;
  }
});

async function init() {
  $("#sortBy").value = getSortBy();
  await Promise.all([loadItems(), loadTranslations()]);
  try { await loadSelected(); } catch (e) { console.warn(e); }
  render();
  updateTimer();
}
init();
setInterval(updateTimer, 1000);
