import { assert, describe, it } from "@effect/vitest";
import { Effect, Match } from "effect";
import { ApkNotFound, SourceBlocked, VerificationError } from "../src/domain/errors.ts";
import { fetchApk, type ApkFile, type ApkRequest, type ApkSource } from "../src/apk/source.ts";

const request: ApkRequest = {
  packageName: "com.example",
  version: "1.0.0",
  arch: "arm64-v8a",
  apkFileType: null,
  download: {},
  destination: "/tmp/x",
};

const file: ApkFile = { source: "good", kind: "apk", path: "/tmp/x.apk", sha256: "aa", size: 1 };

const source = (name: string, outcome: "ok" | "blocked" | "missing" | "invalid"): ApkSource => ({
  name,
  fetch: () =>
    Match.value(outcome).pipe(
      Match.when("ok", () => Effect.succeed({ ...file, source: name })),
      Match.when("blocked", () =>
        Effect.fail(new SourceBlocked({ source: name, message: "cloudflare" })),
      ),
      Match.when("missing", () =>
        Effect.fail(new ApkNotFound({ source: name, message: "no such version" })),
      ),
      Match.when("invalid", () =>
        Effect.fail(new VerificationError({ kind: "digest", message: "bad digest" })),
      ),
      Match.exhaustive,
    ),
});

describe("fetchApk", () => {
  it.effect("falls through blocked and empty sources to the first that works", () =>
    Effect.gen(function* () {
      const result = yield* fetchApk(
        [source("a", "blocked"), source("b", "missing"), source("c", "ok")],
        request,
      );

      assert.strictEqual(result.source, "c");
    }),
  );

  it.effect("stops at the first success", () =>
    Effect.gen(function* () {
      const result = yield* fetchApk([source("a", "ok"), source("b", "ok")], request);
      assert.strictEqual(result.source, "a");
    }),
  );

  it.effect("explains every failure when nothing works", () =>
    Effect.gen(function* () {
      const error = yield* Effect.flip(
        fetchApk([source("a", "blocked"), source("b", "missing")], request),
      );

      assert.strictEqual(error._tag, "ApkNotFound");
      assert.include(error.message, "a: cloudflare");
      assert.include(error.message, "b: no such version");
    }),
  );

  it.effect("stops instead of falling through when a source fails verification", () =>
    Effect.gen(function* () {
      const error = yield* Effect.flip(
        fetchApk([source("a", "invalid"), source("b", "ok")], request),
      );

      assert.strictEqual(error._tag, "VerificationError");
    }),
  );

  it.effect("fails clearly with no sources", () =>
    Effect.gen(function* () {
      const error = yield* Effect.flip(fetchApk([], request));
      assert.include(error.message, "no sources configured");
    }),
  );
});
