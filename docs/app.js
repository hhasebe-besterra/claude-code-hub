const REPO = "hhasebe-besterra/claude-code-hub";
const BRANCH = "main";
const ITEMS_URL = `https://raw.githubusercontent.com/${REPO}/${BRANCH}/data/items.json`;
const TRANS_URL = `https://raw.githubusercontent.com/${REPO}/${BRANCH}/data/translations.json`;
const SELECTED_PATH = "data/selected.json";
const API = `https://api.github.com/repos/${REPO}/contents/${SELECTED_PATH}`;

let ITEMS = [];
let TRANS = {};
let SELECTED = new Set();
let SELECTED_SHA = null;

const $ = sel => document.querySelector(sel);
const cardsEl = $("#cards");

function toast(msg, ms = 2200) {
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
  if (!r.ok) { SELECTED = new Set(); return; }
  const j = await r.json();
  SELECTED_SHA = j.sha;
  const body = JSON.parse(atob(j.content.replace(/\n/g, "")));
  SELECTED = new Set(body.selected || []);
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
  toast("保存しました（watcher が60秒以内に導入します）");
  return true;
}

function matchesFilter(item) {
  const types = Array.from(document.querySelectorAll(".f:checked")).map(e => e.value);
  if (!types.includes(item.type)) return false;
  if ($("#hotOnly").checked && !item.hot) return false;
  if ($("#hideInstalled").checked && SELECTED.has(item.id)) return false;
  const q = $("#q").value.trim().toLowerCase();
  if (q) {
    const tr = TRANS[item.id] || {};
    const hay = [item.title, item.summary, tr.summary_ja, tr.benefit, (item.tags || []).join(" ")].join(" ").toLowerCase();
    if (!hay.includes(q)) return false;
  }
  return true;
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
    // hot + 新着
    arr.sort((a, b) => {
      if (!!b.hot - !!a.hot) return !!b.hot - !!a.hot;
      const dc = pad(dateKey(b)).localeCompare(pad(dateKey(a)));
      if (dc) return dc;
      return (b.views || 0) - (a.views || 0);
    });
  }
  // 導入済みを末尾へ
  arr.sort((a, b) => (SELECTED.has(a.id) ? 1 : 0) - (SELECTED.has(b.id) ? 1 : 0));
  return arr;
}

function renderSortInfo() {
  const by = $("#sortBy").value;
  const total = ITEMS.length;
  const installed = ITEMS.filter(i => SELECTED.has(i.id)).length;
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

function render() {
  cardsEl.innerHTML = "";
  const visible = sortItems(ITEMS.filter(matchesFilter));
  renderSortInfo();
  if (!visible.length) {
    cardsEl.innerHTML = `<div style="padding:40px;color:#57606a;font-size:15px">該当なし</div>`;
    return;
  }
  for (const it of visible) {
    const tr = TRANS[it.id] || {};
    const summaryJa = tr.summary_ja || "";
    const benefit = tr.benefit || "";
    const summaryEn = it.summary || "";
    const card = document.createElement("article");
    const isInstalled = SELECTED.has(it.id);
    card.className = `card ${it.type}` + (isInstalled ? " installed" : "");
    const viewStr = it.views ? (it.views >= 1000 ? (it.views / 1000).toFixed(1) + "k" : it.views) : "—";

    card.innerHTML = `
      <div class="row">
        <h3>${escapeHtml(it.title)}</h3>
        <span class="type">${it.type}</span>
      </div>
      <div class="summary-ja">${escapeHtml(summaryJa || summaryEn)}</div>
      ${benefit ? `<div class="benefit"><span class="benefit-label">導入メリット</span>${escapeHtml(benefit)}</div>` : ""}
      ${summaryJa && summaryEn ? `<details class="en-detail"><summary>原文（英語）</summary><div class="summary-en">${escapeHtml(summaryEn)}</div></details>` : ""}
      <div class="tags">${(it.tags || []).map(t => `<span>#${escapeHtml(t)}</span>`).join("")}</div>
      <div class="foot">
        <label class="select">
          <input type="checkbox" data-id="${it.id}" ${isInstalled ? "checked" : ""}>
          <span>${isInstalled ? "解除する" : "導入する"}</span>
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
    cb.addEventListener("change", async e => {
      const id = e.target.dataset.id;
      const card = e.target.closest(".card");
      card.classList.add("applying");
      if (e.target.checked) SELECTED.add(id); else SELECTED.delete(id);
      const ok = await pushSelected();
      if (!ok) {
        if (e.target.checked) SELECTED.delete(id); else SELECTED.add(id);
        e.target.checked = !e.target.checked;
      }
      card.classList.remove("applying");
      render();
    });
  });
}

function escapeHtml(s) {
  return (s || "").replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[c]));
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

async function init() {
  $("#sortBy").value = getSortBy();
  await Promise.all([loadItems(), loadTranslations()]);
  try { await loadSelected(); } catch (e) { console.warn(e); }
  render();
  updateTimer();
}
init();
setInterval(updateTimer, 1000);
