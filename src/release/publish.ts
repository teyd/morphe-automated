import { Effect, FileSystem, Path } from "effect";
import { GitHubError } from "../domain/errors.ts";
import type { BuildManifest } from "../domain/manifest.ts";
import { GitHub } from "../services/GitHub.ts";
import { Shell } from "../services/Shell.ts";
import {
  MANIFEST_ASSET,
  apkAssetName,
  releaseTag,
  releaseTitle,
  type ReleaseIdentity,
} from "./naming.ts";
import { releasesToPrune } from "./state.ts";

/** Newest releases kept per app: the current one plus one to roll back to. */
export const KEEP_PER_APP = 2;

export interface BundleLink {
  readonly source: string;
  readonly repo: string;
  readonly tag: string;
}

export interface PublishJob {
  readonly repo: string;
  readonly identity: ReleaseIdentity;
  readonly apkPath: string;
  readonly manifest: BuildManifest;
  readonly bundles: ReadonlyArray<BundleLink>;
  readonly cliVersion: string;
  readonly workDirectory: string;
}

export const releaseNotes = (job: PublishJob): string => {
  const { identity, manifest } = job;

  const patches = job.bundles
    .map((b) => `[${b.source} ${b.tag}](https://github.com/${b.repo}/releases/tag/${b.tag})`)
    .join(", ");

  return [
    `**${identity.name} ${identity.inputs.appVersion}**, patched for ${identity.inputs.arch}.`,
    "",
    `- Patches: ${patches}`,
    `- Morphe CLI: ${job.cliVersion}`,
    `- APK SHA-256: \`${manifest.apk.sha256}\``,
    `- Signing certificate SHA-256: \`${identity.inputs.certSha256}\``,
    "",
    "Check the signing certificate with AppVerifier before installing, and only ever update from this repository.",
  ].join("\n");
};

export const createArgs = (
  job: PublishJob,
  files: { readonly apk: string; readonly manifest: string; readonly notes: string },
): string[] => [
  "release",
  "create",
  releaseTag(job.identity),
  files.apk,
  files.manifest,
  "--repo",
  job.repo,
  "--title",
  releaseTitle(job.identity),
  "--notes-file",
  files.notes,
  "--latest=false",
];

/** Create the release, then delete this app's releases beyond the newest `KEEP_PER_APP`. */
export const publishRelease = Effect.fn("publishRelease")(function* (job: PublishJob) {
  const shell = yield* Shell;
  const github = yield* GitHub;
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;

  const files = {
    apk: path.join(job.workDirectory, apkAssetName(job.identity.slug, job.identity.inputs.arch)),
    manifest: path.join(job.workDirectory, MANIFEST_ASSET),
    notes: path.join(job.workDirectory, "release-notes.md"),
  };

  const wrap = (error: { readonly message: string }) => new GitHubError({ message: error.message });

  yield* fs.copyFile(job.apkPath, files.apk).pipe(Effect.mapError(wrap));
  yield* fs
    .writeFileString(files.manifest, `${JSON.stringify(job.manifest, null, 2)}\n`)
    .pipe(Effect.mapError(wrap));
  yield* fs.writeFileString(files.notes, releaseNotes(job)).pipe(Effect.mapError(wrap));

  yield* shell.run("gh", createArgs(job, files), { echo: true }).pipe(Effect.mapError(wrap));

  const releases = yield* github.releases(job.repo);

  for (const old of releasesToPrune(releases, job.identity.slug, KEEP_PER_APP)) {
    yield* Effect.logInfo(`pruning ${old.tag_name}`);
    yield* shell
      .run("gh", ["release", "delete", old.tag_name, "--repo", job.repo, "--yes", "--cleanup-tag"])
      .pipe(Effect.mapError(wrap));
  }
});
