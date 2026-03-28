import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { inputSchema } from "../schemas/generate-linkedin-draft.schema.js";
import { composeDraft } from "../domain/post-composer.js";

export function registerGenerateLinkedinDraft(server: McpServer): void {
  server.tool(
    "generate_linkedin_draft",
    "脳科学・学術系の知見からLinkedIn投稿ドラフトを生成する。topic, source_summary, audience, tone, objective, lengthを指定してください。",
    inputSchema,
    async (args) => {
      const draft = composeDraft({
        topic: args.topic,
        source_summary: args.source_summary,
        audience: args.audience,
        tone: args.tone,
        objective: args.objective,
        length: args.length,
      });

      return {
        content: [{ type: "text", text: draft }],
      };
    }
  );
}
