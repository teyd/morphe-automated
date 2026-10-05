import { describe, expect, it } from "vite-plus/test";
import type { FingerprintInputs } from "../src/domain/manifest.ts";
import { decide, fingerprint } from "../src/plan/fingerprint.ts";
import { stableStringify } from "../src/util/hash.ts";

const base: FingerprintInputs = {
  app: "youtube",
  appVersion: "21.16.256",
  arch: "arm64-v8a",
  bundles: [{ source: "morphe", tag: "v1.45.0", sha256: "aa" }],
  cli: "1.18",
  configHash: "cfg",
  certSha256: "cert",
};

describe("stableStringify", () => {
  it("ignores key order", () => {
    expect(stableStringify({ a: 1, b: { d: 1, c: 2 } })).toBe(
      stableStringify({ b: { c: 2, d: 1 }, a: 1 }),
    );
  });
});

describe("decide", () => {
  it("builds when there is no previous build", () => {
    expect(decide(undefined, base, false)).toEqual({ build: true, reason: "no previous build" });
  });

  it("skips when nothing changed", () => {
    expect(decide({ ...base }, base, false)).toEqual({ build: false, reason: "up to date" });
  });

  it("builds when forced even if nothing changed", () => {
    expect(decide(base, base, true).build).toBe(true);
  });

  it("explains a patch bundle update", () => {
    const next = { ...base, bundles: [{ source: "morphe", tag: "v1.46.0", sha256: "bb" }] };
    const result = decide(base, next, false);
    expect(result.build).toBe(true);
    expect(result.reason).toBe("patches morphe v1.45.0 -> v1.46.0");
  });

  it("rebuilds for a new app version, a new CLI minor, new config or a new certificate", () => {
    expect(decide(base, { ...base, appVersion: "21.17.0" }, false).reason).toBe(
      "app 21.16.256 -> 21.17.0",
    );
    expect(decide(base, { ...base, cli: "1.19" }, false).reason).toBe("cli 1.18 -> 1.19");
    expect(decide(base, { ...base, configHash: "x" }, false).reason).toBe("config changed");
    expect(decide(base, { ...base, certSha256: "x" }, false).reason).toBe(
      "signing certificate changed",
    );
  });
});

describe("fingerprint", () => {
  it("is stable for equal inputs", () => {
    expect(fingerprint(base)).toBe(fingerprint({ ...base }));
  });
});
