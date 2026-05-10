# GitHub Settings

このプロジェクトを新規GitHubリポジトリで運用するための設定メモです。

## 1. 配置

`trend-reporter/` の中身を、新しいリポジトリのルートに置きます。

重要な配置:

```text
.github/workflows/collect.yml
package.json
src/
public/
data/
```

`.github/workflows/collect.yml` がリポジトリルート直下にない場合、GitHub Actionsは起動しません。

## 2. GitHub CLIで自動設定

GitHub CLIにログインします。

```bash
gh auth login -h github.com
```

その後、新しいリポジトリのルートで実行します。

```bash
npm run configure:github -- OWNER/REPO
```

このスクリプトは以下を行います。

- Repository Variablesの登録
- GitHub Pagesのbuild typeを `workflow` に設定
- `collect.yml` workflowの存在確認
- 初回の手動収集実行

## 3. 手動設定する場合

Repository settingsで以下を設定します。

- Settings → Pages → Source: `GitHub Actions`
- Settings → Actions → General → Workflow permissions: `Read and write permissions`

Repository Variables:

| Name | Default |
|---|---|
| `RUN_PARITY` | `0` |
| `TOPIC_KEYWORDS` | `neuroscience,neurotechnology,brain-computer interface,neural decoding,neural interface,neuromodulation,neuromorphic,neuroAI,mental health,cognitive neuroscience,computational neuroscience,brain,neural,cortex,connectome` |
| `PAPER_QUERY` | `neuroscience` |
| `NEWS_FEEDS` | `https://www.nih.gov/news-events/news-releases/feed.xml,https://www.nimh.nih.gov/news/rss.xml,https://www.sciencedaily.com/rss/mind_brain/neuroscience.xml,https://medicalxpress.com/rss-feed/neuroscience-news/` |
| `STARTUP_FEEDS` | `https://techcrunch.com/tag/neuroscience/feed/,https://techcrunch.com/tag/brain-computer-interface/feed/` |
| `STARTUP_QUERIES` | `neurotech,brain-computer interface,neural interface,BCI startup,neuromodulation startup` |
| `FUNDING_FEEDS` | `https://grants.nih.gov/grants/guide/newsfeed/fundingopps.xml,https://www.nsf.gov/rss/rss_www_funding_pgm_annc_inf.xml,https://www.grants.gov/rss/GG_OppModByCategory.xml` |
| `FUNDING_KEYWORDS` | `neuroscience,brain,neurotechnology,cognitive,mental health,brain-computer interface` |
| `GRANTS_GOV_AGENCIES` | `HHS,NSF` |
| `MAX_ITEMS_PER_SECTION` | `30` |

Optional:

| Name | 用途 |
|---|---|
| `OPENALEX_MAILTO` | OpenAlex polite pool用メールアドレス |
| `PAPER_FROM_DATE` | 新着論文取得の開始日 |
| `GRANTS_GOV_FUNDING_CATEGORIES` | Grants.govカテゴリ指定 |

## 4. 定期実行

`collect.yml` は毎日 06:00 JST に起動します。

実際にcollectorを走らせるかどうかは、JST基準の日数と `RUN_PARITY` の偶奇で決まります。

- `RUN_PARITY=0`: 偶数パリティ日に実行
- `RUN_PARITY=1`: 奇数パリティ日に実行

手動実行はこのガードを無視して実行されます。

## 5. 確認

初回実行後、Pages URLで以下が返れば設定完了です。

```text
/data/latest.json
/data/papers.json
/data/news.json
/data/startups.json
/data/funding.json
```
