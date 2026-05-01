const state = {
  payload: null,
  activeSection: ""
};

const formatter = new Intl.DateTimeFormat("ja-JP", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit"
});

load();

async function load() {
  try {
    const response = await fetch("./data/latest.json", { cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    state.payload = await response.json();
    state.activeSection = state.payload.sections?.[0]?.section || "";
    render();
  } catch (error) {
    document.querySelector("#sectionItems").innerHTML =
      `<div class="empty">まだ data/latest.json が生成されていません。GitHub Actions または npm run collect を実行してください。</div>`;
  }
}

function render() {
  const payload = state.payload;
  const sections = payload.sections || [];
  const itemCount = sections.reduce((sum, section) => sum + section.items.length, 0);

  text("#generatedAt", formatDate(payload.generatedAt));
  text("#compareYears", `${payload.compare.previousYear} → ${payload.compare.currentYear}`);
  text("#itemCount", String(itemCount));

  renderRanking("#citationGrowth", payload.rankings?.growingCitationPapers || [], "trend");
  renderRanking("#accessGrowth", payload.rankings?.growingAccessItems || [], "access");
  renderTabs(sections);
  renderSection(sections.find((section) => section.section === state.activeSection) || sections[0]);
}

function renderRanking(selector, items, metricKey) {
  const node = document.querySelector(selector);
  if (!items.length) {
    node.innerHTML = `<div class="empty">該当データはまだありません。</div>`;
    return;
  }

  node.innerHTML = items.slice(0, 6).map((item) => {
    const metric = item[metricKey] || {};
    const delta = metric.delta ?? 0;
    return `<a href="${escapeAttr(item.url)}" target="_blank" rel="noreferrer">
      <span>${escapeHtml(item.title)}</span>
      <span class="delta">+${escapeHtml(String(delta))}</span>
    </a>`;
  }).join("");
}

function renderTabs(sections) {
  const tabs = document.querySelector("#tabs");
  tabs.innerHTML = sections.map((section) => {
    const selected = section.section === state.activeSection;
    return `<button type="button" data-section="${escapeAttr(section.section)}" aria-selected="${selected}">
      ${escapeHtml(section.title)} (${section.items.length})
    </button>`;
  }).join("");

  tabs.querySelectorAll("button").forEach((button) => {
    button.addEventListener("click", () => {
      state.activeSection = button.dataset.section;
      render();
    });
  });
}

function renderSection(section) {
  const container = document.querySelector("#sectionItems");
  if (!section || !section.items.length) {
    container.innerHTML = `<div class="empty">表示できる項目がありません。</div>`;
    return;
  }

  const template = document.querySelector("#itemTemplate");
  container.innerHTML = "";

  for (const item of section.items) {
    const fragment = template.content.cloneNode(true);
    fragment.querySelector(".kind").textContent = item.kind || section.section;
    fragment.querySelector(".date").textContent = formatDate(item.publishedAt);
    const link = fragment.querySelector(".title");
    link.textContent = item.title;
    link.href = item.url;
    fragment.querySelector(".summaryText").textContent = item.summary || "";
    fragment.querySelector(".meta").innerHTML = renderMeta(item);
    container.append(fragment);
  }
}

function renderMeta(item) {
  const parts = [];
  if (item.source) parts.push(item.source);
  if (item.trend?.available) parts.push(`citations ${item.trend.previousValue}→${item.trend.currentValue}`);
  if (item.access?.available) parts.push(`views ${item.access.previousValue}→${item.access.currentValue}`);
  if (item.metrics?.points) parts.push(`${item.metrics.points} pts`);
  if (item.closeDate) parts.push(`close ${item.closeDate}`);
  return parts.map((part) => `<span>${escapeHtml(String(part))}</span>`).join("");
}

function formatDate(value) {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? formatter.format(date) : "-";
}

function text(selector, value) {
  document.querySelector(selector).textContent = value;
}

function escapeHtml(value) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escapeAttr(value) {
  return escapeHtml(value).replace(/'/g, "&#39;");
}
