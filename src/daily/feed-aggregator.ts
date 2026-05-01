/**
 * フィード集約 — 4 カテゴリの最新情報を取得して 1 つの JSON にまとめる
 *
 * カテゴリ:
 *   - papers   : 最新論文 (arXiv q-bio.NC など)
 *   - market   : 脳情報マーケティング・産業動向 (IEEE Spectrum, Stat News など)
 *   - grants   : eRAD・助成金・公募情報 (NIH, AMED, JST など)
 *   - aineuro  : AI for Neuroscience クロス研究 (arXiv cs.NE / cs.LG など)
 *
 * 各カテゴリの RSS URL は環境変数で上書き可能:
 *   FEED_PAPERS_URLS  / FEED_MARKET_URLS / FEED_GRANTS_URLS / FEED_AINEURO_URLS
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
};

const LABELS = {
  papers: "最新論文",
  market: "MARKET / 産業動向",
  grants: "GRANTS / eRAD・助成金",
  aineuro: "AI for NEURO",
};

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

export async function aggregateFeeds(): Promise<FeedAggregation> {
  const config = {
    papers: envUrls("FEED_PAPERS_URLS", DEFAULTS.papers),
    market: envUrls("FEED_MARKET_URLS", DEFAULTS.market),
    grants: envUrls("FEED_GRANTS_URLS", DEFAULTS.grants),
    aineuro: envUrls("FEED_AINEURO_URLS", DEFAULTS.aineuro),
  };
  const maxItems = Number(process.env.FEED_MAX_ITEMS) || 6;

  const [papers, market, grants, aineuro] = await Promise.all([
    fetchCategory(config.papers, maxItems),
    fetchCategory(config.market, maxItems),
    fetchCategory(config.grants, maxItems),
    fetchCategory(config.aineuro, maxItems),
  ]);

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
    },
  };
}
