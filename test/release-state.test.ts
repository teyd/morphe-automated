import { assert, describe, it } from "@effect/vitest";
import { Effect, FileSystem, Layer, Path } from "effect";
import type { Release } from "../src/domain/github.ts";
import type { BuildManifest, FingerprintInputs } from "../src/domain/manifest.ts";
import { MANIFEST_ASSET } from "../src/release/naming.ts";
import {
  KEEP_PER_APP,
  createArgs,
  publishRelease,
  releaseNotes,
  type PublishJob,
} from "../src/release/publish.ts";
import { previousBuild, releasesOf, releasesToPrune } from "../src/release/state.ts";
import { GitHub } from "../src/services/GitHub.ts";
import { Shell } from "../src/services/Shell.ts";
import { Web } from "../src/services/Web.ts";

const release = (
  tag: string,
  publishedAt: string,
  assets: string[] = [MANIFEST_ASSET],
): Release => ({
  id: 1,
  tag_name: tag,
  name: tag,
  draft: false,
  prerelease: false,
  published_at: publishedAt,
  html_url: "",
  body: null,
  assets: assets.map((name) => ({
    name,
    size: 1,
    digest: null,
    browser_download_url: `https://dl/${tag}/${name}`,
  })),
});

const inputs: FingerprintInputs = {
  app: "youtube",
  appVersion: "21.16.256",
  arch: "arm64-v8a",
  bundles: [{ source: "morphe", tag: "v1.45.0", sha256: "aa" }],
  cli: "1.18",
  configHash: "cfg",
  certSha256: "cert",
};
const manifest: BuildManifest = {
  schema: 1,
  fingerprint: "a1b2c3d4e5f6",
  inputs,
  builtAt: "2026-10-05T04:30:00Z",
  apk: { name: "youtube-arm64-v8a.apk", sha256: "ff", size: 10 },
};

const releases = [
  release("youtube-21.16.256-morphe-1.43.0-aaaaaaa", "2026-09-14T00:00:00Z"),
  release("youtube-music-9.15.51-morphe-1.45.0-bbbbbbb", "2026-10-02T00:00:00Z"),
  release("youtube-21.16.256-morphe-1.45.0-ccccccc", "2026-10-02T00:00:00Z"),
  release("youtube-21.16.256-morphe-1.44.0-ddddddd", "2026-09-21T00:00:00Z"),
];

describe("releasesOf / releasesToPrune", () => {
  it("selects one app's releases newest first", () => {
    assert.deepStrictEqual(
      releasesOf(releases, "youtube").map((r) => r.tag_name),
      [
        "youtube-21.16.256-morphe-1.45.0-ccccccc",
        "youtube-21.16.256-morphe-1.44.0-ddddddd",
        "youtube-21.16.256-morphe-1.43.0-aaaaaaa",
      ],
    );
  });

  it("prunes everything beyond the newest N, never touching other apps", () => {
    assert.deepStrictEqual(
      releasesToPrune(releases, "youtube", KEEP_PER_APP).map((r) => r.tag_name),
      ["youtube-21.16.256-morphe-1.43.0-aaaaaaa"],
    );
    assert.deepStrictEqual(releasesToPrune(releases, "youtube-music", KEEP_PER_APP), []);
  });
});

describe("previousBuild", () => {
  const github = (list: ReadonlyArray<Release>) =>
    Layer.succeed(
      GitHub,
      GitHub.of({ releases: () => Effect.succeed(list), rawFile: () => Effect.die("unused") }),
    );
  const web = (json: unknown) =>
    Layer.succeed(
      Web,
      Web.of({
        text: () => Effect.die("unused"),
        json: () => Effect.succeed(json),
        download: () => Effect.die("unused"),
      }),
    );

  it.effect("reads the newest manifest", () =>
    Effect.gen(function* () {
      const result = yield* previousBuild("o/r", "youtube").pipe(
        Effect.provide(Layer.mergeAll(github(releases), web(manifest))),
      );
      assert.strictEqual(result?.fingerprint, "a1b2c3d4e5f6");
    }),
  );

  it.effect(
    "treats a missing repository, release or unreadable manifest as no previous build",
    () =>
      Effect.gen(function* () {
        const none = Layer.mergeAll(github([]), web(manifest));
        assert.isUndefined(yield* previousBuild(undefined, "youtube").pipe(Effect.provide(none)));
        assert.isUndefined(yield* previousBuild("o/r", "youtube").pipe(Effect.provide(none)));
        const garbage = Layer.mergeAll(github(releases), web({ not: "a manifest" }));
        assert.isUndefined(yield* previousBuild("o/r", "youtube").pipe(Effect.provide(garbage)));
      }),
  );
});

describe("publishing", () => {
  const job: PublishJob = {
    repo: "alice/apk-forge",
    identity: { slug: "youtube", name: "YouTube", inputs, fingerprint: manifest.fingerprint },
    apkPath: "/work/out.apk",
    manifest,
    bundles: [{ source: "morphe", repo: "MorpheApp/morphe-patches", tag: "v1.45.0" }],
    cliVersion: "1.18.1",
    workDirectory: "/work",
  };

  it("builds the gh release command", () => {
    const args = createArgs(job, {
      apk: "/work/youtube-arm64-v8a.apk",
      manifest: "/work/m.json",
      notes: "/work/n.md",
    });
    assert.deepStrictEqual(args, [
      "release",
      "create",
      "youtube-21.16.256-morphe-1.45.0-a1b2c3d",
      "/work/youtube-arm64-v8a.apk",
      "/work/m.json",
      "--repo",
      "alice/apk-forge",
      "--title",
      "youtube: 21.16.256 (morphe-1.45.0)",
      "--notes-file",
      "/work/n.md",
      "--latest=false",
    ]);
  });

  it("states the inputs and certificate in the notes", () => {
    const notes = releaseNotes(job);
    assert.include(notes, "https://github.com/MorpheApp/morphe-patches/releases/tag/v1.45.0");
    assert.include(notes, "Morphe CLI: 1.18.1");
    assert.include(notes, "`cert`");
  });

  it.effect("creates the release and prunes the oldest", () =>
    Effect.gen(function* () {
      const commands: string[][] = [];
      const written: string[] = [];
      const layer = Layer.mergeAll(
        Layer.succeed(
          Shell,
          Shell.of({
            run: (command, args) => {
              commands.push([command, ...args]);
              return Effect.succeed({ stdout: "", stderr: "" });
            },
          }),
        ),
        Layer.succeed(
          GitHub,
          GitHub.of({
            releases: () => Effect.succeed(releases),
            rawFile: () => Effect.die("unused"),
          }),
        ),
        Path.layer,
        FileSystem.layerNoop({
          copyFile: () => Effect.void,
          writeFileString: (path) => Effect.sync(() => void written.push(path)),
        }),
      );
      yield* publishRelease(job).pipe(Effect.provide(layer));

      assert.strictEqual(commands[0]?.slice(0, 3).join(" "), "gh release create");
      assert.deepStrictEqual(commands[1], [
        "gh",
        "release",
        "delete",
        "youtube-21.16.256-morphe-1.43.0-aaaaaaa",
        "--repo",
        "alice/apk-forge",
        "--yes",
        "--cleanup-tag",
      ]);
      assert.strictEqual(commands.length, 2);
      assert.deepStrictEqual(written, ["/work/build-manifest.json", "/work/release-notes.md"]);
    }),
  );
});
