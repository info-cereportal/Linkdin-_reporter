# AdSense 広告ユニットの差し替え手順

NeuroPulse は **Auto Ads + 4つの手動配置スロット** のハイブリッド構成で、
費用対効果を最大化しています。

## 配置済みスロット一覧

| ID | 位置 | ファイル | 想定 RPM | 推奨形式 |
|---|---|---|---|---|
| `TOP_BANNER_SLOT` | ホーム — ヒーロー直後 / BCI 直前 | `public/index.html` | 高 | ディスプレイ広告 (レスポンシブ) |
| `MID_INFEED_SLOT` | ホーム — BCI 直後 / 論文直前 | `public/index.html` | 中〜高 | インフィード広告 |
| `BOTTOM_BANNER_SLOT` | ホーム — 編集ノート後 / アーカイブ前 | `public/index.html` | 中 | ディスプレイ広告 (レスポンシブ) |
| `INARTICLE_SLOT` | 記事詳細 — アブストラクト後 / 著者前 | `scripts/build-articles.mjs` | 高 | インアーティクル広告 |

## 差し替え手順 (1 unit ≈ 5 分)

### Step 1: AdSense コンソールで広告ユニットを作成

1. <https://www.google.com/adsense/> にログイン
2. 左メニュー「広告」 → 「広告ユニット」 → 「新しい広告ユニット」
3. それぞれ以下のタイプで作成:

   | 用途 | コンソールでの選択 |
   |---|---|
   | TOP_BANNER / BOTTOM_BANNER | **ディスプレイ広告** → スクエア・横長レスポンシブ |
   | MID_INFEED | **インフィード広告** → 自動デザイン or テンプレート選択 |
   | INARTICLE | **インアーティクル広告** |

4. 各ユニットを保存すると `data-ad-slot="1234567890"` のような **10 桁の数値スロット ID** が表示されます。

### Step 2: コード内のプレースホルダを置換

リポジトリ内の以下 4 箇所を編集:

```bash
# 一括置換 (sed の例)
sed -i '' 's/REPLACE_WITH_TOP_BANNER_SLOT_ID/1234567890/' public/index.html
sed -i '' 's/REPLACE_WITH_MID_INFEED_SLOT_ID/2345678901/' public/index.html
sed -i '' 's/REPLACE_WITH_BOTTOM_BANNER_SLOT_ID/3456789012/' public/index.html
sed -i '' 's/REPLACE_WITH_INARTICLE_SLOT_ID/4567890123/' scripts/build-articles.mjs
```

または、各ファイルを開いて `REPLACE_WITH_*` の文字列を検索 → 実 ID に置換。

### Step 3: 記事ページの再生成

```bash
npm run build:web
```

`scripts/build-articles.mjs` の変更は記事個別ページへ波及するため必須。

### Step 4: コミット・デプロイ

```bash
git checkout -b chore/adsense-slot-ids
git add public/ scripts/
git commit -m "chore: insert AdSense ad unit slot IDs"
git push -u origin chore/adsense-slot-ids
gh pr create --base main --title "chore: AdSense slot IDs" --body "ad unit IDs from AdSense console"
gh pr merge --merge
git checkout main && git pull
firebase deploy --only hosting --project eegbugckets
```

## 重要な注意事項

### ⚠️ 配置済みスロットが空欄でも問題ない理由

CSS で `:has(ins[data-ad-status="unfilled"])` 検出 → 空コンテナを自動的に
非表示にしています。`REPLACE_WITH_*` のままでは AdSense が無効スロットと
判定し空表示になりますが、**ユーザの目には何も映りません** (UX 影響ゼロ)。

### Auto Ads との関係

`/index.html` の `<head>` に既に Auto Ads 用の publisher script が
読み込まれているため、上記 4 スロットを差し替えなくても Auto Ads が
自動配置を行います。**手動スロット = 高 RPM 位置の確保**、
**Auto Ads = カバレッジ補完** という役割分担です。

### ポリシー遵守チェック

- ✅ `aria-label="広告"` + 「広告 / ADVERTISEMENT」ラベル表示で識別性確保
- ✅ 1 ページ広告 ≤ コンテンツ量 (現状 4 unit, コンテンツ密度十分)
- ✅ コンテンツ上部 (above-the-fold) には配置していない
- ✅ ads.txt 配置済 (`/public/ads.txt`)

### 計測のすすめ

差し替え後、AdSense 「レポート」タブで:
- **広告ユニットレポート** を 7 日間隔で確認
- 各 slot の RPM・Impressions・eCPM を比較
- 低パフォーマンスの slot は位置を変える / 削除を検討

## 削除したい場合

特定の slot を非表示にしたい場合、対応する `<aside class="ad-slot">` ブロックを
丸ごと削除して再デプロイ。Auto Ads は引き続き動作します。
