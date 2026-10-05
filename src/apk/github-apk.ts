import { Effect } from "effect";
import { ApkNotFound } from "../domain/errors.ts";
import type { ReleaseAsset } from "../domain/github.ts";
import type { GitHubClient } from "../services/GitHub.ts";
import type { WebClient } from "../services/Web.ts";
import type { VariantKind } from "./apkmirror-parse.ts";
import type { ApkFile, ApkSource } from "./source.ts";

const NAME = "github";

const extension = (name: string): "apk" | "apkm" | "xapk" | undefined => {
  if (name.endsWith(".xapk")) return "xapk";

  if (name.endsWith(".apkm")) return "apkm";

  if (name.endsWith(".apk")) return "apk";

  return undefined;
};

/** Asset whose name contains the wanted version. An architecture-specific file wins over a universal one. */
export const pickStockAsset = (
  assets: ReadonlyArray<ReleaseAsset>,
  version: string,
  arch: string,
): ReleaseAsset | undefined => {
  const matches = assets.filter(
    (asset) => asset.name.includes(version) && extension(asset.name) !== undefined,
  );

  return matches.find((asset) => asset.name.includes(arch)) ?? matches[0];
};

const notFound = (message: string) => new ApkNotFound({ source: NAME, message });

/** Stock APK hosted as a GitHub release asset. Used when the store pages are behind a challenge. */
export const githubApkSource = (github: GitHubClient, web: WebClient): ApkSource => ({
  name: NAME,
  fetch: (request) =>
    Effect.gen(function* () {
      const repo = request.download.github_repo;
      const tag = request.download.github_tag;

      if (repo === undefined || tag === undefined) {
        return yield* notFound("no github stock release configured");
      }

      const releases = yield* github
        .releases(repo)
        .pipe(Effect.mapError((error) => notFound(error.message)));

      const found = releases.find((item) => item.tag_name === tag);

      if (found === undefined) return yield* notFound(`${repo} has no release ${tag}`);

      const asset = pickStockAsset(found.assets, request.version, request.arch);

      if (asset === undefined) {
        return yield* notFound(`${repo}@${tag} has no file for ${request.version}`);
      }

      if (asset.digest === null || !asset.digest.startsWith("sha256:")) {
        return yield* notFound(`${asset.name} has no sha256 digest`);
      }

      const ext = extension(asset.name) ?? "apk";
      const destination = `${request.destination}.${ext === "apk" ? "apk" : "apkm"}`;

      const expected = asset.digest.slice("sha256:".length).toLowerCase();

      const downloaded = yield* web
        .download(asset.browser_download_url, destination)
        .pipe(Effect.mapError((error) => notFound(error.message)));

      if (downloaded.sha256 !== expected) {
        return yield* notFound(
          `${asset.name}: sha256 ${downloaded.sha256} does not match ${expected}`,
        );
      }

      return {
        source: NAME,
        kind: (ext === "apk" ? "apk" : "bundle") satisfies VariantKind,
        path: destination,
        sha256: downloaded.sha256,
        size: downloaded.size,
      } satisfies ApkFile;
    }),
});
