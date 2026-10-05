import { assert, describe, it } from "@effect/vitest";
import { Effect, Fiber, FileSystem, Layer } from "effect";
import { TestClock } from "effect/testing";
import { makeCurlWeb, splitStatus } from "../src/services/Curl.ts";
import { Shell, ShellError } from "../src/services/Shell.ts";

const scripted = (outputs: ReadonlyArray<string | ShellError>, fileBytes = new Uint8Array(0)) => {
  const calls: string[][] = [];
  const layer = Layer.mergeAll(
    Layer.succeed(
      Shell,
      Shell.of({
        run: (command, args) =>
          Effect.suspend(() => {
            calls.push([command, ...args]);
            const next = outputs[Math.min(calls.length - 1, outputs.length - 1)]!;
            return typeof next === "string"
              ? Effect.succeed({ stdout: next, stderr: "" })
              : Effect.fail(next);
          }),
      }),
    ),
    FileSystem.layerNoop({ readFile: () => Effect.succeed(fileBytes) }),
  );
  return {
    web: makeCurlWeb({ headers: { "user-agent": "UA/1", accept: "text/html" } }).pipe(
      Effect.provide(layer),
    ),
    calls,
  };
};

describe("splitStatus", () => {
  it("separates the body from the trailing status line", () => {
    assert.deepStrictEqual(splitStatus("<html>\nbody\n</html>\n200"), {
      body: "<html>\nbody\n</html>",
      status: 200,
    });
    assert.deepStrictEqual(splitStatus("\n404"), { body: "", status: 404 });
  });
});

describe("makeCurlWeb", () => {
  it.effect("maps headers to curl flags and returns the body", () =>
    Effect.gen(function* () {
      const { web, calls } = scripted(["<p>hi</p>\n200"]);
      const client = yield* web;
      const body = yield* client.text("https://example.test/a", {
        referer: "https://example.test/",
      });
      assert.strictEqual(body, "<p>hi</p>");
      const args = calls[0]!;
      assert.strictEqual(args[0], "curl");
      assert.include(args, "--location");
      assert.include(args, "--compressed");
      assert.deepStrictEqual(
        args.slice(args.indexOf("--user-agent"), args.indexOf("--user-agent") + 2),
        ["--user-agent", "UA/1"],
      );
      assert.deepStrictEqual(args.slice(args.indexOf("--referer"), args.indexOf("--referer") + 2), [
        "--referer",
        "https://example.test/",
      ]);
      assert.deepStrictEqual(args.slice(args.indexOf("--header"), args.indexOf("--header") + 2), [
        "--header",
        "accept: text/html",
      ]);
      assert.strictEqual(args.at(-1), "https://example.test/a");
    }),
  );

  it.effect("fails a 403 with its status and does not retry", () =>
    Effect.gen(function* () {
      const { web, calls } = scripted(["blocked\n403"]);
      const error = yield* Effect.flip((yield* web).text("https://example.test/"));
      assert.strictEqual(error.status, 403);
      assert.strictEqual(calls.length, 1);
    }),
  );

  it.effect("retries a 503 and succeeds", () =>
    Effect.gen(function* () {
      const { web, calls } = scripted(["\n503", "\n503", "ok\n200"]);
      const client = yield* web;
      const fiber = yield* Effect.forkChild(client.text("https://example.test/"));
      yield* TestClock.adjust("1 minute");
      assert.strictEqual(yield* Fiber.join(fiber), "ok");
      assert.strictEqual(calls.length, 3);
    }),
  );

  it.effect("reports curl failures as transport errors without a status", () =>
    Effect.gen(function* () {
      const { web } = scripted([
        new ShellError({ command: "curl", message: "exited with code 6: could not resolve host" }),
      ]);
      const client = yield* web;
      const fiber = yield* Effect.forkChild(Effect.flip(client.text("https://example.test/")));
      yield* TestClock.adjust("1 minute");
      const error = yield* Fiber.join(fiber);
      assert.isUndefined(error.status);
      assert.include(error.message, "could not resolve host");
    }),
  );

  it.effect("downloads to a file and reports its hash and header", () =>
    Effect.gen(function* () {
      const bytes = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 9, 9]);
      const { web, calls } = scripted(["200"], bytes);
      const result = yield* (yield* web).download("https://example.test/f.apk", "/tmp/f.apk");
      assert.strictEqual(result.size, 6);
      assert.deepStrictEqual([...result.head], [0x50, 0x4b, 0x03, 0x04]);
      assert.strictEqual(result.sha256.length, 64);
      assert.include(calls[0]!, "--output");
      assert.include(calls[0]!, "/tmp/f.apk");
    }),
  );

  it.effect("parses JSON", () =>
    Effect.gen(function* () {
      const { web } = scripted(['{"a":1}\n200']);
      assert.deepStrictEqual(yield* (yield* web).json("https://example.test/"), { a: 1 });
    }),
  );
});
