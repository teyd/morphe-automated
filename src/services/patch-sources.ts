import { Effect, Schema } from "effect";
import type { SourceConfig } from "../config/schema.ts";
import { GitHubError, NoEligibleRelease } from "../domain/errors.ts";
import type { Release } from "../domain/github.ts";
import { PatchesBundle, PatchesList, packageInfo, type PackageInfo } from "../domain/patches.ts";
import { stripV } from "../domain/version.ts";
import { selectRelease } from "../plan/select-release.ts";
import { GitHub } from "./GitHub.ts";

export interface ResolvedAsset {
  readonly repo: string;
  readonly tag: string;
  readonly assetName: string;
  readonly assetUrl: string;
  /** From the digest GitHub computed when the asset was uploaded. */
  readonly sha256: string;
  readonly signatureUrl: string | undefined;
  /** Tag of the next newer stable release, if any. Some repos record a release's metadata one release late. */
  readonly successorTag: string | undefined;
}

export interface ResolvedBundle extends ResolvedAsset {
  readonly source: string;
}

const isMpp = (name: string) => name.endsWith(".mpp");

const publishedAt = (release: Release) => Date.parse(release.published_at ?? "");

/** Newest stable release past the cooldown that has a matching asset, with its verified digest. */
export const resolveReleaseAsset = Effect.fn("resolveReleaseAsset")(function* (
  repo: string,
  cooldownHours: number,
  hasAsset: (name: string) => boolean,
  now: number,
) {
  const github = yield* GitHub;
  const releases = yield* github.releases(repo);

  const chosen = selectRelease(releases, {
    now,
    cooldownMs: cooldownHours * 3_600_000,
    hasAsset,
  });

  if (chosen === undefined) {
    return yield* new NoEligibleRelease({
      repo,
      message: `no stable release with a matching asset older than ${cooldownHours}h`,
    });
  }

  const asset = chosen.assets.find((candidate) => hasAsset(candidate.name));

  if (asset === undefined) {
    return yield* new NoEligibleRelease({ repo, message: "release has no matching asset" });
  }

  if (asset.digest === null || !asset.digest.startsWith("sha256:")) {
    return yield* new GitHubError({
      message: `${repo}@${chosen.tag_name}: GitHub reports no sha256 digest for ${asset.name}; refusing to use an unverifiable asset`,
    });
  }

  const successor = releases
    .filter(
      (release) =>
        !release.draft && !release.prerelease && publishedAt(release) > publishedAt(chosen),
    )
    .sort((a, b) => publishedAt(a) - publishedAt(b))[0];

  const signature = chosen.assets.find((candidate) => candidate.name === `${asset.name}.asc`);

  return {
    repo,
    tag: chosen.tag_name,
    assetName: asset.name,
    assetUrl: asset.browser_download_url,
    sha256: asset.digest.slice("sha256:".length).toLowerCase(),
    signatureUrl: signature?.browser_download_url,
    successorTag: successor?.tag_name,
  } satisfies ResolvedAsset;
});

export const resolveBundle = Effect.fn("resolveBundle")(function* (
  name: string,
  source: SourceConfig,
  now: number,
) {
  const asset = yield* resolveReleaseAsset(source.repo, source.cooldown_hours, isMpp, now);

  return { source: name, ...asset } satisfies ResolvedBundle;
});

const decodeJson = <S extends Schema.Constraint & { readonly DecodingServices: never }>(
  label: string,
  schema: S,
  text: string,
) =>
  Effect.try({
    try: () => JSON.parse(text) as unknown,
    catch: (cause) => new GitHubError({ message: `${label}: invalid JSON: ${String(cause)}` }),
  }).pipe(
    Effect.flatMap((json) => Schema.decodeUnknownEffect(schema)(json)),
    Effect.mapError((error) =>
      error instanceof GitHubError
        ? error
        : new GitHubError({ message: `${label}: ${error.message}` }),
    ),
  );

/**
 * What the bundle supports for one package, according to the source's `versions` strategy.
 * Returns undefined when the bundle does not patch that package at all.
 */
export const packageTargets = Effect.fn("packageTargets")(function* (
  bundle: ResolvedBundle,
  source: SourceConfig,
  packageName: string,
) {
  const github = yield* GitHub;

  if (source.versions === "patches-list") {
    const text = yield* github.rawFile(bundle.repo, bundle.tag, "patches-list.json");

    const list = yield* decodeJson(
      `${bundle.repo}@${bundle.tag} patches-list.json`,
      PatchesList,
      text,
    );

    if (list.version !== undefined && stripV(list.version) !== stripV(bundle.tag)) {
      return yield* new GitHubError({
        message: `${bundle.repo}: patches-list.json is for ${list.version}, expected ${bundle.tag}`,
      });
    }

    return packageInfo(list, packageName);
  }

  // `bundle` strategy: patches-bundle.json describes this release from the successor's tag (or main).
  const ref = bundle.successorTag ?? "main";
  const text = yield* github.rawFile(bundle.repo, ref, "patches-bundle.json");
  const info = yield* decodeJson(`${bundle.repo}@${ref} patches-bundle.json`, PatchesBundle, text);

  if (info.version === undefined || stripV(info.version) !== stripV(bundle.tag)) {
    return yield* new GitHubError({
      message: `${bundle.repo}: patches-bundle.json at ${ref} describes ${info.version ?? "an unknown release"}, not ${bundle.tag}. Pin "version" in the app config to bypass.`,
    });
  }

  if (info.app_version === undefined) return undefined;

  return {
    packageName,
    apkFileType: null,
    signatures: [],
    versions: [{ version: info.app_version, experimental: false }],
  } satisfies PackageInfo;
});
