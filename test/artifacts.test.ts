import { assert, describe, it } from "@effect/vitest";
import { Effect, Layer } from "effect";
import { fetchVerified } from "../src/services/artifacts.ts";
import { Web } from "../src/services/Web.ts";

const webReturning = (sha256: string) =>
  Layer.succeed(
    Web,
    Web.of({
      text: () => Effect.die("unused"),
      json: () => Effect.die("unused"),
      download: () => Effect.succeed({ sha256, size: 3 }),
    }),
  );

describe("fetchVerified", () => {
  it.effect("accepts a matching digest, ignoring case", () =>
    Effect.gen(function* () {
      const result = yield* fetchVerified("https://x/a.jar", "/tmp/a.jar", "ABC123").pipe(
        Effect.provide(webReturning("abc123")),
      );
      assert.strictEqual(result.size, 3);
    }),
  );

  it.effect("rejects a mismatching digest", () =>
    Effect.gen(function* () {
      const error = yield* Effect.flip(
        fetchVerified("https://x/a.jar", "/tmp/a.jar", "abc123").pipe(
          Effect.provide(webReturning("deadbeef")),
        ),
      );
      assert.strictEqual(error._tag, "VerificationError");
    }),
  );
});
