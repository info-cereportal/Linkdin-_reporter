#!/usr/bin/env bash
set -euo pipefail

repo="${1:-${GITHUB_REPOSITORY:-}}"
project_id="${2:-${FIREBASE_PROJECT_ID:-}}"
service_account_json="${3:-${FIREBASE_SERVICE_ACCOUNT_JSON:-}}"

if [[ -z "$repo" || -z "$project_id" ]]; then
  echo "Usage: scripts/configure-firebase-github.sh OWNER/REPO FIREBASE_PROJECT_ID [service-account.json]"
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

echo "Setting FIREBASE_PROJECT_ID for $repo"
gh variable set FIREBASE_PROJECT_ID --repo "$repo" --body "$project_id"

if [[ -n "$service_account_json" ]]; then
  if [[ ! -f "$service_account_json" ]]; then
    echo "Service account JSON not found: $service_account_json"
    exit 1
  fi

  echo "Setting FIREBASE_SERVICE_ACCOUNT secret for $repo"
  gh secret set FIREBASE_SERVICE_ACCOUNT --repo "$repo" < "$service_account_json"
else
  echo "Skipped FIREBASE_SERVICE_ACCOUNT because no JSON path was provided."
  echo "Set it later with:"
  echo "  gh secret set FIREBASE_SERVICE_ACCOUNT --repo $repo < service-account.json"
fi

echo "Firebase GitHub settings are ready."
