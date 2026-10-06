import { Effect } from "effect";
import {
  ApkNotFound,
  SourceBlocked,
  VerificationError,
  type GitHubError,
  type WebError,
} from "../domain/errors.ts";
import { stripV } from "../domain/version.ts";
import type { GitHubClient } from "../services/GitHub.ts";
import { looksLikeZip, type WebClient } from "../services/Web.ts";
import type { ApkFile, ApkRequest, ApkSource } from "./source.ts";

const NAME = "github";

const notFound = (message: string) => new ApkNotFound({ source: NAME, message });

const fromGitHub = (error: GitHubError) =>
  new SourceBlocked({ source: NAME, message: error.message });

const fromWeb = (error: WebError) =>
  error.status === 404
    ? notFound(`${error.url}: not found`)
    : new SourceBlocked({ source: NAME, message: `${error.url}: ${error.message}` });

/** The tag forms a release might use for a bare version: `v1.2.3` and `1.2.3`. */
export const tagCandidates = (version: string): ReadonlyArray<string> => {
  const bare = stripV(version);

  return version.startsWith("v") ? [version, bare] : [`v${bare}`, bare];
};

/**
 * The publisher's own GitHub release, for apps whose vendor ships a stock APK there (Brave, for one).
 * The version comes from the patch list; the tag is `v<version>` or `<version>`. The asset is picked
 * by architecture and must carry a GitHub-computed digest, which the download is checked against.
 */
export const githubSource = (github: GitHubClient, web: WebClient): ApkSource => {
  const findRelease = Effect.fn("github.findRelease")(function* (repo: string, version: string) {
    for (const tag of tagCandidates(version)) {
      const release = yield* github.releaseByTag(repo, tag).pipe(Effect.mapError(fromGitHub));

      if (release !== undefined) return release;
    }

    return undefined;
  });

  const fetch = Effect.fn("github.fetch")(function* (request: ApkRequest) {
    const repo = request.download.github;

    if (repo === undefined) return yield* notFound("no github repository configured for this app");

    const assetName = request.download.github_assets?.[request.arch];

    if (assetName === undefined) {
      return yield* notFound(`no github asset configured for ${request.arch}`);
    }

    const release = yield* findRelease(repo, request.version);

    if (release === undefined) {
      return yield* notFound(
        `${repo} has no release tagged ${tagCandidates(request.version).join(" or ")}`,
      );
    }

    const asset = release.assets.find((candidate) => candidate.name === assetName);

    if (asset === undefined) {
      const seen = release.assets.map((candidate) => candidate.name).join(", ") || "none";

      return yield* notFound(`${release.tag_name} has no asset ${assetName} (found: ${seen})`);
    }

    if (asset.digest === null || !asset.digest.startsWith("sha256:")) {
      return yield* notFound(
        `${release.tag_name}/${asset.name}: GitHub reports no sha256 digest; refusing to use an unverifiable asset`,
      );
    }

    const destination = `${request.destination}.apk`;

    const downloaded = yield* web
      .download(asset.browser_download_url, destination)
      .pipe(Effect.mapError(fromWeb));

    if (!looksLikeZip(downloaded.head)) {
      return yield* new SourceBlocked({
        source: NAME,
        message: "the download was not an APK archive",
      });
    }

    const expected = asset.digest.slice("sha256:".length).toLowerCase();

    if (downloaded.sha256 !== expected) {
      return yield* new VerificationError({
        kind: "digest",
        message: `${asset.name}: sha256 ${downloaded.sha256} does not match GitHub's ${expected}`,
      });
    }

    return {
      source: NAME,
      kind: "apk",
      path: destination,
      sha256: downloaded.sha256,
      size: downloaded.size,
    } satisfies ApkFile;
  });

  return { name: NAME, fetch };
};
