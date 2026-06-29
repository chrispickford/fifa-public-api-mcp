/**
 * The only module that talks to the network. `fifaFetch` encodes every base-API convention
 * once (browser UA, language default, timeout, structured errors, null handling) so the tools
 * stay clean.
 */

const BASE_URL = "https://api.fifa.com/api/v3";
const TIMEOUT_MS = 15_000;
// A browser User-Agent is required for reliable responses from the FIFA edge.
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36";

export type FifaErrorReason = "timeout" | "http" | "unexpected-null" | "network";

export class FifaApiError extends Error {
  readonly reason: FifaErrorReason;
  readonly path: string;
  readonly status?: number;
  readonly bodyExcerpt?: string;

  constructor(args: { reason: FifaErrorReason; path: string; status?: number; bodyExcerpt?: string }) {
    const detail = args.status ? ` (status ${args.status})` : "";
    super(`FIFA API ${args.reason}${detail} for ${args.path}${args.bodyExcerpt ? `: ${args.bodyExcerpt}` : ""}`);
    this.name = "FifaApiError";
    this.reason = args.reason;
    this.path = args.path;
    this.status = args.status;
    this.bodyExcerpt = args.bodyExcerpt;
  }
}

export type QueryParams = Record<string, string | number | undefined>;

/**
 * Fetch a path under the FIFA API base, applying conventions and returning the parsed JSON.
 * A literal `null` body is returned as `null` (callers decide whether that's a legitimate empty
 * result or an error); non-2xx and timeouts throw `FifaApiError`.
 */
export async function fifaFetch(path: string, params: QueryParams = {}, language = "en"): Promise<unknown> {
  const url = new URL(BASE_URL + path);
  if (!url.searchParams.has("language")) url.searchParams.set("language", language);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) url.searchParams.set(key, String(value));
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(url, {
      headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
      signal: controller.signal,
    });
  } catch (err) {
    if (controller.signal.aborted) throw new FifaApiError({ reason: "timeout", path });
    throw new FifaApiError({ reason: "network", path, bodyExcerpt: (err as Error).message });
  } finally {
    clearTimeout(timer);
  }

  const text = await response.text();
  if (!response.ok) {
    throw new FifaApiError({ reason: "http", path, status: response.status, bodyExcerpt: text.slice(0, 200) });
  }

  // Some endpoints legitimately return literal `null`; hand it back for the caller to interpret.
  return text.trim().length === 0 ? null : JSON.parse(text);
}

/**
 * Assert a payload from an object-returning endpoint is non-null. FIFA serves `200 null` (not a
 * 404) for a non-existent single resource; that is an error, not an empty result, so it throws
 * rather than letting a normalizer crash on null.
 */
export function expectObject<T>(payload: T, path: string): NonNullable<T> {
  if (payload == null) throw new FifaApiError({ reason: "unexpected-null", path });
  return payload as NonNullable<T>;
}
