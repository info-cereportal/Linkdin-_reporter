// ═══════════════════════════════════════════════════════════════════
// NeuroPulse · BCI & Neuroscience Daily — front-end controller (v2)
// ───────────────────────────────────────────────────────────────────
// - loads /data/feeds.json, /data/latest-draft.json, /data/drafts-history.json,
//   /data/grants.json
// - hero (3-up: lead + 2 secondary) from drafts-history
// - 5 category sections + editor's note + grants DB + archive
// - client-side full-text search (Fuse.js)
// - sticky nav with scrollspy
// ═══════════════════════════════════════════════════════════════════

const $ = (id) => document.getElementById(id);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

const SUMMARY_OK = new Set(["papers", "aineuro", "bci"]);

const CAT_LABEL = {
  bci: "BCI",
  papers: "論文",
  aineuro: "AI for Neuro",
  market: "産業ニュース",
  grants: "助成金",
};

const CAT_KEYS = ["bci", "papers", "aineuro", "market", "grants"];

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
  date: $("masthead-date"),
  issue: $("masthead-issue"),
  status: $("status-label"),
  // editor's pick
  editorsTemplate: $("editors-template"),
  editorsTemplateName: $("editors-template-name"),
  editorsPaperTitle: $("editors-paper-title"),
  editorsAuthors: $("editors-authors"),
  editorsKeywords: $("editors-keywords"),
  editorsAbstract: $("editors-abstract"),
  editorsAbstractCite: $("editors-abstract-cite"),
  editorsNote: $("editors-note"),
  paperBtn: $("paper-btn"),
  figureStrip: $("figure-strip"),
  figureCount: $("figure-count"),
  figureList: $("figure-list"),
  archiveList: $("archive-list"),
  archiveCount: $("archive-count"),
  toast: $("toast"),
  accentPath: $("eeg-accent-path"),
  heroTime: $("hero-time"),
  // search
  searchInput: $("np-search"),
  searchResults: $("search-results"),
  srList: $("sr-list"),
  srEmpty: $("sr-empty"),
  srClose: $("sr-close"),
  // grants
  grantsList: $("grants-list"),
  grantsMeta: $("grants-meta"),
};

let currentDraft = null;
let allDrafts = [];

/* ────────── helpers ────────── */
const pad = (n, w = 2) => String(n).padStart(w, "0");

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

function archiveSlug(entry) {
  if (!entry) return null;
  const id = (entry.paperId || "").replace(/[^a-zA-Z0-9._-]/g, "_");
  const ts = (entry.generatedAt || "").replace(/[^0-9]/g, "").slice(0, 12);
  if (!id || !ts) return null;
  return `${ts}-${id}`;
}

function archiveUrl(entry) {
  const s = archiveSlug(entry);
  return s ? `/article/${s}.html` : "#";
}

/* ────────── EEG accent ────────── */
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

/* ────────── poster SVG ────────── */
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
  <linearGradient id="bg-${score}" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0%" stop-color="#161a20"/>
    <stop offset="100%" stop-color="#08090b"/>
  </linearGradient>
  <radialGradient id="glow-${score}" cx="0.85" cy="0.15" r="0.6">
    <stop offset="0%" stop-color="${tierColor}" stop-opacity="0.18"/>
    <stop offset="100%" stop-color="${tierColor}" stop-opacity="0"/>
  </radialGradient>
</defs>
<rect width="480" height="280" fill="url(#bg-${score})"/>
<rect width="480" height="280" fill="url(#glow-${score})"/>
<path d="M14,14 L14,4 L24,4" stroke="#cbc4af" stroke-width="1" fill="none" opacity="0.6"/>
<path d="M466,266 L466,276 L456,276" stroke="#cbc4af" stroke-width="1" fill="none" opacity="0.6"/>
<text x="22" y="34" font-family="JetBrains Mono, monospace" font-size="10"
      letter-spacing="2.5" fill="#e76f51" font-weight="500">[ NEUROPULSE · BCI &amp; NEUROSCIENCE DAILY ]</text>
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

/* ────────── HERO 3-up rendering ────────── */
function pickHeroSlot(rank, key) {
  return document.querySelector(`[data-${key}="${rank}"]`);
}

function fillHeroCard(rank, draft) {
  const setText = (key, val) => {
    const el = pickHeroSlot(rank, key);
    if (el) el.textContent = val ?? "—";
  };
  const setLink = (key, href) => {
    document.querySelectorAll(`[data-link="${rank}"]`).forEach((el) => {
      if (href) el.setAttribute("href", href);
    });
  };
  const setHidden = (key, hidden) => {
    const el = pickHeroSlot(rank, key);
    if (el) el.hidden = hidden;
  };

  if (!draft) {
    setText("headline", "本日のトップを取得しています…");
    return;
  }

  const score = Math.round(Number(draft.riskScore) || 0);
  const articleHref = archiveUrl(draft);

  // poster SVG
  const poster = pickHeroSlot(rank, "poster");
  if (poster) poster.innerHTML = buildPoster(draft);

  // badge / kicker
  setText("badge", (draft.themeArea || "脳情報科学").toUpperCase());
  setText("kicker", (draft.themeArea || "Neuroscience").toUpperCase());

  // headline + dek
  setText("headline", draft.summaryJP || draft.topic || draft.paperTitle || "—");
  setText("dek", buildDek(draft));

  // links — internal article page
  setLink("link", articleHref);
  document.querySelectorAll(`[data-link="${rank}"]`).forEach((a) => {
    a.setAttribute("href", articleHref);
  });

  // byline (lead only)
  if (rank === "lead") {
    setText("source", (draft.paperSource || "—").toUpperCase());
    setText("published", formatShortDate(draft.publishedDate || draft.generatedAt));
    const riskNum = pickHeroSlot(rank, "risk");
    if (riskNum) {
      riskNum.textContent = String(score);
      const cell = pickHeroSlot(rank, "risk-cell");
      if (cell) cell.dataset.risk = riskTier(score);
    }
    // paper btn
    const paperBtn = pickHeroSlot(rank, "paper-btn");
    if (paperBtn) {
      if (draft.paperLink) {
        paperBtn.hidden = false;
        paperBtn.setAttribute("href", draft.paperLink);
      } else {
        paperBtn.hidden = true;
      }
    }
  } else {
    // secondary: compact meta line
    const meta = pickHeroSlot(rank, "meta");
    if (meta) {
      const parts = [
        (draft.paperSource || "source").toUpperCase(),
        formatShortDate(draft.publishedDate || draft.generatedAt),
        `RISK ${pad(score, 2)}`,
      ];
      meta.textContent = parts.join(" · ");
    }
  }
}

function renderHero(historyEntries, latest) {
  // Build top 3: latest first, then most recent unique-paperId entries
  const seen = new Set();
  const ranked = [];
  if (latest) {
    const id = latest.paperId || latest.paperLink;
    if (id) seen.add(id);
    ranked.push(latest);
  }
  for (const e of historyEntries) {
    const id = e.paperId || e.paperLink;
    if (id && !seen.has(id)) {
      seen.add(id);
      ranked.push(e);
      if (ranked.length >= 3) break;
    }
  }
  while (ranked.length < 3) ranked.push(null);

  fillHeroCard("lead", ranked[0]);
  fillHeroCard("sec1", ranked[1]);
  fillHeroCard("sec2", ranked[2]);

  if (els.heroTime && ranked[0]) {
    els.heroTime.textContent = formatLongDateJP(ranked[0].generatedAt);
  }
}

/* ────────── editor's pick / detail ────────── */
function renderEditorial(draft) {
  if (!draft) return;
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

/* ────────── category grids ────────── */
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
  return Math.max(1, Math.round(text.length / 600));
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
      li.textContent = `// BCI シグナル一致なし — ${category.error}`;
    } else {
      li.textContent = `// ${CAT_LABEL[catKey]} の取得待機中…`;
    }
    list.appendChild(li);
    return;
  }
  const showSummary = SUMMARY_OK.has(catKey);
  items.forEach((it) => {
    const li = document.createElement("li");
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

    const h = document.createElement("h3");
    h.className = "article-card-title";
    const a = document.createElement("a");
    a.href = it.url || "#";
    a.target = "_blank";
    a.rel = "noopener";
    a.textContent = it.title || "(no title)";
    h.appendChild(a);
    li.appendChild(h);

    if (showSummary && it.summary) {
      const dek = document.createElement("p");
      dek.className = "article-card-dek";
      dek.textContent = it.summary;
      li.appendChild(dek);
    }

    const byline = document.createElement("div");
    byline.className = "article-card-byline";
    if (it.authors) {
      const auth = document.createElement("span");
      auth.className = "src";
      auth.textContent = it.authors.length > 56 ? it.authors.slice(0, 52) + "…" : it.authors;
      byline.appendChild(auth);
    }
    if (showSummary && it.summary) {
      const m = document.createElement("span");
      m.className = "article-card-meta";
      const len = document.createElement("span");
      len.className = "read-len";
      len.textContent = `~${readingMinutes(it.summary)} MIN`;
      m.appendChild(len);
      byline.appendChild(m);
    }
    li.appendChild(byline);
    list.appendChild(li);
  });
}

function renderFeeds(feeds) {
  if (!feeds || !feeds.categories) {
    CAT_KEYS.forEach((k) => {
      if (k !== "grants") renderCategory(k, { items: [] });
    });
    return;
  }
  // grants is now driven by grants.json — skip RSS for grants section
  ["bci", "papers", "aineuro", "market"].forEach((k) =>
    renderCategory(k, feeds.categories[k] || { items: [] })
  );
}

/* ────────── GRANTS DB rendering ────────── */
let grantsState = { items: [], filter: "all" };

function daysUntil(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return null;
  const now = new Date();
  const diff = Math.ceil((d - now) / 86400000);
  return diff;
}

function renderGrants() {
  if (!els.grantsList) return;
  const items = grantsState.items;
  const flt = grantsState.filter;
  const filtered = items.filter((g) => {
    if (flt === "all") return true;
    if (flt === "JP" || flt === "US" || flt === "EU") return g.country === flt;
    if (flt === "startup") return (g.tags || []).some((t) => /startup|spinout|seed|early-stage/i.test(t));
    if (flt === "bci") return (g.tags || []).some((t) => /bci|neural interface|neurotech/i.test(t));
    if (flt === "open") return /公募中|open|rolling|active|baa/i.test(g.stage || "");
    return true;
  });

  if (els.grantsMeta) els.grantsMeta.textContent = `${filtered.length} / ${items.length} programs`;
  els.grantsList.innerHTML = "";

  if (filtered.length === 0) {
    const li = document.createElement("li");
    li.className = "list-empty";
    li.textContent = "// 該当する助成金が見つかりませんでした。";
    els.grantsList.appendChild(li);
    return;
  }

  // Sort: open first, then by deadline asc
  filtered.sort((a, b) => {
    const da = daysUntil(a.deadline);
    const db = daysUntil(b.deadline);
    if (da == null) return 1;
    if (db == null) return -1;
    return da - db;
  });

  filtered.forEach((g) => {
    const days = daysUntil(g.deadline);
    const isClosed = days != null && days < 0;
    const isUrgent = days != null && days >= 0 && days <= 30;
    const isSoon = days != null && days > 30 && days <= 60;

    const li = document.createElement("li");
    li.className = "grant-card";
    if (isClosed) li.classList.add("is-closed");
    if (isUrgent) li.classList.add("is-urgent");
    else if (isSoon) li.classList.add("is-soon");

    const head = document.createElement("div");
    head.className = "gc-head";
    const ag = document.createElement("span");
    ag.className = "gc-agency";
    ag.textContent = g.agency || "—";
    head.appendChild(ag);
    if (g.country) {
      const region = document.createElement("span");
      region.className = "gc-region";
      const flag = { JP: "🇯🇵", US: "🇺🇸", EU: "🇪🇺", UK: "🇬🇧", INTL: "🌐" }[g.country] || "";
      region.textContent = `${flag} ${g.country}`;
      head.appendChild(region);
    }
    const stage = document.createElement("span");
    stage.className = "gc-stage";
    if (isClosed) {
      stage.classList.add("closed");
      stage.textContent = "終了";
    } else if (/公募中|open|active|baa/i.test(g.stage || "")) {
      stage.classList.add("open");
      stage.textContent = "公募中";
    } else {
      stage.classList.add("upcoming");
      stage.textContent = g.stage || "予定";
    }
    head.appendChild(stage);
    li.appendChild(head);

    const title = document.createElement("h3");
    title.className = "gc-title";
    const a = document.createElement("a");
    a.href = g.url || "#";
    a.target = "_blank";
    a.rel = "noopener";
    a.textContent = g.title || "—";
    title.appendChild(a);
    li.appendChild(title);

    if (g.summary) {
      const sum = document.createElement("p");
      sum.className = "gc-summary";
      sum.textContent = g.summary;
      li.appendChild(sum);
    }

    const meta = document.createElement("dl");
    meta.className = "gc-meta";
    const addRow = (label, value, cls) => {
      const dt = document.createElement("dt");
      dt.textContent = label;
      const dd = document.createElement("dd");
      if (cls) dd.className = cls;
      dd.textContent = value;
      meta.appendChild(dt);
      meta.appendChild(dd);
    };
    if (g.amount) addRow("AMOUNT", g.amount);
    if (g.deadline) {
      let dlClass = "";
      let dlLabel = g.deadline;
      if (isUrgent) {
        dlClass = "gc-deadline-urgent";
        dlLabel = `${g.deadline} (残り ${days} 日)`;
      } else if (isSoon) {
        dlClass = "gc-deadline-soon";
        dlLabel = `${g.deadline} (残り ${days} 日)`;
      } else if (isClosed) {
        dlLabel = `${g.deadline} (終了)`;
      } else if (days != null) {
        dlLabel = `${g.deadline} (残り ${days} 日)`;
      }
      addRow("DEADLINE", dlLabel, dlClass);
    }
    if (g.eligibility) addRow("ELIGIBLE", g.eligibility);
    li.appendChild(meta);

    if (Array.isArray(g.tags) && g.tags.length) {
      const tags = document.createElement("div");
      tags.className = "gc-tags";
      g.tags.slice(0, 5).forEach((t) => {
        const tag = document.createElement("span");
        tag.className = "gc-tag";
        tag.textContent = t;
        tags.appendChild(tag);
      });
      li.appendChild(tags);
    }
    els.grantsList.appendChild(li);
  });
}

function bindGrantFilters() {
  document.querySelectorAll("[data-grant-filter]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const f = btn.dataset.grantFilter;
      grantsState.filter = f;
      document.querySelectorAll("[data-grant-filter]").forEach((b) =>
        b.classList.toggle("is-active", b === btn)
      );
      renderGrants();
    });
  });
}

/* ────────── ARCHIVE ────────── */
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

/* ────────── SEARCH ────────── */
let searchIndex = null;

function buildSearchIndex(feeds, history, grants) {
  const docs = [];
  if (feeds && feeds.categories) {
    for (const [cat, info] of Object.entries(feeds.categories)) {
      (info.items || []).forEach((it) => {
        docs.push({
          type: cat,
          title: it.title || "",
          summary: it.summary || "",
          source: it.source || "",
          url: it.url || "",
          tags: cat,
        });
      });
    }
  }
  (history || []).forEach((h) => {
    docs.push({
      type: "archive",
      title: h.summaryJP || h.topic || h.paperTitle || "",
      summary: h.abstractExcerpt || "",
      source: h.paperSource || "",
      url: archiveUrl(h),
      tags: (h.jpKeywords || []).join(" "),
    });
  });
  (grants || []).forEach((g) => {
    docs.push({
      type: "grant",
      title: g.title || "",
      summary: g.summary || "",
      source: g.agency || "",
      url: g.url || "",
      tags: (g.tags || []).join(" "),
    });
  });

  if (typeof Fuse === "undefined") {
    console.warn("[neuropulse] Fuse.js not loaded — search disabled");
    return null;
  }
  return new Fuse(docs, {
    keys: [
      { name: "title", weight: 0.5 },
      { name: "summary", weight: 0.25 },
      { name: "tags", weight: 0.15 },
      { name: "source", weight: 0.1 },
    ],
    threshold: 0.4,
    ignoreLocation: true,
    minMatchCharLength: 2,
  });
}

function renderSearchResults(query) {
  if (!searchIndex || !els.searchResults) return;
  const q = (query || "").trim();
  if (!q) {
    els.searchResults.hidden = true;
    return;
  }
  const results = searchIndex.search(q).slice(0, 15);
  els.searchResults.hidden = false;
  els.srEmpty.hidden = results.length > 0;
  els.srList.innerHTML = "";
  results.forEach(({ item }) => {
    const li = document.createElement("li");
    const tEl = document.createElement("span");
    tEl.className = "sr-type";
    tEl.dataset.t = item.type;
    tEl.textContent = item.type;
    const title = document.createElement("span");
    title.className = "sr-title";
    title.textContent = item.title;
    const meta = document.createElement("span");
    meta.className = "sr-meta";
    meta.textContent = `${(item.source || "").toUpperCase()}${item.tags ? " · " + item.tags : ""}`;
    li.appendChild(tEl);
    li.appendChild(title);
    li.appendChild(meta);
    li.addEventListener("click", () => {
      if (item.url) {
        if (item.url.startsWith("http")) window.open(item.url, "_blank");
        else window.location.href = item.url;
      }
    });
    els.srList.appendChild(li);
  });
}

function bindSearch() {
  if (!els.searchInput) return;
  let t;
  els.searchInput.addEventListener("input", (e) => {
    clearTimeout(t);
    t = setTimeout(() => renderSearchResults(e.target.value), 120);
  });
  els.searchInput.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      els.searchInput.value = "";
      els.searchResults.hidden = true;
      els.searchInput.blur();
    }
  });
  els.srClose?.addEventListener("click", () => {
    els.searchInput.value = "";
    els.searchResults.hidden = true;
  });
  // "/" focuses search
  document.addEventListener("keydown", (e) => {
    if (e.key === "/" && !e.target.matches("input,textarea")) {
      e.preventDefault();
      els.searchInput.focus();
    }
  });
}

/* ────────── SCROLLSPY + sticky shadow ────────── */
function bindScrollspy() {
  const sections = $$("main section[id]");
  const navLinks = $$('.primary-nav a[href^="#section-"]');
  if (sections.length === 0 || navLinks.length === 0) return;

  const idToLink = new Map();
  navLinks.forEach((a) => {
    const href = a.getAttribute("href");
    if (href?.startsWith("#")) idToLink.set(href.slice(1), a);
  });

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting && entry.intersectionRatio > 0.25) {
          const id = entry.target.id;
          navLinks.forEach((a) => a.classList.remove("is-active"));
          const link = idToLink.get(id);
          if (link) link.classList.add("is-active");
        }
      });
    },
    { rootMargin: "-30% 0px -50% 0px", threshold: [0, 0.25, 0.5, 0.75, 1] }
  );
  sections.forEach((s) => observer.observe(s));

  // sticky shadow on scroll
  const nav = document.querySelector(".primary-nav");
  if (nav) {
    const onScroll = () => {
      nav.classList.toggle("scrolled", window.scrollY > 100);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
  }
}

/* ────────── boot ────────── */
async function init() {
  paintAccent();
  setInterval(paintAccent, 4000);

  els.date.textContent = formatLongDateJP(new Date().toISOString());
  els.issue.textContent = buildIssueId(new Date().toISOString());

  let latest = null, history = [], feeds = null, grants = null;
  try { latest = await loadJson("/data/latest-draft.json"); }
  catch (err) { console.warn("[neuropulse] latest-draft.json unavailable:", err); }
  try { history = await loadJson("/data/drafts-history.json"); }
  catch (err) { console.warn("[neuropulse] drafts-history.json unavailable:", err); }
  try { feeds = await loadJson("/data/feeds.json"); }
  catch (err) { console.warn("[neuropulse] feeds.json unavailable:", err); }
  try { grants = await loadJson("/data/grants.json"); }
  catch (err) { console.warn("[neuropulse] grants.json unavailable:", err); }

  if (feeds && feeds.generatedAt) {
    els.date.textContent = formatLongDateJP(feeds.generatedAt);
    els.issue.textContent = buildIssueId(feeds.generatedAt);
  } else if (latest && latest.generatedAt) {
    els.date.textContent = formatLongDateJP(latest.generatedAt);
    els.issue.textContent = buildIssueId(latest.generatedAt);
  }

  els.status.textContent = latest ? "LIVE — updated" : "STANDBY";

  currentDraft = latest;
  allDrafts = Array.isArray(history) ? history : [];

  // hero (3-up)
  renderHero(allDrafts, latest);
  // editor's note (uses latest)
  renderEditorial(latest);
  // categories (skip grants — driven by grants.json)
  renderFeeds(feeds);
  // grants DB
  if (grants && Array.isArray(grants.items)) {
    grantsState.items = grants.items;
    renderGrants();
    bindGrantFilters();
  }
  // archive
  renderArchive(allDrafts);

  // search index
  searchIndex = buildSearchIndex(feeds, allDrafts, grants?.items || []);
  bindSearch();

  // scrollspy + sticky
  bindScrollspy();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
