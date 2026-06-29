/**
 * Manual, live end-to-end smoke test. Hits every tool against the real FIFA API and prints one
 * status line per tool. Self-bootstrapping: starts from the WC2026 example IDs and derives the
 * stage/match/team/stadium IDs it needs from live responses, so it keeps working as data ages.
 *
 * Run with: npm run smoke. Not part of CI (depends on FIFA uptime).
 */
import { tools, type ToolDef } from "../src/tools.js";

const ID_COMPETITION = "17";
const ID_SEASON = "285023"; // FIFA World Cup 2026

const byName = new Map<string, ToolDef>(tools.map((t) => [t.name, t]));
const get = (name: string) => {
  const t = byName.get(name);
  if (!t) throw new Error(`tool ${name} not registered`);
  return t;
};

let passed = 0;
let failed = 0;

async function run(name: string, args: Record<string, unknown>): Promise<any> {
  try {
    const result = await get(name).handler({ raw: false, language: "en", ...args });
    const summary = Array.isArray((result as any)?.matches)
      ? `${(result as any).matches.length} matches`
      : Array.isArray(result)
        ? `${result.length} items`
        : "ok";
    console.log(`  PASS  ${name.padEnd(20)} ${summary}`);
    passed++;
    return result;
  } catch (err) {
    console.log(`  FAIL  ${name.padEnd(20)} ${(err as Error).message}`);
    failed++;
    return undefined;
  }
}

async function main() {
  console.log(`Smoke test against WC2026 (idCompetition=${ID_COMPETITION}, idSeason=${ID_SEASON})\n`);

  await run("search_competitions", { name: "world cup" });
  await run("get_competition", { idCompetition: ID_COMPETITION });
  await run("list_seasons", { idCompetition: ID_COMPETITION, count: 5 });
  await run("get_season", { idSeason: ID_SEASON });
  await run("list_stages", { idCompetition: ID_COMPETITION, idSeason: ID_SEASON });
  await run("list_countries", {});
  await run("list_confederations", {});

  const matches = await run("get_matches", {
    idCompetition: ID_COMPETITION,
    idSeason: ID_SEASON,
    count: 200,
  });

  // Derive IDs for the match-scoped and lookup tools from the live fixture list.
  const withTeams = matches?.matches?.find((m: any) => m.home && m.idStage && m.idMatch);
  if (withTeams) {
    await run("get_match_timeline", {
      idCompetition: ID_COMPETITION,
      idSeason: ID_SEASON,
      idStage: withTeams.idStage,
      idMatch: withTeams.idMatch,
    });
    const live = await run("get_live_match", {
      idCompetition: ID_COMPETITION,
      idSeason: ID_SEASON,
      idStage: withTeams.idStage,
      idMatch: withTeams.idMatch,
    });
    // Derive a team id from the raw live payload, then a stadium id from that team.
    const rawLive = await get("get_live_match").handler({
      raw: true,
      language: "en",
      idCompetition: ID_COMPETITION,
      idSeason: ID_SEASON,
      idStage: withTeams.idStage,
      idMatch: withTeams.idMatch,
    });
    const idTeam = (rawLive as any)?.HomeTeam?.IdTeam;
    const idStadium = (rawLive as any)?.Stadium?.IdStadium;
    if (idTeam) await run("get_team", { idTeam });
    else console.log("  SKIP  get_team             (no idTeam derivable)");
    if (idStadium) await run("get_stadium", { idStadium });
    else console.log("  SKIP  get_stadium          (no idStadium derivable)");
  } else {
    console.log("  SKIP  match-scoped tools   (no match with teams found)");
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

main();
