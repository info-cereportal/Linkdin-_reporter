import { fetchText } from "./http.mjs";

export async function fetchFeed(url, config) {
  const xml = await fetchText(url, { userAgent: config.userAgent });
  return parseFeed(xml, url);
}

export function parseFeed(xml, feedUrl) {
  const atomEntries = blocks(xml, "entry");
  if (atomEntries.length > 0) {
    return atomEntries.map((entry) => parseAtomEntry(entry, feedUrl)).filter(Boolean);
  }

  return blocks(xml, "item").map((item) => parseRssItem(item, feedUrl)).filter(Boolean);
}

function parseAtomEntry(entry, feedUrl) {
  const title = clean(extractTag(entry, "title"));
  const summary = clean(extractTag(entry, "summary") || extractTag(entry, "content"));
  const publishedAt = clean(extractTag(entry, "published") || extractTag(entry, "updated"));
  const link = extractAtomLink(entry) || clean(extractTag(entry, "id"));
  if (!title || !link) return null;

  return {
    title,
    summary,
    url: link,
    publishedAt,
    source: host(feedUrl),
    sourceUrl: feedUrl
  };
}

function parseRssItem(item, feedUrl) {
  const title = clean(extractTag(item, "title"));
  const summary = clean(extractTag(item, "description") || extractTag(item, "content:encoded"));
  const publishedAt = clean(extractTag(item, "pubDate") || extractTag(item, "dc:date"));
  const link = clean(extractTag(item, "link") || extractTag(item, "guid"));
  if (!title || !link) return null;

  return {
    title,
    summary,
    url: link,
    publishedAt,
    source: host(feedUrl),
    sourceUrl: feedUrl
  };
}

function blocks(xml, tagName) {
  const pattern = new RegExp(`<${escapeRegex(tagName)}\\b[^>]*>([\\s\\S]*?)<\\/${escapeRegex(tagName)}>`, "gi");
  const result = [];
  let match;
  while ((match = pattern.exec(xml)) !== null) {
    result.push(match[1]);
  }
  return result;
}

function extractTag(xml, tagName) {
  const escaped = escapeRegex(tagName);
  const cdata = new RegExp(`<${escaped}\\b[^>]*>\\s*<!\\[CDATA\\[([\\s\\S]*?)\\]\\]>\\s*<\\/${escaped}>`, "i").exec(xml);
  if (cdata) return cdata[1];

  const normal = new RegExp(`<${escaped}\\b[^>]*>([\\s\\S]*?)<\\/${escaped}>`, "i").exec(xml);
  return normal ? normal[1] : "";
}

function extractAtomLink(entry) {
  const alternate = /<link\b(?=[^>]*rel=["']alternate["'])([^>]*)>/i.exec(entry);
  const any = alternate || /<link\b([^>]*)>/i.exec(entry);
  if (!any) return "";

  const href = /\bhref=["']([^"']+)["']/i.exec(any[1]);
  return href ? decodeEntities(href[1]) : "";
}

function clean(value) {
  return decodeEntities(stripTags(value || ""))
    .replace(/\s+/g, " ")
    .trim();
}

function stripTags(value) {
  return value.replace(/<[^>]+>/g, " ");
}

function decodeEntities(value) {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&#x2F;/g, "/")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)));
}

function host(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
