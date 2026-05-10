import { fetchJson } from "../lib/http.mjs";
import { citationGrowth, relevanceScore, sortItems, toIsoDate, uniqueByUrl } from "../lib/scoring.mjs";

export async function collectPapers(config) {
  const [latest, cited] = await Promise.all([
    fetchOpenAlexWorks(config, {
      filter: `type:article,from_publication_date:${config.paperFromDate},to_publication_date:${config.todayDate}`,
      sort: "publication_date:desc"
    }),
    fetchOpenAlexWorks(config, {
      filter: "type:article",
      sort: "cited_by_count:desc"
    })
  ]);

  const items = uniqueByUrl([...latest, ...cited]);
  return {
    section: "papers",
    title: "Papers",
    description: "Recent and citation-growing neuroscience-related papers from OpenAlex.",
    sourceCount: 1,
    items: sortItems(items, config.maxItemsPerSection)
  };
}

async function fetchOpenAlexWorks(config, { filter, sort }) {
  const params = new URLSearchParams({
    search: config.paperQuery,
    filter,
    sort,
    "per-page": String(config.openAlexPerPage),
    select: [
      "id",
      "doi",
      "display_name",
      "publication_date",
      "cited_by_count",
      "counts_by_year",
      "authorships",
      "primary_location",
      "open_access",
      "abstract_inverted_index"
    ].join(",")
  });

  if (config.openAlexMailto) {
    params.set("mailto", config.openAlexMailto);
  }

  const url = `https://api.openalex.org/works?${params.toString()}`;
  const data = await fetchJson(url, { userAgent: config.userAgent });
  const results = Array.isArray(data.results) ? data.results : [];

  return results.map((work) => normalizeWork(work, config)).filter(Boolean);
}

function normalizeWork(work, config) {
  const title = work.display_name || "";
  if (!title) return null;

  const source = work.primary_location?.source?.display_name || "OpenAlex";
  const landingUrl = work.doi || work.primary_location?.landing_page_url || work.id;
  const text = `${title} ${source} ${reconstructAbstract(work.abstract_inverted_index)}`;
  const relevance = relevanceScore(text, config.topicKeywords);
  const growth = citationGrowth(work.counts_by_year || [], config.currentYear, config.previousYear);
  const citationBoost = Math.max(0, growth.delta || 0);

  return {
    id: work.id,
    kind: "paper",
    title,
    summary: reconstructAbstract(work.abstract_inverted_index).slice(0, 600),
    url: landingUrl,
    publishedAt: toIsoDate(work.publication_date),
    source,
    authors: (work.authorships || [])
      .slice(0, 5)
      .map((authorship) => authorship.author?.display_name)
      .filter(Boolean),
    openAccess: {
      isOpen: Boolean(work.open_access?.is_oa),
      url: work.open_access?.oa_url || ""
    },
    metrics: {
      citedByCount: Number(work.cited_by_count || 0)
    },
    trend: growth,
    relevanceKeywords: relevance.matches,
    signalScore: relevance.score + citationBoost + (work.open_access?.is_oa ? 4 : 0)
  };
}

function reconstructAbstract(index) {
  if (!index || typeof index !== "object") return "";
  const words = [];
  for (const [word, positions] of Object.entries(index)) {
    for (const position of positions || []) {
      words[position] = word;
    }
  }
  return words.filter(Boolean).join(" ");
}
