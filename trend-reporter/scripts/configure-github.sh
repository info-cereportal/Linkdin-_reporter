#!/usr/bin/env bash
set -euo pipefail

repo="${1:-${GITHUB_REPOSITORY:-}}"
branch="${DEFAULT_BRANCH:-main}"

if [[ -z "$repo" ]]; then
  remote_url="$(git remote get-url origin 2>/dev/null || true)"
  if [[ "$remote_url" =~ github.com[:/]([^/]+/[^/.]+)(\.git)?$ ]]; then
    repo="${BASH_REMATCH[1]}"
  fi
fi

if [[ -z "$repo" ]]; then
  echo "Usage: scripts/configure-github.sh OWNER/REPO"
  exit 1
fi

if ! command -v gh >/dev/null 2>&1; then
  echo "GitHub CLI is required: https://cli.github.com/"
  exit 1
fi

if ! gh auth status >/dev/null 2>&1; then
  echo "GitHub CLI is not authenticated. Run: gh auth login -h github.com"
  exit 1
fi

set_var() {
  local key="$1"
  local value="$2"
  if [[ -n "$value" ]]; then
    gh variable set "$key" --repo "$repo" --body "$value"
  fi
}

echo "Configuring repository variables for $repo"
set_var RUN_PARITY "${RUN_PARITY:-0}"
set_var TOPIC_KEYWORDS "${TOPIC_KEYWORDS:-neuroscience,neurotechnology,brain-computer interface,neural decoding,neural interface,neuromodulation,neuromorphic,neuroAI,mental health,cognitive neuroscience,computational neuroscience,brain,neural,cortex,connectome}"
set_var PAPER_QUERY "${PAPER_QUERY:-neuroscience}"
set_var PAPER_FROM_DATE "${PAPER_FROM_DATE:-}"
set_var OPENALEX_MAILTO "${OPENALEX_MAILTO:-}"
set_var NEWS_FEEDS "${NEWS_FEEDS:-https://www.nih.gov/news-events/news-releases/feed.xml,https://www.nimh.nih.gov/news/rss.xml,https://www.sciencedaily.com/rss/mind_brain/neuroscience.xml,https://medicalxpress.com/rss-feed/neuroscience-news/}"
set_var STARTUP_FEEDS "${STARTUP_FEEDS:-https://techcrunch.com/tag/neuroscience/feed/,https://techcrunch.com/tag/brain-computer-interface/feed/}"
set_var STARTUP_QUERIES "${STARTUP_QUERIES:-neurotech,brain-computer interface,neural interface,BCI startup,neuromodulation startup}"
set_var FUNDING_FEEDS "${FUNDING_FEEDS:-https://grants.nih.gov/grants/guide/newsfeed/fundingopps.xml,https://www.nsf.gov/rss/rss_www_funding_pgm_annc_inf.xml,https://www.grants.gov/rss/GG_OppModByCategory.xml}"
set_var FUNDING_KEYWORDS "${FUNDING_KEYWORDS:-neuroscience,brain,neurotechnology,cognitive,mental health,brain-computer interface}"
set_var GRANTS_GOV_AGENCIES "${GRANTS_GOV_AGENCIES:-HHS,NSF}"
set_var GRANTS_GOV_FUNDING_CATEGORIES "${GRANTS_GOV_FUNDING_CATEGORIES:-}"
set_var MAX_ITEMS_PER_SECTION "${MAX_ITEMS_PER_SECTION:-30}"

echo "Configuring GitHub Pages for Actions builds"
if gh api "repos/$repo/pages" >/dev/null 2>&1; then
  gh api --method PUT "repos/$repo/pages" -f build_type=workflow >/dev/null
else
  gh api --method POST "repos/$repo/pages" -f build_type=workflow >/dev/null
fi

echo "Checking workflow file"
gh workflow view collect.yml --repo "$repo" >/dev/null

echo "Triggering initial collection"
gh workflow run collect.yml --repo "$repo" --ref "$branch" -f section=all

echo "Done. Watch the run with:"
echo "  gh run list --repo $repo --workflow collect.yml --limit 3"
