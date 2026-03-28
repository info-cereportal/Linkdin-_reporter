import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerGenerateLinkedinDraft } from "./generate-linkedin-draft.js";
import { registerReviewNeuroClaims } from "./review-neuro-claims.js";
import { registerFormatForLinkedin } from "./format-for-linkedin.js";
import { registerCreatePostVariants } from "./create-post-variants.js";

export function registerAllTools(server: McpServer): void {
  registerGenerateLinkedinDraft(server);
  registerReviewNeuroClaims(server);
  registerFormatForLinkedin(server);
  registerCreatePostVariants(server);
}
