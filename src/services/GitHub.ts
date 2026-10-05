import { Config, Context, Effect, Layer, Option, Redacted, Schema } from "effect";
import { GitHubError, type WebError } from "../domain/errors.ts";
import { Releases, type Release } from "../domain/github.ts";
import { Web } from "./Web.ts";

export interface GitHubClient {
  /** Most recent releases first, as returned by the API. */
  readonly releases: (repo: string) => Effect.Effect<ReadonlyArray<Release>, GitHubError>;
  /** Contents of a file in a repo at a tag or branch. */
  readonly rawFile: (repo: string, ref: string, path: string) => Effect.Effect<string, GitHubError>;
}

const fromWeb = (error: WebError) =>
  new GitHubError({
    message: `${error.url}: ${error.message}`,
    ...(error.status === undefined ? {} : { status: error.status }),
  });

export class GitHub extends Context.Service<GitHub, GitHubClient>()("apk-forge/GitHub") {
  static readonly layer = Layer.effect(
    GitHub,
    Effect.gen(function* () {
      const web = yield* Web;
      const token = yield* Config.option(Config.Redacted("GITHUB_TOKEN")).pipe(Effect.orDie);

      // The token only ever goes to the API host, never to download or redirect targets.
      const apiHeaders: Record<string, string> = {
        accept: "application/vnd.github+json",
        "x-github-api-version": "2022-11-28",
        ...(Option.isSome(token) ? { authorization: `Bearer ${Redacted.value(token.value)}` } : {}),
      };

      const releases = Effect.fn("GitHub.releases")(function* (repo: string) {
        const json = yield* web
          .json(`https://api.github.com/repos/${repo}/releases?per_page=50`, apiHeaders)
          .pipe(Effect.mapError(fromWeb));
        return yield* Schema.decodeUnknownEffect(Releases)(json).pipe(
          Effect.mapError((error) => new GitHubError({ message: `${repo}: ${error.message}` })),
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

      return GitHub.of({ releases, rawFile });
    }),
  ).pipe(Layer.provide(Web.layer));
}
