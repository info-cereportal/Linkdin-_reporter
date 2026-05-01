export const DEFAULT_TOPIC_KEYWORDS = [
  "neuroscience",
  "neurotechnology",
  "brain-computer interface",
  "brain computer interface",
  "BCI",
  "neural decoding",
  "neural interface",
  "neuromodulation",
  "neuromorphic",
  "neuroAI",
  "mental health",
  "cognitive neuroscience",
  "computational neuroscience",
  "brain",
  "neural",
  "cortex",
  "connectome"
];

const DEFAULT_NEWS_FEEDS = [
  "https://www.nih.gov/news-events/news-releases/feed.xml",
  "https://www.nimh.nih.gov/news/rss.xml",
  "https://www.sciencedaily.com/rss/mind_brain/neuroscience.xml",
  "https://medicalxpress.com/rss-feed/neuroscience-news/"
];

const DEFAULT_STARTUP_FEEDS = [
  "https://techcrunch.com/tag/neuroscience/feed/",
  "https://techcrunch.com/tag/brain-computer-interface/feed/"
];

const DEFAULT_FUNDING_FEEDS = [
  "https://grants.nih.gov/grants/guide/newsfeed/fundingopps.xml",
  "https://www.nsf.gov/rss/rss_www_funding_pgm_annc_inf.xml",
  "https://www.grants.gov/rss/GG_OppModByCategory.xml"
];

const DEFAULT_FUNDING_KEYWORDS = [
  "neuroscience",
  "brain",
  "neurotechnology",
  "cognitive",
  "mental health",
  "brain-computer interface"
];

const DEFAULT_STARTUP_QUERIES = [
  "neurotech",
  "brain-computer interface",
  "neural interface",
  "BCI startup",
  "neuromodulation startup"
];

function csv(value, fallback) {
  if (!value || !value.trim()) return fallback;
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function numberFromEnv(name, fallback) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

export function buildConfig() {
  const now = new Date();
  const currentYear = numberFromEnv("CURRENT_YEAR", now.getUTCFullYear());
  const previousYear = numberFromEnv("PREVIOUS_YEAR", currentYear - 1);
  const todayDate = now.toISOString().slice(0, 10);
  const defaultPaperFromDate = new Date(now.getTime() - 180 * 86400000).toISOString().slice(0, 10);

  return {
    generatedAt: now.toISOString(),
    todayDate,
    currentYear,
    previousYear,
    topicKeywords: csv(process.env.TOPIC_KEYWORDS, DEFAULT_TOPIC_KEYWORDS),
    paperQuery: process.env.PAPER_QUERY || "neuroscience",
    paperFromDate: process.env.PAPER_FROM_DATE || defaultPaperFromDate,
    openAlexMailto: process.env.OPENALEX_MAILTO || "",
    openAlexPerPage: numberFromEnv("OPENALEX_PER_PAGE", 40),
    newsFeeds: csv(process.env.NEWS_FEEDS, DEFAULT_NEWS_FEEDS),
    startupFeeds: csv(process.env.STARTUP_FEEDS, DEFAULT_STARTUP_FEEDS),
    startupQueries: csv(process.env.STARTUP_QUERIES, DEFAULT_STARTUP_QUERIES),
    fundingFeeds: csv(process.env.FUNDING_FEEDS, DEFAULT_FUNDING_FEEDS),
    fundingKeywords: csv(process.env.FUNDING_KEYWORDS, DEFAULT_FUNDING_KEYWORDS),
    grantsGovAgencies: process.env.GRANTS_GOV_AGENCIES || "",
    grantsGovFundingCategories: process.env.GRANTS_GOV_FUNDING_CATEGORIES || "",
    maxItemsPerSection: numberFromEnv("MAX_ITEMS_PER_SECTION", 30),
    accessMetricsFile: process.env.ACCESS_METRICS_FILE || "data/access-metrics.json",
    userAgent: process.env.USER_AGENT || "neuro-trend-reporter/0.1 (+https://github.com/)"
  };
}
