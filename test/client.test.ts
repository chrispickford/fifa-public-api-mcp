import { describe, it, expect } from "vitest";
import { FifaApiError, expectObject } from "../src/client.js";

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
