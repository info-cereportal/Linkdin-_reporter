/**
 * RSS/Atom フィード取得・パーサー
 * arXiv (Atom) / PubMed (RSS) 両対応
 * PubMed NCBI E-utilities API フォールバック付き
 */

export interface PaperInfo {
  title: string;
  abstract: string;
  link: string;
  publishedDate: string;
  source: string;
}

const PUBMED_SEARCH_TERM = encodeURIComponent(
  '("brain-computer interface"[tiab] OR "neural decoding"[tiab] OR "brain decoding"[tiab] OR "neural interface"[tiab] OR neuromorphic[tiab] OR "spiking neural network"[tiab] OR "computational neuroscience"[tiab] OR "predictive coding"[tiab] OR "neural coding"[tiab] OR "connectome"[tiab] OR "neural dynamics"[tiab] OR "deep learning"[tiab] OR "reinforcement learning"[tiab] OR "representation learning"[tiab]) AND (brain[tiab] OR neural[tiab] OR cortex[tiab] OR neuron[tiab]) AND hasabstract AND journal article[pt]'
);

/**
 * 複数フィードから論文情報を取得する。
 * RSS が空の場合は PubMed E-utilities API にフォールバック。
 */
export async function fetchPapers(feedUrls: string[]): Promise<PaperInfo[]> {
  const allPapers: PaperInfo[] = [];

  for (const url of feedUrls) {
    try {
      const response = await fetch(url.trim(), {
        headers: { "User-Agent": "linkedin-neuro-draft/0.1.0" },
        signal: AbortSignal.timeout(15_000),
      });

      if (!response.ok) {
        console.error(`[RSS] ${url}: HTTP ${response.status}`);
        continue;
      }

      const xml = await response.text();
      const papers = parseXmlFeed(xml, url);
      allPapers.push(...papers);
    } catch (error) {
      console.error(`[RSS] ${url}: fetch error`, error);
    }
  }

  // RSS が空の場合、PubMed E-utilities API にフォールバック
  if (allPapers.length === 0) {
    console.log("   → RSS 結果が空のため PubMed API にフォールバック...");
    const pubmedPapers = await fetchFromPubmed();
    allPapers.push(...pubmedPapers);
  }

  return allPapers;
}

/**
 * PubMed NCBI E-utilities API から最新の神経科学論文を取得する
 */
async function fetchFromPubmed(): Promise<PaperInfo[]> {
  try {
    // 1. 論文 ID を検索
    const searchUrl =
      `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi` +
      `?db=pubmed&term=${PUBMED_SEARCH_TERM}&retmax=10&retmode=json`;

    const searchRes = await fetch(searchUrl, { signal: AbortSignal.timeout(15_000) });
    if (!searchRes.ok) return [];

    const searchData = (await searchRes.json()) as { esearchresult?: { idlist?: string[] } };
    const ids = searchData?.esearchresult?.idlist;
    if (!ids || ids.length === 0) return [];

    // 2. 論文詳細を一括取得
    const fetchUrl =
      `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi` +
      `?db=pubmed&id=${ids.join(",")}&rettype=abstract&retmode=xml`;

    const fetchRes = await fetch(fetchUrl, { signal: AbortSignal.timeout(15_000) });
    if (!fetchRes.ok) return [];

    const xml = await fetchRes.text();
    return parsePubmedXml(xml);
  } catch (error) {
    console.error("[PubMed API] fetch error:", error);
    return [];
  }
}

function parsePubmedXml(xml: string): PaperInfo[] {
  const papers: PaperInfo[] = [];
  const articleRegex = /<PubmedArticle>([\s\S]*?)<\/PubmedArticle>/g;
  let match;

  while ((match = articleRegex.exec(xml)) !== null) {
    const article = match[1];

    const title = extractTag(article, "ArticleTitle");
    const abstractText = extractTag(article, "AbstractText");
    const pmid = extractTag(article, "PMID");
    const year = extractTag(article, "Year");
    const month = extractTag(article, "Month");
    const day = extractTag(article, "Day");

    if (title) {
      papers.push({
        title: cleanText(title),
        abstract: cleanText(abstractText || ""),
        link: pmid ? `https://pubmed.ncbi.nlm.nih.gov/${cleanText(pmid)}/` : "",
        publishedDate: [year, month, day].filter(Boolean).map((s) => cleanText(s!)).join("-"),
        source: "pubmed-api",
      });
    }
  }

  return papers;
}

// --- XML パーサー ---

function parseXmlFeed(xml: string, feedUrl: string): PaperInfo[] {
  const isAtom = xml.includes("<feed") && xml.includes("http://www.w3.org/2005/Atom");
  return isAtom ? parseAtom(xml, feedUrl) : parseRss(xml, feedUrl);
}

function parseAtom(xml: string, feedUrl: string): PaperInfo[] {
  const items: PaperInfo[] = [];
  const entryRegex = /<entry>([\s\S]*?)<\/entry>/g;
  let match;

  while ((match = entryRegex.exec(xml)) !== null) {
    const entry = match[1];
    const title = extractTag(entry, "title");
    const abstract = extractTag(entry, "summary");
    const link = extractAtomLink(entry);
    const date = extractTag(entry, "published") || extractTag(entry, "updated") || "";

    if (title) {
      items.push({
        title: cleanText(title),
        abstract: cleanText(abstract || ""),
        link: link || "",
        publishedDate: date,
        source: feedUrl,
      });
    }
  }

  return items;
}

function parseRss(xml: string, feedUrl: string): PaperInfo[] {
  const items: PaperInfo[] = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/g;
  let match;

  while ((match = itemRegex.exec(xml)) !== null) {
    const item = match[1];
    const title = extractTag(item, "title");
    const abstract = extractTag(item, "description");
    const link = extractTag(item, "link");
    const date = extractTag(item, "pubDate") || "";

    if (title) {
      items.push({
        title: cleanText(title),
        abstract: cleanText(abstract || ""),
        link: cleanText(link || ""),
        publishedDate: date,
        source: feedUrl,
      });
    }
  }

  return items;
}

function extractTag(xml: string, tagName: string): string | null {
  // CDATA
  const cdataRegex = new RegExp(
    `<${tagName}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]><\\/${tagName}>`,
    "i"
  );
  const cdataMatch = cdataRegex.exec(xml);
  if (cdataMatch) return cdataMatch[1];

  // 通常タグ
  const regex = new RegExp(`<${tagName}[^>]*>([\\s\\S]*?)<\\/${tagName}>`, "i");
  const match = regex.exec(xml);
  return match ? match[1] : null;
}

function extractAtomLink(entry: string): string {
  // rel="alternate" を優先、なければ最初の link
  const altRegex = /<link[^>]*rel="alternate"[^>]*href="([^"]*)"[^>]*\/?>/i;
  const altMatch = altRegex.exec(entry);
  if (altMatch) return altMatch[1];

  const linkRegex = /<link[^>]*href="([^"]*)"[^>]*\/?>/i;
  const match = linkRegex.exec(entry);
  return match ? match[1] : "";
}

function cleanText(text: string): string {
  return text
    .replace(/<[^>]+>/g, "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

// ────────────────────────────────────────────
// 論文の図表URL抽出（ベストエフォート）
// ────────────────────────────────────────────

/**
 * arXiv 論文の HTML バージョンから最初の図表画像URLを取得する。
 * 取得できない場合は null を返す（エラーは握りつぶす）。
 */
export async function extractPaperFigure(paperLink: string): Promise<string | null> {
  try {
    // arXiv ID を抽出
    const match = paperLink.match(/arxiv\.org\/abs\/([^\s?#]+)/);
    if (!match) return null;

    const arxivId = match[1].replace(/v\d+$/, "");
    const htmlUrl = `https://arxiv.org/html/${arxivId}`;

    const response = await fetch(htmlUrl, {
      headers: { "User-Agent": "linkedin-neuro-draft/0.1.0" },
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) return null;

    const html = await response.text();

    // <figure> 内の <img src="..."> を探す
    const figRegex = /<figure[^>]*>[\s\S]*?<img[^>]*src="([^"]+)"[^>]*>/gi;
    const figMatch = figRegex.exec(html);
    if (!figMatch) return null;

    const imgSrc = figMatch[1];
    // 相対URLを絶対URLに変換
    if (imgSrc.startsWith("http")) return imgSrc;
    if (imgSrc.startsWith("/")) return `https://arxiv.org${imgSrc}`;
    return `https://arxiv.org/html/${arxivId}/${imgSrc}`;
  } catch {
    return null;
  }
}
