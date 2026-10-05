import type { Release } from "../domain/github.ts";

export interface SelectOptions {
  readonly now: number;
  /** A release must be at least this old (ms) before we use it. */
  readonly cooldownMs: number;
  /** Which asset the release must carry to be usable (e.g. the `.mpp` file). */
  readonly hasAsset: (name: string) => boolean;
}

const publishedAt = (release: Release): number =>
  release.published_at === null ? Number.NaN : Date.parse(release.published_at);

/**
 * Newest stable release that has been public for at least `cooldownMs`.
 * Drafts, prereleases and releases without the wanted asset are ignored.
 */
export const selectRelease = (
  releases: ReadonlyArray<Release>,
  options: SelectOptions,
): Release | undefined =>
  releases
    .filter(
      (release) =>
        !release.draft &&
        !release.prerelease &&
        release.assets.some((asset) => options.hasAsset(asset.name)) &&
        options.now - publishedAt(release) >= options.cooldownMs,
    )
    .sort((a, b) => publishedAt(b) - publishedAt(a))[0];
