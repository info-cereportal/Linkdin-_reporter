import { z } from "zod";

export const inputSchema = {
  topic: z.string().describe("投稿テーマ"),
  base_content: z
    .string()
    .describe("バリアント生成の元となるコンテンツ"),
  variant_styles: z
    .array(
      z.enum([
        "academic",
        "bizdev",
        "short_form",
        "storytelling",
        "data_driven",
      ])
    )
    .default(["academic", "bizdev", "short_form"])
    .describe("生成する文体バリアントの種類"),
};
