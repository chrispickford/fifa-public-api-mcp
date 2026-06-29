# fifa-public-api-mcp

⚽ **Live FIFA World Cup & football data for your AI assistant**: an [MCP](https://modelcontextprotocol.io) server for competitions, fixtures, live scores, lineups, squads, and stadiums.

[![npm version](https://img.shields.io/npm/v/fifa-public-api-mcp?color=cb3837&logo=npm)](https://www.npmjs.com/package/fifa-public-api-mcp)
[![CI](https://github.com/chrispickford/fifa-public-api-mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/chrispickford/fifa-public-api-mcp/actions/workflows/ci.yml)
[![license: MIT](https://img.shields.io/badge/license-MIT-blue)](./LICENSE)
[![Node 22+](https://img.shields.io/badge/Node-22%2B-339933?logo=node.js&logoColor=white)](https://nodejs.org)
[![MCP](https://img.shields.io/badge/MCP-compatible-7c3aed)](https://modelcontextprotocol.io)

Give Claude, or any [Model Context Protocol](https://modelcontextprotocol.io) client, instant read-only access to the public FIFA data API for football (soccer): every FIFA competition (the men's and women's **World Cups**, club competitions, and more), their fixtures and results, live match detail, and reference data. No API key, no auth, no rediscovering FIFA's undocumented endpoints. Just install and ask.

## ⚡ What you can ask

Once it's connected, ask your assistant things like:

- *"Who's hosting the 2026 FIFA World Cup, and which stadiums are being used?"*
- *"List the knockout-stage fixtures for the FIFA Women's World Cup."*
- *"What was the final score, lineup, and attendance for that match?"*
- *"Which six confederations does FIFA recognise, and how many member associations are there?"*

Your assistant picks the right tools and chains the FIFA IDs for you behind the scenes.

## ✨ Features

- ⚽ **12 read-only tools** spanning competitions, seasons, stages, fixtures, results, live matches, teams, stadiums, and reference data.
- 🔑 **No API key or sign-up:** wraps the public FIFA API directly.
- 🌍 **Localised output** via a `language` arg, plus a `raw` escape hatch that returns the untouched FIFA payload.
- 📦 **One-line install** with `npx`: nothing to clone or build.
- 🛡️ **Typed and tested:** unit-tested response normalizers and provenance-signed npm releases.

## 🚀 Install

The server is published to npm and runs via `npx`, so there is nothing to clone or compile.

**Claude Code:**

```bash
claude mcp add fifa -- npx -y fifa-public-api-mcp
```

**Claude Desktop:** add this to `mcpServers` in your config:

```json
{
  "mcpServers": {
    "fifa": {
      "command": "npx",
      "args": ["-y", "fifa-public-api-mcp"]
    }
  }
}
```

`npx` downloads and caches the package on first use; later runs are offline-fast. Requires Node 22+ on the PATH.

## 🧰 Tools

Every tool also accepts two optional args: `raw` (default `false`; return FIFA's untouched payload) and `language` (default `en`).

| Tool | Inputs | Returns |
|---|---|---|
| `search_competitions` | `name` | `[{idCompetition, name}]` |
| `get_competition` | `idCompetition` | `{idCompetition, name, owner, type}` |
| `list_seasons` | `idCompetition`, `count?` | `[{idSeason, name, startDate, endDate}]` |
| `get_season` | `idSeason` | `{idSeason, name, dates, memberAssociations[], hostTeams[], pictureUrls}` |
| `list_stages` | `idCompetition`, `idSeason` | `[{idStage, name}]` |
| `list_countries` | none | `[{idCountry, name}]` |
| `list_confederations` | none | `[{idConfederation, name}]` |
| `get_matches` | `idCompetition`, `idSeason`, `idStage?`, `idGroup?`, `count?` | `{matches:[…]}` (see pagination note) |
| `get_match_timeline` | `idCompetition`, `idSeason`, `idStage`, `idMatch` | `{idMatch, events:[…]}` |
| `get_live_match` | `idCompetition`, `idSeason`, `idStage`, `idMatch` | `{idMatch, status, score, home, away, officials, attendance, weather}` |
| `get_team` | `idTeam` | `{idTeam, name, abbreviation, country, city, stadium, idStadium, pictureUrl}` |
| `get_stadium` | `idStadium` | `{idStadium, name, city, capacity}` |

IDs are stable string handles chained between endpoints. A typical flow: `search_competitions` → `list_seasons` → `list_stages` → `get_matches` → `get_match_timeline` / `get_live_match`.

**Example IDs (FIFA World Cup 2026):** `idCompetition=17`, `idSeason=285023`. These are examples for trying the tools, not defaults baked into the server.

## ⚠️ Known limitations

- **No standings.** FIFA's `/calendar/standing` endpoint returns `200 null` for every competition and season tested, so no standings tool ships.
- **No real pagination on `get_matches`.** The API's continuation cursor is non-functional, so `count` is only a single-request hard limit. Set a large `count` (e.g. 500) for a full fixture list, and narrow with `idStage` / `idGroup`; there is no way to page past `count`.
- `get_live_match` returns data for any match state, not just live matches. A not-started match has an empty lineup and a null score.

## 🛠️ Develop from source

```bash
git clone https://github.com/chrispickford/fifa-public-api-mcp.git
cd fifa-public-api-mcp
npm install
npm run build      # compiles TS to build/index.js (with shebang + executable bit)
npm test           # vitest unit tests over the normalizers (no network, CI-safe)
npm run smoke      # manual live end-to-end hit of every tool against the real API (needs network)
```

Point a client at the local build with an absolute path, e.g. `claude mcp add fifa-dev -- node /absolute/path/to/build/index.js`.

The code is four small, single-purpose layers: `src/client.ts` (the only module that touches the network; encodes the FIFA base-API conventions and throws a structured `FifaApiError`), `src/shape.ts` (pure, unit-tested response normalizers), `src/tools.ts` (tool definitions and handlers wiring client → shape), and `src/index.ts` (bootstrap: register tools, connect `StdioServerTransport`).

## License

MIT © Chris Pickford
