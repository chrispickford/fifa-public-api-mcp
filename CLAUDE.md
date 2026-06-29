# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project status

**Implemented and verified** (2026-06-29): all four `src/` layers, 28 passing unit tests, and a
live smoke test that hits all 12 tools. The approved design spec at
`docs/superpowers/specs/2026-06-29-fifa-public-api-mcp-design.md` remains the source of truth for
*why* things are the way they are (and records the live-API investigation). The notes below
summarize the cross-file decisions so you don't have to re-derive them.

## What this is

A thin **stdio MCP server** (built on `@modelcontextprotocol/sdk` + `zod`) that wraps the
**public, undocumented** FIFA data API (`https://api.fifa.com/api/v3`) as a small set of read-only
tools, so any Claude session can query competitions, fixtures, results, live matches, and reference
data without rediscovering the endpoints.

## Commands

- `npm run build` — compile TS to `build/index.js` (adds shebang + exec bit; `bin` entry).
- `npm start` — run the built server over stdio.
- `npm test` — `vitest` unit tests over the normalizers (no network; CI-safe).
- `npm run smoke` — `scripts/smoke.ts`, a **manual live** end-to-end hit of every tool against the
  real API. **Self-bootstrapping:** starts from WC2026 IDs (`idCompetition=17`, `idSeason=285023`)
  and derives stage/match/team/stadium IDs from live responses. Not in CI; depends on FIFA uptime.
- Run a single test: `npx vitest run test/shape.test.ts -t "<test name>"`.
- Install into a client: `claude mcp add fifa -- node /abs/path/build/index.js`.

Runtime is **Node 18+** (relies on built-in `fetch`). Package is `type: module`.

## Architecture (the big picture)

Three layers, each in its own file, kept deliberately separate:

- `src/client.ts` — the **only** place that talks to the network. `fifaFetch(path, params, lang)`
  encodes every base-API convention once (see below), enforces a 15s `AbortController` timeout, and
  throws a structured `FifaApiError({reason, path, status?, bodyExcerpt?})`. Also exports
  `expectObject(payload, path)`, a pure guard that turns FIFA's `200 null` (served for a missing
  single resource instead of a 404) into a `FifaApiError({reason:"unexpected-null"})`. No tool talks
  to `fetch` directly.
- `src/shape.ts` — **pure** normalizers (`pickName`, `resolvePicture`, `matchStatus`, `trimMatches`,
  `trimTeam`, ...). No I/O. This is where the real logic lives and where the unit tests point; keep
  it free of network/SDK imports so it stays testable against fixtures.
- `src/tools.ts` — the 12 tool definitions (name, description, zod input schema) + handlers that
  wire `client` → `shape`. List/search tools use `fifaFetch`; single-object and match-scoped tools
  use the local `fetchObject` helper (`fifaFetch` + `expectObject`). Handlers let `FifaApiError`
  propagate; `index.ts` converts it to an MCP tool error (`isError: true`) so the calling model sees
  failures instead of silent empties.
- `src/index.ts` — bootstrap only: create server, register tools, connect `StdioServerTransport`.
  Logs only to **stderr** (stdout is the JSON-RPC stream).

### Base-API conventions (centralized in `client.ts`)

The FIFA API is quirky; these are encoded once so tools stay clean:

- A browser `User-Agent` (`Mozilla/5.0 ...`) is **required** for reliable responses.
- Default `language=en`; localization-capable tools pass a `language` arg through.
- **String IDs** are stable handles chained across endpoints: `IdCompetition`, `IdSeason`,
  `IdStage`, `IdGroup`, `IdMatch`, `IdTeam`, `IdStadium`.
- Name fields are arrays of `{Locale, Description}`; flatten via `pickName(arr, lang)` (prefers
  `en`/`en-GB`, falls back to first entry).
- **Pagination on `/calendar/matches` is non-functional** (verified 2026-06-29): the cursor params
  are `token`+`hash` (both required) but feeding them back returns the same first page. Don't
  surface a continuation token; pass `count` through (FIFA default 50) and tell callers to set a
  large `count` for a full fixture list.
- `MatchStatus` enum → string: `0=finished`, `1=notStarted`, `3=live`; unknown codes →
  `"unknown:<n>"`.
- Dates are ISO **UTC**.

### Conventions every tool follows

- Every tool accepts optional `raw: boolean` (default `false`, return FIFA's untouched payload) and
  `language: string` (default `en`, drives `pickName`). Unit tests assert faithful `raw` passthrough.
- Some endpoints **legitimately return literal `null`** (e.g. `search_competitions` with no hits) —
  the list normalizers treat these as a normal empty result (`[]`). An unexpected `null` from an
  endpoint that should return an object throws via `expectObject` (reason `"unexpected-null"`);
  that's why object tools go through `fetchObject` and list tools don't.

## Endpoint reference (confirmed during investigation)

Working: `/competitions`, `/competitions/{id}`, `/competitions/search?name=`,
`/seasons?idCompetition=`, `/seasons/{id}`, `/stages?idCompetition=&idSeason=`,
`/calendar/matches?idCompetition=&idSeason=[&idStage=&idGroup=&count=]`,
`/timelines/{c}/{s}/{st}/{m}`,
`/live/football/{c}/{s}/{st}/{m}`, `/teams/{idTeam}`, `/stadiums/{idStadium}`, `/countries`,
`/confederations`, picture CDN `/picture/tournaments-{format}-{size}/{idSeason}`.

Quirks / dead ends (don't waste time re-testing): no OpenAPI/Swagger spec (spec paths return Akamai
`503`); `/calendar/standing` is dead (returns `200 null` for every competition/season/param, so no
standings tool ships); `/teams` list query → 405; `/statistics/...` and path-style `/calendar/match/...` → 404;
use `search?name=` not `?query=` (the latter returns null); `/calendar/matches` continuation cursor
doesn't advance (use a large `count`); `/live/football/...` returns `200` for any match state (a
not-started match has empty lineup/null score); season/team picture URLs are `{format}`/`{size}`
templates needing client-side resolution (`resolvePicture` defaults to `sq`/`4`; size is a 1-6
resolution tier, all valid).

## Non-goals (don't add these)

No write operations, no MCP resources/prompts (tools only), no HTTP/SSE transport (stdio only),
no competition/season IDs hardcoded into tool logic (examples in docs only), no live-network tests
in CI.
