// ═══════════════════════════════════════════════════════════════════
// Cereportal Neuro Daily — front-end controller (news magazine)
// ───────────────────────────────────────────────────────────────────
// - loads /data/feeds.json, /data/latest-draft.json, /data/drafts-history.json
// - hero (top story) + 4 category sections + editor's note + archive
// - market/grants categories show headlines + source link only (copyright)
// ═══════════════════════════════════════════════════════════════════

const $ = (id) => document.getElementById(id);

// Categories where we are licensed/permitted to show summaries.
// Everything else (statnews / sciencedaily / techcrunch) is title + link only.
const SUMMARY_OK = new Set(["papers", "aineuro", "bci"]);

const CAT_LABEL = {
  bci: "BCI",
  papers: "論文",
  aineuro: "AI for Neuro",
  market: "産業ニュース",
  grants: "助成金 / ライフサイエンス",
};

const CAT_KEYS = ["bci", "papers", "aineuro", "market", "grants"];

// Sources we recognise — feeds back into the source badge color
const KNOWN_SOURCES = new Set([
  "arxiv.org",
  "statnews.com",
  "techcrunch.com",
  "sciencedaily.com",
  "spectrum.ieee.org",
  "pubmed.ncbi.nlm.nih.gov",
]);

const els = {
  body: document.body,
  // masthead
  date: $("masthead-date"),
  issue: $("masthead-issue"),
  status: $("status-label"),
  // hero
  poster: $("poster-svg"),
  heroBadge: $("hero-badge"),
  heroKicker: $("hero-kicker"),
  heroHeadline: $("hero-headline-text"),
  heroLink: $("hero-headline-link"),
  heroDek: $("hero-dek"),
  heroSource: $("hero-source"),
  heroPublished: $("hero-published"),
  heroRisk: $("hero-risk"),
  heroLede: $("hero-lede"),
  heroPaperBtn: $("hero-paper-btn"),
  heroTime: $("hero-time"),
  // editor's pick
  editorsTemplate: $("editors-template"),
  editorsTemplateName: $("editors-template-name"),
  editorsPaperTitle: $("editors-paper-title"),
  editorsAuthors: $("editors-authors"),
  editorsKeywords: $("editors-keywords"),
  editorsAbstract: $("editors-abstract"),
  editorsAbstractCite: $("editors-abstract-cite"),
  editorsNote: $("editors-note"),
  // draft
  draftCollapse: $("draft-collapse"),
  draftText: $("draft-text"),
  paperBtn: $("paper-btn"),
  copyBtn: $("copy-btn"),
  // figures
  figureStrip: $("figure-strip"),
  figureCount: $("figure-count"),
  figureList: $("figure-list"),
  // archive
  archiveList: $("archive-list"),
  archiveCount: $("archive-count"),
  // toast
  toast: $("toast"),
  // accent
  accentPath: $("eeg-accent-path"),
};

let currentDraft = null;

/* ────────── helpers ────────── */
const pad = (n, w = 2) => String(n).padStart(w, "0");

function safe(s) { return (s == null || s === "") ? "—" : s; }

function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeXml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function loadJson(path) {
  return fetch(`${path}?t=${Date.now()}`, { cache: "no-store" }).then((r) => {
    if (!r.ok) throw new Error(`HTTP ${r.status} for ${path}`);
    return r.json();
  });
}

function dayOfYear(d) {
  const start = new Date(d.getFullYear(), 0, 0);
  return Math.floor((d - start) / 86400000);
}

function formatLongDateJP(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const days = ["日", "月", "火", "水", "木", "金", "土"];
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日（${days[d.getDay()]}） ${pad(d.getHours())}:${pad(d.getMinutes())} JST`;
}

function formatShortDate(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso).slice(0, 10);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function formatArchiveTime(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso).slice(0, 10);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} · ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function buildIssueId(iso) {
  if (!iso) return "VOL. — / ISSUE —";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "VOL. — / ISSUE —";
  const vol = d.getFullYear() - 2025;
  const issue = dayOfYear(d);
  return `VOL. ${vol} · ISSUE ${pad(issue, 3)}`;
}

function riskTier(score) {
  const n = Number(score) || 0;
  if (n <= 30) return "low";
  if (n <= 60) return "mid";
  return "high";
}

/** stable slug for an archive item — keep in sync with build-articles.mjs */
function archiveSlug(entry) {
  if (!entry) return null;
  const id = (entry.paperId || "").replace(/[^a-zA-Z0-9._-]/g, "_");
  const ts = (entry.generatedAt || "").replace(/[^0-9]/g, "").slice(0, 12);
  if (!id || !ts) return null;
  return `${ts}-${id}`;
}

/* ────────── EEG accent (slim brand line) ────────── */
function paintAccent() {
  if (!els.accentPath) return;
  const W = 1600;
  const H = 14;
  const samples = 320;
  const seedPhase = (Date.now() / 4000) % (Math.PI * 2);
  let d = "M";
  for (let i = 0; i <= samples; i++) {
    const t = i / samples;
    const x = (t * W).toFixed(1);
    const phase = t * Math.PI * 12 + seedPhase;
    const y =
      H +
      Math.sin(phase) * 5 +
      Math.cos(phase * 2.3) * 2.8 +
      Math.sin(phase * 0.7) * 1.6;
    d += `${i === 0 ? "" : " L"}${x},${y.toFixed(1)}`;
  }
  els.accentPath.setAttribute("d", d);
}

/* ────────── poster SVG (hero visual) ────────── */
function buildPoster(draft) {
  if (!draft) return "";
  const tier = riskTier(draft.riskScore);
  const tierColor = { low: "#84a98c", mid: "#e9c46a", high: "#e76f51" }[tier];
  const topic = String(draft.topic || draft.themeArea || "脳情報科学").trim();
  const lines = wrap(topic, 14, 2);
  const theme = draft.themeArea || "脳情報科学";
  const date = formatShortDate(draft.date || draft.generatedAt);
  const score = Math.round(Number(draft.riskScore) || 0);
  const sigil = sigilPath(440, 30, draft.generatedAt || draft.paperId || "");

  return `
<defs>
  <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0%" stop-color="#161a20"/>
    <stop offset="100%" stop-color="#08090b"/>
  </linearGradient>
  <radialGradient id="glow" cx="0.85" cy="0.15" r="0.6">
    <stop offset="0%" stop-color="${tierColor}" stop-opacity="0.18"/>
    <stop offset="100%" stop-color="${tierColor}" stop-opacity="0"/>
  </radialGradient>
</defs>
<rect width="480" height="280" fill="url(#bg)"/>
<rect width="480" height="280" fill="url(#glow)"/>
<path d="M14,14 L14,4 L24,4" stroke="#cbc4af" stroke-width="1" fill="none" opacity="0.6"/>
<path d="M466,266 L466,276 L456,276" stroke="#cbc4af" stroke-width="1" fill="none" opacity="0.6"/>
<text x="22" y="34" font-family="JetBrains Mono, monospace" font-size="10"
      letter-spacing="2.5" fill="#e76f51" font-weight="500">[ CEREPORTAL · NEURO DAILY ]</text>
<text x="458" y="34" font-family="JetBrains Mono, monospace" font-size="10"
      letter-spacing="2" fill="#918a7a" text-anchor="end">${escapeXml(date)}</text>
<line x1="22" y1="46" x2="458" y2="46" stroke="#232831" stroke-dasharray="2 4"/>
${lines.map((l, i) => `<text x="22" y="${88 + i * 38}" font-family="Fraunces, serif"
  font-size="32" font-weight="500" fill="#ede6d3" font-style="italic"
  letter-spacing="-0.5">${escapeXml(l)}</text>`).join("\n")}
<rect x="22" y="${98 + lines.length * 38}" width="${Math.min(theme.length * 14 + 24, 280)}" height="22"
  fill="#161a20" stroke="#00d9b8" stroke-opacity="0.5" rx="3"/>
<text x="34" y="${113 + lines.length * 38}" font-family="Fraunces, serif" font-size="13"
  fill="#00d9b8" font-weight="500">${escapeXml(theme)}</text>
<line x1="22" y1="222" x2="458" y2="222" stroke="#232831" stroke-dasharray="2 4"/>
<g transform="translate(22, 234)">
  <text font-family="JetBrains Mono, monospace" font-size="9" letter-spacing="2" fill="#5e554a">SIGNAL</text>
  <path d="${sigil}" fill="none" stroke="${tierColor}" stroke-width="1.2" opacity="0.85" transform="translate(0, 6)"/>
</g>
<g transform="translate(360, 248)">
  <text font-family="JetBrains Mono, monospace" font-size="9" letter-spacing="2" fill="#5e554a">RISK</text>
  <text x="0" y="14" font-family="JetBrains Mono, monospace" font-size="22"
        fill="${tierColor}" font-weight="500">${score}</text>
  <text x="32" y="14" font-family="JetBrains Mono, monospace" font-size="11" fill="#5e554a">/100</text>
</g>`;
}

function wrap(s, perLine, maxLines) {
  if (!s) return [""];
  const out = [];
  let cur = "";
  let w = 0;
  const weight = (c) => (/[　-鿿＀-￯]/.test(c) ? 1 : 0.55);
  for (const c of s) {
    cur += c;
    w += weight(c);
    if (w >= perLine) {
      out.push(cur);
      cur = "";
      w = 0;
      if (out.length === maxLines - 1) break;
    }
  }
  if (cur) out.push(cur);
  if (out.length > maxLines) {
    out.length = maxLines;
    out[maxLines - 1] = out[maxLines - 1].slice(0, -1) + "…";
  }
  return out;
}

function sigilPath(width, height, seedSrc) {
  const seed = String(seedSrc || "")
    .split("")
    .reduce((a, c) => a + c.charCodeAt(0), 0);
  const samples = 60;
  const step = width / (samples - 1);
  const baseY = height / 2;
  let d = "";
  for (let i = 0; i < samples; i++) {
    const t = i / (samples - 1);
    const phase = t * Math.PI * 6 + seed * 0.07;
    const y =
      baseY +
      Math.sin(phase) * 5 +
      Math.cos(phase * 2.4 + seed * 0.13) * 3 +
      Math.sin(phase * 4.7 + seed * 0.21) * 1.6;
    d += `${i === 0 ? "M" : " L"}${(i * step + 50).toFixed(1)},${y.toFixed(1)}`;
  }
  return d;
}

/* ────────── editorial dek (one-sentence summary) ────────── */
function buildDek(draft) {
  if (!draft) return "—";
  const theme = draft.themeArea || "脳情報科学";
  const tmpl = draft.templateName || "";
  const dekMap = {
    "data-driven": `データが裏づけた${theme}の新知見。`,
    "paradigm-shift": `${theme}の前提を揺さぶる研究が登場した。`,
    "three-insights": `${theme}の最新研究が示す三つの示唆。`,
    "future-vision": `${theme}が描く次の地平を読み解く。`,
    "neuro-ai-bridge": `神経科学とAIの境界を結び直す研究。`,
    "provocative-question": `${theme}に投げかけられた、ひとつの問い。`,
  };
  return dekMap[tmpl] || `${theme}の最新動向をデイリーで読み解く。`;
}

function buildLede(draft) {
  if (!draft) return "—";
  const summary = draft.summaryJP || `${draft.themeArea || "脳情報科学"}の最新研究`;
  const tmpl = draft.templateName || "";
  const tmplLabel = {
    "data-driven": "データドリブン",
    "paradigm-shift": "パラダイムシフト",
    "three-insights": "3つの示唆",
    "future-vision": "未来予想",
    "neuro-ai-bridge": "神経AI接続",
    "provocative-question": "問題提起",
  }[tmpl] || "編集ノート";
  return `本日の編集ノートは「${summary}」。${tmplLabel}テンプレートで構成し、編集部の hedging ルールを通過した内容を、LinkedIn 配信用に整形してお届けします。`;
}

/* ────────── render: hero / top story ────────── */
function renderHero(draft) {
  if (!draft) {
    els.heroHeadline.textContent = "本日のドラフトを取得しています…";
    els.heroDek.textContent = "—";
    return;
  }
  const score = Math.round(Number(draft.riskScore) || 0);
  els.poster.innerHTML = buildPoster(draft);
  els.heroBadge.textContent = (draft.themeArea || "脳情報科学").toUpperCase();
  els.heroKicker.textContent = (draft.themeArea || "Neuroscience").toUpperCase();
  els.heroHeadline.textContent = draft.summaryJP || draft.topic || draft.paperTitle || "—";
  els.heroDek.textContent = buildDek(draft);
  els.heroLede.textContent = buildLede(draft);
  els.heroSource.textContent = (draft.paperSource || "—").toUpperCase();
  els.heroPublished.textContent = formatShortDate(draft.publishedDate || draft.generatedAt);
  els.heroRisk.textContent = String(score);
  const heroRiskCell = els.heroRisk.closest(".risk-cell");
  if (heroRiskCell) heroRiskCell.dataset.risk = riskTier(score);
  els.heroTime.textContent = formatLongDateJP(draft.generatedAt);
  if (draft.paperLink) {
    els.heroPaperBtn.hidden = false;
    els.heroPaperBtn.href = draft.paperLink;
    els.heroLink.href = draft.paperLink;
    els.heroLink.target = "_blank";
    els.heroLink.rel = "noopener";
  } else {
    els.heroPaperBtn.hidden = true;
  }
}

/* ────────── render: editor's pick / detail ────────── */
function renderEditorial(draft) {
  if (!draft) {
    els.draftText.textContent =
      "// no transmission yet\n" +
      "// the next pipeline run (≤3h) will populate this section.";
    els.copyBtn.disabled = true;
    return;
  }

  els.editorsTemplate.textContent = `TEMPLATE · ${(draft.templateName || "—").toUpperCase()}`;
  els.editorsTemplateName.textContent = draft.templateName || "—";
  els.editorsPaperTitle.textContent = draft.paperTitle || "—";
  els.editorsAuthors.textContent = draft.paperAuthors || "(著者情報なし)";

  const kws = Array.isArray(draft.jpKeywords) ? draft.jpKeywords : [];
  els.editorsKeywords.textContent = kws.length ? kws.slice(0, 8).join(" · ") : "—";

  const abs = draft.abstractExcerpt || "(abstract not available)";
  els.editorsAbstract.textContent = abs;
  els.editorsAbstractCite.textContent =
    `${(draft.paperSource || "source").toUpperCase()} · ${draft.paperId || "—"}`;

  els.draftText.textContent = draft.formatted || "// draft body unavailable";
  els.copyBtn.disabled = false;

  if (draft.paperLink) {
    els.paperBtn.hidden = false;
    els.paperBtn.href = draft.paperLink;
  } else {
    els.paperBtn.hidden = true;
  }

  renderFigures(draft);
}

function renderFigures(draft) {
  let figs = Array.isArray(draft?.figureUrls) ? draft.figureUrls : [];
  if (figs.length === 0 && draft?.figureUrl) figs = [draft.figureUrl];

  if (figs.length === 0) {
    els.figureStrip.hidden = true;
    els.figureList.innerHTML = "";
    return;
  }
  els.figureStrip.hidden = false;
  els.figureCount.textContent = `${figs.length} extracted`;
  els.figureList.innerHTML = "";
  figs.forEach((url, i) => {
    const li = document.createElement("li");
    const img = document.createElement("img");
    img.src = url;
    img.alt = draft.paperTitle ? `${draft.paperTitle} — figure ${i + 1}` : `figure ${i + 1}`;
    img.loading = "lazy";
    const cap = document.createElement("figcaption");
    cap.textContent = `FIG. ${pad(i + 1)}`;
    img.onerror = () => {
      li.style.opacity = "0.4";
      cap.textContent = `FIG. ${pad(i + 1)} — load failed`;
    };
    li.appendChild(img);
    li.appendChild(cap);
    els.figureList.appendChild(li);
  });
}

/* ────────── render: category grids ────────── */
function sourceKey(rawSource) {
  const s = String(rawSource || "").toLowerCase().replace(/^www\./, "");
  return KNOWN_SOURCES.has(s) ? s : s || "source";
}

function sourceLabel(rawSource) {
  const k = sourceKey(rawSource);
  const map = {
    "arxiv.org": "arXiv",
    "statnews.com": "STAT",
    "techcrunch.com": "TechCrunch",
    "sciencedaily.com": "ScienceDaily",
    "spectrum.ieee.org": "IEEE Spectrum",
    "pubmed.ncbi.nlm.nih.gov": "PubMed",
  };
  return map[k] || k.toUpperCase();
}

function readingMinutes(text) {
  if (!text) return 0;
  // mixed JP/EN: rough heuristic
  const len = text.length;
  // JP ≈ 600 cpm, EN ≈ 1100 cpm — use 800 average for mixed
  const min = Math.max(1, Math.round(len / 600));
  return min;
}

function renderCategory(catKey, category) {
  const list = document.querySelector(`[data-list="${catKey}"]`);
  const meta = document.querySelector(`[data-list-meta="${catKey}"]`);
  if (!list) return;

  list.innerHTML = "";
  const items = (category && Array.isArray(category.items)) ? category.items : [];

  if (meta) meta.textContent = `${items.length} articles`;

  if (items.length === 0) {
    const li = document.createElement("li");
    li.className = "list-empty";
    if (catKey === "bci" && category && category.error) {
      li.classList.add("error");
      li.textContent = `// BCI シグナル一致なし — フィードを更新中 (${category.error})`;
    } else {
      li.textContent = `// ${CAT_LABEL[catKey]} の取得待機中…`;
    }
    list.appendChild(li);
    return;
  }

  const showSummary = SUMMARY_OK.has(catKey);

  items.forEach((it) => {
    const li = document.createElement("li");

    // ── kicker row: source badge + published time
    const kicker = document.createElement("div");
    kicker.className = "article-card-kicker";

    const badge = document.createElement("span");
    badge.className = "source-badge";
    badge.dataset.src = sourceKey(it.source);
    badge.textContent = sourceLabel(it.source);
    kicker.appendChild(badge);

    if (it.publishedDate) {
      const dot = document.createElement("span");
      dot.className = "kicker-dot";
      dot.textContent = "·";
      const t = document.createElement("span");
      t.className = "kicker-time";
      t.textContent = formatShortDate(it.publishedDate);
      kicker.appendChild(dot);
      kicker.appendChild(t);
    }
    li.appendChild(kicker);

    // ── headline
    const h = document.createElement("h3");
    h.className = "article-card-title";
    const a = document.createElement("a");
    a.href = it.url || "#";
    a.target = "_blank";
    a.rel = "noopener";
    a.textContent = it.title || "(no title)";
    h.appendChild(a);
    li.appendChild(h);

    // ── summary (only when license permits)
    if (showSummary && it.summary) {
      const dek = document.createElement("p");
      dek.className = "article-card-dek";
      dek.textContent = it.summary;
      li.appendChild(dek);
    }

    // ── byline row: author + reading time chip
    const byline = document.createElement("div");
    byline.className = "article-card-byline";
    if (it.authors) {
      const auth = document.createElement("span");
      auth.className = "src";
      auth.textContent = it.authors.length > 56 ? it.authors.slice(0, 52) + "…" : it.authors;
      byline.appendChild(auth);
    }
    if (showSummary && it.summary) {
      const meta = document.createElement("span");
      meta.className = "article-card-meta";
      const len = document.createElement("span");
      len.className = "read-len";
      len.textContent = `~${readingMinutes(it.summary)} MIN`;
      meta.appendChild(len);
      byline.appendChild(meta);
    }
    li.appendChild(byline);

    list.appendChild(li);
  });
}

function renderFeeds(feeds) {
  if (!feeds || !feeds.categories) {
    CAT_KEYS.forEach((k) => renderCategory(k, { items: [] }));
    return;
  }
  CAT_KEYS.forEach((k) => renderCategory(k, feeds.categories[k] || { items: [] }));
}

/* ────────── render: archive ────────── */
function renderArchive(entries) {
  els.archiveCount.textContent = `${entries.length} entries`;
  if (entries.length === 0) {
    els.archiveList.innerHTML = '<li class="archive-empty">取得待機中…</li>';
    return;
  }
  els.archiveList.innerHTML = "";
  entries.slice(0, 30).forEach((e) => {
    const li = document.createElement("li");

    const t = document.createElement("span");
    t.className = "archive-time";
    t.textContent = formatArchiveTime(e.generatedAt);

    const topic = document.createElement("span");
    topic.className = "archive-topic";
    const slug = archiveSlug(e);
    if (slug) {
      const a = document.createElement("a");
      a.href = `/article/${slug}.html`;
      a.textContent = e.summaryJP || e.topic || e.paperTitle || "(no topic)";
      topic.appendChild(a);
    } else {
      topic.textContent = e.summaryJP || e.topic || e.paperTitle || "(no topic)";
    }

    const score = Math.round(Number(e.riskScore) || 0);
    const r = document.createElement("span");
    r.className = "archive-risk";
    r.dataset.risk = riskTier(score);
    r.textContent = `RISK ${pad(score, 2)}`;
    r.style.color =
      r.dataset.risk === "high" ? "var(--risk-high)" :
      r.dataset.risk === "mid" ? "var(--risk-mid)" : "var(--risk-low)";

    li.appendChild(t);
    li.appendChild(topic);
    li.appendChild(r);
    els.archiveList.appendChild(li);
  });
}

/* ────────── toast + copy ────────── */
function toast(msg) {
  els.toast.textContent = msg;
  els.toast.hidden = false;
  els.toast.classList.add("show");
  clearTimeout(toast._t);
  toast._t = setTimeout(() => {
    els.toast.classList.remove("show");
    setTimeout(() => { els.toast.hidden = true; }, 240);
  }, 2200);
}

async function copyDraft() {
  if (!currentDraft || !currentDraft.formatted) return;
  try {
    await navigator.clipboard.writeText(currentDraft.formatted);
    toast("✓ ドラフトをコピーしました");
  } catch {
    const ta = document.createElement("textarea");
    ta.value = currentDraft.formatted;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    try {
      document.execCommand("copy");
      toast("✓ ドラフトをコピーしました");
    } catch {
      toast("⚠ コピーに失敗しました");
    }
    document.body.removeChild(ta);
  }
}

function bindKeyboard() {
  document.addEventListener("keydown", (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "c") {
      const sel = window.getSelection();
      if (sel && sel.toString().length > 0) return;
      if (!currentDraft) return;
      e.preventDefault();
      copyDraft();
    }
  });
}

/* ────────── boot ────────── */
async function init() {
  paintAccent();
  setInterval(paintAccent, 4000);

  els.copyBtn.addEventListener("click", copyDraft);

  els.date.textContent = formatLongDateJP(new Date().toISOString());
  els.issue.textContent = buildIssueId(new Date().toISOString());

  let latest = null, history = [], feeds = null;
  try { latest = await loadJson("/data/latest-draft.json"); }
  catch (err) { console.warn("[cereportal] latest-draft.json unavailable:", err); }
  try { history = await loadJson("/data/drafts-history.json"); }
  catch (err) { console.warn("[cereportal] drafts-history.json unavailable:", err); }
  try { feeds = await loadJson("/data/feeds.json"); }
  catch (err) { console.warn("[cereportal] feeds.json unavailable:", err); }

  if (feeds && feeds.generatedAt) {
    els.date.textContent = formatLongDateJP(feeds.generatedAt);
    els.issue.textContent = buildIssueId(feeds.generatedAt);
  } else if (latest && latest.generatedAt) {
    els.date.textContent = formatLongDateJP(latest.generatedAt);
    els.issue.textContent = buildIssueId(latest.generatedAt);
  }

  els.status.textContent = latest ? "LIVE — updated" : "STANDBY";

  currentDraft = latest;
  renderHero(latest);
  renderEditorial(latest);
  renderFeeds(feeds);
  renderArchive(Array.isArray(history) ? history : []);
  bindKeyboard();
}

init();
