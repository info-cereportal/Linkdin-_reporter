/**
 * デイリー LinkedIn ドラフト生成 — CLI エントリポイント
 *
 * 使い方:
 *   npm run daily                     # 実行
 *   RSS_FEEDS=url1,url2 npm run daily # カスタム RSS フィード
 *   WEBHOOK_URL=https://... npm run daily # Webhook 通知あり
 */

import { runDailyPipeline } from "./daily/runner.js";

runDailyPipeline()
  .then((result) => {
    if (!result.success) {
      console.error(`\n❌ 失敗: ${result.error}`);
      process.exit(1);
    }
    process.exit(0);
  })
  .catch((error) => {
    console.error("予期しないエラー:", error);
    process.exit(1);
  });
