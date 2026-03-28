/**
 * デイリーパイプライン
 *
 * RSS取得 → トピック選定（履歴重複排除） → ドラフト生成 → レビュー → 整形 → Webhook通知
 */

import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fetchPapers, type PaperInfo } from "./rss-fetcher.js";
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
}

function loadConfig(): DailyConfig {
  return {
    rssFeeds: (process.env.RSS_FEEDS || "https://rss.arxiv.org/rss/q-bio.NC").split(",").map((s) => s.trim()),
    webhookUrl: process.env.WEBHOOK_URL || "",
    webhookType: (process.env.WEBHOOK_TYPE === "discord" ? "discord" : "slack") as "slack" | "discord",
    mentionUserId: process.env.DISCORD_MENTION_USER_ID || "",
    historyPath: resolve(process.env.HISTORY_FILE || ".daily-history.json"),
    maxHistoryDays: Number(process.env.MAX_HISTORY_DAYS) || 30,
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

  console.log("✍️  ドラフトを生成・推敲中...");
  const draft = polishDraft(paper, dayOfYear);

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

  history.push({ date: today, paperTitle: paper.title, topic: draft.topic });
  await saveHistory(config.historyPath, history, config.maxHistoryDays);

  console.log(`\n${"─".repeat(50)}`);
  console.log("✅ 完了\n");
  console.log(draft.formatted);
  console.log(`\n${"─".repeat(50)}\n`);

  return { success: true, draft };
}
