#!/usr/bin/env node
/* ============================================================
   generate-editorials.mjs
   ──────────────────────────────────────────────────────────
   Free-tier LLM (Google Gemini) editorial generator.

   Turns thin auto-selected drafts into substantial, ORIGINAL
   Japanese editorials so each published article has real added
   value (the AdSense "low value content" fix). Output is consumed
   by scripts/build-articles.mjs, which publishes ONLY articles
   that have an editorial (the editorial gate).

   Reads:
     public/data/drafts-history.json   (array of drafts)
     public/data/latest-draft.json     (single latest draft)
     public/data/editorials.json       (existing editorials; merged)
   Writes:
     public/data/editorials.json        keyed by article slug

   Env:
     GEMINI_API_KEY     (required; if missing → no-op exit 0)
     GEMINI_MODEL       (default: gemini-2.0-flash)
     EDITORIAL_TARGET   (default: 30) total editorials to maintain
     MAX_PER_RUN        (default: 8)  cap generations per run (quota-friendly)
     DRY_RUN=1          (plan only; no API calls, no writes)

   Slug format must stay in sync with build-articles.mjs:
     <ts:YYYYMMDDHHMM>-<paperId>
   ============================================================ */

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");
const DATA_DIR = path.join(ROOT, "public", "data");
const EDITORIALS_PATH = path.join(DATA_DIR, "editorials.json");

const API_KEY = process.env.GEMINI_API_KEY || "";
const MODEL = process.env.GEMINI_MODEL || "gemini-2.0-flash";
const EDITORIAL_TARGET = Number(process.env.EDITORIAL_TARGET || "30");
const MAX_PER_RUN = Number(process.env.MAX_PER_RUN || "8");
const DRY_RUN = process.env.DRY_RUN === "1";

/* ────────── helpers ────────── */
function archiveSlug(entry) {
  const id = String(entry.paperId || "").replace(/[^a-zA-Z0-9._-]/g, "_");
  const ts = String(entry.generatedAt || "").replace(/[^0-9]/g, "").slice(0, 12);
  if (!id || !ts) return null;
  return `${ts}-${id}`;
}

async function readJson(p, fallback) {
  try {
    return JSON.parse(await readFile(p, "utf8"));
  } catch {
    return fallback;
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Gemini responseSchema (OpenAPI subset; types are UPPERCASE strings).
const RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    title: { type: "STRING" },
    dek: { type: "STRING" },
    theme: { type: "STRING" },
    lede: { type: "STRING" },
    sections: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: { h: { type: "STRING" }, html: { type: "STRING" } },
        required: ["h", "html"],
      },
    },
    glossary: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: { term: { type: "STRING" }, def: { type: "STRING" } },
        required: ["term", "def"],
      },
    },
    faq: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: { q: { type: "STRING" }, a: { type: "STRING" } },
        required: ["q", "a"],
      },
    },
  },
  required: ["title", "dek", "theme", "lede", "sections", "glossary", "faq"],
};

function buildPrompt(entry) {
  const realTitle = entry.paperTitle || "(no title)";
  const authors = entry.paperAuthors || "(著者情報なし)";
  const abs = entry.abstractExcerpt || "(no abstract available)";
  const source = (entry.paperSource || "source").toUpperCase();
  const link = entry.paperLink || "";
  // The upstream classifier frequently MISLABELS papers (assigning an unrelated
  // Japanese topic/theme). Tell the model to trust the real paper, not the labels.
  const autoTopic = entry.topic || entry.summaryJP || "";
  const autoTheme = entry.themeArea || "";

  return `あなたは脳情報科学・ニューロAI・ライフサイエンスを専門とする日本語の編集者です。
以下の「原典（学術論文／プレプリント）」だけを根拠に、読者にとって価値のあるオリジナルの日本語編集記事を書いてください。

# 原典
- タイトル(原文): ${realTitle}
- 著者: ${authors}
- 出典: ${source}${link ? ` (${link})` : ""}
- アブストラクト抜粋(原文): ${abs}

# 参考（自動付与ラベル・誤っている可能性あり）
- 自動トピック: ${autoTopic}
- 自動テーマ: ${autoTheme}
※これらは自動分類で、原典と食い違うことがあります。食い違う場合は必ず「原典のタイトル・アブストラクト」を優先し、正直な title / theme を付け直してください。

# 厳守するルール
1. 原典の主題を正確に反映した正直な内容にする（自動ラベルに引きずられない）。
2. 査読前プレプリントを含むため、断定を避け hedging 表現（「示唆される」「可能性がある」「とされる」）を用いる。
3. 医学的助言・診断・治療の推奨はしない。
4. アブストラクトの単なる和訳・コピーにしない。背景・意義・既存研究との関係・限界/注意点・示唆/インパクトを、編集部の視点で独自に解説する。
5. 本文(sections の html 合計)は日本語で概ね1,500〜2,500字。
6. html フィールドには <p>, <ul>, <ol>, <li>, <strong>, <em> のみを使う（見出し・script・style・リンクは入れない）。
7. すべて日本語で書く（用語の英語併記は可）。

# 出力（JSON のみ）
- title: 原典に忠実な日本語の記事タイトル（30〜45字程度、煽りすぎない）
- dek: 1文の要約リード（40〜70字）
- theme: 適切な日本語テーマ名（例: 神経デコーディング / ニューロAI・計算論 / BCI / 神経画像 / 計算神経科学 など、原典に合うもの）
- lede: 導入段落（150〜250字、プレーンテキスト）
- sections: 3〜5個。各 {h: 見出し, html: 本文HTML}。推奨見出し例「背景」「研究の要点」「既存研究との関係」「限界と注意点」「示唆・インパクト」
- glossary: 2〜4個。各 {term, def} 専門用語の平易な定義
- faq: 2〜3個。各 {q, a} 読者がもちやすい疑問と簡潔な回答`;
}

async function generateOne(entry) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${API_KEY}`;
  const body = {
    contents: [{ role: "user", parts: [{ text: buildPrompt(entry) }] }],
    generationConfig: {
      temperature: 0.7,
      maxOutputTokens: 4096,
      responseMimeType: "application/json",
      responseSchema: RESPONSE_SCHEMA,
    },
  };

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`Gemini HTTP ${res.status}: ${txt.slice(0, 300)}`);
  }

  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.map((p) => p.text || "").join("") || "";
  if (!text.trim()) throw new Error("empty response (possibly blocked or truncated)");

  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (e) {
    throw new Error(`JSON parse failed: ${e.message}; raw=${text.slice(0, 200)}`);
  }

  // Minimal validation
  if (!parsed.title || !Array.isArray(parsed.sections) || parsed.sections.length === 0) {
    throw new Error("invalid editorial shape (missing title/sections)");
  }
  return parsed;
}

/* ────────── main ────────── */
async function main() {
  if (!API_KEY && !DRY_RUN) {
    console.warn("[generate-editorials] GEMINI_API_KEY not set → no-op (the editorial gate stays inactive until editorials exist). Set the secret to enable generation.");
    return;
  }

  const [history, latest, editorials] = await Promise.all([
    readJson(path.join(DATA_DIR, "drafts-history.json"), []),
    readJson(path.join(DATA_DIR, "latest-draft.json"), null),
    readJson(EDITORIALS_PATH, {}),
  ]);

  // Combine latest + history, dedupe by slug, newest first.
  const combined = [];
  const seen = new Set();
  const push = (e) => {
    const s = archiveSlug(e);
    if (s && !seen.has(s)) { combined.push({ slug: s, entry: e }); seen.add(s); }
  };
  if (latest) push(latest);
  for (const e of Array.isArray(history) ? history : []) push(e);
  combined.sort((a, b) =>
    String(b.entry.generatedAt || "").localeCompare(String(a.entry.generatedAt || ""))
  );

  const existingCount = Object.keys(editorials).length;
  const missing = combined.filter(({ slug }) => !editorials[slug]);

  // The cron sometimes re-picks the SAME paper on different runs, producing
  // duplicate articles (same paperId, different timestamp). Generating an
  // editorial for each would publish near-duplicate content (bad for AdSense),
  // so we keep at most ONE editorial per paperId (newest wins, since combined is
  // sorted newest-first).
  const paperIdsWithEditorial = new Set(
    combined
      .filter(({ slug }) => editorials[slug])
      .map(({ entry }) => String(entry.paperId || ""))
      .filter(Boolean)
  );

  // How many more editorials do we want, capped per run for API quota.
  const want = Math.max(0, EDITORIAL_TARGET - existingCount);
  const limit = Math.min(want, MAX_PER_RUN);
  const todo = [];
  const chosenPaperIds = new Set();
  for (const item of combined) {
    if (todo.length >= limit) break;
    if (editorials[item.slug]) continue; // already has an editorial
    const pid = String(item.entry.paperId || "");
    if (pid && (paperIdsWithEditorial.has(pid) || chosenPaperIds.has(pid))) continue; // dup paper
    todo.push(item);
    if (pid) chosenPaperIds.add(pid);
  }

  console.log(
    `[generate-editorials] model=${MODEL} target=${EDITORIAL_TARGET} existing=${existingCount} ` +
    `missing=${missing.length} → generating ${todo.length} this run${DRY_RUN ? " (DRY_RUN)" : ""}`
  );

  if (DRY_RUN) {
    for (const { slug, entry } of todo) {
      console.log(`  would generate: ${slug}  ← ${(entry.paperTitle || "").slice(0, 70)}`);
    }
    return;
  }

  let ok = 0, fail = 0;
  for (const { slug, entry } of todo) {
    try {
      const editorial = await generateOne(entry);
      editorials[slug] = editorial;
      // Persist incrementally so partial progress survives a mid-run failure.
      await writeFile(EDITORIALS_PATH, JSON.stringify(editorials, null, 2) + "\n", "utf8");
      ok += 1;
      console.log(`  ✓ ${slug}  ${editorial.title}`);
    } catch (err) {
      fail += 1;
      console.warn(`  ✗ ${slug}  ${err.message}`);
    }
    await sleep(1500); // gentle pacing for free-tier rate limits
  }

  console.log(`[generate-editorials] done: +${ok} editorials (${fail} failed), total now ${Object.keys(editorials).length}`);
}

main().catch((err) => {
  console.error("[generate-editorials] fatal:", err);
  process.exit(1);
});
