# fifa-public-api-mcp

A small, read-only [MCP](https://modelcontextprotocol.io) server that wraps the **public,
undocumented** FIFA data API (`https://api.fifa.com/api/v3`) as a set of tools, so any MCP client
can query FIFA competitions, fixtures, results, live match data, and reference data without
re-deriving the endpoints.

No API key or auth is required. The server speaks **stdio** only.

## Requirements

- Node **18+** (uses built-in `fetch`).

## Install (no clone, no build)

The server is published to npm and runs via `npx`, so there is nothing to clone or compile.

Claude Code:

```bash
claude mcp add fifa -- npx -y fifa-public-api-mcp
```

Claude Desktop: add this to `mcpServers` in your config:

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

`npx` downloads and caches the package on first use; later runs are offline-fast. Requires Node 18+
on the PATH.

## Develop from source

```bash
git clone https://github.com/chrispickford/fifa-public-api-mcp.git
cd fifa-public-api-mcp
npm install
npm run build      # compiles TS to build/index.js (with shebang + executable bit)
```

Then point a client at the local build with an absolute path, e.g.
`claude mcp add fifa-dev -- node /absolute/path/to/build/index.js`.

## Tools

Every tool accepts two optional args: `raw` (default `false`; return FIFA's untouched payload) and
`language` (default `en`).

| Tool | Inputs | Returns |
|---|---|---|
| `search_competitions` | `name` | `[{idCompetition, name}]` |
| `get_competition` | `idCompetition` | `{idCompetition, name, owner, type}` |
| `list_seasons` | `idCompetition`, `count?` | `[{idSeason, name, startDate, endDate}]` |
| `get_season` | `idSeason` | `{idSeason, name, dates, memberAssociations[], hostTeams[], pictureUrls}` |
| `list_stages` | `idCompetition`, `idSeason` | `[{idStage, name}]` |
| `list_countries` |  | `[{idCountry, name}]` |
| `list_confederations` |  | `[{idConfederation, name}]` |
| `get_matches` | `idCompetition`, `idSeason`, `idStage?`, `idGroup?`, `count?` | `{matches:[…]}` (see pagination note) |
| `get_match_timeline` | `idCompetition`, `idSeason`, `idStage`, `idMatch` | `{idMatch, events:[…]}` |
| `get_live_match` | `idCompetition`, `idSeason`, `idStage`, `idMatch` | `{idMatch, status, score, home, away, officials, attendance, weather}` |
| `get_team` | `idTeam` | `{idTeam, name, abbreviation, country, city, stadium, idStadium, pictureUrl}` |
| `get_stadium` | `idStadium` | `{idStadium, name, city, capacity}` |

IDs are stable string handles chained between endpoints. A typical flow: `search_competitions` →
`list_seasons` → `list_stages` → `get_matches` → `get_match_timeline` / `get_live_match`.

### Example IDs (FIFA World Cup 2026)

`idCompetition=17`, `idSeason=285023`. These are examples for trying the tools, not defaults baked
into the server.

## Known limitations

- **No standings.** FIFA's `/calendar/standing` endpoint returns `200 null` for every competition
  and season tested, so no standings tool ships.
- **No real pagination on `get_matches`.** The API's continuation cursor is non-functional, so
  `count` is only a single-request hard limit. Set a large `count` (e.g. 500) for a full fixture
  list, and narrow with `idStage` / `idGroup`; there is no way to page past `count`.
- `get_live_match` returns data for any match state, not just live matches. A not-started match has
  an empty lineup and null score.

## Development

```bash
npm test           # vitest unit tests over the normalizers (no network, CI-safe)
npm run test:watch # watch mode
npm run smoke      # manual live end-to-end hit of every tool against the real API (needs network)
```

The unit tests run the pure normalizers (`src/shape.ts`) against real captured fixtures in
`test/fixtures/`. The smoke test is self-bootstrapping: it starts from the WC2026 example IDs and
derives the stage/match/team/stadium IDs it needs from live responses.

## Architecture

- `src/client.ts`: the only module that touches the network; encodes the base-API conventions
  (browser User-Agent, language default, 15s timeout) and throws a structured `FifaApiError`.
- `src/shape.ts`: pure response normalizers; no I/O, fully unit-tested.
- `src/tools.ts`: tool definitions (zod input schemas) and handlers wiring client → shape.
- `src/index.ts`: bootstrap: register tools, connect `StdioServerTransport`.
