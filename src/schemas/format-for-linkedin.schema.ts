import { z } from "zod";

export const inputSchema = {
  post_text: z.string().describe("整形対象の投稿テキスト"),
  topic: z
    .string()
    .optional()
    .describe("投稿のテーマ（ハッシュタグ生成に使用）"),
  include_hashtags: z
    .boolean()
    .default(true)
    .describe("ハッシュタグを付加するか"),
  include_cta: z
    .boolean()
    .default(true)
    .describe("CTA（行動喚起）を末尾に付加するか"),
};
