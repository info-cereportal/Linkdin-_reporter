import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { inputSchema } from "../schemas/format-for-linkedin.schema.js";
import { formatForLinkedin } from "../domain/linkedin-formatter.js";

export function registerFormatForLinkedin(server: McpServer): void {
  server.tool(
    "format_for_linkedin",
    "投稿文をLinkedIn向けに整形する。冒頭フック、改行、締めのCTA、ハッシュタグを調整する。",
    inputSchema,
    async (args) => {
      const formatted = formatForLinkedin(
        args.post_text,
        args.topic ?? "脳科学",
        {
          includeHashtags: args.include_hashtags,
          includeCta: args.include_cta,
        }
      );

      return {
        content: [{ type: "text", text: formatted }],
      };
    }
  );
}
