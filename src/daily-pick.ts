/**
 * 論文選定 CLI — Claude エージェント用
 *
 * 論文を1件選定し、title / abstract / link をJSON出力する。
 * 文面生成はClaude側で行う。
 */

import { selectDailyPaper } from "./daily/runner.js";

selectDailyPaper()
  .then((result) => {
    if (!result.success || !result.paper) {
      console.error(result.error);
      process.exit(1);
    }
    // stdout にJSON出力（Claudeが読み取る）
    console.log(JSON.stringify(result.paper, null, 2));
  })
  .catch((error) => {
    console.error("Error:", error);
    process.exit(1);
  });
