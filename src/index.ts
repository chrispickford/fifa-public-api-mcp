#!/usr/bin/env node
/**
 * Bootstrap: create the MCP server, register every tool, connect over stdio.
 * Nothing here may write to stdout except the JSON-RPC stream (the transport owns it);
 * all diagnostics go to stderr.
 */
import { readFileSync } from "node:fs";
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

/** Read the version from package.json at runtime so the MCP handshake never drifts from the release. */
function packageVersion(): string {
  try {
    return JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")).version ?? "0.0.0";
  } catch {
    return "0.0.0";
  }
}

/** Server-level orientation the client surfaces to the model: domain, the ID-chaining workflow, and known gaps. */
const INSTRUCTIONS = [
  "Read-only access to the public FIFA data API. Covers FIFA football competitions (the men's and women's World Cups, club competitions and more), their seasons, stages, fixtures and results, and live match detail (lineups, officials, attendance, weather), plus teams, stadiums, and reference data (countries, confederations).",
  "",
  "Most lookups chain string IDs: search_competitions -> list_seasons -> list_stages -> get_matches -> get_match_timeline / get_live_match. get_team and get_stadium take IDs surfaced by those calls. Example: the 2026 FIFA World Cup is idCompetition=17, idSeason=285023.",
  "",
  "Gaps to know: no league tables or standings are available; get_matches has no working pagination (pass a large count for a full list); get_live_match returns data for any match state, so a not-yet-started match has an empty lineup and a null score.",
].join("\n");

const server = new McpServer(
  {
    name: "fifa-public-api-mcp",
    version: packageVersion(),
    title: "FIFA World Cup & Football Data",
    description: "Read-only MCP tools for FIFA competitions, fixtures, live scores, lineups, squads, and stadiums.",
    websiteUrl: "https://github.com/chrispickford/fifa-public-api-mcp",
  },
  { instructions: INSTRUCTIONS },
);

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
