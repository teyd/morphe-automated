import { Effect } from "effect";
import { stripV } from "../domain/version.ts";
import { resolveReleaseAsset } from "./patch-sources.ts";

export const CLI_REPO = "MorpheApp/morphe-desktop";

const CLI_COOLDOWN_HOURS = 6;

const isCliJar = (name: string) => /^morphe-desktop-.*-all\.jar$/.test(name);

/** Newest stable Morphe CLI release, with the digest GitHub computed for the jar. */
export const resolveCli = Effect.fn("resolveCli")(function* (now: number) {
  const asset = yield* resolveReleaseAsset(CLI_REPO, CLI_COOLDOWN_HOURS, isCliJar, now);

  return { ...asset, version: stripV(asset.tag) };
});

export type ResolvedCli = Effect.Success<ReturnType<typeof resolveCli>>;
