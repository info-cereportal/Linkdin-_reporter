import { z } from "zod";

export const inputSchema = {
  topic: z
    .string()
    .describe("投稿のメインテーマ（例: 「前頭前皮質と意思決定」）"),
  source_summary: z
    .string()
    .describe("元となる学術知見の要約（論文要旨、教科書の要点など）"),
  audience: z
    .enum([
      "researchers",
      "business_leaders",
      "general",
      "students",
      "hr_professionals",
    ])
    .describe("想定読者層"),
  tone: z
    .enum([
      "academic",
      "professional",
      "casual",
      "inspirational",
      "thought_leadership",
    ])
    .describe("文体トーン"),
  objective: z
    .enum(["educate", "engage", "promote", "network", "thought_leadership"])
    .describe("投稿の目的"),
  length: z
    .enum(["short", "medium", "long"])
    .describe(
      "投稿の長さ: short=〜500文字, medium=500-1000文字, long=1000-1500文字"
    ),
};
