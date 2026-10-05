import { readFileSync } from "node:fs";
import { describe, expect, it } from "vite-plus/test";
import {
  findDownloadButton,
  findDownloadLink,
  findReleaseLink,
  isChallenge,
  parseVariants,
  pickVariant,
} from "../src/apk/apkmirror-parse.ts";

const fixture = (name: string) =>
  readFileSync(new URL(`./fixtures/apkmirror/${name}`, import.meta.url), "utf8");

describe("findReleaseLink", () => {
  const listing = fixture("listing-x.html");

  it("matches the version slug even when the prefix differs from the app name", () => {
    expect(findReleaseLink(listing, "x-corp/twitter", "12.29.1-prod.01")).toBe(
      "/apk/x-corp/twitter/x-12-29-1-prod-01-release/",
    );
  });

  it("does not match a version that is only a prefix of another", () => {
    expect(findReleaseLink(listing, "x-corp/twitter", "12.29")).toBeUndefined();
  });

  it("returns undefined for versions not on the page", () => {
    expect(findReleaseLink(listing, "x-corp/twitter", "1.0.0")).toBeUndefined();
  });
});

describe("parseVariants / pickVariant", () => {
  const variants = parseVariants(fixture("release-youtube-21.16.256.html"));

  it("reads kind, architecture and dpi for every row", () => {
    expect(variants).toHaveLength(4);
    expect(variants.map((v) => [v.kind, v.arch, v.dpi])).toEqual([
      ["bundle", "universal", "120-480dpi"],
      ["bundle", "arm64-v8a + armeabi-v7a", "480-640dpi"],
      ["bundle", "arm64-v8a", "480-640dpi"],
      ["apk", "universal", "nodpi"],
    ]);
  });

  it("requires a plain APK when the patches say APK_REQUIRED", () => {
    const picked = pickVariant(variants, { arch: "arm64-v8a", apkFileType: "APK_REQUIRED" });
    expect(picked?.href).toMatch(/youtube-21-16-256-3-android-apk-download\/$/);
  });

  it("prefers a plain APK over a bundle even when only the bundle is arm64-specific", () => {
    const picked = pickVariant(variants, { arch: "arm64-v8a", apkFileType: "APKM" });
    expect(picked?.kind).toBe("apk");
  });

  it("falls back to the exact-architecture bundle when there is no plain APK", () => {
    const bundles = variants.filter((v) => v.kind === "bundle");
    const picked = pickVariant(bundles, { arch: "arm64-v8a", apkFileType: null });
    expect(picked?.arch).toBe("arm64-v8a");
  });

  it("returns undefined when nothing fits the architecture", () => {
    expect(pickVariant(variants, { arch: "x86", apkFileType: "APKM" })?.arch).toBe("universal");
    expect(
      pickVariant(
        variants.filter((v) => v.arch === "arm64-v8a"),
        { arch: "x86", apkFileType: null },
      ),
    ).toBeUndefined();
  });
});

describe("download steps", () => {
  it("finds the button on the variant page", () => {
    expect(findDownloadButton(fixture("variant-youtube-21.16.256-apk.html"))).toContain(
      "/download/?key=",
    );
  });

  it("finds the final link on the download page", () => {
    expect(findDownloadLink(fixture("download-youtube-21.16.256-apk.html"))).toContain(
      "/wp-content/themes/APKMirror/download.php?id=",
    );
  });

  it("recognises a Cloudflare challenge page", () => {
    expect(isChallenge("<html><head><title>Just a moment...</title>")).toBe(true);
    expect(isChallenge(fixture("listing-x.html"))).toBe(false);
  });
});
