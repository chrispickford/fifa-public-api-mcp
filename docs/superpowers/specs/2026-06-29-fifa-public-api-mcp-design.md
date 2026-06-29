# FIFA Public API MCP Server — Design

**Date:** 2026-06-29
**Status:** Approved (design); pending implementation plan

## Purpose

A lightweight, reusable MCP server that exposes the public (unofficial, undocumented)
`api.fifa.com/api/v3` data API as a small set of MCP tools, so other Claude sessions and projects
can query FIFA competitions, fixtures, results, live match data, and reference data without
re-deriving the endpoints each time.

The endpoint knowledge comes from a prior investigation: the API is public, needs **no auth/key**,
has **no OpenAPI/Swagger spec** (spec paths return Akamai `503` edge pages), returns verbose nested
JSON with localized-name arrays, uses **string IDs**, ISO **UTC** dates, and cursor pagination
(`count` + `ContinuationToken`). A browser `User-Agent` is required for reliable responses.

## Non-goals

- No write operations (the API is read-only anyway).
- No MCP resources or prompts — tools only (broadest client support, YAGNI).
- No HTTP/SSE transport — stdio only.
- No hardcoded competition/season IDs baked into tool logic (documented as examples only).
- No live-network unit tests in CI.

## Architecture

Thin stdio MCP server on the official `@modelcontextprotocol/sdk`. One HTTP client wraps the API;
a pure normalization layer trims responses; tool handlers wire the two together.

```
fifa-public-api-mcp/
  package.json          # type:module, bin -> build/index.js, scripts: build/start/test/smoke
  tsconfig.json
  src/
    client.ts           # fifaFetch(path, params): browser UA, language=en default,
                         #   15s AbortController timeout, structured errors, null handling
    shape.ts            # pure normalizers: pickName(localizedArray), trimMatch, trimTeam, ...
    tools.ts            # tool definitions (name, description, zod input schema) + handlers
    index.ts            # bootstrap: create server, register tools, connect StdioServerTransport
  test/
    fixtures/*.json     # real captured responses (fifa_matches/stages/team/timeline/live)
    shape.test.ts       # unit tests for normalizers against fixtures (no network)
  scripts/smoke.ts      # live end-to-end hit of each tool, run manually
  README.md             # tool list + how to add to Claude Code / Desktop
```

- **Runtime:** Node 18+ (built-in `fetch`).
- **Runtime deps:** `@modelcontextprotocol/sdk`, `zod`.
- **Dev deps:** `typescript`, `tsx`, `vitest`.
- **Transport:** `StdioServerTransport`. No auth.

## Base API conventions (encoded once in `client.ts`)

- Base URL: `https://api.fifa.com/api/v3`.
- Always send `User-Agent: Mozilla/5.0 (...)`.
- Default `language=en`; tools that support localization accept a `language` arg passed through.
- **Pagination (verified non-functional, 2026-06-29):** `/calendar/matches` returns
  `ContinuationToken` + `ContinuationHash` and accepts them back as the query params **`token` and
  `hash` (both required, or it 400s `"Both token and hash are required"`)** — but feeding the pair
  back returns the **same first page** and the **same token**, i.e. the cursor does not advance.
  Default page size is **50**; `count` works as a hard limit (`count=200` returned all 104 WC2026
  matches). **Conclusion:** do not surface a continuation token; instead pass `count` through
  (FIFA's default 50 when omitted, per the agreed pass-through behavior) and document that callers
  wanting a full fixture list should set a large `count`.
- Name fields are arrays of `{Locale, Description}`; flattened via `pickName(arr, lang)` which
  prefers `en`/`en-GB` and falls back to the first entry.
- IDs are strings and are stable handles chained between endpoints
  (`IdCompetition`, `IdSeason`, `IdStage`, `IdGroup`, `IdMatch`, `IdTeam`, `IdStadium`).
- `MatchStatus` is a numeric enum normalized to a string by `shape.ts`. **Verified mapping
  (2026-06-29):** `0 → "finished"`, `1 → "notStarted"`, `3 → "live"`. Other codes (postponed,
  abandoned, etc.) were not observed in the WC2026 data; map unknown codes to `"unknown:<n>"`
  rather than guessing.

## Tools

All tools accept two optional args:
- `raw: boolean` (default `false`); when true they return FIFA's untouched payload instead of the
  trimmed shape.
- `language: string` (default `en`); passed through to the API and used by `pickName` to select the
  localized name. Universal because every tool returns at least one localized name field.

### Discovery / reference

| Tool | Inputs | Trimmed output |
|---|---|---|
| `search_competitions` | `name` | `[{idCompetition, name}]` |
| `get_competition` | `idCompetition` | `{idCompetition, name, owner, type}` |
| `list_seasons` | `idCompetition`, `count?` | `[{idSeason, name, startDate, endDate}]` |
| `get_season` | `idSeason` | `{idSeason, name, startDate, endDate, memberAssociations[], hostTeams[], pictureUrls}`. **Verified:** the payload carries `PictureUrl`/`MascotPictureUrl`/`MatchBallPictureUrl` as **templates with literal `{format}`/`{size}` placeholders**; `format=sq,size=2` resolves to a real PNG while e.g. `3-4` returns an empty `200`. Normalizer resolves the placeholders to a documented default (`sq`/`4`) and returns `{picture, mascot, matchBall}`; `raw` exposes the untouched templates |
| `list_stages` | `idCompetition`, `idSeason` | `[{idStage, name}]` |
| `list_countries` | — | `[{idCountry, name}]` |
| `list_confederations` | — | `[{idConfederation, name}]` |

### Matches

| Tool | Inputs | Trimmed output |
|---|---|---|
| `get_matches` | `idCompetition`, `idSeason`, `idStage?`, `idGroup?`, `count?` (default 50; set high for a full list, see pagination note) | `{matches:[{matchNumber, stage, group, dateUtc, home, away, homeScore, awayScore, winner, status, placeholderA, placeholderB, idMatch, idStage}]}` (no continuation token: the cursor is non-functional. `home`/`away` are null for TBD knockouts; use `placeholderA`/`placeholderB` e.g. `"A1"`. `winner` is an `idTeam` string or null) |
| `get_match_timeline` | `idCompetition`, `idSeason`, `idStage`, `idMatch` | `{idMatch, events:[{minute, period, type, team, score, text}]}` |
| `get_live_match` | `idCompetition`, `idSeason`, `idStage`, `idMatch` | `{idMatch, status, dateUtc, score, home:{name, lineup:[{name, shirt, role}]}, away:{...}, officials, attendance, weather}` (verified: returns `200` for **any** match state, not just live; a not-started match has an empty `lineup` and null `score`/`attendance`, so the normalizer must tolerate empty/null fields rather than assume live data) |

> **`get_standings` was dropped (2026-06-29).** `/calendar/standing` returns `200 null` for every
> competition, season, and param/path variant tested (WC2026, Qatar 2022, and Premier League seasons
> back to 2021/22; with/without `idStage`/`idGroup`; `standing`/`standings`/`group` paths). The
> endpoint is non-functional, so there is no data to normalize or test against. See Known
> limitations.

### Lookups

| Tool | Inputs | Trimmed output |
|---|---|---|
| `get_team` | `idTeam` | `{idTeam, name, abbreviation, country, city, stadium, idStadium, pictureUrl}` (surface `idStadium` so callers can chain to `get_stadium`) |
| `get_stadium` | `idStadium` | `{idStadium, name, city, capacity}` |

## Error handling (centralized in `fifaFetch`)

`FifaApiError` carries `{ reason: "timeout" | "http" | "unexpected-null", path, status?, bodyExcerpt? }`
so the timeout case and the HTTP case share one type.

- **Timeout:** 15s via `AbortController` → `FifaApiError({reason:"timeout", path})`.
- **Non-2xx:** `FifaApiError({reason:"http", path, status, bodyExcerpt})` with the first ~200 chars of
  body (surfaces edge `503`s and the API's own `404 {"error":"Route not found"}`).
- **Null body:** endpoints that legitimately return literal `null` (e.g. `search_competitions` with
  no hits) are treated as a normal empty result (`[]`). An unexpected `null` from an endpoint that
  should return an object still throws `FifaApiError({reason:"unexpected-null", path})`.
- MCP handlers let `FifaApiError` propagate as a tool error (`isError: true`) with a readable
  message, so the calling model sees the failure rather than a silent empty.

## Testing

- **Unit (CI-safe, no network):** `vitest` over `shape.ts` normalizers, fed by real captured
  fixtures pulled during investigation. Every normalizer must have a fixture, so the capture set is
  one fixture per response shape: `competition.json` + `search.json`, `seasons.json` +
  `season.json`, `stages.json`, `matches.json`, `timeline.json`, `live.json`, `team.json`,
  `stadium.json`, `countries.json`, `confederations.json`. Asserts name flattening, score/winner
  mapping, timeline event extraction, lineup extraction, season member/host extraction, the
  legitimate-`null` empty case, and faithful `raw` passthrough.
- **Smoke (manual, live):** `scripts/smoke.ts` runs against the real API and prints one status line
  per tool. It is **self-bootstrapping**: it starts from the WC2026 example IDs (`idCompetition=17`,
  `idSeason=285023`), then derives every other ID it needs (`idStage`, `idMatch`, `idTeam`,
  `idStadium`) from the live `get_matches`/`get_team` responses rather than hardcoding them, so it
  keeps working as fixtures age. Not in CI (depends on FIFA uptime).
- The HTTP client is not unit-tested against live network; the pure normalizers carry the logic.

## Implementation notes (stdio gotchas)

- **Nothing may write to stdout except the JSON-RPC stream.** All logging, including Node 18's
  global-`fetch` `ExperimentalWarning`, must go to stderr. Use `console.error`, never
  `console.log`, anywhere in the server path.
- **`bin` entry:** `index.ts`'s first line is `#!/usr/bin/env node` (tsc preserves it). The built
  `build/index.js` needs the executable bit; set it in the build script (`chmod +x`). Authoring on
  Windows, keep that file **LF**, not CRLF, or the shebang breaks on POSIX hosts.

## Distribution / usage

- `npm run build` → `build/index.js` (with shebang, `bin` entry).
- Add to a client, e.g. Claude Code: `claude mcp add fifa -- node /abs/path/build/index.js`.
- README documents the tool list and the WC2026 example IDs.

## Known limitations

- **No standings.** `/calendar/standing` returns `200 null` universally (verified 2026-06-29 across
  WC2026, Qatar 2022, and Premier League seasons back to 2021/22; with/without `idStage`/`idGroup`;
  `standing`/`standings`/`group` path variants). The endpoint is non-functional, so no
  `get_standings` tool ships. If FIFA restores it, add the tool back with a fixture and a row
  normalizer.
- **No pagination beyond `count` on `/calendar/matches`.** The API's continuation cursor is
  non-functional (verified 2026-06-29 at page sizes 1, 2, 3, encoded and raw: `token`+`hash` are
  accepted but never advance, returning the same first page and the same tokens every call). `count`
  works only as a hard single-request limit. Consequence: `get_matches` can return at most `count`
  matches in one call and there is **no way to reach result N+1** except by raising `count`. For
  WC2026 (104 matches) a large `count` covers the whole tournament; for a long domestic-league
  season the match list could exceed any sane single-request `count`, and the only way to narrow the
  result set is the `idStage` / `idGroup` filters. If full traversal of a large competition becomes a
  real requirement, it cannot be solved client-side with this API as it stands.

## Reference: confirmed endpoints

Working (200, real data): `/competitions`, `/competitions/{id}`, `/competitions/search?name=`,
`/seasons?idCompetition=`, `/seasons/{id}`, `/stages?idCompetition=&idSeason=`,
`/calendar/matches?idCompetition=&idSeason=[&idStage=&idGroup=&count=]`,
`/timelines/{c}/{s}/{st}/{m}`,
`/live/football/{c}/{s}/{st}/{m}`, `/teams/{idTeam}`, `/stadiums/{idStadium}`, `/countries`,
`/confederations`, picture CDN `/picture/tournaments-{format}-{size}/{idSeason}`.

Not available / quirks: no OpenAPI spec; `/calendar/standing` returns `200 null` for every
competition/season/param tested (effectively dead, no `get_standings` tool); `/teams` list query → 405; `/statistics/...` and path-style
`/calendar/match/...` → 404; `/competitions/search?query=` returns null (use `name=`);
`/calendar/matches` continuation cursor is **non-functional** (params are `token`+`hash`, both
required, but feeding them back returns the same first page) — use a large `count` (default 50);
season picture URLs come back as `{format}`/`{size}` templates that must be resolved client-side
(`sq`/`2` works; some combos return an empty `200`).
