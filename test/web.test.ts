import { assert, describe, it } from "@effect/vitest";
import { Effect, Fiber, FileSystem, Layer } from "effect";
import { HttpClient, HttpClientResponse } from "effect/http";
import { TestClock } from "effect/testing";
import { makeWeb } from "../src/services/Web.ts";

const scripted = (statuses: ReadonlyArray<number>, body = "ok") => {
  let calls = 0;

  const client = HttpClient.make((request) =>
    Effect.sync(() => {
      const status = statuses[Math.min(calls++, statuses.length - 1)] ?? 200;

      return HttpClientResponse.fromWeb(request, new Response(body, { status }));
    }),
  );

  const web = makeWeb().pipe(
    Effect.provide(
      Layer.mergeAll(Layer.succeed(HttpClient.HttpClient, client), FileSystem.layerNoop({})),
    ),
  );

  return { web, calls: () => calls };
};

describe("Web", () => {
  it.effect("retries 5xx responses with backoff", () =>
    Effect.gen(function* () {
      const { web, calls } = scripted([500, 500, 200]);
      const client = yield* web;
      const fiber = yield* Effect.forkChild(client.text("https://example.test/"));
      yield* TestClock.adjust("1 minute");
      assert.strictEqual(yield* Fiber.join(fiber), "ok");
      assert.strictEqual(calls(), 3);
    }),
  );

  it.effect("does not retry a 403 challenge", () =>
    Effect.gen(function* () {
      const { web, calls } = scripted([403]);
      const client = yield* web;
      const error = yield* Effect.flip(client.text("https://example.test/"));
      assert.strictEqual(error.status, 403);
      assert.strictEqual(calls(), 1);
    }),
  );

  it.effect("gives up after the retry limit", () =>
    Effect.gen(function* () {
      const { web, calls } = scripted([503]);
      const client = yield* web;
      const fiber = yield* Effect.forkChild(Effect.flip(client.text("https://example.test/")));
      yield* TestClock.adjust("1 minute");
      const error = yield* Fiber.join(fiber);
      assert.strictEqual(error.status, 503);
      assert.strictEqual(calls(), 4);
    }),
  );

  it.effect("parses JSON bodies", () =>
    Effect.gen(function* () {
      const { web } = scripted([200], '{"a":1}');
      const client = yield* web;
      assert.deepStrictEqual(yield* client.json("https://example.test/"), { a: 1 });
    }),
  );
});
