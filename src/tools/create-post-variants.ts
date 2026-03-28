import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { inputSchema } from "../schemas/create-post-variants.schema.js";
import { generateVariants } from "../domain/variant-generator.js";

export function registerCreatePostVariants(server: McpServer): void {
  server.tool(
    "create_post_variants",
    "同一テーマから複数の文体・長さの候補を返す（学術寄り、BizDev寄り、短文版など）。",
    inputSchema,
    async (args) => {
      const variants = generateVariants(
        args.topic,
        args.base_content,
        args.variant_styles
      );

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(variants, null, 2),
          },
        ],
      };
    }
  );
}
