import { Config, Context, Effect, Layer, Option, Redacted, Result, Schema } from "effect";
import { GitHubError, type WebError } from "../domain/errors.ts";
import { Release, Releases } from "../domain/github.ts";
import { Web } from "./Web.ts";

export interface GitHubClient {
  /** Most recent releases first, as returned by the API. */
  readonly releases: (repo: string) => Effect.Effect<ReadonlyArray<Release>, GitHubError>;
  /** One release by its exact tag, or undefined when the repository has no such release. */
  readonly releaseByTag: (
    repo: string,
    tag: string,
  ) => Effect.Effect<Release | undefined, GitHubError>;
  /** Contents of a file in a repo at a tag or branch. */
  readonly rawFile: (repo: string, ref: string, path: string) => Effect.Effect<string, GitHubError>;
  /**
   * A release asset's JSON contents, read through the API so it also works for private repositories,
   * whose `browser_download_url` rejects unauthenticated requests.
   */
  readonly assetJson: (repo: string, assetId: number) => Effect.Effect<Schema.Json, GitHubError>;
}

const fromWeb = (error: WebError) =>
  new GitHubError({
    message: `${error.url}: ${error.message}`,
    status: error.status,
  });

export class GitHub extends Context.Service<GitHub, GitHubClient>()("morphe-automated/GitHub") {
  static readonly layer = Layer.effect(
    GitHub,
    Effect.gen(function* () {
      const web = yield* Web;
      const token = yield* Config.option(Config.Redacted("GITHUB_TOKEN")).pipe(Effect.orDie);

      // The token only ever goes to the API host, never to download or redirect targets.
      const baseHeaders = {
        accept: "application/vnd.github+json",
        "x-github-api-version": "2022-11-28",
      };

      const apiHeaders = Option.match(token, {
        onNone: () => baseHeaders,
        onSome: (value) => ({ ...baseHeaders, authorization: `Bearer ${Redacted.value(value)}` }),
      });

      const releases = Effect.fn("GitHub.releases")(function* (repo: string) {
        const json = yield* web
          .json(`https://api.github.com/repos/${repo}/releases?per_page=50`, apiHeaders)
          .pipe(Effect.mapError(fromWeb));

        return yield* Schema.decodeUnknownEffect(Releases)(json).pipe(
          Effect.mapError((error) => new GitHubError({ message: `${repo}: ${error.message}` })),
        );
      });

      const releaseByTag = Effect.fn("GitHub.releaseByTag")(function* (repo: string, tag: string) {
        const result = yield* Effect.result(
          web.json(
            `https://api.github.com/repos/${repo}/releases/tags/${encodeURIComponent(tag)}`,
            apiHeaders,
          ),
        );

        if (Result.isFailure(result)) {
          if (result.failure.status === 404) return undefined;

          return yield* fromWeb(result.failure);
        }

        return yield* Schema.decodeUnknownEffect(Release)(result.success).pipe(
          Effect.mapError(
            (error) => new GitHubError({ message: `${repo}@${tag}: ${error.message}` }),
          ),
        );
      });

      const rawFile = Effect.fn("GitHub.rawFile")(function* (
        repo: string,
        ref: string,
        path: string,
      ) {
        return yield* web
          .text(`https://raw.githubusercontent.com/${repo}/${ref}/${path}`)
          .pipe(Effect.mapError(fromWeb));
      });

      const assetJson = Effect.fn("GitHub.assetJson")(function* (repo: string, assetId: number) {
        return yield* web
          .json(`https://api.github.com/repos/${repo}/releases/assets/${assetId}`, {
            ...apiHeaders,
            accept: "application/octet-stream",
          })
          .pipe(Effect.mapError(fromWeb));
      });

      return GitHub.of({ releases, releaseByTag, rawFile, assetJson });
    }),
  );
}
