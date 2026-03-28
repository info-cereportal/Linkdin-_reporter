import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createServer } from "./server.js";
import { registerAllTools } from "./tools/index.js";

async function main(): Promise<void> {
  const server = createServer();
  registerAllTools(server);

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("LinkedIn Neuro Draft MCP Server is running on stdio");
}

main().catch((error) => {
  console.error("Server error:", error);
  process.exit(1);
});
