import { spawnSync } from "node:child_process";
import { Config, Effect, Option, Schema } from "effect";
import { isChallenge } from "../apk/apkmirror-parse.ts";

const Scrape = Schema.Struct({
  statusCode: Schema.optional(Schema.Number),
  html: Schema.optional(Schema.String),
});

/** HTML from a trawl `/scrape` body, or undefined when it is missing or still a challenge page. */
export const htmlFromScrape = (body: Schema.Json): string | undefined => {
  const parsed = Schema.decodeUnknownOption(Scrape)(body);

  if (Option.isNone(parsed)) return undefined;

  const { html, statusCode } = parsed.value;

  if (statusCode !== 200 || html === undefined || html.length === 0 || isChallenge(html)) {
    return undefined;
  }

  return html;
};

/**
 * Render `url` in trawl's browser (`skipHttp`), the same fallback other builders use when APKMirror
 * serves a Cloudflare challenge. Undefined when `TRAWL_URL` is unset or the render did not yield a page.
 */
export const renderPage = Effect.fn("trawl.renderPage")(function* (url: string) {
  const base = yield* Config.option(Config.String("TRAWL_URL")).pipe(Effect.orDie);

  if (Option.isNone(base)) return undefined;

  const stdout = yield* Effect.try({
    try: () =>
      spawnSync(
        "curl",
        [
          "--silent",
          "--show-error",
          "--max-time",
          "150",
          "-X",
          "POST",
          `${base.value.replace(/\/$/, "")}/scrape`,
          "-H",
          "content-type: application/json",
          "-d",
          JSON.stringify({ url, skipHttp: true, maxTimeout: 120000 }),
        ],
        { encoding: "utf8", timeout: 160000 },
      ).stdout,
    catch: () => new Error("trawl request failed"),
  }).pipe(Effect.orElseSucceed(() => ""));

  const json = yield* Effect.try({
    try: (): Schema.Json => JSON.parse(stdout),
    catch: () => new Error("trawl returned non-JSON"),
  }).pipe(Effect.option);

  return Option.match(json, {
    onNone: () => undefined,
    onSome: htmlFromScrape,
  });
});
