# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

MCP server in Node.js/TypeScript that converts neuroscience/academic knowledge into LinkedIn post drafts. No LinkedIn API integration — drafts are generated for manual copy-paste posting. Posts are in Japanese.

## Build & Run

```bash
npm install
npm run build        # tsc → dist/
npm start            # node dist/index.js (stdio transport)
npm run dev          # npx tsx src/index.ts (development)
```

## Architecture

3層構造: `tools/` (MCP登録) → `domain/` (ビジネスロジック) → `schemas/` (Zodバリデーション)

### MCP Tools (src/tools/)

Each tool file exports a `register<Name>(server: McpServer)` function, aggregated in `tools/index.ts`.

| Tool | Domain Module | Purpose |
|---|---|---|
| `generate_linkedin_draft` | `post-composer.ts` + `neuro-hedging.ts` | Academic knowledge → LinkedIn draft |
| `review_neuro_claims` | `claim-detector.ts` + `neuro-hedging.ts` | Detect medical assertions, exaggeration, missing citations → warnings + risk_score + safer_rewrite |
| `format_for_linkedin` | `linkedin-formatter.ts` | Add hook, line breaks, CTA, hashtags |
| `create_post_variants` | `variant-generator.ts` | Generate academic/bizdev/short_form/storytelling/data_driven variants |

### Domain Modules (src/domain/)

- **neuro-hedging.ts** — Hedging pattern dictionary + `applyHedging()`. Shared by generate and review tools.
- **claim-detector.ts** — RegExp-based claim detection with 4 categories (medical_assertion ×3.0, unreproducible ×2.5, exaggeration ×2.0, missing_citation ×1.5 weight). `calculateRiskScore()` outputs 0-100.
- **linkedin-formatter.ts** — Hook templates, line break optimization, CTA, hashtag selection.
- **post-composer.ts** — Template engine with audience/tone/objective/length configs.
- **variant-generator.ts** — Style-specific templates for 5 variant types.

### Key Design Decisions

- Tools are independent — no inter-tool calls. Composition (generate → review → format) is done by the LLM client.
- Adding a new tool: create schema file + tool file + add 1 line to `tools/index.ts`.
- `StdioServerTransport` for Claude Desktop/CLI. Future: swap to StreamableHTTP in `src/index.ts` only.

## Key Constraints

- No LinkedIn API / OAuth / auto-posting (extensibility preserved for future `publish_linkedin_post`)
- Neuroscience domain: avoid definitive medical claims; use hedging language (「示唆される」「可能性がある」)
- `claim-detector.ts` rules are RegExp-based arrays — add new patterns to the corresponding `*_RULES` array

## Claude Desktop Config

```json
{
  "mcpServers": {
    "linkedin-neuro-draft": {
      "command": "node",
      "args": ["<path-to-repo>/dist/index.js"]
    }
  }
}
```
