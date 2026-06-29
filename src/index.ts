#!/usr/bin/env node
/**
 * Bootstrap: create the MCP server, register every tool, connect over stdio.
 * Nothing here may write to stdout except the JSON-RPC stream (the transport owns it);
 * all diagnostics go to stderr.
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { FifaApiError } from "./client.js";
import { tools } from "./tools.js";

/** Extract a human-readable message from an unknown throwable without assuming it's an Error. */
function errorMessage(err: unknown): string {
  if (err instanceof FifaApiError) return err.message;
  if (err instanceof Error) return `Unexpected error: ${err.message}`;
  return `Unexpected error: ${String(err)}`;
}

const server = new McpServer({ name: "fifa-public-api-mcp", version: "0.1.0" });

for (const def of tools) {
  server.registerTool(
    def.name,
    { description: def.description, inputSchema: def.inputSchema },
    async (args: Record<string, unknown>) => {
      try {
        const result = await def.handler(args);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      } catch (err) {
        return { content: [{ type: "text", text: errorMessage(err) }], isError: true };
      }
    },
  );
}

const transport = new StdioServerTransport();
server
  .connect(transport)
  .then(() => console.error("fifa-public-api-mcp running on stdio"))
  .catch((err) => {
    console.error(`fifa-public-api-mcp failed to start: ${errorMessage(err)}`);
    process.exit(1);
  });
