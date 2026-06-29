import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import {
  pickName,
  resolvePicture,
  matchStatus,
  trimCompetition,
  trimCompetitionList,
  trimSeasonList,
  trimSeason,
  trimStageList,
  trimCountryList,
  trimConfederationList,
  trimMatches,
  trimTimeline,
  trimLiveMatch,
  trimTeam,
  trimStadium,
} from "../src/shape.js";

const fx = (name: string) =>
  JSON.parse(readFileSync(fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url)), "utf-8"));

describe("pickName", () => {
  it("flattens a localized name array, preferring en/en-GB", () => {
    expect(pickName([{ Locale: "fr-FR", Description: "Mexique" }, { Locale: "en-GB", Description: "Mexico" }])).toBe("Mexico");
  });

  it("returns a plain string name unchanged (countries use bare strings)", () => {
    expect(pickName("Afghanistan")).toBe("Afghanistan");
  });

  it("falls back to the first entry when no en locale is present", () => {
    expect(pickName([{ Locale: "fr-FR", Description: "Mexique" }])).toBe("Mexique");
  });

  it("returns undefined for null/empty input", () => {
    expect(pickName(null)).toBeUndefined();
    expect(pickName([])).toBeUndefined();
  });
});

describe("resolvePicture", () => {
  it("substitutes {format}/{size} placeholders with documented defaults", () => {
    expect(resolvePicture("https://api.fifa.com/api/v3/picture/tournaments-{format}-{size}/285023"))
      .toBe("https://api.fifa.com/api/v3/picture/tournaments-sq-4/285023");
  });

  it("returns undefined for a missing template", () => {
    expect(resolvePicture(null)).toBeUndefined();
  });
});

describe("matchStatus", () => {
  it("maps verified numeric codes to strings", () => {
    expect(matchStatus(0)).toBe("finished");
    expect(matchStatus(1)).toBe("notStarted");
    expect(matchStatus(3)).toBe("live");
  });

  it("labels unknown codes rather than guessing", () => {
    expect(matchStatus(12)).toBe("unknown:12");
  });
});

describe("trimCompetition", () => {
  it("extracts id, flattened name, owner and type", () => {
    const c = trimCompetition(fx("competition.json"));
    expect(c.idCompetition).toBe("17");
    expect(c.name).toContain("FIFA World Cup");
    expect(c.owner).toBe("FIFA");
    expect(c.type).toBe(3);
  });
});

describe("trimCompetitionList (search)", () => {
  it("maps each result to {idCompetition, name}", () => {
    const list = trimCompetitionList(fx("search.json"));
    expect(Array.isArray(list)).toBe(true);
    expect(list[0]).toHaveProperty("idCompetition");
    expect(typeof list[0].name).toBe("string");
  });

  it("treats a null body (no hits) as an empty list", () => {
    expect(trimCompetitionList(null)).toEqual([]);
  });
});

describe("trimSeasonList", () => {
  it("maps each season to id, name and dates", () => {
    const list = trimSeasonList(fx("seasons.json"));
    expect(list.length).toBeGreaterThan(0);
    expect(list[0]).toMatchObject({
      idSeason: expect.any(String),
      name: expect.any(String),
      startDate: expect.any(String),
      endDate: expect.any(String),
    });
  });
});

describe("trimSeason", () => {
  it("extracts member associations, host teams and resolved picture urls", () => {
    const s = trimSeason(fx("season.json"));
    expect(s.idSeason).toBe("285023");
    expect(s.name).toContain("FIFA World Cup 2026");
    expect(s.memberAssociations).toContain("USA");
    expect(s.hostTeams).toEqual(["43921", "43899", "43911"]);
    expect(s.pictureUrls.picture).toBe("https://api.fifa.com/api/v3/picture/tournaments-sq-4/285023");
    expect(s.pictureUrls.mascot).toContain("tournaments-mascot-sq-4");
    expect(s.pictureUrls.matchBall).toContain("tournaments-matchball-sq-4");
  });
});

describe("trimStageList", () => {
  it("maps each stage to {idStage, name}", () => {
    const list = trimStageList(fx("stages.json"));
    expect(list).toContainEqual({ idStage: "289273", name: "First Stage" });
  });
});

describe("trimCountryList", () => {
  it("maps each country to {idCountry, name} with bare-string names", () => {
    const list = trimCountryList(fx("countries.json"));
    expect(list[0]).toMatchObject({ idCountry: expect.any(String), name: "Afghanistan" });
  });
});

describe("trimConfederationList", () => {
  it("maps each confederation to {idConfederation, name} flattening localized names", () => {
    const list = trimConfederationList(fx("confederations.json"));
    expect(list[0].idConfederation).toBeTruthy();
    expect(list[0].name).toContain("Confédération Africaine");
  });
});

describe("trimMatches", () => {
  const out = trimMatches(fx("matches.json"));

  it("returns a matches array and no continuation token (cursor is dead)", () => {
    expect(Array.isArray(out.matches)).toBe(true);
    expect(out).not.toHaveProperty("continuationToken");
  });

  it("maps a finished match with team names, scores, winner and status", () => {
    const finished = out.matches.find((m) => m.status === "finished")!;
    expect(finished.home).toBe("Mexico");
    expect(finished.homeScore).toBe(2);
    expect(finished.awayScore).toBe(0);
    expect(finished.winner).toBe("43911");
    expect(finished.idStage).toBe("289273");
    expect(finished.stage).toBe("First Stage");
    expect(finished.group).toBe("Group A");
  });

  it("represents a TBD knockout match with null teams and placeholder codes", () => {
    const tbd = out.matches.find((m) => m.home === null)!;
    expect(tbd).toBeDefined();
    expect(tbd.away).toBeNull();
    expect(tbd.placeholderA).toBeTruthy();
    expect(tbd.placeholderB).toBeTruthy();
  });

  it("maps a not-started match with null scores and winner", () => {
    const ns = out.matches.find((m) => m.status === "notStarted" && m.home)!;
    expect(ns.homeScore).toBeNull();
    expect(ns.winner).toBeNull();
  });
});

describe("trimTimeline", () => {
  it("extracts match id and normalized events", () => {
    const t = trimTimeline(fx("timeline.json"));
    expect(t.idMatch).toBe("400021443");
    expect(t.events.length).toBe(12);
    const first = t.events[0];
    expect(first).toMatchObject({
      minute: "0'",
      period: 2,
      type: "Coin Toss",
      team: "43911",
      score: "0-0",
    });
    expect(first.text).toContain("coin toss");
  });
});

describe("trimLiveMatch", () => {
  const l = trimLiveMatch(fx("live.json"));

  it("maps status, date, score and per-side lineups", () => {
    expect(l.idMatch).toBe("400021443");
    expect(l.status).toBe("finished");
    expect(l.dateUtc).toBe("2026-06-11T19:00:00Z");
    expect(l.score).toEqual({ home: 2, away: 0 });
    expect(l.home.name).toBe("Mexico");
    expect(l.away.name).toBe("South Africa");
  });

  it("normalizes lineup players to {name, shirt, role}", () => {
    const p = l.home.lineup[0];
    expect(p).toMatchObject({ name: "Raul RANGEL", shirt: 1, role: 0 });
  });

  it("extracts officials, attendance and weather", () => {
    expect(l.attendance).toBe("80824"); // FIFA returns attendance as a string; passed through as-is
    expect(l.officials[0]).toMatchObject({ name: "Wilton SAMPAIO", type: "Referee" });
    expect(l).toHaveProperty("weather");
  });
});

describe("trimTeam", () => {
  it("maps a national team, tolerating a null stadium", () => {
    const t = trimTeam(fx("team.json"));
    expect(t).toMatchObject({
      idTeam: "43911",
      name: "Mexico",
      abbreviation: "MEX",
      country: "MEX",
      city: "DISTRITO FEDERAL",
      stadium: null,
      idStadium: null,
    });
    expect(t.pictureUrl).toContain("flags-sq-4/MEX");
  });
});

describe("trimStadium", () => {
  it("maps id, flattened name, city and capacity (tolerating null capacity)", () => {
    const s = trimStadium(fx("stadium.json"));
    expect(s).toMatchObject({
      idStadium: "400222084",
      name: "Mexico City Stadium",
      city: "Mexico City",
      capacity: null,
    });
  });
});
