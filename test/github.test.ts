import { assert, describe, it } from "@effect/vitest";
import { Effect } from "effect";
import { githubSource, tagCandidates } from "../src/apk/github.ts";
import type { ApkRequest } from "../src/apk/source.ts";
import { GitHubError } from "../src/domain/errors.ts";
import type { Release } from "../src/domain/github.ts";
import type { GitHubClient } from "../src/services/GitHub.ts";
import type { WebClient } from "../src/services/Web.ts";

const ASSET = "BraveMonoarm64.apk";

const DIGEST = "a".repeat(64);

const release = (
  tag: string,
  assets: ReadonlyArray<{ readonly name: string; readonly digest: string | null }>,
): Release => ({
  id: 1,
  tag_name: tag,
  name: tag,
  draft: false,
  prerelease: false,
  published_at: "2026-10-02T12:12:00Z",
  html_url: "",
  body: null,
  assets: assets.map((asset, index) => ({
    id: index + 1,
    name: asset.name,
    size: 123,
    digest: asset.digest,
    browser_download_url: `https://github.com/brave/brave-browser/releases/download/${tag}/${asset.name}`,
  })),
});

const fakeGitHub = (
  byTag: Readonly<Record<string, Release>>,
  failure?: GitHubError,
): GitHubClient => ({
  releases: () => Effect.die("unused"),
  releaseByTag: (repo, tag) => {
    if (failure !== undefined) return Effect.fail(failure);

    return Effect.succeed(byTag[`${repo}@${tag}`]);
  },
  rawFile: () => Effect.die("unused"),
  assetJson: () => Effect.die("unused"),
});

const fakeWeb = (sha256: string): WebClient => ({
  text: () => Effect.die("unused"),
  json: () => Effect.die("unused"),
  download: () =>
    Effect.succeed({
      sha256,
      size: 123,
      head: new Uint8Array([0x50, 0x4b, 0x03, 0x04]),
    }),
});

const request: ApkRequest = {
  packageName: "com.brave.browser",
  version: "1.96.61",
  arch: "arm64-v8a",
  apkFileType: "APK",
  download: { github: "brave/brave-browser", github_assets: { "arm64-v8a": ASSET } },
  destination: "/tmp/work/brave",
};

describe("tagCandidates", () => {
  it("offers the v-prefixed and bare tag", () => {
    assert.deepStrictEqual(tagCandidates("1.96.61"), ["v1.96.61", "1.96.61"]);
  });

  it("does not double the v", () => {
    assert.deepStrictEqual(tagCandidates("v1.96.61"), ["v1.96.61", "1.96.61"]);
  });
});

describe("githubSource", () => {
  it.effect("downloads the configured arch asset and checks its digest", () =>
    Effect.gen(function* () {
      const source = githubSource(
        fakeGitHub({
          "brave/brave-browser@v1.96.61": release("v1.96.61", [
            { name: ASSET, digest: `sha256:${DIGEST}` },
          ]),
        }),
        fakeWeb(DIGEST),
      );

      const file = yield* source.fetch(request);

      assert.deepStrictEqual(file, {
        source: "github",
        kind: "apk",
        path: "/tmp/work/brave.apk",
        sha256: DIGEST,
        size: 123,
      });
    }),
  );

  it.effect("accepts a release tagged without the v prefix", () =>
    Effect.gen(function* () {
      const source = githubSource(
        fakeGitHub({
          "brave/brave-browser@1.96.61": release("1.96.61", [
            { name: ASSET, digest: `sha256:${DIGEST}` },
          ]),
        }),
        fakeWeb(DIGEST),
      );

      const file = yield* source.fetch(request);
      assert.strictEqual(file.sha256, DIGEST);
    }),
  );

  it.effect("stops with a verification error when the download does not match", () =>
    Effect.gen(function* () {
      const source = githubSource(
        fakeGitHub({
          "brave/brave-browser@v1.96.61": release("v1.96.61", [
            { name: ASSET, digest: `sha256:${DIGEST}` },
          ]),
        }),
        fakeWeb("b".repeat(64)),
      );

      const error = yield* Effect.flip(source.fetch(request));
      assert.strictEqual(error._tag, "VerificationError");
    }),
  );

  it.effect("reports a missing asset as not found", () =>
    Effect.gen(function* () {
      const source = githubSource(
        fakeGitHub({
          "brave/brave-browser@v1.96.61": release("v1.96.61", [
            { name: "other.apk", digest: `sha256:${DIGEST}` },
          ]),
        }),
        fakeWeb(DIGEST),
      );

      const error = yield* Effect.flip(source.fetch(request));
      assert.strictEqual(error._tag, "ApkNotFound");
      assert.include(error.message, ASSET);
    }),
  );

  it.effect("refuses an asset GitHub has no digest for", () =>
    Effect.gen(function* () {
      const source = githubSource(
        fakeGitHub({
          "brave/brave-browser@v1.96.61": release("v1.96.61", [{ name: ASSET, digest: null }]),
        }),
        fakeWeb(DIGEST),
      );

      const error = yield* Effect.flip(source.fetch(request));
      assert.strictEqual(error._tag, "ApkNotFound");
      assert.include(error.message, "digest");
    }),
  );

  it.effect("reports a version with no release as not found", () =>
    Effect.gen(function* () {
      const source = githubSource(fakeGitHub({}), fakeWeb(DIGEST));
      const error = yield* Effect.flip(source.fetch(request));
      assert.strictEqual(error._tag, "ApkNotFound");
    }),
  );

  it.effect("reports an API failure as blocked so another source can be tried", () =>
    Effect.gen(function* () {
      const source = githubSource(
        fakeGitHub({}, new GitHubError({ message: "HTTP 403", status: 403 })),
        fakeWeb(DIGEST),
      );

      const error = yield* Effect.flip(source.fetch(request));
      assert.strictEqual(error._tag, "SourceBlocked");
    }),
  );

  it.effect("fails fast when no repository is configured", () =>
    Effect.gen(function* () {
      const source = githubSource(fakeGitHub({}), fakeWeb(DIGEST));
      const error = yield* Effect.flip(source.fetch({ ...request, download: {} }));
      assert.strictEqual(error._tag, "ApkNotFound");
    }),
  );
});
