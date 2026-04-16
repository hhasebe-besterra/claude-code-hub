const REPO = "hhasebe-besterra/claude-code-hub";
const BRANCH = "main";
const ITEMS_URL = `https://raw.githubusercontent.com/${REPO}/${BRANCH}/data/items.json`;
const TRANS_URL = `https://raw.githubusercontent.com/${REPO}/${BRANCH}/data/translations.json`;
const SELECTED_PATH = "data/selected.json";
const API = `https://api.github.com/repos/${REPO}/contents/${SELECTED_PATH}`;

// 次回 harvest 時刻 (毎日 06:00 JST = 21:00 UTC)
const HARVEST_HOUR_JST = 6;

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

function getToken() {
  return localStorage.getItem("cchub_pat") || "";
}
function setToken(t) {
  if (t) localStorage.setItem("cchub_pat", t);
  else localStorage.removeItem("cchub_pat");
}

async function loadItems() {
  const r = await fetch(ITEMS_URL + "?t=" + Date.now());
  const j = await r.json();
  ITEMS = j.items || [];
  const genAt = j.generated_at || "?";
  // 日本時間で見やすい形式に
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
  toast("保存しました（watcher が数分以内に導入します）");
  return true;
}

function matchesFilter(item) {
  const types = Array.from(document.querySelectorAll(".f:checked")).map(e => e.value);
  if (!types.includes(item.type)) return false;
  if ($("#hotOnly").checked && !item.hot) return false;
  const q = $("#q").value.trim().toLowerCase();
  if (q) {
    const tr = TRANS[item.id] || {};
    const hay = [item.title, item.summary, tr.summary_ja, tr.benefit, (item.tags || []).join(" ")].join(" ").toLowerCase();
    if (!hay.includes(q)) return false;
  }
  return true;
}

function render() {
  cardsEl.innerHTML = "";
  const visible = ITEMS.filter(matchesFilter);
  if (!visible.length) {
    cardsEl.innerHTML = `<div style="padding:40px;color:#57606a">該当なし</div>`;
    return;
  }
  for (const it of visible) {
    const tr = TRANS[it.id] || {};
    const summaryJa = tr.summary_ja || "";
    const benefit = tr.benefit || "";
    const summaryEn = it.summary || "";
    const card = document.createElement("article");
    card.className = `card ${it.type}` + (SELECTED.has(it.id) ? " selected" : "");
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
          <input type="checkbox" data-id="${it.id}" ${SELECTED.has(it.id) ? "checked" : ""}>
          導入する
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
      card.classList.toggle("selected", SELECTED.has(id));
    });
  });
}

function escapeHtml(s) {
  return (s || "").replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[c]));
}

// --- タイマー ---
function updateTimer() {
  const el = $("#nextUpdate");
  if (!el) return;
  const now = new Date();
  // 次の 06:00 JST を計算
  const jstOffset = 9 * 60; // minutes
  const utcMinutes = now.getUTCHours() * 60 + now.getUTCMinutes();
  const jstMinutes = (utcMinutes + jstOffset) % (24 * 60);
  const targetMinutes = HARVEST_HOUR_JST * 60; // 06:00
  let diffMin = targetMinutes - jstMinutes;
  if (diffMin <= 0) diffMin += 24 * 60;
  const h = Math.floor(diffMin / 60);
  const m = diffMin % 60;
  el.textContent = `次回収集: ${h}時間${m}分後`;
  el.title = `毎朝 ${HARVEST_HOUR_JST}:00 JST に GitHub Actions で自動収集`;
}

document.querySelectorAll(".f, #hotOnly").forEach(el => el.addEventListener("change", render));
$("#q").addEventListener("input", render);
$("#refreshBtn").addEventListener("click", async () => { await init(); toast("再読込完了"); });
$("#authBtn").addEventListener("click", () => {
  const cur = getToken();
  const t = prompt("PAT（空で削除）:", cur ? "(保存済み)" : "");
  if (t === null) return;
  if (t === "" || t === "(保存済み)") { if (t === "") { setToken(""); toast("PAT削除"); } return; }
  setToken(t); toast("PAT保存");
});

async function init() {
  await Promise.all([loadItems(), loadTranslations()]);
  try { await loadSelected(); } catch (e) { console.warn(e); }
  render();
  updateTimer();
}
init();
setInterval(updateTimer, 60000);
