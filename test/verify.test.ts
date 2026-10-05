import { createHash } from "node:crypto";
import { assert, describe, it } from "@effect/vitest";
import { Effect, FileSystem } from "effect";
import type { ApkFile } from "../src/apk/source.ts";
import { verifyStockApk } from "../src/apk/verify.ts";
import { signedApk, zip } from "./helpers/zip.ts";

const certificate = Uint8Array.from({ length: 64 }, (_, i) => i);

const fingerprint = createHash("sha256").update(certificate).digest("hex");

const apk = signedApk(certificate);

const filesystem = (bytes: Uint8Array) =>
  FileSystem.layerNoop({ readFile: () => Effect.succeed(bytes) });

const file = (kind: ApkFile["kind"]): ApkFile => ({
  source: "apkmirror",
  kind,
  path: "/tmp/x",
  sha256: "aa",
  size: 1,
});

describe("verifyStockApk", () => {
  it.effect("accepts an APK signed by a known certificate", () =>
    Effect.gen(function* () {
      const result = yield* verifyStockApk(file("apk"), [fingerprint.toUpperCase()]).pipe(
        Effect.provide(filesystem(apk)),
      );

      assert.deepStrictEqual(result, { certSha256: fingerprint, verified: true });
    }),
  );

  it.effect("rejects an APK signed by someone else", () =>
    Effect.gen(function* () {
      const error = yield* Effect.flip(
        verifyStockApk(file("apk"), ["00".repeat(32)]).pipe(Effect.provide(filesystem(apk))),
      );

      assert.strictEqual(error._tag, "VerificationError");
      assert.strictEqual(error.kind, "certificate");
    }),
  );

  it.effect("looks inside bundles", () =>
    Effect.gen(function* () {
      const bundle = zip([{ name: "base.apk", data: apk, deflate: true }]);

      const result = yield* verifyStockApk(file("bundle"), [fingerprint]).pipe(
        Effect.provide(filesystem(bundle)),
      );

      assert.isTrue(result.verified);
    }),
  );

  it.effect("reports but cannot vouch for an APK when no fingerprints are known", () =>
    Effect.gen(function* () {
      const result = yield* verifyStockApk(file("apk"), []).pipe(Effect.provide(filesystem(apk)));
      assert.deepStrictEqual(result, { certSha256: fingerprint, verified: false });
    }),
  );

  it.effect("turns parser failures into verification errors", () =>
    Effect.gen(function* () {
      const html = new TextEncoder().encode("<html>blocked</html>");

      const error = yield* Effect.flip(
        verifyStockApk(file("apk"), [fingerprint]).pipe(Effect.provide(filesystem(html))),
      );

      assert.strictEqual(error._tag, "VerificationError");
    }),
  );
});
