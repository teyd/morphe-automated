import { assert, describe, it } from "@effect/vitest";
import { Effect, Layer, Match } from "effect";
import { parseApp } from "../src/config/load.ts";
import type { LoadedConfig } from "../src/config/load.ts";
import type { Release } from "../src/domain/github.ts";
import type { BuildManifest } from "../src/domain/manifest.ts";
import { MANIFEST_ASSET } from "../src/release/naming.ts";
import { GitHub } from "../src/services/GitHub.ts";
import { Web } from "../src/services/Web.ts";
import { planApp } from "../src/pipeline/plan.ts";

const NOW = Date.parse("2026-10-05T04:17:00Z");

const digest = (hex: string) => `sha256:${hex.repeat(32)}`;

const release = (tag: string, publishedAt: string, assetName: string, hex: string): Release => ({
  id: 1,
  tag_name: tag,
  name: tag,
  draft: false,
  prerelease: false,
  published_at: publishedAt,
  html_url: "",
  body: null,
  assets: [
    {
      name: assetName,
      size: 1,
      digest: digest(hex),
      browser_download_url: `https://dl/${tag}/${assetName}`,
    },
  ],
});

const patchesList = JSON.stringify({
  version: "1.45.0",
  patches: [
    {
      name: "p",
      compatiblePackages: [
        {
          packageName: "com.google.android.youtube",
          apkFileType: "APK_REQUIRED",
          signatures: ["AA"],
          targets: [
            { version: "21.38.130", isExperimental: true },
            { version: "21.16.256", isExperimental: false },
          ],
        },
      ],
    },
  ],
});

const config: LoadedConfig = {
  sources: {
    morphe: { repo: "MorpheApp/morphe-patches", cooldown_hours: 6, versions: "patches-list" },
  },
  certSha256: "cert",
  apps: [],
};

const youtube = parseApp(
  "youtube",
  'name = "YouTube"\npackage = "com.google.android.youtube"\nsources = ["morphe"]\n[download]\n',
);

const world = (previous: BuildManifest | undefined, patchesTag = "v1.45.0") => {
  const mine = previous
    ? [
        release(
          "youtube-21.16.256-morphe-1.45.0-abc1234",
          "2026-10-03T00:00:00Z",
          MANIFEST_ASSET,
          "00",
        ),
      ]
    : [];

  return Layer.mergeAll(
    Layer.succeed(
      GitHub,
      GitHub.of({
        releases: (repo) =>
          Effect.succeed(
            Match.value(repo).pipe(
              Match.when("MorpheApp/morphe-patches", () => [
                release(
                  patchesTag,
                  "2026-10-02T08:55:00Z",
                  `patches-${patchesTag.slice(1)}.mpp`,
                  "ab",
                ),
              ]),
              Match.when("MorpheApp/morphe-desktop", () => [
                {
                  ...release(
                    "v1.18.1",
                    "2026-10-04T00:00:00Z",
                    "morphe-desktop-1.18.1-all.jar",
                    "cd",
                  ),
                },
              ]),
              Match.orElse(() => mine),
            ),
          ),
        rawFile: () => Effect.succeed(patchesList.replace('"1.45.0"', `"${patchesTag.slice(1)}"`)),
      }),
    ),
    Layer.succeed(
      Web,
      Web.of({
        text: () => Effect.die("unused"),
        json: () => Effect.succeed(previous),
        download: () => Effect.die("unused"),
      }),
    ),
  );
};

describe("planApp", () => {
  it.effect("builds when there is no previous release", () =>
    Effect.gen(function* () {
      const app = yield* youtube;

      const plan = yield* planApp(app, config, {
        now: NOW,
        repo: "alice/forge",
        force: false,
      }).pipe(Effect.provide(world(undefined)));

      assert.deepStrictEqual(plan.decision, { build: true, reason: "no previous build" });
      assert.strictEqual(plan.inputs.appVersion, "21.16.256");
      assert.strictEqual(plan.inputs.cli, "1.18");
      assert.strictEqual(plan.apkFileType, "APK_REQUIRED");
      assert.deepStrictEqual(plan.expectedSignatures, ["aa"]);
      assert.strictEqual(plan.bundles[0]?.sha256, "ab".repeat(32));
    }),
  );

  it.effect("skips when the previous build used identical inputs", () =>
    Effect.gen(function* () {
      const app = yield* youtube;

      const first = yield* planApp(app, config, {
        now: NOW,
        repo: "alice/forge",
        force: false,
      }).pipe(Effect.provide(world(undefined)));

      const manifest: BuildManifest = {
        schema: 1,
        fingerprint: first.fingerprint,
        inputs: first.inputs,
        builtAt: "2026-10-03T00:00:00Z",
        apk: { name: "youtube-arm64-v8a.apk", sha256: "ff", size: 1 },
      };

      const again = yield* planApp(app, config, {
        now: NOW,
        repo: "alice/forge",
        force: false,
      }).pipe(Effect.provide(world(manifest)));

      assert.deepStrictEqual(again.decision, { build: false, reason: "up to date" });

      const forced = yield* planApp(app, config, {
        now: NOW,
        repo: "alice/forge",
        force: true,
      }).pipe(Effect.provide(world(manifest)));

      assert.strictEqual(forced.decision.build, true);
    }),
  );

  it.effect("rebuilds, and says why, when the patches changed", () =>
    Effect.gen(function* () {
      const app = yield* youtube;

      const first = yield* planApp(app, config, {
        now: NOW,
        repo: "alice/forge",
        force: false,
      }).pipe(Effect.provide(world(undefined)));

      const manifest: BuildManifest = {
        schema: 1,
        fingerprint: first.fingerprint,
        inputs: first.inputs,
        builtAt: "2026-10-03T00:00:00Z",
        apk: { name: "youtube-arm64-v8a.apk", sha256: "ff", size: 1 },
      };

      const next = yield* planApp(app, config, {
        now: NOW,
        repo: "alice/forge",
        force: false,
      }).pipe(Effect.provide(world(manifest, "v1.46.0")));

      assert.strictEqual(next.decision.build, true);
      assert.strictEqual(next.decision.reason, "patches morphe v1.45.0 -> v1.46.0");
    }),
  );
});
