import { Effect, Schema } from "effect";
import type { GitHubError } from "../domain/errors.ts";
import type { Release } from "../domain/github.ts";
import { BuildManifest } from "../domain/manifest.ts";
import { GitHub } from "../services/GitHub.ts";
import { Web } from "../services/Web.ts";
import { MANIFEST_ASSET, tagBelongsTo } from "./naming.ts";

const publishedAt = (release: Release) => Date.parse(release.published_at ?? "");

/** This app's published releases, newest first. */
export const releasesOf = (releases: ReadonlyArray<Release>, slug: string): Release[] =>
  releases
    .filter((release) => !release.draft && tagBelongsTo(slug, release.tag_name))
    .sort((a, b) => publishedAt(b) - publishedAt(a));

/** Releases to delete so only the newest `keep` remain. */
export const releasesToPrune = (
  releases: ReadonlyArray<Release>,
  slug: string,
  keep: number,
): Release[] => releasesOf(releases, slug).slice(keep);

/**
 * What we built last time, read from the newest release's `build-manifest.json`.
 * No previous release, an unreadable manifest, or no repository to look in all mean "build".
 */
export const previousBuild = Effect.fn("previousBuild")(function* (
  repo: string | undefined,
  slug: string,
) {
  if (repo === undefined) return undefined;
  const github = yield* GitHub;
  const web = yield* Web;

  const releases = yield* github.releases(repo);
  const asset = releasesOf(releases, slug)
    .flatMap((release) => release.assets)
    .find((candidate) => candidate.name === MANIFEST_ASSET);
  if (asset === undefined) return undefined;

  const json = yield* web.json(asset.browser_download_url).pipe(Effect.option);
  if (json._tag === "None") return undefined;
  const manifest = yield* Schema.decodeUnknownEffect(BuildManifest)(json.value).pipe(Effect.option);
  return manifest._tag === "Some" ? manifest.value : undefined;
});

export type PreviousBuildError = GitHubError;
