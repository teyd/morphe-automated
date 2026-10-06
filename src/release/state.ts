import { Effect, Schema } from "effect";
import { GitHubError } from "../domain/errors.ts";
import type { Release } from "../domain/github.ts";
import { BuildManifest } from "../domain/manifest.ts";
import { GitHub } from "../services/GitHub.ts";
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
 * No previous release or no repository means "build". Unreadable state fails closed.
 */
export const previousBuild = Effect.fn("previousBuild")(function* (
  repo: string | undefined,
  slug: string,
) {
  if (repo === undefined) return undefined;
  const github = yield* GitHub;
  const releases = yield* github.releases(repo);

  const latest = releasesOf(releases, slug)[0];

  if (latest === undefined) return undefined;

  const asset = latest.assets.find((candidate) => candidate.name === MANIFEST_ASSET);

  if (asset === undefined) {
    return yield* new GitHubError({
      message: `${repo} ${latest.tag_name}: missing ${MANIFEST_ASSET}; refusing to assume inputs changed`,
    });
  }

  const json = yield* github.assetJson(repo, asset.id);

  return yield* Schema.decodeUnknownEffect(BuildManifest)(json).pipe(
    Effect.mapError(
      (error) => new GitHubError({ message: `${repo} ${latest.tag_name}: ${error.message}` }),
    ),
  );
});

export type PreviousBuildError = GitHubError;
