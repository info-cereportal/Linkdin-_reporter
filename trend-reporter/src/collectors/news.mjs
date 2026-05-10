import { fetchFeed } from "../lib/rss.mjs";
import { relevanceScore, recencyScore, sortItems, toIsoDate, uniqueByUrl } from "../lib/scoring.mjs";

export async function collectNews(config) {
  const fetched = await Promise.allSettled(config.newsFeeds.map((feed) => fetchFeed(feed, config)));
  const items = [];

  for (const result of fetched) {
    if (result.status !== "fulfilled") continue;
    for (const entry of result.value) {
      const text = `${entry.title} ${entry.summary}`;
      const relevance = relevanceScore(text, config.topicKeywords);
      if (relevance.score <= 0) continue;

      items.push({
        kind: "research_news",
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

  return {
    section: "news",
    title: "Research News",
    description: "Brain and neuroscience related research news from configured RSS feeds.",
    sourceCount: config.newsFeeds.length,
    items: sortItems(uniqueByUrl(items), config.maxItemsPerSection)
  };
}
