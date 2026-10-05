import { Effect, FileSystem, Path } from "effect";
import { GitHubError } from "../domain/errors.ts";
import { GitHub } from "../services/GitHub.ts";
import { Shell } from "../services/Shell.ts";
import { releasesOf } from "./state.ts";

/** Set `enabled = false` in an app's TOML, replacing an existing `enabled` line or adding one. */
export const disableAppToml = (text: string): string =>
  /^enabled\s*=.*$/m.test(text)
    ? text.replace(/^enabled\s*=.*$/m, "enabled = false")
    : `enabled = false\n\n${text}`;

export interface TakedownResult {
  readonly deleted: ReadonlyArray<string>;
  readonly configFile: string;
}

/**
 * Remove an app everywhere: delete all its releases (and their tags), then disable it in config so the
 * daily run cannot publish it again. Commit and push the config change afterwards.
 */
export const takedownApp = Effect.fn("takedownApp")(function* (
  repo: string,
  slug: string,
  configDirectory: string,
) {
  const github = yield* GitHub;
  const shell = yield* Shell;
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const wrap = (error: { readonly message: string }) => new GitHubError({ message: error.message });

  const configFile = path.join(configDirectory, "apps", `${slug}.toml`);
  const text = yield* fs.readFileString(configFile).pipe(Effect.mapError(wrap));

  const releases = releasesOf(yield* github.releases(repo), slug);
  const deleted: string[] = [];

  for (const release of releases) {
    yield* shell
      .run("gh", ["release", "delete", release.tag_name, "--repo", repo, "--yes", "--cleanup-tag"])
      .pipe(Effect.mapError(wrap));
    deleted.push(release.tag_name);
  }

  yield* fs.writeFileString(configFile, disableAppToml(text)).pipe(Effect.mapError(wrap));

  return { deleted, configFile } satisfies TakedownResult;
});
