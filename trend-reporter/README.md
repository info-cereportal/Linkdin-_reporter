# Neuro Trend Reporter

GitHub Actionsで1日置きに脳情報関連の情報を収集し、GitHub Pagesから閲覧できるJSON APIとダッシュボードを生成するプロジェクトです。

## 目的

- 論文情報、研究ニュース、スタートアップ動向、助成金/公募情報を別々のcollectorで取得する
- 取得結果を `public/data/*.json` として公開する
- 論文はOpenAlexの年別引用数を使って前年比の伸びを集計する
- Webサイトのアクセス数は、GA4/Search Console/Matomoなどから別途出力した `data/access-metrics.json` がある場合だけ前年比を集計する
- GitHub PagesまたはFirebase Hostingへ同じWebアプリをdeployする

## 公開されるAPI

GitHub Pagesを有効化すると、以下の静的JSONがAPIとして閲覧できます。

| Endpoint | 内容 |
|---|---|
| `/data/latest.json` | 全カテゴリの統合結果 |
| `/data/papers.json` | 論文情報 |
| `/data/news.json` | 研究系ニュース |
| `/data/startups.json` | スタートアップ/技術動向 |
| `/data/funding.json` | 助成金・公募情報 |

## Collector

| Section | Source | 主な指標 |
|---|---|---|
| `papers` | OpenAlex Works API | 年別引用数、総引用数、OA有無 |
| `news` | RSS/Atom feeds | 関連キーワード、公開日 |
| `startups` | RSS/Atom feeds, Hacker News public search | HN points/comments、関連キーワード |
| `funding` | Grants.gov Search2 API, NIH Guide RSS, NSF RSS | 公募状態、締切、関連キーワード |

## ローカル実行

```bash
npm run check
npm run collect
npm run serve
```

ブラウザで `http://localhost:8000` を開くとダッシュボードを確認できます。

個別カテゴリだけ更新する場合:

```bash
npm run collect -- --section papers
npm run collect -- --section funding
```

## GitHub Actions

`.github/workflows/collect.yml` は以下を行います。

1. 毎日 06:00 JST に起動し、JST日数の偶奇判定で1日置きにcollectorを実行
2. `public/data/*.json` と `data/history.json` を更新
3. 生成済みJSONをGitHub Pagesへdeploy

GitHub側では、Repository settingsでPagesのSourceを「GitHub Actions」にしてください。

`RUN_PARITY` をRepository Variablesに設定すると、隔日実行の日付側を切り替えられます。

| `RUN_PARITY` | 挙動 |
|---|---|
| `0` | JST基準の偶数パリティ日に実行。未設定時のデフォルト |
| `1` | JST基準の奇数パリティ日に実行 |

手動実行 (`workflow_dispatch`) はこの隔日ガードを無視して実行します。

## 設定

GitHub ActionsのRepository Variablesで探索対象を変更できます。

GitHub側の初期設定は [docs/github-settings.md](docs/github-settings.md) を参照してください。GitHub CLIが使える場合は、`npm run configure:github -- OWNER/REPO` でRepository Variables、Pages、初回workflow実行まで設定できます。

Firebase Hostingへ公開する場合は [docs/firebase-hosting.md](docs/firebase-hosting.md) を参照してください。`FIREBASE_PROJECT_ID` と `FIREBASE_SERVICE_ACCOUNT` が設定されている場合、GitHub Actionsの収集後にFirebase Hostingへ自動deployします。

| Variable | 例 |
|---|---|
| `TOPIC_KEYWORDS` | `neuroscience,neurotechnology,brain-computer interface,neural decoding` |
| `PAPER_QUERY` | `neuroscience neurotechnology brain-computer interface` |
| `PAPER_FROM_DATE` | 新着論文取得の開始日。例: `2026-01-01` |
| `CURRENT_YEAR` / `PREVIOUS_YEAR` | 前年比集計の比較年。完了年同士なら `2025` / `2024` |
| `NEWS_FEEDS` | RSS URLをカンマ区切り |
| `STARTUP_FEEDS` | スタートアップ系RSS URLをカンマ区切り |
| `STARTUP_QUERIES` | `neurotech,BCI startup,neuromodulation startup` |
| `FUNDING_FEEDS` | 助成金系RSS URLをカンマ区切り |
| `FUNDING_KEYWORDS` | `neuroscience,brain,mental health,cognitive` |
| `GRANTS_GOV_AGENCIES` | `HHS,NSF` |
| `GRANTS_GOV_FUNDING_CATEGORIES` | Grants.govのカテゴリコード |
| `OPENALEX_MAILTO` | OpenAlex polite pool用メールアドレス |

## アクセス数の前年比集計

公開RSSやOpenAlexからは、任意Webサイトのアクセス数は取得できません。アクセス前年比を出したい場合は、GA4/Search Console/Matomoなどから次の形式で `data/access-metrics.json` を生成してください。

```json
[
  {
    "url": "https://example.com/research-news/neurotech-market",
    "year": 2025,
    "views": 1200
  },
  {
    "url": "https://example.com/research-news/neurotech-market",
    "year": 2026,
    "views": 1840
  }
]
```

このファイルは `.gitignore` に入れています。公開してよい集計値だけを使う運用にしてください。

## 新しい探索元を増やす

- RSS/Atomで取得できるサイトは、対応する `*_FEEDS` 変数にURLを足すだけで追加できます
- APIが必要なサイトは `src/collectors/*.mjs` にcollectorを追加し、`src/cli.mjs` の `collectors` に登録してください
- 認証が必要なAPIキーはGitHub Secretsに保存し、workflowのenvで渡してください
