import { postJson } from "../lib/http.mjs";
import { fetchFeed } from "../lib/rss.mjs";
import { relevanceScore, recencyScore, sortItems, toIsoDate, uniqueByUrl } from "../lib/scoring.mjs";

export async function collectFunding(config) {
  const [rssItems, grantsGovItems] = await Promise.all([
    collectFundingFeeds(config),
    collectGrantsGov(config)
  ]);

  return {
    section: "funding",
    title: "Funding Opportunities",
    description: "Neuro-related funding opportunities from Grants.gov, NIH Guide, NSF, and configured RSS feeds.",
    sourceCount: config.fundingFeeds.length + config.fundingKeywords.length,
    items: sortItems(uniqueByUrl([...grantsGovItems, ...rssItems]), config.maxItemsPerSection)
  };
}

async function collectFundingFeeds(config) {
  const fetched = await Promise.allSettled(config.fundingFeeds.map((feed) => fetchFeed(feed, config)));
  const items = [];

  for (const result of fetched) {
    if (result.status !== "fulfilled") continue;
    for (const entry of result.value) {
      const text = `${entry.title} ${entry.summary}`;
      const relevance = relevanceScore(text, [...config.topicKeywords, ...config.fundingKeywords]);
      if (relevance.score <= 0) continue;

      items.push({
        kind: "funding_feed",
        title: entry.title,
        summary: entry.summary.slice(0, 700),
        url: entry.url,
        publishedAt: toIsoDate(entry.publishedAt),
        source: entry.source,
        sourceUrl: entry.sourceUrl,
        relevanceKeywords: relevance.matches,
        signalScore: relevance.score + recencyScore(entry.publishedAt)
      });
    }
  }

  return items;
}

async function collectGrantsGov(config) {
  const requests = config.fundingKeywords.map((keyword) =>
    searchGrantsGov(keyword, config).catch(() => [])
  );
  const results = await Promise.all(requests);
  return results.flat();
}

async function searchGrantsGov(keyword, config) {
  const payload = {
    rows: 25,
    keyword,
    oppStatuses: "forecasted|posted",
    agencies: config.grantsGovAgencies,
    fundingCategories: config.grantsGovFundingCategories
  };
  const data = await postJson("https://api.grants.gov/v1/api/search2", payload, {
    userAgent: config.userAgent
  });
  const hits = data?.data?.oppHits || [];

  return hits.map((hit) => {
    const title = hit.title || "";
    const text = `${title} ${hit.agencyName || ""} ${keyword}`;
    const relevance = relevanceScore(text, [...config.topicKeywords, ...config.fundingKeywords]);
    const url = hit.id ? `https://www.grants.gov/search-results-detail/${hit.id}` : "https://www.grants.gov/search-grants";

    return {
      id: hit.id,
      kind: "funding_grants_gov",
      title,
      summary: `${hit.agencyName || hit.agencyCode || "Agency"} / ${hit.oppStatus || "status unknown"} / ${hit.number || ""}`.trim(),
      url,
      publishedAt: toIsoDate(hit.openDate),
      closeDate: normalizeUsDate(hit.closeDate),
      source: "Grants.gov",
      agency: hit.agencyName || hit.agencyCode || "",
      opportunityNumber: hit.number || "",
      opportunityStatus: hit.oppStatus || "",
      relevanceKeywords: relevance.matches,
      signalScore: relevance.score + recencyScore(hit.openDate) + (hit.oppStatus === "posted" ? 8 : 4)
    };
  });
}

function normalizeUsDate(value) {
  if (!value) return "";
  const [month, day, year] = String(value).split("/");
  if (!month || !day || !year) return value;
  return `${year.padStart(4, "0")}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
}
