import { fetchJson } from "../lib/http.mjs";
import { fetchFeed } from "../lib/rss.mjs";
import { relevanceScore, recencyScore, sortItems, toIsoDate, uniqueByUrl } from "../lib/scoring.mjs";

export async function collectStartups(config) {
  const [rssItems, hnItems] = await Promise.all([
    collectStartupFeeds(config),
    collectHackerNewsSignals(config)
  ]);

  return {
    section: "startups",
    title: "Startup Signals",
    description: "Neurotechnology and brain-related startup signals from configured feeds and Hacker News public search.",
    sourceCount: config.startupFeeds.length + config.startupQueries.length,
    items: sortItems(uniqueByUrl([...rssItems, ...hnItems]), config.maxItemsPerSection)
  };
}

async function collectStartupFeeds(config) {
  const fetched = await Promise.allSettled(config.startupFeeds.map((feed) => fetchFeed(feed, config)));
  const items = [];

  for (const result of fetched) {
    if (result.status !== "fulfilled") continue;
    for (const entry of result.value) {
      const text = `${entry.title} ${entry.summary}`;
      const relevance = relevanceScore(text, config.topicKeywords);
      if (relevance.score <= 0) continue;

      items.push({
        kind: "startup_feed",
        title: entry.title,
        summary: entry.summary.slice(0, 700),
        url: entry.url,
        publishedAt: toIsoDate(entry.publishedAt),
        source: entry.source,
        sourceUrl: entry.sourceUrl,
        relevanceKeywords: relevance.matches,
        metrics: {},
        signalScore: relevance.score + recencyScore(entry.publishedAt)
      });
    }
  }

  return items;
}

async function collectHackerNewsSignals(config) {
  const requests = config.startupQueries.map(async (query) => {
    const params = new URLSearchParams({
      query,
      tags: "story",
      hitsPerPage: "20"
    });
    const data = await fetchJson(`https://hn.algolia.com/api/v1/search_by_date?${params.toString()}`, {
      userAgent: config.userAgent
    });
    return (data.hits || []).map((hit) => normalizeHnHit(hit, query, config)).filter(Boolean);
  });

  const settled = await Promise.allSettled(requests);
  return settled.flatMap((result) => (result.status === "fulfilled" ? result.value : []));
}

function normalizeHnHit(hit, query, config) {
  const title = hit.title || hit.story_title || "";
  const url = hit.url || (hit.objectID ? `https://news.ycombinator.com/item?id=${hit.objectID}` : "");
  if (!title || !url) return null;

  const relevance = relevanceScore(`${title} ${query}`, [...config.topicKeywords, ...config.startupQueries]);
  const points = Number(hit.points || 0);
  const comments = Number(hit.num_comments || 0);

  return {
    id: hit.objectID,
    kind: "startup_hn_signal",
    title,
    summary: `Matched Hacker News query: ${query}`,
    url,
    discussionUrl: hit.objectID ? `https://news.ycombinator.com/item?id=${hit.objectID}` : "",
    publishedAt: toIsoDate(hit.created_at),
    source: "Hacker News",
    relevanceKeywords: relevance.matches,
    metrics: {
      points,
      comments
    },
    signalScore: relevance.score + recencyScore(hit.created_at) + points * 0.5 + comments
  };
}
