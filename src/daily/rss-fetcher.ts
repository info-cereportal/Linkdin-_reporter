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
  /** 論文著者を ", " 区切りで連結 (取得できない場合は空文字) */
  authors: string;
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

    // PubMed Author entries: <Author><LastName>...</LastName><ForeName>...</ForeName></Author>
    const authorMatches: string[] = [];
    const authorRegex = /<Author[^>]*>([\s\S]*?)<\/Author>/g;
    let am;
    while ((am = authorRegex.exec(article)) !== null) {
      const last = extractTag(am[1], "LastName");
      const fore = extractTag(am[1], "ForeName") || extractTag(am[1], "Initials");
      if (last) {
        authorMatches.push(cleanText(`${fore || ""} ${last}`).trim());
      }
      if (authorMatches.length >= 6) break;
    }

    if (title) {
      papers.push({
        title: cleanText(title),
        abstract: cleanText(abstractText || ""),
        link: pmid ? `https://pubmed.ncbi.nlm.nih.gov/${cleanText(pmid)}/` : "",
        publishedDate: [year, month, day].filter(Boolean).map((s) => cleanText(s!)).join("-"),
        source: "pubmed-api",
        authors: authorMatches.join(", "),
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

    // Atom: <author><name>...</name></author> ×N
    const authorRegex = /<author[^>]*>([\s\S]*?)<\/author>/gi;
    const authors: string[] = [];
    let am;
    while ((am = authorRegex.exec(entry)) !== null) {
      const name = extractTag(am[1], "name");
      if (name) authors.push(cleanText(name));
      if (authors.length >= 6) break;
    }

    if (title) {
      items.push({
        title: cleanText(title),
        abstract: cleanText(abstract || ""),
        link: link || "",
        publishedDate: date,
        source: feedUrl,
        authors: authors.join(", "),
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

    // RSS 2.0: <dc:creator> または <author>。複数登場するケースに対応。
    const creator =
      extractTag(item, "dc:creator") || extractTag(item, "author") || "";

    if (title) {
      items.push({
        title: cleanText(title),
        abstract: cleanText(abstract || ""),
        link: cleanText(link || ""),
        publishedDate: date,
        source: feedUrl,
        authors: cleanText(creator || ""),
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
 * arXiv 論文の HTML バージョンから複数の図表画像URLを取得する。
 * 最大 maxFigs 枚 (デフォルト3) まで。取得できない場合は空配列。
 */
export async function extractPaperFigures(
  paperLink: string,
  maxFigs = 3
): Promise<string[]> {
  try {
    const match = paperLink.match(/arxiv\.org\/abs\/([^\s?#]+)/);
    if (!match) return [];

    const arxivId = match[1].replace(/v\d+$/, "");
    const htmlUrl = `https://arxiv.org/html/${arxivId}`;

    const response = await fetch(htmlUrl, {
      headers: { "User-Agent": "linkedin-neuro-draft/0.1.0" },
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) return [];

    const html = await response.text();

    const figRegex = /<figure[^>]*>[\s\S]*?<img[^>]*src="([^"]+)"[^>]*>/gi;
    const figs: string[] = [];
    let m;
    while ((m = figRegex.exec(html)) !== null && figs.length < maxFigs) {
      const imgSrc = m[1];
      let abs: string;
      if (imgSrc.startsWith("http")) abs = imgSrc;
      else if (imgSrc.startsWith("/")) abs = `https://arxiv.org${imgSrc}`;
      else abs = `https://arxiv.org/html/${arxivId}/${imgSrc}`;
      // 重複除外
      if (!figs.includes(abs)) figs.push(abs);
    }
    return figs;
  } catch {
    return [];
  }
}

/** 後方互換: 1枚目のみ返す既存シグネチャ */
export async function extractPaperFigure(
  paperLink: string
): Promise<string | null> {
  const figs = await extractPaperFigures(paperLink, 1);
  return figs[0] ?? null;
}
