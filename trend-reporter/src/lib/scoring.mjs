export function relevanceScore(text, keywords) {
  const normalized = (text || "").toLowerCase();
  let score = 0;
  const matches = [];

  for (const keyword of keywords) {
    const lower = keyword.toLowerCase();
    if (normalized.includes(lower)) {
      matches.push(keyword);
      score += lower.length > 8 ? 8 : 4;
    }
  }

  return { score, matches };
}

export function recencyScore(publishedAt) {
  const date = Date.parse(publishedAt || "");
  if (!Number.isFinite(date)) return 0;
  const days = Math.max(0, (Date.now() - date) / 86400000);
  if (days <= 7) return 20;
  if (days <= 30) return 12;
  if (days <= 90) return 6;
  return 1;
}

export function toIsoDate(value) {
  const date = Date.parse(value || "");
  return Number.isFinite(date) ? new Date(date).toISOString() : "";
}

export function uniqueByUrl(items) {
  const seen = new Set();
  const result = [];
  for (const item of items) {
    const key = normalizeUrl(item.url || item.id || item.title);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push(item);
  }
  return result;
}

export function normalizeUrl(value) {
  if (!value) return "";
  try {
    const url = new URL(value);
    url.hash = "";
    for (const key of [...url.searchParams.keys()]) {
      if (/^utm_|^fbclid$|^gclid$/i.test(key)) url.searchParams.delete(key);
    }
    return url.toString().replace(/\/$/, "");
  } catch {
    return String(value).trim().toLowerCase();
  }
}

export function sortItems(items, limit) {
  return [...items]
    .sort((a, b) => {
      const scoreDelta = (b.signalScore || 0) - (a.signalScore || 0);
      if (scoreDelta !== 0) return scoreDelta;
      return Date.parse(b.publishedAt || "") - Date.parse(a.publishedAt || "");
    })
    .slice(0, limit);
}

export function citationGrowth(countsByYear, currentYear, previousYear) {
  const current = countForYear(countsByYear, currentYear);
  const previous = countForYear(countsByYear, previousYear);
  const delta = current - previous;
  const rate = previous > 0 ? delta / previous : current > 0 ? 1 : 0;

  return {
    metric: "citations_by_year",
    currentYear,
    previousYear,
    currentValue: current,
    previousValue: previous,
    delta,
    growthRate: Number(rate.toFixed(4)),
    available: true
  };
}

export function unavailableAccessGrowth(currentYear, previousYear, reason = "access metrics not configured") {
  return {
    metric: "access_views",
    currentYear,
    previousYear,
    currentValue: null,
    previousValue: null,
    delta: null,
    growthRate: null,
    available: false,
    reason
  };
}

export function applyAccessMetrics(item, accessIndex, config) {
  const key = normalizeUrl(item.url);
  const metrics = accessIndex.get(key);
  if (!metrics) {
    return {
      ...item,
      access: unavailableAccessGrowth(config.currentYear, config.previousYear)
    };
  }

  const current = Number(metrics[config.currentYear] || 0);
  const previous = Number(metrics[config.previousYear] || 0);
  const delta = current - previous;
  const growthRate = previous > 0 ? delta / previous : current > 0 ? 1 : 0;

  return {
    ...item,
    access: {
      metric: "access_views",
      currentYear: config.currentYear,
      previousYear: config.previousYear,
      currentValue: current,
      previousValue: previous,
      delta,
      growthRate: Number(growthRate.toFixed(4)),
      available: true
    }
  };
}

export function buildAccessIndex(records) {
  const index = new Map();
  for (const record of records || []) {
    const key = normalizeUrl(record.url);
    if (!key) continue;
    const bucket = index.get(key) || {};
    bucket[record.year] = Number(record.views || record.sessions || record.clicks || 0);
    index.set(key, bucket);
  }
  return index;
}

function countForYear(countsByYear, year) {
  const entry = (countsByYear || []).find((item) => Number(item.year) === Number(year));
  return Number(entry?.cited_by_count || 0);
}
