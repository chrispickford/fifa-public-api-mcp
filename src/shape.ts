/**
 * Pure normalizers for FIFA API payloads. No I/O, no SDK imports: this is where the
 * response-trimming logic lives and what the unit tests exercise against real fixtures.
 */

type LocalizedName = { Locale?: string; Description?: string };
/** FIFA name fields are usually arrays of {Locale, Description}, but some (countries) are bare strings. */
type NameField = string | LocalizedName[] | null | undefined;

const PICTURE_FORMAT = "sq";
const PICTURE_SIZE = "4";

/** Flatten a localized name array to a single string, preferring en/en-GB; pass bare strings through. */
export function pickName(value: NameField, lang = "en"): string | undefined {
  if (value == null) return undefined;
  if (typeof value === "string") return value;
  if (!Array.isArray(value) || value.length === 0) return undefined;
  const want = lang.toLowerCase();
  const match = value.find((n) => (n.Locale ?? "").toLowerCase().startsWith(want));
  return (match ?? value[0]).Description;
}

/** Resolve FIFA's {format}/{size} picture-URL templates to a concrete URL. */
export function resolvePicture(template: string | null | undefined): string | undefined {
  if (!template) return undefined;
  return template.replace("{format}", PICTURE_FORMAT).replace("{size}", PICTURE_SIZE);
}

/** Map the numeric MatchStatus enum to a string (verified: 0=finished, 1=notStarted, 3=live). */
export function matchStatus(code: number | null | undefined): string {
  switch (code) {
    case 0:
      return "finished";
    case 1:
      return "notStarted";
    case 3:
      return "live";
    default:
      return `unknown:${code}`;
  }
}

const results = (raw: any): any[] => (raw && Array.isArray(raw.Results) ? raw.Results : []);

export function trimCompetition(raw: any) {
  return {
    idCompetition: raw.IdCompetition,
    name: pickName(raw.Name),
    owner: raw.IdOwner,
    type: raw.CompetitionType,
  };
}

export function trimCompetitionList(raw: any) {
  // /competitions/search returns literal null when there are no hits.
  if (raw == null) return [];
  return results(raw).map((c) => ({ idCompetition: c.IdCompetition, name: pickName(c.Name) }));
}

export function trimSeasonList(raw: any) {
  return results(raw).map((s) => ({
    idSeason: s.IdSeason,
    name: pickName(s.Name),
    startDate: s.StartDate,
    endDate: s.EndDate,
  }));
}

export function trimSeason(raw: any) {
  return {
    idSeason: raw.IdSeason,
    name: pickName(raw.Name),
    startDate: raw.StartDate,
    endDate: raw.EndDate,
    memberAssociations: raw.IdMemberAssociation ?? [],
    hostTeams: (raw.HostTeams ?? []).map((h: any) => h.IdTeam),
    pictureUrls: {
      picture: resolvePicture(raw.PictureUrl),
      mascot: resolvePicture(raw.MascotPictureUrl),
      matchBall: resolvePicture(raw.MatchBallPictureUrl),
    },
  };
}

export function trimStageList(raw: any) {
  return results(raw).map((s) => ({ idStage: s.IdStage, name: pickName(s.Name) }));
}

export function trimCountryList(raw: any) {
  return results(raw).map((c) => ({ idCountry: c.IdCountry, name: pickName(c.Name) }));
}

export function trimConfederationList(raw: any) {
  return results(raw).map((c) => ({ idConfederation: c.IdConfederation, name: pickName(c.Name) }));
}

export function trimMatches(raw: any) {
  return {
    matches: results(raw).map((m) => ({
      matchNumber: m.MatchNumber,
      stage: pickName(m.StageName),
      group: pickName(m.GroupName),
      dateUtc: m.Date,
      home: pickName(m.Home?.TeamName) ?? null,
      away: pickName(m.Away?.TeamName) ?? null,
      homeScore: m.HomeTeamScore ?? null,
      awayScore: m.AwayTeamScore ?? null,
      winner: m.Winner ?? null,
      status: matchStatus(m.MatchStatus),
      placeholderA: m.PlaceHolderA ?? null,
      placeholderB: m.PlaceHolderB ?? null,
      idMatch: m.IdMatch,
      idStage: m.IdStage,
    })),
  };
}

export function trimTimeline(raw: any) {
  const events = Array.isArray(raw.Event) ? raw.Event : [];
  return {
    idMatch: raw.IdMatch,
    events: events.map((e: any) => ({
      minute: e.MatchMinute,
      period: e.Period,
      type: pickName(e.TypeLocalized),
      team: e.IdTeam,
      score: `${e.HomeGoals}-${e.AwayGoals}`,
      text: pickName(e.EventDescription),
    })),
  };
}

const trimSide = (side: any) => ({
  name: pickName(side?.TeamName) ?? null,
  lineup: (side?.Players ?? []).map((p: any) => ({
    name: pickName(p.PlayerName),
    shirt: p.ShirtNumber,
    role: p.Position,
  })),
});

export function trimLiveMatch(raw: any) {
  return {
    idMatch: raw.IdMatch,
    status: matchStatus(raw.MatchStatus),
    dateUtc: raw.Date,
    score: { home: raw.HomeTeam?.Score ?? null, away: raw.AwayTeam?.Score ?? null },
    home: trimSide(raw.HomeTeam),
    away: trimSide(raw.AwayTeam),
    officials: (raw.Officials ?? []).map((o: any) => ({
      name: pickName(o.Name),
      type: pickName(o.TypeLocalized),
    })),
    attendance: raw.Attendance ?? null,
    weather: raw.Weather ?? null,
  };
}

export function trimTeam(raw: any) {
  return {
    idTeam: raw.IdTeam,
    name: pickName(raw.Name),
    abbreviation: raw.Abbreviation,
    country: raw.IdCountry,
    city: raw.City ?? null,
    stadium: pickName(raw.Stadium?.Name) ?? null,
    idStadium: raw.Stadium?.IdStadium ?? null,
    pictureUrl: resolvePicture(raw.PictureUrl),
  };
}

export function trimStadium(raw: any) {
  return {
    idStadium: raw.IdStadium,
    name: pickName(raw.Name),
    city: pickName(raw.CityName) ?? null,
    capacity: raw.Capacity ?? null,
  };
}
