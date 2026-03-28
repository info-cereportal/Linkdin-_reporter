import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { inputSchema } from "../schemas/review-neuro-claims.schema.js";
import {
  detectClaims,
  calculateRiskScore,
  generateSaferRewrite,
} from "../domain/claim-detector.js";

export function registerReviewNeuroClaims(server: McpServer): void {
  server.tool(
    "review_neuro_claims",
    "投稿文を受け取り、医療断定・誇張表現・再現性不明な主張・出典不足などを検出する。warnings, risk_score, safer_rewriteを返す。",
    inputSchema,
    async (args) => {
      const warnings = detectClaims(args.post_text);
      const riskScore = calculateRiskScore(warnings);
      const saferRewrite = generateSaferRewrite(args.post_text);

      const result = {
        warnings: warnings.map(
          (w) => `[${w.category}] ${w.message}（該当箇所: 「${w.matchedText}」）→ ${w.suggestion}`
        ),
        risk_score: riskScore,
        safer_rewrite: saferRewrite,
      };

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    }
  );
}
