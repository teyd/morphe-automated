import { assert, describe, it } from "@effect/vitest";
import { Effect, FileSystem, Layer, Path } from "effect";
import type { Release } from "../src/domain/github.ts";
import { disableAppToml, takedownApp } from "../src/release/takedown.ts";
import { GitHub } from "../src/services/GitHub.ts";
import { Shell } from "../src/services/Shell.ts";

describe("disableAppToml", () => {
  it("adds enabled = false when absent", () => {
    assert.strictEqual(disableAppToml('name = "X"\n'), 'enabled = false\n\nname = "X"\n');
  });

  it("replaces an existing enabled line, keeping the rest", () => {
    const input = '# note\nenabled = true\nname = "X"\n';
    assert.strictEqual(disableAppToml(input), '# note\nenabled = false\nname = "X"\n');
  });

  it("is idempotent", () => {
    const once = disableAppToml('name = "X"\n');
    assert.strictEqual(disableAppToml(once), once);
  });
});

const release = (tag: string): Release => ({
  id: 1,
  tag_name: tag,
  name: tag,
  draft: false,
  prerelease: false,
  published_at: "2026-10-01T00:00:00Z",
  html_url: "",
  body: null,
  assets: [],
});

describe("takedownApp", () => {
  it.effect("deletes only that app's releases and disables its config", () =>
    Effect.gen(function* () {
      const commands: string[][] = [];
      const writes: Record<string, string> = {};

      const layer = Layer.mergeAll(
        Layer.succeed(
          GitHub,
          GitHub.of({
            releases: () =>
              Effect.succeed([
                release("x-12.29.1-prod.01-piko-newx-3.51.0-aaaaaaa"),
                release("x-12.29.1-prod.01-piko-newx-3.50.0-bbbbbbb"),
                release("youtube-21.16.256-morphe-1.45.0-ccccccc"),
              ]),
            rawFile: () => Effect.die("unused"),
            assetJson: () => Effect.die("unused"),
          }),
        ),
        Layer.succeed(
          Shell,
          Shell.of({
            run: (command, args) =>
              Effect.sync(() => {
                commands.push([command, ...args]);

                return { stdout: "", stderr: "" };
              }),
          }),
        ),
        Path.layer,
        FileSystem.layerNoop({
          readFileString: () => Effect.succeed('name = "X"\n'),
          writeFileString: (path, data) => Effect.sync(() => void (writes[path] = data)),
        }),
      );

      const result = yield* takedownApp("alice/forge", "x", "config").pipe(Effect.provide(layer));

      assert.deepStrictEqual(
        commands.map((c) => c[3]),
        [
          "x-12.29.1-prod.01-piko-newx-3.51.0-aaaaaaa",
          "x-12.29.1-prod.01-piko-newx-3.50.0-bbbbbbb",
        ],
      );
      assert.include(commands[0]!, "--cleanup-tag");
      assert.strictEqual(result.deleted.length, 2);
      assert.strictEqual(writes["config/apps/x.toml"], 'enabled = false\n\nname = "X"\n');
    }),
  );
});
