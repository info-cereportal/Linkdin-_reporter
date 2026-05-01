#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { buildConfig } from "./config.mjs";
import { collectPapers } from "./collectors/papers.mjs";
import { collectNews } from "./collectors/news.mjs";
import { collectStartups } from "./collectors/startups.mjs";
import { collectFunding } from "./collectors/funding.mjs";
import { applyAccessMetrics, buildAccessIndex } from "./lib/scoring.mjs";

const collectors = {
  papers: collectPapers,
  news: collectNews,
  startups: collectStartups,
  funding: collectFunding
};

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const config = buildConfig();
  const section = args.section || "all";
  const outDir = args.outDir || "public/data";
  const latestPath = args.latest || `${outDir}/latest.json`;
  const historyPath = args.history || "data/history.json";

  const accessRecords = await readJson(config.accessMetricsFile, []);
  const accessIndex = buildAccessIndex(accessRecords);
  const collectedSections = await runCollectors(section, config);
  const enriched = collectedSections.map((sectionData) => ({
    ...sectionData,
    items: sectionData.items.map((item) => applyAccessMetrics(item, accessIndex, config))
  }));

  const previousPayload = await readJson(latestPath, null);
  const sections = section === "all" ? enriched : mergeSections(previousPayload?.sections || [], enriched);
  const payload = buildPayload(sections, config);
  await writeJson(latestPath, payload);
  await writeSectionFiles(outDir, payload.sections);
  await appendHistory(historyPath, payload);

  console.log(`Generated ${latestPath}`);
  console.log(`Sections: ${payload.sections.map((item) => `${item.section}:${item.items.length}`).join(", ")}`);
}

async function runCollectors(section, config) {
  const names = section === "all" ? Object.keys(collectors) : [section];
  const invalid = names.filter((name) => !collectors[name]);
  if (invalid.length > 0) {
    throw new Error(`Unknown section: ${invalid.join(", ")}`);
  }

  const settled = await Promise.allSettled(names.map((name) => collectors[name](config)));
  return settled.map((result, index) => {
    if (result.status === "fulfilled") return result.value;
    return {
      section: names[index],
      title: names[index],
      description: "Collector failed.",
      sourceCount: 0,
      error: String(result.reason?.message || result.reason),
      items: []
    };
  });
}

function buildPayload(sections, config) {
  const allItems = sections.flatMap((section) =>
    section.items.map((item) => ({
      section: section.section,
      ...item
    }))
  );

  const growingAccessItems = allItems
    .filter((item) => item.access?.available && item.access.delta > 0)
    .sort((a, b) => b.access.delta - a.access.delta)
    .slice(0, 30);

  const growingCitationPapers = allItems
    .filter((item) => item.kind === "paper" && item.trend?.available && item.trend.delta > 0)
    .sort((a, b) => b.trend.delta - a.trend.delta)
    .slice(0, 30);

  return {
    schemaVersion: 1,
    generatedAt: config.generatedAt,
    compare: {
      currentYear: config.currentYear,
      previousYear: config.previousYear
    },
    notes: [
      "Access growth is available only for URLs present in data/access-metrics.json or another configured metrics file.",
      "Paper trend growth uses OpenAlex citation counts by year, not page views."
    ],
    sections,
    rankings: {
      growingAccessItems,
      growingCitationPapers
    }
  };
}

function mergeSections(previousSections, updatedSections) {
  const byName = new Map(previousSections.map((section) => [section.section, section]));
  for (const section of updatedSections) {
    byName.set(section.section, section);
  }

  const preferredOrder = ["papers", "news", "startups", "funding"];
  return [...byName.values()].sort((a, b) => {
    const aIndex = preferredOrder.indexOf(a.section);
    const bIndex = preferredOrder.indexOf(b.section);
    return (aIndex === -1 ? 99 : aIndex) - (bIndex === -1 ? 99 : bIndex);
  });
}

async function writeSectionFiles(outDir, sections) {
  for (const section of sections) {
    await writeJson(`${outDir}/${section.section}.json`, section);
  }
}

async function appendHistory(path, payload) {
  const history = await readJson(path, []);
  history.push({
    generatedAt: payload.generatedAt,
    compare: payload.compare,
    counts: Object.fromEntries(payload.sections.map((section) => [section.section, section.items.length])),
    topCitationGrowth: payload.rankings.growingCitationPapers.slice(0, 10).map(slimItem),
    topAccessGrowth: payload.rankings.growingAccessItems.slice(0, 10).map(slimItem)
  });

  await writeJson(path, history.slice(-200));
}

function slimItem(item) {
  return {
    section: item.section,
    title: item.title,
    url: item.url,
    publishedAt: item.publishedAt,
    trend: item.trend,
    access: item.access
  };
}

async function readJson(path, fallback) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch {
    return fallback;
  }
}

async function writeJson(path, value) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function parseArgs(args) {
  const parsed = {};
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--section") parsed.section = args[++index];
    else if (arg === "--out-dir") parsed.outDir = args[++index];
    else if (arg === "--latest") parsed.latest = args[++index];
    else if (arg === "--history") parsed.history = args[++index];
  }
  return parsed;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
