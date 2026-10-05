import { Effect, Schema } from "effect";
import type { SourceConfig } from "../config/schema.ts";
import { GitHubError, NoEligibleRelease } from "../domain/errors.ts";
import type { Release } from "../domain/github.ts";
import { PatchesBundle, PatchesList, packageInfo, type PackageInfo } from "../domain/patches.ts";
import { stripV } from "../domain/version.ts";
import { selectRelease } from "../plan/select-release.ts";
import { GitHub } from "./GitHub.ts";

export interface ResolvedBundle {
  readonly source: string;
  readonly repo: string;
  readonly tag: string;
  readonly mppName: string;
  readonly mppUrl: string;
  /** From the digest GitHub computed when the asset was uploaded. */
  readonly sha256: string;
  readonly signatureUrl: string | undefined;
  /** Tag of the next newer stable release, if any. Some repos record a release's metadata one release late. */
  readonly successorTag: string | undefined;
}

const isMpp = (name: string) => name.endsWith(".mpp");

const publishedAt = (release: Release) => Date.parse(release.published_at ?? "");

export const resolveBundle = Effect.fn("resolveBundle")(function* (
  name: string,
  source: SourceConfig,
  now: number,
) {
  const github = yield* GitHub;
  const releases = yield* github.releases(source.repo);

  const chosen = selectRelease(releases, {
    now,
    cooldownMs: source.cooldown_hours * 3_600_000,
    hasAsset: isMpp,
  });
  if (chosen === undefined) {
    return yield* new NoEligibleRelease({
      repo: source.repo,
      message: `no stable release with an .mpp asset older than ${source.cooldown_hours}h`,
    });
  }

  const mpp = chosen.assets.find((asset) => isMpp(asset.name));
  if (mpp === undefined) {
    return yield* new NoEligibleRelease({
      repo: source.repo,
      message: "release has no .mpp asset",
    });
  }
  if (mpp.digest === null || !mpp.digest.startsWith("sha256:")) {
    return yield* new GitHubError({
      message: `${source.repo}@${chosen.tag_name}: GitHub reports no sha256 digest for ${mpp.name}; refusing to use an unverifiable asset`,
    });
  }

  const successor = releases
    .filter(
      (release) =>
        !release.draft && !release.prerelease && publishedAt(release) > publishedAt(chosen),
    )
    .sort((a, b) => publishedAt(a) - publishedAt(b))[0];

  const signature = chosen.assets.find((asset) => asset.name === `${mpp.name}.asc`);

  return {
    source: name,
    repo: source.repo,
    tag: chosen.tag_name,
    mppName: mpp.name,
    mppUrl: mpp.browser_download_url,
    sha256: mpp.digest.slice("sha256:".length).toLowerCase(),
    signatureUrl: signature?.browser_download_url,
    successorTag: successor?.tag_name,
  } satisfies ResolvedBundle;
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
