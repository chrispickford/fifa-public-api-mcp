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

const server = new McpServer({ name: "fifa-public-api-mcp", version: "0.1.0" });

for (const def of tools) {
  server.registerTool(
    def.name,
    { description: def.description, inputSchema: def.inputSchema },
    async (args: any) => {
      try {
        const result = await def.handler(args);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      } catch (err) {
        const message = err instanceof FifaApiError ? err.message : `Unexpected error: ${(err as Error).message}`;
        return { content: [{ type: "text", text: message }], isError: true };
      }
    },
  );
}

const transport = new StdioServerTransport();
await server.connect(transport);
console.error("fifa-public-api-mcp running on stdio");
