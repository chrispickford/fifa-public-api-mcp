/**
 * Tool definitions (name, description, zod input schema) and handlers that wire `client` → `shape`.
 * Handlers return FIFA's untouched payload when `raw` is true; otherwise the trimmed shape. Any
 * `FifaApiError` is allowed to propagate so the MCP layer surfaces it as a tool error.
 */
import { z } from "zod";
import { fifaFetch, expectObject, type QueryParams } from "./client.js";
import * as shape from "./shape.js";

/** Fetch an endpoint that must return an object; turns FIFA's `200 null` into a clean error. */
const fetchObject = async (path: string, params: QueryParams, language: string) =>
  expectObject(await fifaFetch(path, params, language), path);

/** Encode an ID before interpolating it into a path, so a stray slash can't reshape the URL. */
const seg = (id: string) => encodeURIComponent(id);

/** Shared optional args every tool accepts. */
const raw = z.boolean().default(false).describe("Return FIFA's untouched payload instead of the trimmed shape");
const language = z.string().default("en").describe("Language code passed through to the API and used for name selection");

/** The two optional args mixed into every tool's schema; always present once zod applies defaults. */
type CommonArgs = { raw: boolean; language: string };

export type ToolDef = {
  name: string;
  description: string;
  inputSchema: z.ZodRawShape;
  handler: (args: Record<string, unknown>) => Promise<unknown>;
};

/** Build a handler: fetch once, return raw or the trimmed shape. */
function tool<S extends z.ZodRawShape>(
  name: string,
  description: string,
  schema: S,
  fetcher: (args: z.infer<z.ZodObject<S>> & CommonArgs) => Promise<unknown>,
  trim: (payload: any) => unknown,
): ToolDef {
  return {
    name,
    description,
    inputSchema: { ...schema, raw, language },
    handler: async (rawArgs) => {
      const args = rawArgs as z.infer<z.ZodObject<S>> & CommonArgs;
      const payload = await fetcher(args);
      return args.raw ? payload : trim(payload);
    },
  };
}

export const tools: ToolDef[] = [
  tool(
    "search_competitions",
    "Search FIFA competitions by name. Returns matching competitions with their string IdCompetition.",
    { name: z.string().describe("Competition name or fragment, e.g. 'world cup'") },
    (a) => fifaFetch("/competitions/search", { name: a.name }, a.language),
    (p) => shape.trimCompetitionList(p),
  ),
  tool(
    "get_competition",
    "Get a single competition by its string IdCompetition.",
    { idCompetition: z.string() },
    (a) => fetchObject(`/competitions/${seg(a.idCompetition)}`, {}, a.language),
    (p) => shape.trimCompetition(p),
  ),
  tool(
    "list_seasons",
    "List the seasons (editions) of a competition, newest first.",
    { idCompetition: z.string(), count: z.number().int().positive().optional() },
    (a) => fifaFetch("/seasons", { idCompetition: a.idCompetition, count: a.count }, a.language),
    (p) => shape.trimSeasonList(p),
  ),
  tool(
    "get_season",
    "Get a single season, including member associations, host teams and resolved picture URLs.",
    { idSeason: z.string() },
    (a) => fetchObject(`/seasons/${seg(a.idSeason)}`, {}, a.language),
    (p) => shape.trimSeason(p),
  ),
  tool(
    "list_stages",
    "List the stages of a season (e.g. First Stage, Round of 16, Final).",
    { idCompetition: z.string(), idSeason: z.string() },
    (a) => fifaFetch("/stages", { idCompetition: a.idCompetition, idSeason: a.idSeason }, a.language),
    (p) => shape.trimStageList(p),
  ),
  tool(
    "list_countries",
    "List FIFA country/association reference data.",
    {},
    (a) => fifaFetch("/countries", {}, a.language),
    (p) => shape.trimCountryList(p),
  ),
  tool(
    "list_confederations",
    "List the six FIFA confederations.",
    {},
    (a) => fifaFetch("/confederations", {}, a.language),
    (p) => shape.trimConfederationList(p),
  ),
  tool(
    "get_matches",
    "Get the fixture/result list for a season. Pagination is non-functional on this endpoint, so set a large `count` for a full list; narrow with idStage/idGroup. Returns no continuation token.",
    {
      idCompetition: z.string(),
      idSeason: z.string(),
      idStage: z.string().optional(),
      idGroup: z.string().optional(),
      count: z.number().int().positive().optional().describe("Max matches in one request (FIFA default 50). Set high for a full list."),
    },
    (a) =>
      fifaFetch(
        "/calendar/matches",
        { idCompetition: a.idCompetition, idSeason: a.idSeason, idStage: a.idStage, idGroup: a.idGroup, count: a.count },
        a.language,
      ),
    (p) => shape.trimMatches(p),
  ),
  tool(
    "get_match_timeline",
    "Get the event timeline (goals, cards, substitutions, etc.) for a single match.",
    { idCompetition: z.string(), idSeason: z.string(), idStage: z.string(), idMatch: z.string() },
    (a) => fetchObject(`/timelines/${seg(a.idCompetition)}/${seg(a.idSeason)}/${seg(a.idStage)}/${seg(a.idMatch)}`, {}, a.language),
    (p) => shape.trimTimeline(p),
  ),
  tool(
    "get_live_match",
    "Get live/detailed match data (lineups, officials, attendance, weather). Returns 200 for any match state; a not-started match has an empty lineup and null score.",
    { idCompetition: z.string(), idSeason: z.string(), idStage: z.string(), idMatch: z.string() },
    (a) => fetchObject(`/live/football/${seg(a.idCompetition)}/${seg(a.idSeason)}/${seg(a.idStage)}/${seg(a.idMatch)}`, {}, a.language),
    (p) => shape.trimLiveMatch(p),
  ),
  tool(
    "get_team",
    "Get a team by its string IdTeam. Surfaces idStadium so callers can chain to get_stadium.",
    { idTeam: z.string() },
    (a) => fetchObject(`/teams/${seg(a.idTeam)}`, {}, a.language),
    (p) => shape.trimTeam(p),
  ),
  tool(
    "get_stadium",
    "Get a stadium by its string IdStadium.",
    { idStadium: z.string() },
    (a) => fetchObject(`/stadiums/${seg(a.idStadium)}`, {}, a.language),
    (p) => shape.trimStadium(p),
  ),
];
