// ═══════════════════════════════════════════════════════════════════
//   CEREPORTAL · NEURO·DRAFT REPORTER — dashboard controller
//   --------------------------------------------------------------------
//   - boot sequence + reveal staging
//   - generates 4-channel synthetic EEG hero traces (seamless loop)
//   - drives the live frequency band meter (δθαβγ pseudo-oscillation)
//   - mini status waveform animation
//   - latest draft + archive log rendering
//   - keyboard shortcut + clipboard with fallback
// ═══════════════════════════════════════════════════════════════════

const $ = (id) => document.getElementById(id);

const els = {
  // boot/state
  body: document.body,
  statusLabel: $("status-label"),
  heroState: $("hero-state"),
  heroEpoch: $("hero-epoch"),
  headerTime: $("header-time"),
  // signal card
  runId: $("run-id"),
  template: $("latest-template"),
  riskNum: $("latest-risk"),
  riskBar: $("risk-bar"),
  riskCell: document.querySelector(".risk-cell"),
  time: $("latest-time"),
  topic: $("latest-topic"),
  text: $("latest-text"),
  draftFrame: $("draft-frame"),
  source: $("latest-source"),
  paperLink: $("latest-paper"),
  paperTitle: $("latest-paper-title"),
  copyBtn: $("copy-btn"),
  paperBtn: $("paper-btn"),
  // figure carousel
  figureStrip: $("figure-strip"),
  figureCount: $("figure-count"),
  figureList: $("figure-list"),
  // paper metadata panel
  posterSvg: $("poster-svg"),
  paperSummary: $("paper-summary"),
  paperAuthors: $("paper-authors"),
  paperDate: $("paper-date"),
  paperSourceTag: $("paper-source-tag"),
  paperIdText: $("paper-id-text"),
  paperTheme: $("paper-theme"),
  paperKeywords: $("paper-keywords"),
  paperAbstract: $("paper-abstract"),
  // archive
  historyList: $("history-list"),
  archiveCount: $("archive-count"),
  // waveforms
  chFp1: $("ch-fp1"),
  chCz: $("ch-cz"),
  chOz: $("ch-oz"),
  chT8: $("ch-t8"),
  statusWavePath: $("status-wave-path"),
  // brand spike
  brandSpike: $("brand-spike"),
  // toast
  toast: $("toast"),
};

let currentDraft = null;
let historyEntries = [];

/* ════════ data loading ════════ */
async function loadJson(path) {
  const res = await fetch(`${path}?t=${Date.now()}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${path}`);
  return res.json();
}

/* ════════ formatting helpers ════════ */
const pad = (n, w = 2) => String(n).padStart(w, "0");

function formatLongTime(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ` +
    `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
  );
}

function formatLogTime(iso) {
  if (!iso) return "--/-- --:--";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 10);
  return `${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function dayOfYear(d) {
  const start = new Date(d.getFullYear(), 0, 0);
  return Math.floor((d - start) / 86400000);
}

/** lab-style run identifier: #YYYY.DOY.HH */
function buildRunId(iso) {
  if (!iso) return "#----.---.--";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "#----.---.--";
  return `#${d.getFullYear()}.${pad(dayOfYear(d), 3)}.${pad(d.getHours())}`;
}

function riskTier(score) {
  if (score <= 30) return "low";
  if (score <= 60) return "mid";
  return "high";
}

/* ════════ EEG hero waveform generation ════════ */
/*
 * Each channel path is generated in two halves with identical content,
 * making translateX(-50%) a seamless loop.
 *
 * The ViewBox is 1600 wide. We generate a path of length 3200 (2x), where
 * the second half is an exact copy of the first. CSS animates translateX
 * from 0 to -50%, looping forever with no visible seam.
 *
 * To make the path itself periodic, all sin components use frequencies
 * that complete an integer number of cycles within 1600 units.
 */

const VB_WIDTH = 1600;
const SAMPLES_PER_HALF = 320; // step ≈ 5px

function generateChannelPath(baseY, freqs, noiseSeed) {
  const step = VB_WIDTH / SAMPLES_PER_HALF;
  const points = [];
  const totalSamples = SAMPLES_PER_HALF * 2;

  for (let i = 0; i <= totalSamples; i++) {
    const x = i * step;
    let y = baseY;

    // sum of sines (each freq is integer cycles per VB_WIDTH for periodicity)
    for (const { hz, amp, phase } of freqs) {
      y += Math.sin((i / SAMPLES_PER_HALF) * hz * 2 * Math.PI + phase) * amp;
    }

    // periodic harmonic "noise" (also integer cycles → seamless)
    y +=
      Math.sin((i / SAMPLES_PER_HALF) * 7 * 2 * Math.PI + noiseSeed) * 1.4 +
      Math.cos((i / SAMPLES_PER_HALF) * 13 * 2 * Math.PI + noiseSeed * 1.7) *
        0.9;

    points.push(`${x.toFixed(1)},${y.toFixed(1)}`);
  }

  return "M" + points.join(" L");
}

function paintHeroWaveforms() {
  // Channel parameters chosen to evoke distinct EEG characteristics
  // (frequencies are cycles-per-viewbox; visually, higher = more wiggly)
  els.chFp1.setAttribute(
    "d",
    generateChannelPath(
      35,
      [
        { hz: 8, amp: 11, phase: 0 },     // alpha-ish
        { hz: 22, amp: 4, phase: 0.6 },   // beta
        { hz: 4, amp: 5, phase: 1.2 },    // theta
      ],
      0.3
    )
  );

  els.chCz.setAttribute(
    "d",
    generateChannelPath(
      90,
      [
        { hz: 11, amp: 9, phase: 0.2 },   // mu
        { hz: 18, amp: 5, phase: 0.9 },   // beta
        { hz: 3, amp: 6, phase: 0.4 },    // slow
      ],
      1.1
    )
  );

  els.chOz.setAttribute(
    "d",
    generateChannelPath(
      145,
      [
        { hz: 10, amp: 14, phase: 0.5 },  // alpha (occipital strong)
        { hz: 5, amp: 3, phase: 1.5 },
      ],
      2.4
    )
  );

  els.chT8.setAttribute(
    "d",
    generateChannelPath(
      195,
      [
        { hz: 2, amp: 12, phase: 0 },     // delta
        { hz: 14, amp: 5, phase: 1.0 },   // beta
        { hz: 6, amp: 4, phase: 2.1 },    // theta
      ],
      0.8
    )
  );
}

/* ════════ mini status waveform ════════ */
let statusWaveT = 0;
function tickStatusWave() {
  statusWaveT += 0.08;
  const samples = 24;
  const w = 60;
  const h = 14;
  const step = w / (samples - 1);
  let d = "M";
  for (let i = 0; i < samples; i++) {
    const x = i * step;
    const phase = statusWaveT - i * 0.4;
    const y =
      h / 2 +
      Math.sin(phase) * 3.2 +
      Math.cos(phase * 2.3) * 1.4;
    d += `${i === 0 ? "" : " L"}${x.toFixed(1)},${y.toFixed(2)}`;
  }
  els.statusWavePath.setAttribute("d", d);
}

/* ════════ frequency band meter ════════ */
const BANDS = ["delta", "theta", "alpha", "beta", "gamma"];

const bandEls = BANDS.map((name) => {
  const li = document.querySelector(`.fb[data-band="${name}"]`);
  return {
    name,
    li,
    fill: li.querySelector(".fb-fill"),
    val: li.querySelector(".fb-val"),
    /* unique phase + characteristic baseline so the bands feel distinct */
    phase: Math.random() * Math.PI * 2,
    speed: 0.3 + Math.random() * 0.4,
    base: 0.45 + Math.random() * 0.25,
  };
});

let bandT = 0;
function tickBands(dt) {
  bandT += dt;
  for (const b of bandEls) {
    // smooth pseudo-noise: base + slow sine + faster sine + tiny jitter
    const slow = Math.sin(bandT * 0.0007 * b.speed + b.phase) * 0.18;
    const fast =
      Math.sin(bandT * 0.0023 * b.speed + b.phase * 1.3) * 0.09 +
      Math.cos(bandT * 0.0041 + b.phase) * 0.05;
    let v = b.base + slow + fast;
    if (v < 0.05) v = 0.05;
    if (v > 0.98) v = 0.98;
    const pct = Math.round(v * 100);
    b.fill.style.setProperty("--fb-pct", `${pct}%`);
    b.val.textContent = `${pct.toString().padStart(2, "0")} dB`;
  }
}

/* ════════ live header clock ════════ */
function tickClock() {
  const d = new Date();
  els.headerTime.textContent =
    `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())} · ` +
    `D${pad(dayOfYear(d), 3)}`;
  els.heroEpoch.textContent =
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} · ` +
    `${pad(d.getHours())}:${pad(d.getMinutes())} JST`;
}

/* ════════ brand mark spike (occasional firing) ════════ */
function fireBrandSpike() {
  const positions = [
    { cx: 28, cy: 3 },
    { cx: 53, cy: 28 },
    { cx: 28, cy: 53 },
    { cx: 3, cy: 28 },
    { cx: 13, cy: 13 },
    { cx: 43, cy: 13 },
    { cx: 13, cy: 43 },
    { cx: 43, cy: 43 },
  ];
  const p = positions[Math.floor(Math.random() * positions.length)];
  els.brandSpike.setAttribute("cx", p.cx);
  els.brandSpike.setAttribute("cy", p.cy);
  els.brandSpike.style.transition = "none";
  els.brandSpike.setAttribute("r", "0.5");
  els.brandSpike.style.opacity = "1";
  // animate to expanded then fade
  requestAnimationFrame(() => {
    els.brandSpike.style.transition = "r 0.3s ease, opacity 0.7s ease";
    els.brandSpike.setAttribute("r", "5");
    els.brandSpike.style.opacity = "0";
  });
}

/* ════════ risk ring ════════ */
function applyRiskRing(score) {
  const tier = riskTier(score || 0);
  const colorMap = {
    low: "var(--risk-low)",
    mid: "var(--risk-mid)",
    high: "var(--risk-high)",
  };
  els.riskBar.style.setProperty("--risk-pct", String(score || 0));
  els.riskBar.style.setProperty("--risk-color", colorMap[tier]);
  els.riskCell.dataset.risk = tier;
}

/* count-up animation for risk number */
function countUp(el, from, to, duration = 600) {
  const start = performance.now();
  const delta = to - from;
  function step(now) {
    const t = Math.min(1, (now - start) / duration);
    // easeOutCubic
    const eased = 1 - Math.pow(1 - t, 3);
    el.textContent = String(Math.round(from + delta * eased));
    if (t < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}

/* ════════ poster SVG generator (per-draft thumbnail) ════════ */
function buildPosterSVG(draft) {
  const tier = riskTier(Number(draft.riskScore) || 0);
  const tierColor = { low: "#84a98c", mid: "#e9c46a", high: "#e76f51" }[tier];

  const topic = (draft.topic || "—").trim();
  // long topic → wrap
  const topicLines = wrapText(topic, 14, 2);
  const theme = draft.themeArea || "脳情報科学";
  const tmpl = draft.templateName || "";
  const date = (draft.date || draft.generatedAt || "").slice(0, 10);
  const score = Number(draft.riskScore) || 0;

  // build small EEG-like sigil along the bottom for visual signature
  const sigil = buildPosterSigil(440, 30, draft.generatedAt);

  return `
<defs>
  <linearGradient id="poster-bg" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0%" stop-color="#161a20"/>
    <stop offset="100%" stop-color="#08090b"/>
  </linearGradient>
  <radialGradient id="poster-glow" cx="0.85" cy="0.15" r="0.6">
    <stop offset="0%" stop-color="${tierColor}" stop-opacity="0.18"/>
    <stop offset="100%" stop-color="${tierColor}" stop-opacity="0"/>
  </radialGradient>
</defs>

<rect width="480" height="280" fill="url(#poster-bg)"/>
<rect width="480" height="280" fill="url(#poster-glow)"/>

<!-- frame corners -->
<path d="M14,14 L14,4 L24,4" stroke="#cbc4af" stroke-width="1" fill="none" opacity="0.6"/>
<path d="M466,266 L466,276 L456,276" stroke="#cbc4af" stroke-width="1" fill="none" opacity="0.6"/>

<!-- top label -->
<text x="22" y="34" font-family="JetBrains Mono, monospace" font-size="10"
      letter-spacing="2.5" fill="#ff6b35" font-weight="500">[ CEREPORTAL · NEURO·DRAFT ]</text>
<text x="458" y="34" font-family="JetBrains Mono, monospace" font-size="10"
      letter-spacing="2" fill="#918a7a" text-anchor="end">${escapeXml(buildRunId(draft.generatedAt))}</text>

<!-- divider -->
<line x1="22" y1="46" x2="458" y2="46" stroke="#232831" stroke-dasharray="2 4"/>

<!-- topic (large, serif) -->
${topicLines
  .map(
    (line, i) =>
      `<text x="22" y="${88 + i * 38}" font-family="Fraunces, serif"
            font-size="32" font-weight="500" fill="#ede6d3"
            font-style="italic" letter-spacing="-0.5">${escapeXml(line)}</text>`
  )
  .join("\n")}

<!-- theme tag -->
<rect x="22" y="${
    98 + topicLines.length * 38
  }" width="${Math.min(theme.length * 14 + 24, 280)}" height="22" fill="#161a20"
      stroke="#00d9b8" stroke-opacity="0.5" rx="3"/>
<text x="34" y="${
    113 + topicLines.length * 38
  }" font-family="Fraunces, serif" font-size="13" fill="#00d9b8" font-weight="500">${escapeXml(
    theme
  )}</text>

<!-- bottom strip: sigil + risk + template -->
<line x1="22" y1="222" x2="458" y2="222" stroke="#232831" stroke-dasharray="2 4"/>

<g transform="translate(22, 234)">
  <text font-family="JetBrains Mono, monospace" font-size="9"
        letter-spacing="2" fill="#5e554a">SIGNAL</text>
  <path d="${sigil}" fill="none" stroke="${tierColor}" stroke-width="1.2"
        opacity="0.85" transform="translate(0, 6)"/>
</g>

<g transform="translate(360, 248)">
  <text font-family="JetBrains Mono, monospace" font-size="9" letter-spacing="2"
        fill="#5e554a">RISK</text>
  <text x="0" y="14" font-family="JetBrains Mono, monospace" font-size="22"
        fill="${tierColor}" font-weight="500">${score}</text>
  <text x="32" y="14" font-family="JetBrains Mono, monospace" font-size="11"
        fill="#5e554a">/100</text>
</g>

<text x="22" y="270" font-family="JetBrains Mono, monospace" font-size="9"
      letter-spacing="2" fill="#5e554a">${escapeXml(date.toUpperCase())}  ·  ${escapeXml(
    tmpl.toUpperCase()
  )}</text>
`;
}

/** topic を wrap: ざっくり日本語 + 英語混在を想定し、文字数で改行 */
function wrapText(s, perLine, maxLines) {
  if (!s) return [""];
  const lines = [];
  let cur = "";
  // 日本語は1文字=1, 英字は0.6相当で計算
  const weight = (c) => (/[　-鿿＀-￯]/.test(c) ? 1 : 0.55);
  let w = 0;
  for (const c of s) {
    cur += c;
    w += weight(c);
    if (w >= perLine) {
      lines.push(cur);
      cur = "";
      w = 0;
      if (lines.length === maxLines - 1) break;
    }
  }
  if (cur) lines.push(cur);
  if (lines.length > maxLines) {
    lines.length = maxLines;
    lines[maxLines - 1] = lines[maxLines - 1].slice(0, -1) + "…";
  }
  return lines;
}

/** 短い波形 sigil を生成 (decorativeなのでシードに依存) */
function buildPosterSigil(width, height, seedSrc) {
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

function escapeXml(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/* ════════ render: paper metadata panel ════════ */
function renderPaperMeta(draft) {
  if (!draft) {
    els.paperSummary.textContent = "—";
    els.paperAuthors.textContent = "—";
    els.paperDate.textContent = "—";
    els.paperSourceTag.textContent = "—";
    els.paperIdText.textContent = "—";
    els.paperTheme.textContent = "—";
    els.paperKeywords.innerHTML = "—";
    els.paperAbstract.textContent = "—";
    els.posterSvg.innerHTML = "";
    return;
  }

  els.paperSummary.textContent = draft.summaryJP || draft.topic || "—";
  els.paperAuthors.textContent = draft.paperAuthors || "(著者情報なし)";
  els.paperDate.textContent = draft.publishedDate || "—";

  const src = draft.paperSource || "—";
  els.paperSourceTag.textContent = src.toUpperCase();
  els.paperIdText.textContent = draft.paperId || "—";

  els.paperTheme.textContent = draft.themeArea || "—";

  const kws = Array.isArray(draft.jpKeywords) ? draft.jpKeywords : [];
  if (kws.length === 0) {
    els.paperKeywords.innerHTML =
      '<span style="color:var(--cream-4); font-family: var(--mono); font-size: 11px;">—</span>';
  } else {
    els.paperKeywords.innerHTML = "";
    kws.slice(0, 8).forEach((kw, i) => {
      const span = document.createElement("span");
      span.className = "pm-keyword" + (i === 0 ? " signal" : "");
      span.textContent = kw;
      els.paperKeywords.appendChild(span);
    });
  }

  els.paperAbstract.textContent =
    draft.abstractExcerpt || "(abstract not available)";

  // generate poster SVG
  els.posterSvg.innerHTML = buildPosterSVG(draft);
}

/* ════════ render: figure carousel ════════ */
function renderFigures(draft) {
  // legacy support: use figureUrls if present, fall back to single figureUrl
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
    img.onerror = () => {
      li.style.opacity = "0.4";
      cap.textContent = `FIG. ${String(i + 1).padStart(2, "0")} — load failed`;
    };
    const cap = document.createElement("figcaption");
    cap.textContent = `FIG. ${String(i + 1).padStart(2, "0")}`;
    li.appendChild(img);
    li.appendChild(cap);
    els.figureList.appendChild(li);
  });
}

/* ════════ render: latest signal ════════ */
function renderLatest(draft, opts = {}) {
  const previousScore = currentDraft ? Number(currentDraft.riskScore) || 0 : 0;
  currentDraft = draft;

  if (!draft) {
    els.text.textContent =
      "// no transmission yet\n" +
      "// the next GitHub Actions run (≤3h) will populate this dashboard.\n" +
      "// data files: public/data/latest-draft.json, drafts-history.json";
    els.copyBtn.disabled = true;
    renderPaperMeta(null);
    renderFigures(null);
    return;
  }

  els.text.textContent = draft.formatted;
  els.copyBtn.disabled = false;

  els.runId.textContent = buildRunId(draft.generatedAt);
  els.template.textContent = draft.templateName || "—";
  els.time.textContent = formatLongTime(draft.generatedAt);
  els.topic.textContent = draft.topic || "—";

  const score = Number(draft.riskScore) || 0;
  applyRiskRing(score);
  countUp(els.riskNum, opts.skipCountUp ? score : previousScore, score, 700);

  if (draft.paperLink) {
    els.source.hidden = false;
    els.paperLink.href = draft.paperLink;
    els.paperTitle.textContent = draft.paperTitle || draft.paperLink;
    els.paperBtn.hidden = false;
    els.paperBtn.href = draft.paperLink;
  } else {
    els.source.hidden = true;
    els.paperBtn.hidden = true;
  }

  renderPaperMeta(draft);
  renderFigures(draft);

  // scrub effect on draft change (skip on first render)
  if (!opts.first) {
    els.draftFrame.classList.remove("scrubbing");
    void els.draftFrame.offsetWidth; // reflow to restart animation
    els.draftFrame.classList.add("scrubbing");
  }
}

/* ════════ render: archive log ════════ */
function renderHistory(entries) {
  historyEntries = entries;
  els.archiveCount.textContent = `${entries.length} entries`;

  if (entries.length === 0) {
    els.historyList.innerHTML =
      '<li class="log-empty"><span class="log-empty-mark">∅</span><span>awaiting archive…</span></li>';
    return;
  }

  els.historyList.innerHTML = "";
  entries.forEach((entry, idx) => {
    const li = document.createElement("li");
    li.className = "log-item";
    if (idx === 0) li.classList.add("active");
    li.dataset.index = String(idx);

    const score = Number(entry.riskScore) || 0;
    const tier = riskTier(score);

    const time = document.createElement("span");
    time.className = "log-time";
    time.textContent = formatLogTime(entry.generatedAt);

    const meta = document.createElement("span");
    meta.className = "log-meta";

    const topic = document.createElement("span");
    topic.className = "log-topic";
    topic.textContent = entry.topic || entry.paperTitle || "(no topic)";

    const tmpl = document.createElement("span");
    tmpl.className = "log-template";
    tmpl.textContent = entry.templateName || "—";

    meta.appendChild(topic);
    meta.appendChild(tmpl);

    const risk = document.createElement("span");
    risk.className = "log-risk";
    risk.dataset.risk = tier;
    risk.textContent = String(score);

    li.appendChild(time);
    li.appendChild(meta);
    li.appendChild(risk);

    li.addEventListener("click", () => selectHistoryItem(idx));
    li.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        selectHistoryItem(idx);
      }
    });
    li.tabIndex = 0;
    li.setAttribute("role", "button");
    li.setAttribute("aria-label", `${entry.topic || "draft"} — risk ${score}`);

    els.historyList.appendChild(li);
  });
}

function selectHistoryItem(idx) {
  const entry = historyEntries[idx];
  if (!entry) return;
  renderLatest(entry);
  document.querySelectorAll(".log-item").forEach((el, i) => {
    el.classList.toggle("active", i === idx);
  });
  document
    .getElementById("latest-section")
    .scrollIntoView({ behavior: "smooth", block: "start" });
}

/* ════════ toast + copy ════════ */
function showToast(msg) {
  els.toast.textContent = msg;
  els.toast.hidden = false;
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => {
    els.toast.hidden = true;
  }, 2200);
}

async function copyDraft() {
  if (!currentDraft) return;
  try {
    await navigator.clipboard.writeText(currentDraft.formatted);
    showToast("✓ copied to clipboard");
  } catch {
    const ta = document.createElement("textarea");
    ta.value = currentDraft.formatted;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    try {
      document.execCommand("copy");
      showToast("✓ copied to clipboard");
    } catch {
      showToast("⚠ copy failed");
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

/* ════════ animation loop ════════ */
let lastFrame = performance.now();
function animationLoop(now) {
  const dt = now - lastFrame;
  lastFrame = now;

  tickStatusWave();
  tickBands(dt);

  requestAnimationFrame(animationLoop);
}

/* ════════ boot sequence ════════ */
async function runBootSequence() {
  // boot scan-line plays for 800ms via CSS
  await new Promise((r) => setTimeout(r, 700));
  els.body.classList.remove("booting");
  els.statusLabel.textContent = "SIGNAL ACTIVE";
  els.heroState.textContent = "ACTIVE";
}

/* ════════ feeds rendering ════════ */
function formatFeedTime(iso) {
  if (!iso) return "—/—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 10);
  return `${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function feedItemDom(item) {
  const a = document.createElement("a");
  a.className = "fp-item";
  a.href = item.url || "#";
  a.target = "_blank";
  a.rel = "noopener";

  const head = document.createElement("div");
  head.className = "fp-item-head";

  const time = document.createElement("span");
  time.className = "fp-item-time";
  time.textContent = formatFeedTime(item.publishedDate);
  head.appendChild(time);

  if (item.source) {
    const src = document.createElement("span");
    src.className = "fp-item-source";
    src.textContent = item.source;
    head.appendChild(src);
  }

  const title = document.createElement("div");
  title.className = "fp-item-title";
  title.textContent = item.title || "(no title)";

  a.appendChild(head);
  a.appendChild(title);

  if (item.summary) {
    const sum = document.createElement("div");
    sum.className = "fp-item-summary";
    sum.textContent = item.summary;
    a.appendChild(sum);
  }

  return a;
}

function renderFeedPanel(catKey, category) {
  const panel = document.querySelector(`.feed-panel[data-cat="${catKey}"]`);
  if (!panel) return;

  const sub = panel.querySelector(".fp-sub");
  const count = panel.querySelector(".fp-count");
  const list = panel.querySelector(".fp-list");

  sub.textContent = category.sublabel || "—";
  count.textContent = `${category.itemCount || 0} items`;
  list.innerHTML = "";

  if (!category.items || category.items.length === 0) {
    const li = document.createElement("li");
    li.className = "fp-empty";
    const mark = document.createElement("span");
    mark.className = "fp-empty-mark";
    mark.textContent = "∅";
    li.appendChild(mark);
    li.appendChild(document.createTextNode(category.error || "no items yet"));
    if (catKey === "grants") {
      const hint = document.createElement("span");
      hint.className = "fp-empty-hint";
      hint.textContent = "Tip: set FEED_GRANTS_URLS env var with AMED/JST/eRAD feeds";
      li.appendChild(hint);
    }
    list.appendChild(li);
    return;
  }

  category.items.forEach((it) => {
    const li = document.createElement("li");
    li.appendChild(feedItemDom(it));
    list.appendChild(li);
  });
}

function renderFeeds(feeds) {
  const updatedEl = document.getElementById("feeds-updated");
  const totalEl = document.getElementById("feeds-total");

  if (!feeds || !feeds.categories) {
    updatedEl.textContent = "no feed data";
    totalEl.textContent = "—";
    ["papers", "market", "grants", "aineuro"].forEach((k) =>
      renderFeedPanel(k, { sublabel: "—", itemCount: 0, items: [] })
    );
    return;
  }

  const cats = feeds.categories;
  const total = Object.values(cats).reduce(
    (n, c) => n + (c.itemCount || 0),
    0
  );

  updatedEl.textContent = `updated ${formatLongTime(feeds.generatedAt)}`;
  totalEl.textContent = `${total} items`;

  renderFeedPanel("papers", cats.papers);
  renderFeedPanel("market", cats.market);
  renderFeedPanel("grants", cats.grants);
  renderFeedPanel("aineuro", cats.aineuro);
}

/* ════════ boot ════════ */
async function init() {
  // immediate setup so viewing area looks alive even during boot
  paintHeroWaveforms();

  els.copyBtn.addEventListener("click", copyDraft);

  // start animations early so they're already running when boot finishes
  requestAnimationFrame(animationLoop);
  tickClock();
  setInterval(tickClock, 1000);

  // brand spike: occasional firing (every 4-7s)
  setInterval(fireBrandSpike, 5500);

  // run boot in parallel with data load
  const bootPromise = runBootSequence();

  let latest = null;
  let history = [];
  let feeds = null;
  try {
    latest = await loadJson("/data/latest-draft.json");
  } catch (err) {
    console.warn("[cereportal] latest-draft.json unavailable:", err);
  }
  try {
    history = await loadJson("/data/drafts-history.json");
  } catch (err) {
    console.warn("[cereportal] drafts-history.json unavailable:", err);
  }
  try {
    feeds = await loadJson("/data/feeds.json");
  } catch (err) {
    console.warn("[cereportal] feeds.json unavailable:", err);
  }

  await bootPromise;

  renderFeeds(feeds);
  renderLatest(latest, { first: true, skipCountUp: true });
  renderHistory(Array.isArray(history) ? history : []);

  bindKeyboard();
}

init();
