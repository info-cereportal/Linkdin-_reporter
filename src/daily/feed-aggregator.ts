/**
 * フィード集約 — 5 カテゴリの最新情報を取得して 1 つの JSON にまとめる
 *
 * カテゴリ:
 *   - papers   : 最新論文 (arXiv q-bio.NC など)
 *   - market   : 脳情報マーケティング・産業動向 (IEEE Spectrum, Stat News など)
 *   - grants   : eRAD・助成金・公募情報 (NIH, AMED, JST など)
 *   - aineuro  : AI for Neuroscience クロス研究 (arXiv cs.NE / cs.LG など)
 *   - bci      : ブレイン・コンピュータ・インターフェース (TechCrunch / arXiv eess.SP / cs.HC)
 *
 * 各カテゴリの RSS URL は環境変数で上書き可能:
 *   FEED_PAPERS_URLS  / FEED_MARKET_URLS / FEED_GRANTS_URLS
 *   FEED_AINEURO_URLS / FEED_BCI_URLS
 *   (カンマ区切り)
 */

import { fetchSingleFeed, type PaperInfo } from "./rss-fetcher.js";

export interface FeedItem {
  title: string;
  url: string;
  publishedDate: string;
  source: string; // 表示用 (e.g. "arxiv.org")
  summary: string; // 抄録 / 説明 (240字程度に切り詰め)
  authors: string;
}

export interface FeedCategory {
  /** UI 表示ラベル (日本語) */
  label: string;
  /** 副題 (取得元の domain など) */
  sublabel: string;
  /** 取得件数 */
  itemCount: number;
  /** 取得失敗時の理由 (失敗していなければ undefined) */
  error?: string;
  /** 最新順アイテム配列 */
  items: FeedItem[];
}

export interface FeedAggregation {
  generatedAt: string;
  schemaVersion: 1;
  categories: {
    papers: FeedCategory;
    market: FeedCategory;
    grants: FeedCategory;
    aineuro: FeedCategory;
    bci: FeedCategory;
  };
}

// ────────────────────────────────────────────
// デフォルト RSS ソース (環境変数で上書き可)
// ────────────────────────────────────────────

const DEFAULTS = {
  papers: ["https://rss.arxiv.org/rss/q-bio.NC"],
  // 英語ニュース系で確実に取得できるものをデフォルト
  market: ["https://www.statnews.com/category/health/feed/"],
  // 助成金: NIH/NSF の公式 RSS は 404/403 を返す状態のため、
  // 研究政策ニュース (Stat News politics) + ScienceDaily 医学ニュース で代替。
  // eRAD/AMED/JST など Japan 特化ソースは FEED_GRANTS_URLS 環境変数で追加可。
  grants: [
    "https://www.statnews.com/category/politics/feed/",
    "https://www.sciencedaily.com/rss/health_medicine/medical_topics.xml",
  ],
  // AI×Neuro 系
  aineuro: [
    "https://rss.arxiv.org/rss/cs.NE",
    "https://rss.arxiv.org/rss/q-bio.NC",
  ],
  // BCI / ニューラルインターフェース系
  // - TechCrunch BCI タグ: 産業ニュース寄り (Neuralink, Synchron 等)
  // - arXiv eess.SP: EEG/iEEG 信号処理研究
  // - arXiv cs.HC: BCI を含むヒューマン・コンピュータ・インタラクション
  bci: [
    "https://techcrunch.com/tag/brain-computer-interface/feed/",
    "https://rss.arxiv.org/rss/eess.SP",
    "https://rss.arxiv.org/rss/cs.HC",
  ],
};

const LABELS = {
  papers: "最新論文",
  market: "MARKET / 産業動向",
  grants: "GRANTS / eRAD・助成金",
  aineuro: "AI for NEURO",
  bci: "BCI / ニューラルインターフェース",
};

// BCI 関連シグナルワード — フィード後段で重み付けスコアリングに利用
const BCI_KEYWORDS = [
  "brain-computer interface",
  "brain computer interface",
  "brain-machine interface",
  "neural interface",
  "neurofeedback",
  "neuroprosth",
  "neuralink",
  "synchron",
  "blackrock neurotech",
  "motor cortex decod",
  "p300",
  "ssvep",
  "eeg",
  "ecog",
  "ieeg",
  "spike sorting",
  "closed-loop",
  "intracortical",
  "bci",
  "bmi",
];

// ────────────────────────────────────────────
// ヘルパー
// ────────────────────────────────────────────

function envUrls(envKey: string, fallback: string[]): string[] {
  const raw = process.env[envKey];
  if (!raw) return fallback;
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function extractDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "—";
  }
}

function summarize(s: string, max = 240): string {
  if (!s) return "";
  const cleaned = s.replace(/\s+/g, " ").trim();
  if (cleaned.length <= max) return cleaned;
  return cleaned.substring(0, max).replace(/\s\S*$/, "") + "…";
}

function parsePubDate(s: string): number {
  if (!s) return 0;
  const t = Date.parse(s);
  return Number.isNaN(t) ? 0 : t;
}

function paperToFeedItem(p: PaperInfo): FeedItem {
  return {
    title: p.title,
    url: p.link,
    publishedDate: p.publishedDate || "",
    source: extractDomain(p.link || p.source),
    summary: summarize(p.abstract, 240),
    authors: p.authors || "",
  };
}

/** 1カテゴリ分の URL 群を並列取得し、新しい順に並べた上位 N 件を返す */
async function fetchCategory(
  urls: string[],
  maxItems: number
): Promise<{ items: FeedItem[]; error?: string }> {
  if (urls.length === 0) return { items: [], error: "no source configured" };

  const settled = await Promise.allSettled(urls.map((u) => fetchSingleFeed(u)));
  const items: FeedItem[] = [];
  const errors: string[] = [];

  settled.forEach((r, i) => {
    if (r.status === "fulfilled") {
      items.push(...r.value.map(paperToFeedItem));
    } else {
      errors.push(`${urls[i]}: ${r.reason}`);
    }
  });

  // dedup by URL, keep first occurrence
  const seen = new Set<string>();
  const unique = items.filter((it) => {
    if (!it.url) return true;
    if (seen.has(it.url)) return false;
    seen.add(it.url);
    return true;
  });

  // sort by published date desc (unparseable dates → 0 = end)
  unique.sort((a, b) => parsePubDate(b.publishedDate) - parsePubDate(a.publishedDate));

  return {
    items: unique.slice(0, maxItems),
    error: items.length === 0 && errors.length > 0 ? errors[0] : undefined,
  };
}

// ────────────────────────────────────────────
// メイン
// ────────────────────────────────────────────

/** BCI シグナルが含まれるかどうかでアイテムをスコア化 (高いほど BCI 関連) */
function bciScore(it: FeedItem): number {
  const haystack = `${it.title} ${it.summary}`.toLowerCase();
  let score = 0;
  for (const kw of BCI_KEYWORDS) {
    if (haystack.includes(kw)) score += kw.length >= 5 ? 2 : 1;
  }
  return score;
}

/** BCI カテゴリは取得後にキーワードスコアでフィルタ + 並び替え */
function rankBciItems(items: FeedItem[], maxItems: number): FeedItem[] {
  const scored = items
    .map((it) => ({ it, score: bciScore(it), t: parsePubDate(it.publishedDate) }))
    // BCI シグナル 0 を除外 (eess.SP / cs.HC には BCI 以外の研究も多い)
    .filter((s) => s.score > 0);

  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return b.t - a.t;
  });

  return scored.slice(0, maxItems).map((s) => s.it);
}

export async function aggregateFeeds(): Promise<FeedAggregation> {
  const config = {
    papers: envUrls("FEED_PAPERS_URLS", DEFAULTS.papers),
    market: envUrls("FEED_MARKET_URLS", DEFAULTS.market),
    grants: envUrls("FEED_GRANTS_URLS", DEFAULTS.grants),
    aineuro: envUrls("FEED_AINEURO_URLS", DEFAULTS.aineuro),
    bci: envUrls("FEED_BCI_URLS", DEFAULTS.bci),
  };
  const maxItems = Number(process.env.FEED_MAX_ITEMS) || 6;

  // BCI は arXiv 2 ソースから多めに取得 → 後でスコアでランキング
  const bciFetchCap = Math.max(maxItems * 4, 24);

  const [papers, market, grants, aineuro, bciRaw] = await Promise.all([
    fetchCategory(config.papers, maxItems),
    fetchCategory(config.market, maxItems),
    fetchCategory(config.grants, maxItems),
    fetchCategory(config.aineuro, maxItems),
    fetchCategory(config.bci, bciFetchCap),
  ]);

  const bci = {
    items: rankBciItems(bciRaw.items, maxItems),
    error:
      bciRaw.error ||
      (bciRaw.items.length > 0 && bciRaw.items.every((it) => bciScore(it) === 0)
        ? "no BCI-keyword match in fetched feed"
        : undefined),
  };

  const buildCategory = (
    key: keyof typeof config,
    result: { items: FeedItem[]; error?: string }
  ): FeedCategory => ({
    label: LABELS[key],
    sublabel:
      config[key].length > 0
        ? config[key].map(extractDomain).slice(0, 2).join(" + ") +
          (config[key].length > 2 ? ` +${config[key].length - 2}` : "")
        : "—",
    itemCount: result.items.length,
    error: result.error,
    items: result.items,
  });

  return {
    generatedAt: new Date().toISOString(),
    schemaVersion: 1,
    categories: {
      papers: buildCategory("papers", papers),
      market: buildCategory("market", market),
      grants: buildCategory("grants", grants),
      aineuro: buildCategory("aineuro", aineuro),
      bci: buildCategory("bci", bci),
    },
  };
}
