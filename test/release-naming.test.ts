import { describe, expect, it } from "vite-plus/test";
import type { FingerprintInputs } from "../src/domain/manifest.ts";
import { apkAssetName, releaseTag, releaseTitle, tagBelongsTo } from "../src/release/naming.ts";
import { obtainiumApp, obtainiumLink, obtainiumSettings } from "../src/release/obtainium.ts";

const inputs: FingerprintInputs = {
  app: "youtube",
  appVersion: "21.16.256",
  arch: "arm64-v8a",
  bundles: [{ source: "morphe", tag: "v1.45.0", sha256: "aa" }],
  cli: "1.18",
  configHash: "cfg",
  certSha256: "cert",
};
const identity = { slug: "youtube", name: "YouTube", inputs, fingerprint: "a1b2c3d4e5f6" };

describe("release naming", () => {
  it("builds a tag that changes with the fingerprint", () => {
    expect(releaseTag(identity)).toBe("youtube-21.16.256-morphe-1.45.0-a1b2c3d");
    expect(releaseTag({ ...identity, fingerprint: "ffffffffffff" })).not.toBe(releaseTag(identity));
  });

  it("joins several bundles without characters that break tags", () => {
    const tag = releaseTag({
      ...identity,
      inputs: {
        ...inputs,
        bundles: [...inputs.bundles, { source: "piko", tag: "v3.9.0", sha256: "bb" }],
      },
    });
    expect(tag).toBe("youtube-21.16.256-morphe-1.45.0_piko-3.9.0-a1b2c3d");
  });

  it("titles start with the slug and a colon", () => {
    expect(releaseTitle(identity)).toBe("youtube: 21.16.256 (morphe-1.45.0)");
  });

  it("keeps the APK name stable", () => {
    expect(apkAssetName("youtube", "arm64-v8a")).toBe("youtube-arm64-v8a.apk");
  });

  it("does not confuse youtube with youtube-music", () => {
    expect(tagBelongsTo("youtube", "youtube-21.16.256-morphe-1.45.0-a1b2c3d")).toBe(true);
    expect(tagBelongsTo("youtube", "youtube-music-9.15.51-morphe-1.45.0-a1b2c3d")).toBe(false);
    expect(tagBelongsTo("youtube-music", "youtube-music-9.15.51-morphe-1.45.0-a1b2c3d")).toBe(true);
  });
});

describe("obtainium config", () => {
  const app = {
    slug: "youtube-music",
    name: "YouTube Music",
    packageName: "com.google.android.apps.youtube.music",
    arch: "arm64-v8a",
    repo: "alice/apk-forge",
  };

  it("filters titles and APKs per app", () => {
    const settings = obtainiumSettings(app);
    expect(settings.filterReleaseTitlesByRegEx).toBe("^youtube-music:");
    expect(settings.apkFilterRegEx).toBe("^youtube-music-arm64-v8a\\.apk$");
    expect(new RegExp(settings.filterReleaseTitlesByRegEx).test("youtube: 21.16.256 (x)")).toBe(
      false,
    );
    expect(new RegExp(settings.filterReleaseTitlesByRegEx).test("youtube-music: 9.15.51 (x)")).toBe(
      true,
    );
  });

  it("disables standard version detection and scans older releases", () => {
    const settings = obtainiumSettings(app);
    expect(settings.versionDetection).toBe(false);
    expect(settings.fallbackToOlderReleases).toBe(true);
    expect(settings.includePrereleases).toBe(false);
  });

  it("produces an import link whose JSON round-trips", () => {
    const link = obtainiumLink(app);
    expect(link.startsWith("obtainium://app/")).toBe(true);
    const json = JSON.parse(decodeURIComponent(link.slice("obtainium://app/".length)));
    expect(json).toEqual(obtainiumApp(app));
    expect(json.id).toBe("com.google.android.apps.youtube.music");
    expect(json.url).toBe("https://github.com/alice/apk-forge");
    expect(JSON.parse(json.additionalSettings).versionDetection).toBe(false);
  });
});
