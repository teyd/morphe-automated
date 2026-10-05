import { assert, describe, it } from "@effect/vitest";
import { Effect, Layer } from "effect";
import type { SourceConfig } from "../src/config/schema.ts";
import type { Release } from "../src/domain/github.ts";
import { chooseAppVersion } from "../src/plan/target.ts";
import { GitHub } from "../src/services/GitHub.ts";
import { packageTargets, resolveBundle } from "../src/services/patch-sources.ts";

const HOUR = 3_600_000;

const now = Date.parse("2026-10-05T04:17:00Z");

const release = (
  tag: string,
  publishedAt: string,
  digest: string | null = `sha256:${"ab".repeat(32)}`,
): Release => ({
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
      name: `patches-${tag.slice(1)}.mpp`,
      size: 1,
      digest,
      browser_download_url: `https://example.test/${tag}.mpp`,
    },
  ],
});

const fakeGitHub = (releases: ReadonlyArray<Release>, files: Record<string, string>) =>
  Layer.succeed(
    GitHub,
    GitHub.of({
      releases: () => Effect.succeed(releases),
      rawFile: (repo, ref, path) => {
        const body = files[`${repo}@${ref}:${path}`];

        return body === undefined
          ? Effect.die(new Error(`unexpected fetch ${repo}@${ref}:${path}`))
          : Effect.succeed(body);
      },
    }),
  );

const source = (overrides: Partial<SourceConfig> = {}): SourceConfig => ({
  repo: "o/r",
  cooldown_hours: 6,
  versions: "patches-list",
  ...overrides,
});

describe("resolveBundle", () => {
  it.effect("applies the cooldown and reports the digest and successor", () =>
    Effect.gen(function* () {
      const releases = [
        release("v3.51.0", "2026-10-05T02:00:00Z"),
        release("v3.50.0", "2026-10-04T05:24:00Z"),
        release("v3.49.0", "2026-10-03T05:19:00Z"),
      ];

      const bundle = yield* resolveBundle("x", source(), now).pipe(
        Effect.provide(fakeGitHub(releases, {})),
      );

      assert.strictEqual(bundle.tag, "v3.50.0");
      assert.strictEqual(bundle.sha256, "ab".repeat(32));
      assert.strictEqual(bundle.successorTag, "v3.51.0");
    }),
  );

  it.effect("refuses an asset GitHub has no digest for", () =>
    Effect.gen(function* () {
      const error = yield* Effect.flip(
        resolveBundle("x", source(), now).pipe(
          Effect.provide(fakeGitHub([release("v1.0.0", "2026-09-01T00:00:00Z", null)], {})),
        ),
      );

      assert.strictEqual(error._tag, "GitHubError");
    }),
  );

  it.effect("fails when nothing is old enough", () =>
    Effect.gen(function* () {
      const error = yield* Effect.flip(
        resolveBundle("x", source({ cooldown_hours: 24 * HOUR }), now).pipe(
          Effect.provide(fakeGitHub([release("v1.0.0", "2026-10-05T03:00:00Z")], {})),
        ),
      );

      assert.strictEqual(error._tag, "NoEligibleRelease");
    }),
  );
});

describe("packageTargets", () => {
  const bundle = {
    source: "morphe",
    repo: "o/r",
    tag: "v1.45.0",
    assetName: "patches-1.45.0.mpp",
    assetUrl: "",
    sha256: "",
    signatureUrl: undefined,
    successorTag: undefined,
  };

  it.effect("reads versions and signatures from patches-list.json at the tag", () =>
    Effect.gen(function* () {
      const list = JSON.stringify({
        version: "1.45.0",
        patches: [
          {
            name: "p",
            compatiblePackages: [
              {
                packageName: "com.example",
                apkFileType: "APK_REQUIRED",
                signatures: ["AA"],
                targets: [
                  { version: "2.0.0", isExperimental: true },
                  { version: "1.5.0", isExperimental: false },
                ],
              },
            ],
          },
        ],
      });

      const info = yield* packageTargets(bundle, source(), "com.example").pipe(
        Effect.provide(fakeGitHub([], { "o/r@v1.45.0:patches-list.json": list })),
      );

      assert.deepStrictEqual(info?.signatures, ["aa"]);

      const chosen = yield* chooseAppVersion(info, "com.example", {
        pin: undefined,
        allowExperimental: false,
      });

      assert.strictEqual(chosen, "1.5.0");

      const experimental = yield* chooseAppVersion(info, "com.example", {
        pin: undefined,
        allowExperimental: true,
      });

      assert.strictEqual(experimental, "2.0.0");
    }),
  );

  it.effect("reads the lagging patches-bundle.json from the successor's tag", () =>
    Effect.gen(function* () {
      const info = yield* packageTargets(
        { ...bundle, tag: "v3.50.0", successorTag: "v3.51.0" },
        source({ versions: "bundle" }),
        "com.twitter.android",
      ).pipe(
        Effect.provide(
          fakeGitHub([], {
            "o/r@v3.51.0:patches-bundle.json": JSON.stringify({
              version: "v3.50.0",
              app_version: "12.29.1-prod.01",
            }),
          }),
        ),
      );

      assert.deepStrictEqual(info?.versions, [{ version: "12.29.1-prod.01", experimental: false }]);
    }),
  );

  it.effect("rejects a bundle file that describes a different release", () =>
    Effect.gen(function* () {
      const error = yield* Effect.flip(
        packageTargets(
          { ...bundle, tag: "v3.49.0" },
          source({ versions: "bundle" }),
          "com.twitter.android",
        ).pipe(
          Effect.provide(
            fakeGitHub([], {
              "o/r@main:patches-bundle.json": JSON.stringify({
                version: "v3.51.0",
                app_version: "1",
              }),
            }),
          ),
        ),
      );

      assert.strictEqual(error._tag, "GitHubError");
    }),
  );
});

describe("chooseAppVersion", () => {
  it.effect("a pin always wins", () =>
    Effect.gen(function* () {
      const chosen = yield* chooseAppVersion(undefined, "com.example", {
        pin: "9.9.9",
        allowExperimental: false,
      });

      assert.strictEqual(chosen, "9.9.9");
    }),
  );

  it.effect("fails when the package is not patched", () =>
    Effect.gen(function* () {
      const error = yield* Effect.flip(
        chooseAppVersion(undefined, "com.example", { pin: undefined, allowExperimental: false }),
      );

      assert.strictEqual(error._tag, "NoCompatibleVersion");
    }),
  );
});
