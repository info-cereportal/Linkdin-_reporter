import { z } from "zod";

export const inputSchema = {
  post_text: z.string().describe("レビュー対象の投稿テキスト"),
};

export const outputSchema = {
  warnings: z
    .array(z.string())
    .describe("検出された問題点のリスト（医療断定、誇張、出典不足など）"),
  risk_score: z
    .number()
    .min(0)
    .max(100)
    .describe("リスクスコア（0=安全, 100=高リスク）"),
  safer_rewrite: z
    .string()
    .describe("より安全な表現に書き換えた代替テキスト"),
};
