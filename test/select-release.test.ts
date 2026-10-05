import { describe, expect, it } from "vite-plus/test";
import type { Release } from "../src/domain/github.ts";
import { selectRelease } from "../src/plan/select-release.ts";

const HOUR = 3_600_000;

const now = Date.parse("2026-10-05T04:17:00Z");

const release = (tag: string, publishedAt: string, extra: Partial<Release> = {}): Release => ({
  id: 1,
  tag_name: tag,
  name: tag,
  draft: false,
  prerelease: false,
  published_at: publishedAt,
  html_url: `https://example.test/${tag}`,
  body: null,
  assets: [
    { id: 1, name: `patches-${tag}.mpp`, size: 1, digest: null, browser_download_url: "https://x" },
  ],
  ...extra,
});

const options = { now, cooldownMs: 6 * HOUR, hasAsset: (name: string) => name.endsWith(".mpp") };

describe("selectRelease", () => {
  it("skips releases younger than the cooldown", () => {
    const releases = [
      release("v3.51.0", "2026-10-05T02:00:00Z"), // 2h old
      release("v3.50.0", "2026-10-04T05:24:00Z"), // ~23h old
    ];

    expect(selectRelease(releases, options)?.tag_name).toBe("v3.50.0");
  });

  it("picks the newest eligible release regardless of list order", () => {
    const releases = [
      release("v3.49.0", "2026-10-03T05:19:00Z"),
      release("v3.51.0", "2026-10-04T05:40:00Z"),
      release("v3.50.0", "2026-10-04T05:24:00Z"),
    ];

    expect(selectRelease(releases, options)?.tag_name).toBe("v3.51.0");
  });

  it("ignores prereleases, drafts and releases without the asset", () => {
    const releases = [
      release("v1.46.0-dev.7", "2026-10-01T00:00:00Z", { prerelease: true }),
      release("v1.47.0", "2026-10-01T00:00:00Z", { draft: true }),
      release("v1.48.0", "2026-10-01T00:00:00Z", { assets: [] }),
      release("v1.45.0", "2026-10-02T08:55:00Z"),
    ];

    expect(selectRelease(releases, options)?.tag_name).toBe("v1.45.0");
  });

  it("returns undefined when nothing qualifies", () => {
    expect(selectRelease([release("v1.0.0", "2026-10-05T03:00:00Z")], options)).toBeUndefined();
  });

  it("uses a zero cooldown to accept brand new releases", () => {
    const releases = [release("v1.0.0", "2026-10-05T04:16:00Z")];
    expect(selectRelease(releases, { ...options, cooldownMs: 0 })?.tag_name).toBe("v1.0.0");
  });
});
