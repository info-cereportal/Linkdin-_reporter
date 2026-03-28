Node.js / TypeScript で、Claude から使える MCP サーバを実装してください。

目的は、脳科学・学術系の知見を LinkedIn投稿用の Draft に変換することです。
ただし現段階では LinkedIn API 連携や自動投稿は実装せず、Draft を生成して人が確認し、手動でコピペ投稿する運用を前提にします。

必要なMCPツールは以下です。

1. generate_linkedin_draft
- topic, source_summary, audience, tone, objective, length を受け取り
- LinkedIn投稿用 Draft を生成する

2. review_neuro_claims
- 投稿文を受け取り
- 医療断定、誇張表現、再現性不明な主張、出典不足などを検出する
- warnings, risk_score, safer_rewrite を返す

3. format_for_linkedin
- 投稿文を LinkedIn向けに整形する
- 冒頭フック、改行、締め、ハッシュタグを調整する

4. create_post_variants
- 同一テーマから複数の文体・長さの候補を返す
- 学術寄り、BizDev寄り、短文版など

制約:
- linkedin.com/feed/ の画面操作やスクレイピング前提にしない
- LinkedIn API / OAuth / 自動投稿は今回のスコープ外
- 脳科学領域のため、医療効果の断定や誇張表現を避ける
- 不確実な内容は「示唆される」「可能性がある」などに言い換える
- 将来 publish_linkedin_post を足せる拡張性は残す

期待する成果物:
- 完成コード一式
- package.json / tsconfig.json
- src/index.ts
- 各ツール実装
- 実行方法
- Claude からの利用例