import { describe, it, expect, vi, afterEach } from "vitest";
import { FifaApiError, expectObject, fifaFetch } from "../src/client.js";

/** Stub global fetch with a single canned Response and capture the requested URL. */
function stubFetch(body: string, init: { status?: number } = {}) {
  const calls: { url: string; headers: Record<string, string> }[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: URL, opts: RequestInit) => {
      calls.push({ url: url.toString(), headers: opts.headers as Record<string, string> });
      return new Response(body, { status: init.status ?? 200 });
    }),
  );
  return calls;
}

afterEach(() => vi.unstubAllGlobals());

describe("expectObject", () => {
  it("returns the payload unchanged when it is an object", () => {
    const obj = { IdCompetition: "17" };
    expect(expectObject(obj, "/competitions/17")).toBe(obj);
  });

  it("throws unexpected-null when an object endpoint returns literal null", () => {
    // FIFA returns 200 null for a non-existent single resource rather than a 404.
    try {
      expectObject(null, "/competitions/does-not-exist");
      throw new Error("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(FifaApiError);
      expect((err as FifaApiError).reason).toBe("unexpected-null");
      expect((err as FifaApiError).path).toBe("/competitions/does-not-exist");
    }
  });
});

describe("fifaFetch", () => {
  it("parses a JSON body and applies the default language + browser User-Agent", async () => {
    const calls = stubFetch(JSON.stringify({ IdCompetition: "17" }));
    const result = await fifaFetch("/competitions/17");
    expect(result).toEqual({ IdCompetition: "17" });
    expect(calls[0].url).toContain("language=en");
    expect(calls[0].headers["User-Agent"]).toMatch(/Mozilla/);
  });

  it("passes through an explicit language and skips undefined params", async () => {
    const calls = stubFetch("[]");
    await fifaFetch("/stages", { idCompetition: "17", idSeason: undefined }, "fr");
    expect(calls[0].url).toContain("language=fr");
    expect(calls[0].url).toContain("idCompetition=17");
    expect(calls[0].url).not.toContain("idSeason");
  });

  it("returns null for an empty body (a legitimate FIFA empty result)", async () => {
    stubFetch("");
    expect(await fifaFetch("/competitions/search")).toBeNull();
  });

  it("throws an http FifaApiError carrying the status for a non-2xx response", async () => {
    stubFetch("Service Unavailable", { status: 503 });
    await expect(fifaFetch("/spec")).rejects.toMatchObject({
      reason: "http",
      status: 503,
    });
  });

  it("throws invalid-json when a 2xx body is not JSON (e.g. an Akamai HTML interstitial)", async () => {
    stubFetch("<html>blocked</html>");
    await expect(fifaFetch("/competitions")).rejects.toMatchObject({ reason: "invalid-json" });
  });
});
