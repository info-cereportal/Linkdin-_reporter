/**
 * デイリーパイプライン
 *
 * RSS取得 → トピック選定（履歴重複排除） → ドラフト生成 → レビュー → 整形 → Webhook通知
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import {
  fetchPapers,
  extractPaperFigures,
  type PaperInfo,
} from "./rss-fetcher.js";
import { polishDraft, type PolishedDraft } from "./post-polisher.js";
import { notifyWebhook } from "./webhook-notifier.js";

// ────────────────────────────────────────────
// 設定
// ────────────────────────────────────────────

export interface DailyConfig {
  rssFeeds: string[];
  webhookUrl: string;
  webhookType: "slack" | "discord";
  mentionUserId: string;
  historyPath: string;
  maxHistoryDays: number;
  publicDataDir: string;
  maxPublicHistory: number;
}

function loadConfig(): DailyConfig {
  return {
    rssFeeds: (process.env.RSS_FEEDS || "https://rss.arxiv.org/rss/q-bio.NC").split(",").map((s) => s.trim()),
    webhookUrl: process.env.WEBHOOK_URL || "",
    webhookType: (process.env.WEBHOOK_TYPE === "discord" ? "discord" : "slack") as "slack" | "discord",
    mentionUserId: process.env.DISCORD_MENTION_USER_ID || "",
    historyPath: resolve(process.env.HISTORY_FILE || ".daily-history.json"),
    maxHistoryDays: Number(process.env.MAX_HISTORY_DAYS) || 30,
    publicDataDir: resolve(process.env.PUBLIC_DATA_DIR || "public/data"),
    maxPublicHistory: Number(process.env.MAX_PUBLIC_HISTORY) || 50,
  };
}

// ────────────────────────────────────────────
// 履歴管理（トピック重複防止）
// ────────────────────────────────────────────

interface HistoryEntry {
  date: string;
  paperTitle: string;
  topic: string;
}

async function loadHistory(path: string): Promise<HistoryEntry[]> {
  try {
    const data = await readFile(path, "utf-8");
    return JSON.parse(data) as HistoryEntry[];
  } catch {
    return [];
  }
}

async function saveHistory(path: string, history: HistoryEntry[], maxDays: number): Promise<void> {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - maxDays);
  const cutoffStr = cutoff.toISOString().slice(0, 10);

  const pruned = history.filter((e) => e.date >= cutoffStr);
  await writeFile(path, JSON.stringify(pruned, null, 2), "utf-8");
}

function isAlreadyUsed(paper: PaperInfo, history: HistoryEntry[]): boolean {
  return history.some((e) => e.paperTitle === paper.title);
}

// ────────────────────────────────────────────
// Web アプリ用の公開 JSON 書き出し
// ────────────────────────────────────────────

interface PublicDraftEntry {
  // 既存フィールド (後方互換)
  generatedAt: string;
  date: string;
  topic: string;
  templateName: string;
  riskScore: number;
  paperTitle: string;
  paperLink: string;
  figureUrl?: string;
  formatted: string;
  // 新規メタデータ (情報密度向上)
  summaryJP: string;
  paperAuthors: string;
  publishedDate: string;
  paperId: string;
  paperSource: "arxiv" | "pubmed" | "other";
  themeArea: string;
  jpKeywords: string[];
  abstractExcerpt: string;
  figureUrls: string[];
}

function toPublicEntry(draft: PolishedDraft, generatedAt: string): PublicDraftEntry {
  return {
    generatedAt,
    date: generatedAt.slice(0, 10),
    topic: draft.topic,
    templateName: draft.templateName,
    riskScore: draft.riskScore,
    paperTitle: draft.paperTitle,
    paperLink: draft.paperLink,
    figureUrl: draft.figureUrl,
    formatted: draft.formatted,
    summaryJP: draft.summaryJP,
    paperAuthors: draft.paperAuthors,
    publishedDate: draft.publishedDate,
    paperId: draft.paperId,
    paperSource: draft.paperSource,
    themeArea: draft.themeArea,
    jpKeywords: draft.jpKeywords,
    abstractExcerpt: draft.abstractExcerpt,
    figureUrls: draft.figureUrls,
  };
}

async function writeJson(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(value, null, 2) + "\n", "utf-8");
}

async function readJson<T>(path: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await readFile(path, "utf-8")) as T;
  } catch {
    return fallback;
  }
}

/**
 * Firebase Hosting 用の latest-draft.json と drafts-history.json を更新する。
 * 既存履歴に追記し、上限件数を超えたら古いものから切り詰める。
 */
async function updatePublicData(
  draft: PolishedDraft,
  config: DailyConfig
): Promise<void> {
  const entry = toPublicEntry(draft, new Date().toISOString());
  const latestPath = resolve(config.publicDataDir, "latest-draft.json");
  const historyPath = resolve(config.publicDataDir, "drafts-history.json");

  await writeJson(latestPath, entry);

  const history = await readJson<PublicDraftEntry[]>(historyPath, []);
  history.unshift(entry);
  const trimmed = history.slice(0, config.maxPublicHistory);
  await writeJson(historyPath, trimmed);
}

// ────────────────────────────────────────────
// トピック選定
// ────────────────────────────────────────────

/** 認知神経科学的な関連度をスコアリングする */
const RELEVANCE_KEYWORDS = [
  "brain", "cognitive", "neural", "cortex", "memory", "attention",
  "decision", "learning", "emotion", "prefrontal", "dopamine", "serotonin",
  "hippocampus", "plasticity", "fmri", "eeg", "executive", "working memory",
  "mindfulness", "sleep", "stress", "creativity", "motivation", "reward",
  "default mode", "amygdala", "cognition", "neuroscience", "behavior",
];

function scorePaper(paper: PaperInfo): number {
  const text = `${paper.title} ${paper.abstract}`.toLowerCase();
  let score = 0;

  // キーワードマッチ（タイトルは2倍重み）
  for (const kw of RELEVANCE_KEYWORDS) {
    if (paper.title.toLowerCase().includes(kw)) score += 2;
    if (paper.abstract.toLowerCase().includes(kw)) score += 1;
  }

  // abstract が充実しているほど高スコア
  if (paper.abstract.length > 200) score += 3;
  else if (paper.abstract.length > 100) score += 1;

  // editorial/review/letter はスコア減
  if (text.includes("editorial") || text.includes("letter to")) score -= 5;

  return score;
}

function selectPaper(papers: PaperInfo[], history: HistoryEntry[]): PaperInfo | null {
  if (papers.length === 0) return null;

  // 未使用の論文から選択
  const unused = papers.filter((p) => !isAlreadyUsed(p, history));
  const candidates = unused.length > 0 ? unused : papers;

  // スコア順にソートし、上位5件からランダム選択
  const scored = candidates
    .map((p) => ({ paper: p, score: scorePaper(p) }))
    .sort((a, b) => b.score - a.score);

  const topN = scored.slice(0, Math.min(5, scored.length));
  return topN[Math.floor(Math.random() * topN.length)].paper;
}

// ────────────────────────────────────────────
// 論文選定のみ（Claude エージェント用）
// ────────────────────────────────────────────

export interface PaperSelection {
  success: boolean;
  paper?: PaperInfo;
  error?: string;
}

/**
 * 論文を1件選定してJSON出力する。
 * 文面生成はClaude側で行うため、ここでは素材だけ返す。
 */
export async function selectDailyPaper(): Promise<PaperSelection> {
  const config = loadConfig();
  const today = new Date().toISOString().slice(0, 10);

  // 1. RSS フィード取得
  const papers = await fetchPapers(config.rssFeeds);
  if (papers.length === 0) {
    return { success: false, error: "RSS/PubMed から論文を取得できませんでした。" };
  }

  // 2. 履歴ロード + 選定
  const history = await loadHistory(config.historyPath);
  const paper = selectPaper(papers, history);
  if (!paper) {
    return { success: false, error: "候補の論文が見つかりませんでした。" };
  }

  // 3. 履歴保存
  history.push({ date: today, paperTitle: paper.title, topic: "" });
  await saveHistory(config.historyPath, history, config.maxHistoryDays);

  return { success: true, paper };
}

// ────────────────────────────────────────────
// フルパイプライン（テンプレートベース、ローカル実行用）
// ────────────────────────────────────────────

export interface DailyResult {
  success: boolean;
  draft?: PolishedDraft;
  error?: string;
}

export async function runDailyPipeline(): Promise<DailyResult> {
  const config = loadConfig();
  const today = new Date().toISOString().slice(0, 10);
  const dayOfYear = Math.floor(
    (Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) / 86400000
  );

  console.log(`\n${"═".repeat(50)}`);
  console.log(`📅 デイリー LinkedIn ドラフト生成: ${today}`);
  console.log(`${"═".repeat(50)}\n`);

  console.log("📡 RSS フィードを取得中...");
  const papers = await fetchPapers(config.rssFeeds);

  if (papers.length === 0) {
    const msg = "RSS フィードから論文を取得できませんでした。";
    console.error(`❌ ${msg}`);
    return { success: false, error: msg };
  }

  console.log(`   → ${papers.length} 件の論文を取得`);

  console.log("🔍 トピックを選定中...");
  const history = await loadHistory(config.historyPath);
  const paper = selectPaper(papers, history);

  if (!paper) {
    const msg = "投稿候補の論文が見つかりませんでした。";
    console.error(`❌ ${msg}`);
    return { success: false, error: msg };
  }

  console.log(`   → 選定: ${paper.title.substring(0, 80)}...`);

  console.log("🖼️  論文の図表を取得中...");
  const figureUrls = await extractPaperFigures(paper.link, 3);
  if (figureUrls.length > 0) {
    console.log(`   → 図表 ${figureUrls.length} 枚取得`);
  } else {
    console.log("   → 図表の取得をスキップ（HTML版なし）");
  }

  console.log("✍️  ドラフトを生成・推敲中...");
  const draft = polishDraft(paper, dayOfYear);
  draft.figureUrls = figureUrls;
  draft.figureUrl = figureUrls[0] ?? undefined;

  if (config.webhookUrl) {
    console.log("📤 Webhook に通知中...");
    try {
      await notifyWebhook(draft, {
        url: config.webhookUrl,
        type: config.webhookType,
        mentionUserId: config.mentionUserId,
      });
    } catch (error) {
      console.error("⚠️  Webhook 通知に失敗しました:", error);
    }
  }

  console.log("🌐 Web アプリ用 JSON を更新中...");
  try {
    await updatePublicData(draft, config);
    console.log(`   → ${config.publicDataDir}/latest-draft.json`);
    console.log(`   → ${config.publicDataDir}/drafts-history.json`);
  } catch (error) {
    console.error("⚠️  公開JSONの書き出しに失敗しました:", error);
  }

  history.push({ date: today, paperTitle: paper.title, topic: draft.topic });
  await saveHistory(config.historyPath, history, config.maxHistoryDays);

  console.log(`\n${"─".repeat(50)}`);
  console.log("✅ 完了\n");
  console.log(draft.formatted);
  console.log(`\n${"─".repeat(50)}\n`);

  return { success: true, draft };
}
