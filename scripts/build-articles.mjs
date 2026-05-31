#!/usr/bin/env node
/* ============================================================
   build-articles.mjs
   ──────────────────────────────────────────────────────────
   Reads:
     public/data/latest-draft.json
     public/data/drafts-history.json
   Writes:
     public/article/<slug>.html       (per-draft article page)
     public/sitemap-main.xml
     public/robots.txt
   Slug format (kept in sync with public/assets/app.js):
     <ts:YYYYMMDDHHMM>-<paperId>
   ============================================================ */

import { readFile, writeFile, mkdir, readdir, unlink } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");
const PUBLIC_DIR = path.join(ROOT, "public");
const DATA_DIR = path.join(PUBLIC_DIR, "data");
const OUT_DIR = path.join(PUBLIC_DIR, "article");
const SITE_ORIGIN = process.env.SITE_ORIGIN || "https://eegbugckets.web.app";

// Hand-authored editorial bodies live here, keyed by article slug.
// This file is read-only for the build (and must NOT be overwritten by the
// generation pipeline), so original Japanese commentary survives rebuilds.
const EDITORIALS_PATH = path.join(DATA_DIR, "editorials.json");

// AdSense: only emit an in-article ad unit when a real slot id is configured.
// Leaving a placeholder slot id in published pages serves no ad and looks broken
// to reviewers, so we omit the unit until ADSENSE_INARTICLE_SLOT is set.
const ADSENSE_CLIENT = "ca-pub-3378319187302369";
const ADSENSE_INARTICLE_SLOT = process.env.ADSENSE_INARTICLE_SLOT || "";

// AdSense readiness gate: thin template-fallback pages (no hand-authored
// editorial) read as "low value content" to reviewers, which is the most
// likely cause of repeated AdSense rejection. By default we publish ONLY
// articles that have an authored editorial in editorials.json. Set
// PUBLISH_ALL=1 to restore the legacy behavior (also emit template fallbacks).
const PUBLISH_ALL = process.env.PUBLISH_ALL === "1";

// Use clean URLs (no .html extension) to match canonical form under cleanUrls: true.
const STATIC_PAGES = [
  { path: "/", changefreq: "hourly", priority: "1.0" },
  { path: "/about", changefreq: "monthly", priority: "0.6" },
  { path: "/privacy", changefreq: "monthly", priority: "0.4" },
  { path: "/terms", changefreq: "monthly", priority: "0.4" },
  { path: "/contact", changefreq: "yearly", priority: "0.3" },
];

/* ────────── helpers ────────── */
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

function pad(n, w = 2) { return String(n).padStart(w, "0"); }

function archiveSlug(entry) {
  const id = String(entry.paperId || "").replace(/[^a-zA-Z0-9._-]/g, "_");
  const ts = String(entry.generatedAt || "").replace(/[^0-9]/g, "").slice(0, 12);
  if (!id || !ts) return null;
  return `${ts}-${id}`;
}

function formatLongDateJP(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const days = ["日", "月", "火", "水", "木", "金", "土"];
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日（${days[d.getDay()]}） ${pad(d.getHours())}:${pad(d.getMinutes())} JST`;
}

function isoDateOnly(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso).slice(0, 10);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function templateLabelJP(name) {
  return {
    "data-driven": "データドリブン編集",
    "paradigm-shift": "パラダイムシフト編集",
    "three-insights": "3つの示唆編集",
    "future-vision": "未来予想編集",
    "neuro-ai-bridge": "神経AI接続編集",
    "provocative-question": "問題提起編集",
  }[name] || (name || "編集ノート");
}

function dekFor(entry) {
  const theme = entry.themeArea || "脳情報科学";
  const tmpl = entry.templateName || "";
  return {
    "data-driven": `データが裏づけた${theme}の新知見。`,
    "paradigm-shift": `${theme}の前提を揺さぶる研究が登場した。`,
    "three-insights": `${theme}の最新研究が示す三つの示唆。`,
    "future-vision": `${theme}が描く次の地平を読み解く。`,
    "neuro-ai-bridge": `神経科学とAIの境界を結び直す研究。`,
    "provocative-question": `${theme}に投げかけられた、ひとつの問い。`,
  }[tmpl] || `${theme}の最新動向を読み解く編集ノート。`;
}

function commentary(entry) {
  const theme = entry.themeArea || "脳情報科学";
  const tmpl = entry.templateName || "";
  const intros = {
    "data-driven":
      `本稿では、${theme}領域における最新研究をデータドリブンの観点から整理した。
      引用元は学術プレプリント (arXiv) を含み、査読前の研究結果を多く含む点には注意を要するが、
      同時に「いま何が議論されているか」を最も早く把握できる情報源でもある。`,
    "paradigm-shift":
      `本稿は、${theme}の従来モデルを揺さぶる可能性のある研究を取り上げた。
      編集部は、結果の再現性および解釈の幅について慎重な距離をとりつつ、
      仮説としての価値を読者に共有する形でまとめている。`,
    "three-insights":
      `本稿では、${theme}に関する最新研究から、編集部が抽出した三つの示唆を提示した。
      いずれも査読前のプレプリントを含むため、確定的な結論ではなく
      「この方向の議論が活発である」というシグナルとして読み取っていただきたい。`,
    "future-vision":
      `本稿では、${theme}が向かう先を示唆する一報を取り上げた。
      未来予測の性質上、本稿は確定的な見立てではなく、現時点の傍証から導かれた
      編集部の仮説的展望である。`,
    "neuro-ai-bridge":
      `神経科学と人工知能の交差点では、互いのメタファーが互いを駆動するサイクルが続いている。
      本稿で取り上げる研究も、その界面で生まれた新しい仮説の一例である。`,
    "provocative-question":
      `本稿は、${theme}に投げかけられた一つの「問い」を中心に構成した。
      解の提示よりも、議論を深めるための材料提供を意図している。`,
  };
  return intros[tmpl] ||
    `本稿は、${theme}の最新動向を編集部が独自に整理し、読者の文脈に翻訳したものである。
     原典の主張を保ちつつ、断定を避けた hedging 表現を用いている。`;
}

function relatedEntries(target, all, limit = 3) {
  if (!target || !Array.isArray(all)) return [];
  const targetTheme = target.themeArea || "";
  const targetKws = new Set(
    (Array.isArray(target.jpKeywords) ? target.jpKeywords : []).map((s) => String(s).toLowerCase())
  );
  const targetSlug = archiveSlug(target);

  const scored = all
    .filter((e) => archiveSlug(e) && archiveSlug(e) !== targetSlug)
    .map((e) => {
      let score = 0;
      if ((e.themeArea || "") === targetTheme && targetTheme) score += 5;
      const ekw = (Array.isArray(e.jpKeywords) ? e.jpKeywords : []).map((s) =>
        String(s).toLowerCase()
      );
      for (const k of ekw) if (targetKws.has(k)) score += 2;
      // recency tiebreaker
      const t = Date.parse(e.generatedAt || "");
      score += Number.isFinite(t) ? t / 1e15 : 0;
      return { e, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score);

  // Fallback: if not enough scored matches, fill with most recent unrelated
  const out = scored.slice(0, limit).map((x) => x.e);
  if (out.length < limit) {
    const seen = new Set(out.map((e) => archiveSlug(e)));
    for (const e of all) {
      const s = archiveSlug(e);
      if (s && s !== targetSlug && !seen.has(s)) {
        out.push(e);
        seen.add(s);
        if (out.length >= limit) break;
      }
    }
  }
  return out;
}

function relatedHtml(target, all) {
  const rel = relatedEntries(target, all, 3);
  if (rel.length === 0) return "";
  const cards = rel.map((e) => {
    const slug = archiveSlug(e);
    const title = e.summaryJP || e.topic || e.paperTitle || "—";
    const theme = e.themeArea || "脳情報科学";
    const date = isoDateOnly(e.generatedAt);
    return `
      <article class="related-card">
        <span class="rk-eyebrow">${escapeHtml(theme)}</span>
        <a href="/article/${escapeHtml(slug)}">${escapeHtml(title)}</a>
        <span class="rk-meta">${escapeHtml(date)}</span>
      </article>`;
  }).join("\n");
  return `
    <section class="related-stories" aria-labelledby="related-heading">
      <h2 id="related-heading">関連する編集ノート</h2>
      <div class="related-grid">${cards}</div>
    </section>`;
}

/* ────────── editorial body (hand-authored, original) ────────── */

// Render the authored sections. `s.html` is trusted authored markup
// (paragraphs / lists) and is intentionally NOT escaped; headings are.
function editorialSectionsHtml(editorial) {
  if (!editorial || !Array.isArray(editorial.sections)) return "";
  return editorial.sections
    .map((s) => `        <h2>${escapeHtml(s.h || "")}</h2>\n        ${String(s.html || "").trim()}`)
    .join("\n\n");
}

function glossaryHtml(editorial) {
  const gl = editorial && Array.isArray(editorial.glossary) ? editorial.glossary : [];
  if (gl.length === 0) return "";
  const items = gl
    .map((g) => `          <dt>${escapeHtml(g.term || "")}</dt>\n          <dd>${escapeHtml(g.def || "")}</dd>`)
    .join("\n");
  return `
        <h2>用語ノート</h2>
        <dl class="glossary">
${items}
        </dl>`;
}

function faqHtml(editorial) {
  const faq = editorial && Array.isArray(editorial.faq) ? editorial.faq : [];
  if (faq.length === 0) return "";
  const items = faq
    .map(
      (f) => `        <div class="faq-item">
          <h3 class="faq-q">${escapeHtml(f.q || "")}</h3>
          <p class="faq-a">${escapeHtml(f.a || "")}</p>
        </div>`
    )
    .join("\n");
  return `
      <section class="article-faq" aria-labelledby="faq-heading">
        <h2 id="faq-heading">よくある質問</h2>
${items}
      </section>`;
}

function faqLdNode(editorial, url) {
  const faq = editorial && Array.isArray(editorial.faq) ? editorial.faq : [];
  if (faq.length === 0) return null;
  return {
    "@type": "FAQPage",
    "@id": `${url}#faq`,
    mainEntity: faq.map((f) => ({
      "@type": "Question",
      name: f.q || "",
      acceptedAnswer: { "@type": "Answer", text: f.a || "" },
    })),
  };
}

// Plain-text length of authored body, used for wordCount in schema.
function editorialTextLength(editorial) {
  if (!editorial) return 0;
  const parts = [editorial.lede || ""];
  for (const s of editorial.sections || []) parts.push(String(s.html || "").replace(/<[^>]*>/g, " "));
  for (const g of editorial.glossary || []) parts.push(g.term || "", g.def || "");
  for (const f of editorial.faq || []) parts.push(f.q || "", f.a || "");
  return parts.join(" ").replace(/\s+/g, "").length;
}

function inArticleAdHtml() {
  if (!ADSENSE_INARTICLE_SLOT) return "";
  return `
        <!-- AdSense slot: ARTICLE_INCONTENT -->
        <aside class="ad-slot ad-slot--inarticle" aria-label="広告">
          <span class="ad-slot__label">広告 / ADVERTISEMENT</span>
          <ins class="adsbygoogle"
               style="display:block; text-align:center;"
               data-ad-layout="in-article"
               data-ad-format="fluid"
               data-ad-client="${ADSENSE_CLIENT}"
               data-ad-slot="${ADSENSE_INARTICLE_SLOT}"></ins>
          <script>(adsbygoogle = window.adsbygoogle || []).push({});</script>
        </aside>`;
}

function articlePageHtml(entry, allEntries, editorials) {
  const slug = archiveSlug(entry);
  const editorial = (editorials && editorials[slug]) || null;
  const url = `${SITE_ORIGIN}/article/${slug}`;
  // Editorials may override the auto-generated title/dek/theme when the
  // upstream classifier mislabeled the paper (e.g. assigning "深層学習" to a
  // purely clinical study). Honest titles matter more than template parity.
  const title = (editorial && editorial.title) || entry.summaryJP || entry.topic || entry.paperTitle || "NeuroPulse article";
  const dek = (editorial && editorial.dek) || dekFor(entry);
  const dateISO = entry.generatedAt || new Date().toISOString();
  const datePub = isoDateOnly(dateISO);
  const dateLong = formatLongDateJP(dateISO);
  const tmplLabel = templateLabelJP(entry.templateName);
  const theme = (editorial && editorial.theme) || entry.themeArea || "脳情報科学";
  const score = Math.round(Number(entry.riskScore) || 0);
  const note = commentary(entry);
  const abs = entry.abstractExcerpt || "";
  const paperLink = entry.paperLink || "";
  const paperTitle = entry.paperTitle || "";
  const authors = entry.paperAuthors || "(著者情報なし)";
  const keywords = Array.isArray(entry.jpKeywords) ? entry.jpKeywords.join(", ") : "";

  const ldjson = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "NewsMediaOrganization",
        "@id": `${SITE_ORIGIN}/#org`,
        name: "NeuroPulse",
        alternateName: "NeuroPulse — BCI & Neuroscience Daily",
        url: `${SITE_ORIGIN}/`,
        logo: {
          "@type": "ImageObject",
          url: `${SITE_ORIGIN}/assets/favicon.svg`,
          width: 64,
          height: 64,
        },
        inLanguage: "ja",
      },
      {
        "@type": "WebSite",
        "@id": `${SITE_ORIGIN}/#site`,
        url: `${SITE_ORIGIN}/`,
        name: "NeuroPulse",
        alternateName: "NeuroPulse — BCI & Neuroscience Daily",
        publisher: { "@id": `${SITE_ORIGIN}/#org` },
        inLanguage: "ja",
      },
      {
        "@type": "NewsArticle",
        "@id": url,
        headline: title,
        description: dek,
        inLanguage: "ja",
        url,
        datePublished: dateISO,
        dateModified: dateISO,
        keywords,
        articleSection: theme,
        isPartOf: { "@id": `${SITE_ORIGIN}/#site` },
        publisher: { "@id": `${SITE_ORIGIN}/#org` },
        author: {
          "@type": "Organization",
          name: "NeuroPulse Editorial",
          url: `${SITE_ORIGIN}/about`,
        },
        mainEntityOfPage: { "@type": "WebPage", "@id": url },
        wordCount: editorial ? editorialTextLength(editorial) : undefined,
        isAccessibleForFree: true,
        isBasedOn: paperLink || undefined,
      },
    ],
  };

  const faqNode = faqLdNode(editorial, url);
  if (faqNode) ldjson["@graph"].push(faqNode);

  return `<!DOCTYPE html>
<html lang="ja">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(title)} — NeuroPulse — BCI &amp; Neuroscience Daily</title>
    <meta name="description" content="${escapeHtml(dek)}" />
    <meta name="author" content="NeuroPulse Editorial" />
    <meta name="robots" content="index,follow,max-image-preview:large" />
    <link rel="canonical" href="${escapeHtml(url)}" />
    <meta name="color-scheme" content="dark light" />
    <meta name="google-site-verification" content="925j_JLVm5kAlnMIG4L6Pcc1Y344gm08zFSs_ERw_0I" />
    <link rel="icon" type="image/svg+xml" href="/assets/favicon.svg" />
    <link rel="apple-touch-icon" href="/assets/favicon.svg" />
    <meta name="theme-color" content="#1e1b4b" />

    <meta property="og:type" content="article" />
    <meta property="og:site_name" content="NeuroPulse — BCI &amp; Neuroscience Daily" />
    <meta property="og:title" content="${escapeHtml(title)}" />
    <meta property="og:description" content="${escapeHtml(dek)}" />
    <meta property="og:url" content="${escapeHtml(url)}" />
    <meta property="og:locale" content="ja_JP" />
    <meta property="article:published_time" content="${escapeHtml(dateISO)}" />
    <meta property="article:section" content="${escapeHtml(theme)}" />

    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link
      rel="stylesheet"
      href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,300..900&family=Inter:wght@300..700&family=JetBrains+Mono:wght@300..600&display=swap"
    />
    <link rel="stylesheet" href="/assets/style.css" />

    <!-- Google AdSense -->
    <script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-3378319187302369"
            crossorigin="anonymous"></script>
    <meta name="google-adsense-account" content="ca-pub-3378319187302369" />

    <script type="application/ld+json">${JSON.stringify(ldjson)}</script>
  </head>
  <body class="page-article">
    <a href="#main" class="skip-link">本文へスキップ</a>

    <header class="masthead" role="banner">
      <a href="/" class="masthead-brand" aria-label="NeuroPulse — BCI &amp; Neuroscience Daily — トップへ">
        <h1 class="brand-wordmark">
          <span class="brand-neuro">Neuro</span><span class="brand-pulse">Pulse</span>
          <span class="brand-divider">·</span>
          <span class="brand-tagline">BCI &amp; Neuroscience Daily</span>
        </h1>
      </a>
    </header>

    <main id="main" class="article-detail">
      <nav class="breadcrumb" aria-label="パンくず">
        <a href="/">Home</a> · <a href="/#section-archive">Archive</a> · ${escapeHtml(theme)}
      </nav>

      <h1>${escapeHtml(title)}</h1>
      <p class="dek">${escapeHtml(dek)}</p>

      <div class="meta">
        <span><strong>掲載</strong> ${escapeHtml(dateLong)}</span>
        <span><strong>編集</strong> NeuroPulse Editorial</span>
        <span><strong>テーマ</strong> ${escapeHtml(theme)}</span>
        <span><strong>テンプレート</strong> ${escapeHtml(tmplLabel)}</span>
        <span><strong>リスクスコア</strong> ${score}/100</span>
      </div>

      <article class="body">
${
  editorial
    ? `        <p class="article-lede">${escapeHtml(editorial.lede || dek)}</p>

${editorialSectionsHtml(editorial)}
${inArticleAdHtml()}
${glossaryHtml(editorial)}

        <h2>原典の要旨（英語原文・抜粋）</h2>
        <blockquote>${escapeHtml(abs)}</blockquote>
        <p class="src-attr" style="font-size: 12px; color: var(--ink-300);">
          引用元: ${escapeHtml((entry.paperSource || "source").toUpperCase())} · ${escapeHtml(entry.paperId || "—")}
          ／ 上記要旨は原典からの抜粋です。本文の背景説明・評価・限界の指摘は NeuroPulse 編集部による独自の解説です。
        </p>

        <h2>原題と著者</h2>
        <p><strong>${escapeHtml(paperTitle)}</strong></p>
        <p style="color: var(--ink-200); font-size: 14px;">${escapeHtml(authors)}</p>`
    : `        <h2>編集部メモ</h2>
        <p>${escapeHtml(note)}</p>

        ${
          abs
            ? `<h2>アブストラクト抜粋</h2>
        <blockquote>${escapeHtml(abs)}</blockquote>
        <p style="font-family: var(--mono); font-size: 11px; letter-spacing: 0.18em; text-transform: uppercase; color: var(--ink-300);">
          引用元: ${escapeHtml((entry.paperSource || "source").toUpperCase())} · ${escapeHtml(entry.paperId || "—")}
        </p>`
            : ""
        }
${inArticleAdHtml()}
        <h2>原題と著者</h2>
        <p><strong>${escapeHtml(paperTitle)}</strong></p>
        <p style="color: var(--ink-200); font-size: 14px;">${escapeHtml(authors)}</p>`
}
      </article>

      ${faqHtml(editorial)}

      ${
        paperLink
          ? `<div class="source-cta">
        <strong>原典 / SOURCE</strong>
        <span class="src-title">${escapeHtml(paperTitle || paperLink)}</span>
        <a class="btn btn-primary" href="${escapeHtml(paperLink)}" target="_blank" rel="noopener">
          <span>原典を読む</span><span class="btn-arrow">↗</span>
        </a>
      </div>`
          : ""
      }

      ${relatedHtml(entry, allEntries || [])}

      <a href="/" class="policy-back">← トップへ戻る</a>
    </main>

    <footer class="site-footer" role="contentinfo">
      <div class="footer-inner">
        <div class="footer-brand">
          <span class="footer-mark">⏚</span>
          <span class="footer-wordmark">NEUROPULSE</span>
          <span class="footer-mark">⏚</span>
        </div>
        <nav class="footer-nav" aria-label="サイト情報">
          <ul>
            <li><a href="/about">運営者情報</a></li>
            <li><a href="/contact">お問い合わせ</a></li>
            <li><a href="/privacy">プライバシーポリシー</a></li>
            <li><a href="/terms">利用規約</a></li>
          </ul>
        </nav>
        <p class="footer-copy">© 2026 NeuroPulse Editorial. All rights reserved.</p>
        <p class="footer-disclaimer">
          掲載されている各リンク先記事の著作権は各オリジナル発行元に帰属します。
        </p>
      </div>
    </footer>
  </body>
</html>
`;
}

function sitemapXml(articleEntries) {
  const today = new Date().toISOString().slice(0, 10);
  const urls = [
    ...STATIC_PAGES.map(
      (p) => `  <url>
    <loc>${SITE_ORIGIN}${p.path}</loc>
    <lastmod>${today}</lastmod>
  </url>`
    ),
    ...articleEntries.map((e) => {
      const slug = archiveSlug(e);
      if (!slug) return null;
      return `  <url>
    <loc>${SITE_ORIGIN}/article/${slug}</loc>
    <lastmod>${isoDateOnly(e.generatedAt) || today}</lastmod>
  </url>`;
    }).filter(Boolean),
  ];

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.join("\n")}
</urlset>
`;
}

function robotsTxt() {
  return `User-agent: *
Allow: /
Disallow: /data/

Sitemap: ${SITE_ORIGIN}/sitemap-main.xml
`;
}

/* ────────── main ────────── */
async function main() {
  const latestPath = path.join(DATA_DIR, "latest-draft.json");
  const historyPath = path.join(DATA_DIR, "drafts-history.json");

  let history = [];
  try {
    const txt = await readFile(historyPath, "utf8");
    history = JSON.parse(txt);
  } catch (err) {
    console.warn("[build-articles] drafts-history.json not readable:", err.message);
  }

  let latest = null;
  try {
    const txt = await readFile(latestPath, "utf8");
    latest = JSON.parse(txt);
  } catch (err) {
    console.warn("[build-articles] latest-draft.json not readable:", err.message);
  }

  let editorials = {};
  try {
    const txt = await readFile(EDITORIALS_PATH, "utf8");
    editorials = JSON.parse(txt) || {};
  } catch (err) {
    console.warn("[build-articles] editorials.json not readable (falling back to template bodies):", err.message);
  }

  // Combine: ensure latest is in the set, dedupe by slug.
  const combined = [];
  const seen = new Set();
  if (latest) {
    const s = archiveSlug(latest);
    if (s) { combined.push(latest); seen.add(s); }
  }
  for (const e of (Array.isArray(history) ? history : [])) {
    const s = archiveSlug(e);
    if (s && !seen.has(s)) { combined.push(e); seen.add(s); }
  }

  if (!existsSync(OUT_DIR)) await mkdir(OUT_DIR, { recursive: true });

  // Gate: publish only articles with a hand-authored editorial unless PUBLISH_ALL.
  // Template-fallback (thin) entries are excluded from the HTML output, the
  // related-stories pool, and the sitemap; their stale files are swept below.
  const published = PUBLISH_ALL
    ? combined
    : combined.filter((e) => editorials[archiveSlug(e)]);

  // Write per-article HTML
  const validSlugs = new Set();
  let written = 0;
  let withEditorial = 0;
  for (const entry of published) {
    const slug = archiveSlug(entry);
    if (!slug) continue;
    validSlugs.add(`${slug}.html`);
    if (editorials[slug]) withEditorial += 1;
    const out = path.join(OUT_DIR, `${slug}.html`);
    await writeFile(out, articlePageHtml(entry, published, editorials), "utf8");
    written += 1;
  }

  // Sweep stale article files no longer in combined
  let removed = 0;
  try {
    const existing = await readdir(OUT_DIR);
    for (const f of existing) {
      if (!f.endsWith(".html")) continue;
      if (!validSlugs.has(f)) {
        await unlink(path.join(OUT_DIR, f));
        removed += 1;
      }
    }
  } catch (err) {
    console.warn("[build-articles] sweep skipped:", err.message);
  }

  // Sitemap + robots
  await writeFile(path.join(PUBLIC_DIR, "sitemap-main.xml"), sitemapXml(published), "utf8");
  await writeFile(path.join(PUBLIC_DIR, "robots.txt"), robotsTxt(), "utf8");

  console.log(
    `[build-articles] wrote ${written} article pages ` +
    `(${withEditorial} with authored editorial / ${written - withEditorial} template fallback)` +
    (removed ? `, swept ${removed} stale` : "") +
    `, sitemap (${published.length} entries) + robots.txt → ${SITE_ORIGIN}` +
    (PUBLISH_ALL ? "" : ` [editorial-only gate on: ${combined.length - published.length} thin entries hidden]`)
  );
}

main().catch((err) => {
  console.error("[build-articles] fatal:", err);
  process.exit(1);
});
