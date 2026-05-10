# LinkedIn Neuro Reporter

脳情報科学・ニューロAI領域の知見を **LinkedIn 投稿ドラフト** に変換し、さらに **トレンドデータ** を毎日収集・公開する複合プロダクトです。

> **コンセプト:** 「研究知見 → 投稿ドラフト → 配信 → トレンド可視化」を一つのリポジトリで完結。LinkedIn API は使わず、人がレビューして手動投稿する運用を前提にしています。

---

## プロダクト全体像

このリポジトリは 4 つのコンポーネントで構成されます。

```
┌──────────────────────────────────────────────────────────────────┐
│                    LinkedIn Neuro Reporter                       │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ① MCP Server (src/)                                             │
│     Claude Desktop / Claude Code から呼べる 4 ツール              │
│     対話的にドラフト生成・レビュー・整形・バリアント比較          │
│                                                                  │
│  ② Daily Pipeline (src/daily/)                                   │
│     RSS/PubMed → 論文選定 → 推敲 → Slack/Discord 通知             │
│     + public/data/*.json を更新                                   │
│     GitHub Actions で 3時間おきに自動実行                         │
│                                       │                          │
│                                       ▼                          │
│  ④ Firebase Web App (public/) ←───────┘                          │
│     最新ドラフト + 履歴を表示するダッシュボード                   │
│     GitHub Actions が Firebase Hosting に自動デプロイ             │
│                                                                  │
│  ③ Trend Reporter (trend-reporter/)                              │
│     OpenAlex / RSS / Grants.gov から論文・ニュース・スタートアップ│
│     ・助成金トレンドを収集 → JSON API + ダッシュボード公開        │
│     GitHub Pages / Firebase Hosting にデプロイ                    │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

| コンポーネント | 用途 | 起動方法 | 出力先 |
|---|---|---|---|
| **MCP Server** | 対話的ドラフト生成 | Claude Desktop/Code から呼び出し | Claude チャット |
| **Daily Pipeline** | 自動ドラフト生成 | `npm run daily` / GitHub Actions | Slack / Discord / `public/data/` |
| **Firebase Web App** | 自動生成ドラフトのブラウザ表示 | Firebase Hosting | `public/` を Firebase に配信 |
| **Trend Reporter** | トレンドJSON API + ダッシュボード | `npm run trend:collect` / GitHub Actions | `trend-reporter/public/data/*.json` |

---

## ① MCP Server — 対話的ドラフト生成

脳科学・学術系の知見を LinkedIn 投稿ドラフトに変換する MCP サーバーです。Claude Desktop や Claude Code から MCP ツールとして利用できます。

> LinkedIn API 連携・自動投稿はスコープ外です。生成されたドラフトを確認し、手動でコピペ投稿する運用を想定しています。

### セットアップ

```bash
git clone <repository-url>
cd Linkdin-_reporter
npm install
npm run build
```

### Claude Desktop への接続

`claude_desktop_config.json` に以下を追加してください。

- **macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows:** `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "linkedin-neuro-draft": {
      "command": "node",
      "args": ["/path/to/Linkdin-_reporter/dist/index.js"]
    }
  }
}
```

### Claude Code への接続

```bash
claude mcp add linkedin-neuro-draft node /path/to/Linkdin-_reporter/dist/index.js
```

### 提供ツール

| ツール | 役割 |
|---|---|
| `generate_linkedin_draft` | 学術知見 → LinkedIn ドラフト生成 |
| `review_neuro_claims` | 医療断定・誇張・出典不足の検出（warnings + risk_score + safer_rewrite） |
| `format_for_linkedin` | フック・改行・CTA・ハッシュタグの自動整形 |
| `create_post_variants` | 同一テーマから複数文体・長さの候補生成（最大5パターン） |

### 標準ワークフロー

```
学術知見
    │
    ▼
┌──────────────────────────────┐
│ ① generate_linkedin_draft   │  topic, source_summary, audience,
│    ドラフト生成              │  tone, objective, length
└──────────────┬───────────────┘
               ▼
┌──────────────────────────────┐
│ ② review_neuro_claims       │  ← 医療断定・誇張・出典不足を検出
│    表現レビュー              │
└──────────────┬───────────────┘
               │ risk_score > 30 → safer_rewrite を採用
               ▼
┌──────────────────────────────┐
│ ③ format_for_linkedin       │  ← フック・改行・CTA・ハッシュタグ
│    LinkedIn 向け整形         │
└──────────────┬───────────────┘
               ▼
        LinkedIn に手動コピペ投稿
```

### ツールリファレンス

#### `generate_linkedin_draft`

学術知見から LinkedIn 投稿ドラフトを生成します。

| 名前 | 型 | 必須 | 説明 |
|---|---|---|---|
| `topic` | string | Yes | 投稿のメインテーマ |
| `source_summary` | string | Yes | 元となる学術知見の要約 |
| `audience` | enum | Yes | `researchers` / `business_leaders` / `general` / `students` / `hr_professionals` |
| `tone` | enum | Yes | `academic` / `professional` / `casual` / `inspirational` / `thought_leadership` |
| `objective` | enum | Yes | `educate` / `engage` / `promote` / `network` / `thought_leadership` |
| `length` | enum | Yes | `short`(〜500字) / `medium`(500-1000字) / `long`(1000-1500字) |

#### `review_neuro_claims`

投稿テキストをレビューし、問題のある表現を検出します。

**検出カテゴリと重み:**

| カテゴリ | 検出対象 | 重み |
|---|---|---|
| `medical_assertion` | 医療効果の断定（「脳を治す」「効果がある」等） | ×3.0 |
| `unreproducible` | 再現性不明な主張（単一研究への過度な依拠等） | ×2.5 |
| `exaggeration` | 誇張表現（「革命的」「画期的」等） | ×2.0 |
| `missing_citation` | 出典不足（具体的な数値に出典なし等） | ×1.5 |

**risk_score の目安:**

| スコア | レベル | 推奨アクション |
|---|---|---|
| 0 - 30 | 低リスク | そのまま投稿可 |
| 31 - 60 | 中リスク | 該当箇所の修正を推奨 |
| 61 - 80 | 高リスク | safer_rewrite の採用を推奨 |
| 81 - 100 | 非常に高リスク | 大幅な書き直しが必要 |

#### `format_for_linkedin`

| 名前 | 型 | 必須 | デフォルト | 説明 |
|---|---|---|---|---|
| `post_text` | string | Yes | - | 整形対象 |
| `topic` | string | No | `"脳科学"` | ハッシュタグ選定用 |
| `include_hashtags` | boolean | No | `true` | ハッシュタグ付加 |
| `include_cta` | boolean | No | `true` | CTA 付加 |

冒頭フック / 改行最適化（「もっと見る」位置を意識）/ CTA / 関連ハッシュタグ最大5つを自動付加します。

#### `create_post_variants`

| 名前 | 型 | 必須 | デフォルト | 説明 |
|---|---|---|---|---|
| `topic` | string | Yes | - | 投稿テーマ |
| `base_content` | string | Yes | - | 元コンテンツ |
| `variant_styles` | string[] | No | `["academic","bizdev","short_form"]` | 文体種類 |

選択肢: `academic` / `bizdev` / `short_form` / `storytelling` / `data_driven`

### 利用例（Claude への自然言語依頼）

```
💬 「デフォルトモードネットワークと創造性」について LinkedIn 投稿を作って。
   ビジネスリーダー向け、プロフェッショナルなトーンで。
   元ネタ: DMNは安静時に活性化する脳領域群で、創造的思考に関与する。
   意図的にDMNを活性化させる休息が創造的問題解決を促進する可能性が示されている。
```

```
💬 ドラフトを作って、表現をレビューして、最後にLinkedIn向けに整形まで一気にやって。
   テーマ: ワーキングメモリとマルチタスク
```

| やりたいこと | Claude への依頼例 |
|---|---|
| ドラフト生成 | 「〜について LinkedIn 投稿を作って」 |
| 表現チェック | 「この文章に問題がないかレビューして」 |
| LinkedIn 整形 | 「LinkedIn 向けにフォーマットして」 |
| バリアント生成 | 「3パターンで候補を出して」 |
| 一括処理 | 「ドラフト作成→レビュー→整形まで一気にやって」 |
| ハッシュタグなし | 「フォーマットして。ただしハッシュタグは不要」 |

---

## ② Daily Pipeline — 自動ドラフト生成

RSS/PubMed から脳情報科学の論文を自動取得し、推敲済みドラフトを生成して **Slack/Discord に通知** + **Firebase Hosting に公開** します。GitHub Actions で **3時間おき** に自動実行されます（`.github/workflows/daily-draft.yml`）。

### パイプライン

```
┌─────────────────────┐
│ RSS / PubMed 取得   │  arXiv q-bio.NC（デフォルト）
│                     │  RSS が空なら PubMed E-utilities にフォールバック
└──────────┬──────────┘
           ▼
┌─────────────────────┐
│ トピック選定        │  関連キーワード×タイトル重みでスコアリング
│                     │  履歴から重複論文を除外（既出はスキップ）
│                     │  上位5件からランダム選択
└──────────┬──────────┘
           ▼
┌─────────────────────┐
│ 論文図表抽出        │  arXiv HTML版から最初のFigure画像を取得
│ (ベストエフォート) │
└──────────┬──────────┘
           ▼
┌─────────────────────┐
│ 推敲エンジン        │  英→日 用語辞書 (140+ 語)
│ (post-polisher.ts) │  6種テンプレートを日替わりローテーション
│                     │   - パラダイムシフト型
│                     │   - データドリブン型
│                     │   - 3つの示唆型
│                     │   - 未来予測型
│                     │   - 脳科学×AI融合型
│                     │   - 挑発的問いかけ型
└──────────┬──────────┘
           ▼
┌─────────────────────┐
│ ヘッジング適用      │  domain/neuro-hedging.ts
│ クレーム検出 + safer│  risk_score > 30 で自動書き換え
│ LinkedIn 整形       │  domain/linkedin-formatter.ts
└──────────┬──────────┘
           ▼
┌─────────────────────┐
│ Slack / Discord     │  Slack: Block Kit でリッチ表示
│ Webhook 通知        │  Discord: Embed + 図表画像 + メンション
└──────────┬──────────┘
           ▼
┌─────────────────────┐
│ public/data/ 更新   │  latest-draft.json / drafts-history.json
│                     │  Firebase Hosting に自動デプロイ → Web で閲覧
└─────────────────────┘
```

### ローカル実行

```bash
cp .env.example .env
# .env を編集して RSS_FEEDS / WEBHOOK_URL などを設定

npm run daily          # フルパイプライン（推敲＋整形＋通知）
npm run daily:pick     # 論文選定のみ（JSON出力 / Claude エージェント連携用）
npm run daily:build    # ビルド済み dist/ で実行（CI 向け）
```

### 環境変数

| 変数 | デフォルト | 説明 |
|---|---|---|
| `RSS_FEEDS` | `https://rss.arxiv.org/rss/q-bio.NC` | RSS URL（カンマ区切りで複数指定可） |
| `WEBHOOK_URL` | `""` | Slack Incoming Webhook または Discord Webhook URL |
| `WEBHOOK_TYPE` | `slack` | `slack` または `discord` |
| `DISCORD_MENTION_USER_ID` | `""` | Discord でメンションしたいユーザーID |
| `HISTORY_FILE` | `.daily-history.json` | 重複防止用の履歴ファイル |
| `MAX_HISTORY_DAYS` | `30` | 履歴保持日数 |
| `PUBLIC_DATA_DIR` | `public/data` | Web アプリ用 JSON 出力先 |
| `MAX_PUBLIC_HISTORY` | `50` | `drafts-history.json` の最大保持件数 |

### GitHub Actions

`.github/workflows/daily-draft.yml` が UTC 0,3,6,9,12,15,18,21 時（JST 9,12,15,18,21,0,3,6 時）に実行されます。

実行内容:

1. RSS/PubMed から論文を選定し、ドラフトを生成
2. Slack/Discord に Webhook 通知（任意）
3. `public/data/latest-draft.json` と `public/data/drafts-history.json` を更新
4. 更新分を `[skip ci]` でコミット & プッシュ
5. Firebase Hosting にデプロイ（`FIREBASE_PROJECT_ID` + `FIREBASE_SERVICE_ACCOUNT` が設定されている場合のみ）

| Secret / Variable | 種別 | 用途 |
|---|---|---|
| `RSS_FEEDS` | Secret | RSS URL（カンマ区切り） |
| `WEBHOOK_URL` | Secret | Slack / Discord Webhook URL |
| `WEBHOOK_TYPE` | Secret | `slack` または `discord` |
| `DISCORD_MENTION_USER_ID` | Secret | Discord メンション用ID |
| `FIREBASE_PROJECT_ID` | **Variable** | Firebase Hosting のプロジェクトID（例: `eegdatabucket`） |
| `FIREBASE_SERVICE_ACCOUNT` | Secret | Firebase サービスアカウント JSON の **中身**（フルJSON） |

実行ごとに `.daily-history.json` が更新され、同じ論文を続けて選ばないようになります。

### 二つの実行モード

| コマンド | 用途 | 文面生成 |
|---|---|---|
| `npm run daily` | 完全自動運用 | テンプレート + ヘッジング辞書（決定的） |
| `npm run daily:pick` | Claude エージェント連携 | 論文情報のみ JSON 出力 → Claude が文面生成 |

---

## Firebase Web App — 自動生成ドラフトのダッシュボード

ルート `public/` に配置されたシングルページアプリで、**Daily Pipeline が生成した最新ドラフトと履歴をブラウザで閲覧 / コピー** できます。Firebase Hosting にデプロイされ、3時間おきに自動更新されます。

### 機能

- 最新ドラフトをそのまま表示し、ワンクリックでクリップボードにコピー
- リスクスコア / テンプレート種別 / トピックを色分けバッジで表示
- 過去 50 件のドラフトをサイドリストから切り替え閲覧
- 取得できた論文の図表（arXiv HTML 版）をインライン表示
- ダークテーマ / モバイル対応

### データ契約

| ファイル | 内容 |
|---|---|
| `public/data/latest-draft.json` | 最新の1件（`PolishedDraft` + `generatedAt` + `date`） |
| `public/data/drafts-history.json` | 直近 N 件の配列（新しい順 / `MAX_PUBLIC_HISTORY` で調整） |

```jsonc
// latest-draft.json
{
  "generatedAt": "2026-05-01T03:00:12.345Z",
  "date": "2026-05-01",
  "topic": "予測符号化と注意機構",
  "templateName": "neuro-ai-bridge",
  "riskScore": 12,
  "paperTitle": "...",
  "paperLink": "https://arxiv.org/abs/...",
  "figureUrl": "https://arxiv.org/html/.../fig1.png",
  "formatted": "脳科学とAI——その境界線が消えつつある。\n..."
}
```

### Firebase Hosting セットアップ

#### 1. プロジェクト準備

`.firebaserc` で対象プロジェクトを指定（このリポジトリでは `eegdatabucket`）。別プロジェクトを使う場合は書き換えてください。

```bash
npx firebase-tools@latest login
npx firebase-tools@latest use --add  # 必要に応じて
```

#### 2. ローカル動作確認

```bash
npm run daily        # public/data/*.json を生成
npx firebase-tools@latest emulators:start --only hosting
# → http://localhost:5000 でダッシュボード確認
```

#### 3. 手動デプロイ

```bash
npx firebase-tools@latest deploy --only hosting
```

#### 4. GitHub Actions 自動デプロイのセットアップ

サービスアカウントを作成し、JSON キーをそのまま GitHub Secret に貼り付けます。

```bash
# Firebase Console → プロジェクト設定 → サービスアカウント → 新しい秘密鍵を生成
# 取得した JSON ファイルを開く

# GitHub リポジトリで:
# Settings → Secrets and variables → Actions
#   ▸ Variables タブ:  FIREBASE_PROJECT_ID = eegdatabucket
#   ▸ Secrets タブ:    FIREBASE_SERVICE_ACCOUNT = (JSON ファイルの全文を貼り付け)
```

両方が設定されていない場合、ワークフローはデプロイステップを **スキップして警告ログを出して正常終了** します（Webhook 通知のみで運用する場合に対応）。

### 設計判断

- **デフォルト Firebase スキャフォールディングを廃止**: `public/index.html` を独自ダッシュボードに差し替え（`assets/style.css` + `assets/app.js`）
- **ビルドステップ無し**: 静的 HTML/JS のみで、Firebase が直接配信。Lighthouse スコアが高く、ビルド時間ゼロ
- **JSON は `no-cache` ヘッダ**: 3時間おきの更新が即座に反映される（`firebase.json` で設定）
- **アセットは 1時間キャッシュ**: CSS/JS は更新頻度が低いのでブラウザキャッシュを活用
- **Trend Reporter とは独立**: ルート Firebase 設定は LinkedIn ドラフト用。`trend-reporter/firebase.json` は別プロジェクト用

---

## ③ Trend Reporter — 脳科学トレンドの JSON API & ダッシュボード

`trend-reporter/` 配下の独立サブプロジェクト。脳情報科学領域の **論文 / 研究ニュース / スタートアップ動向 / 助成金・公募情報** を収集し、静的 JSON API + ダッシュボードとして公開します。

### 公開エンドポイント

| Endpoint | 内容 |
|---|---|
| `/data/latest.json` | 全カテゴリの統合結果 + 引用伸び率ランキング |
| `/data/papers.json` | OpenAlex 論文情報（前年比引用数の伸び付き） |
| `/data/news.json` | 研究ニュース（RSS/Atom） |
| `/data/startups.json` | スタートアップ動向（RSS + Hacker News） |
| `/data/funding.json` | 助成金・公募情報（Grants.gov / NIH / NSF） |

### Collector

| Section | Source | 主な指標 |
|---|---|---|
| `papers` | OpenAlex Works API | 年別引用数、総引用数、OA有無、前年比伸び率 |
| `news` | RSS / Atom feeds | 関連キーワード、公開日 |
| `startups` | RSS / Atom + Hacker News public search | HN points/comments、関連キーワード |
| `funding` | Grants.gov Search2 API + NIH Guide RSS + NSF RSS | 公募状態、締切、関連キーワード |

### ローカル実行

ルートからの呼び出し：

```bash
npm run trend:check        # 構文チェック
npm run trend:collect      # 全 collector 実行
npm run configure:github   # GitHub Repo Variables / Pages 初期設定
npm run configure:firebase # Firebase Hosting 初期設定
```

`trend-reporter/` 内で直接実行も可能：

```bash
cd trend-reporter
npm run collect:papers
npm run collect:news
npm run collect:startups
npm run collect:funding
npm run serve              # http://localhost:8000 でダッシュボード確認
```

### GitHub Actions（隔日実行）

`trend-reporter/.github/workflows/collect.yml` が **JST 06:00 に毎日起動し、JST日数の偶奇で1日置きに実行** します。

- `RUN_PARITY=0`（デフォルト）: 偶数パリティ日に実行
- `RUN_PARITY=1`: 奇数パリティ日に実行
- `workflow_dispatch` 手動実行は隔日ガードを無視

実行後、`public/data/*.json` を更新 → コミット → GitHub Pages / Firebase Hosting に自動 deploy。

### 主要な Repository Variables

| Variable | 例 |
|---|---|
| `TOPIC_KEYWORDS` | `neuroscience,neurotechnology,brain-computer interface,neural decoding` |
| `PAPER_QUERY` | `neuroscience neurotechnology brain-computer interface` |
| `CURRENT_YEAR` / `PREVIOUS_YEAR` | 前年比集計の比較年 |
| `NEWS_FEEDS` / `STARTUP_FEEDS` / `FUNDING_FEEDS` | 各カテゴリの RSS URL |
| `STARTUP_QUERIES` | `neurotech,BCI startup,neuromodulation startup` |
| `FUNDING_KEYWORDS` | `neuroscience,brain,mental health,cognitive` |
| `GRANTS_GOV_AGENCIES` | `HHS,NSF` |
| `OPENALEX_MAILTO` | OpenAlex polite pool 用メールアドレス |
| `FIREBASE_PROJECT_ID` + `FIREBASE_SERVICE_ACCOUNT` (secret) | Firebase Hosting 自動 deploy |

詳細は [`trend-reporter/README.md`](trend-reporter/README.md)、[`trend-reporter/docs/github-settings.md`](trend-reporter/docs/github-settings.md)、[`trend-reporter/docs/firebase-hosting.md`](trend-reporter/docs/firebase-hosting.md) を参照してください。

### アクセス前年比

公開 RSS / OpenAlex からは任意 Web サイトのアクセス数は取得できません。GA4 / Search Console / Matomo などから `data/access-metrics.json` を生成すれば、前年比集計に組み込まれます（`.gitignore` 対象）。

---

## ディレクトリ構成

```
.
├── src/                          # ① MCP Server + ② Daily Pipeline
│   ├── index.ts                  #   MCP エントリポイント (stdio transport)
│   ├── server.ts                 #   McpServer 生成
│   ├── daily-run.ts              #   デイリーパイプライン CLI
│   ├── daily-pick.ts             #   論文選定のみ CLI（Claude エージェント連携用）
│   ├── config/                   #   定数設定
│   ├── schemas/                  #   Zod 入出力スキーマ
│   ├── domain/                   #   共有ビジネスロジック
│   │   ├── neuro-hedging.ts      #     ヘッジング表現辞書
│   │   ├── claim-detector.ts     #     主張検出エンジン (4カテゴリ × 重み)
│   │   ├── linkedin-formatter.ts #     LinkedIn 整形（フック・改行・CTA・タグ）
│   │   ├── post-composer.ts      #     ドラフト構成テンプレート
│   │   └── variant-generator.ts  #     バリアント生成
│   ├── tools/                    #   MCP ツール登録
│   │   ├── index.ts              #     一括登録
│   │   ├── generate-linkedin-draft.ts
│   │   ├── review-neuro-claims.ts
│   │   ├── format-for-linkedin.ts
│   │   └── create-post-variants.ts
│   └── daily/                    #   ② デイリーパイプライン本体
│       ├── runner.ts             #     全体オーケストレーション
│       ├── rss-fetcher.ts        #     RSS/Atom + PubMed E-utilities
│       ├── post-polisher.ts      #     用語辞書 + 6種テンプレート + 推敲
│       └── webhook-notifier.ts   #     Slack Block Kit / Discord Embed
│
├── trend-reporter/               # ③ トレンド収集 & 公開（独立サブプロジェクト）
│   ├── src/
│   │   ├── cli.mjs
│   │   ├── config.mjs
│   │   ├── collectors/           #   papers / news / startups / funding
│   │   └── lib/
│   ├── public/                   #   ダッシュボード + JSON API
│   │   ├── index.html
│   │   ├── assets/
│   │   └── data/                 #   生成された JSON (collectorが書き出し)
│   ├── data/
│   │   ├── history.json
│   │   └── access-metrics.example.json
│   ├── docs/
│   │   ├── github-settings.md
│   │   └── firebase-hosting.md
│   ├── scripts/                  #   GH / Firebase 初期設定スクリプト
│   └── .github/workflows/collect.yml
│
├── public/                       # ④ Firebase Web App（自動生成ドラフトのダッシュボード）
│   ├── index.html                #     ダッシュボード本体
│   ├── 404.html
│   ├── assets/
│   │   ├── style.css
│   │   └── app.js                #     latest-draft.json / drafts-history.json を読み込んで描画
│   └── data/                     #     ② Daily Pipeline が書き出す JSON
│       ├── latest-draft.json
│       └── drafts-history.json
├── firebase.json                 #   Firebase Hosting 設定（cache 制御込み）
├── .firebaserc                   #   Firebase プロジェクト ID
├── .github/workflows/daily-draft.yml  # ② 3時間おき自動実行 + Firebase deploy
└── archdesign.md                 #   初期設計仕様
```

---

## 開発スクリプト

```bash
# MCP Server
npm run dev          # tsx 開発モード（src/index.ts）
npm run build        # TypeScript コンパイル → dist/
npm start            # ビルド済み MCP サーバー起動

# Daily Pipeline
npm run daily        # フルパイプライン
npm run daily:pick   # 論文選定のみ
npm run daily:build  # ビルド済み dist/ で実行

# Trend Reporter
npm run trend:check      # 構文チェック
npm run trend:collect    # 全 collector 実行
npm run configure:github # GH Variables / Pages 初期設定
npm run configure:firebase # Firebase Hosting 初期設定
```

---

## 技術スタック

| Layer | Stack |
|---|---|
| Runtime | Node.js 18+（trend-reporter は Node 22+） |
| Language | TypeScript（MCP / Daily）/ JavaScript ESM（Trend Reporter） |
| MCP | `@modelcontextprotocol/sdk` v1.12 + Stdio transport |
| Validation | Zod |
| 取得 API | arXiv RSS、PubMed E-utilities、OpenAlex、Grants.gov、HN public search |
| 配信 | Slack Incoming Webhook (Block Kit) / Discord Webhook (Embed) |
| ホスティング | GitHub Pages / Firebase Hosting |
| CI | GitHub Actions（3時間おき + 隔日） |

---

## 設計上のキーポイント

- **MCP ツール同士は非依存**: 合成 (generate → review → format) は LLM クライアント側で行う。新ツール追加は schema + tool ファイル + `tools/index.ts` に1行追加で完結。
- **`domain/` は MCP / Daily Pipeline の両方から共有**: ヘッジング・クレーム検出・LinkedIn 整形ロジックは1つの実装で2系統の出力を支える。
- **Trend Reporter は独立サブプロジェクト**: ルート `package.json` から `npm --prefix trend-reporter` でブリッジ。Node ESM (.mjs) で完結し依存ゼロ運用。
- **将来の `publish_linkedin_post` 拡張余地は維持**: 現時点では LinkedIn API / OAuth / 自動投稿はスコープ外。
- **トランスポートは差し替え可**: `StdioServerTransport` を `StreamableHTTPServerTransport` に変更するのは `src/index.ts` のみ。
- **脳科学領域の言語衛生**: 医療効果の断定を避け、「示唆される」「可能性がある」へのヘッジングを規定値とする。

---

## ライセンス

MIT
