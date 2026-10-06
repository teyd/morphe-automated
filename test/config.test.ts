import { readFileSync, readdirSync } from "node:fs";
import { Effect } from "effect";
import { describe, expect, it } from "vite-plus/test";
import { configHash, parseApp, parseSigning, parseSources } from "../src/config/load.ts";

const read = (file: string) => readFileSync(new URL(`../config/${file}`, import.meta.url), "utf8");

describe("shipped config", () => {
  it("parses sources.toml", async () => {
    const sources = await Effect.runPromise(parseSources(read("sources.toml")));
    expect(Object.keys(sources).sort()).toEqual(["hushfeed", "morphe", "piko-newx", "riky"]);
    expect(sources["piko-newx"]?.versions).toBe("bundle");
    expect(sources.hushfeed?.versions).toBe("patches-list");
    expect(sources.riky?.repo).toBe("riky-dev/morphe-patches");
    expect(sources.morphe?.cooldown_hours).toBe(6);
  });

  it("parses every app and references only known sources", async () => {
    const sources = await Effect.runPromise(parseSources(read("sources.toml")));

    const files = readdirSync(new URL("../config/apps/", import.meta.url)).filter((f) =>
      f.endsWith(".toml"),
    );

    expect(files.length).toBeGreaterThanOrEqual(4);

    for (const file of files) {
      const app = await Effect.runPromise(
        parseApp(file.replace(".toml", ""), read(`apps/${file}`)),
      );

      for (const source of app.config.sources) expect(sources).toHaveProperty(source);
    }
  });
});

describe("signing.toml", () => {
  const fingerprint = "ab".repeat(32);

  it("accepts a lowercase sha256 fingerprint", async () => {
    const result = await Effect.runPromise(parseSigning(`cert_sha256 = "${fingerprint}"`));
    expect(result).toBe(fingerprint);
  });

  it("rejects anything else", async () => {
    for (const value of ["", "AB".repeat(32), "abc", "zz".repeat(32)]) {
      const error = await Effect.runPromise(Effect.flip(parseSigning(`cert_sha256 = "${value}"`)));
      expect(error._tag).toBe("ConfigError");
    }
  });
});

describe("app defaults", () => {
  it("fills in arm64, stable-only and empty patch selection", async () => {
    const app = await Effect.runPromise(parseApp("youtube", read("apps/youtube.toml")));
    expect(app.config.enabled).toBe(true);
    expect(app.config.arch).toBe("arm64-v8a");
    expect(app.config.allow_experimental).toBe(false);
    expect(app.config.patches).toEqual({ enable: [], disable: [], exclusive: false, options: {} });
  });

  it("rejects an app without sources", async () => {
    const result = await Effect.runPromise(
      Effect.flip(parseApp("bad", 'name = "Bad"\npackage = "x"\nsources = []\n[download]\n')),
    );

    expect(result._tag).toBe("ConfigError");
  });

  it("rejects invalid TOML", async () => {
    const result = await Effect.runPromise(Effect.flip(parseSources("[[[")));
    expect(result._tag).toBe("ConfigError");
  });
});

describe("configHash", () => {
  it("changes with patch selection but not with cosmetic fields", async () => {
    const base = await Effect.runPromise(parseApp("youtube", read("apps/youtube.toml")));

    const renamed = await Effect.runPromise(
      parseApp("youtube", read("apps/youtube.toml").replace('name = "YouTube"', 'name = "YT"')),
    );

    const patched = await Effect.runPromise(
      parseApp(
        "youtube",
        read("apps/youtube.toml").replace("[download]", '[patches]\ndisable = ["x"]\n[download]'),
      ),
    );

    expect(configHash(renamed.config)).toBe(configHash(base.config));
    expect(configHash(patched.config)).not.toBe(configHash(base.config));
  });
});
