import { readFileSync } from "node:fs";
import { describe, expect, it } from "vite-plus/test";
import {
  findUploadsCategory,
  guessReleasePath,
  releasePrefix,
  releaseUrlVersion,
  uploadsPath,
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

  it("ignores the split build's channel and architecture suffix", () => {
    expect(
      findReleaseLink(
        fixture("listing-gboard.html"),
        "google-inc/gboard",
        "18.4.1.985164140-release-arm64-v8a",
      ),
    ).toBe("/apk/google-inc/gboard/gboard-the-google-keyboard-18-4-1-985164140-release/");
  });
});

describe("releaseUrlVersion", () => {
  it("strips the channel and architecture split apps append to versionName", () => {
    expect(releaseUrlVersion("18.0.3.954559732-release-arm64-v8a")).toBe("18.0.3.954559732");
    expect(releaseUrlVersion("18.0.3.954559732-lite_release-armeabi-v7a")).toBe("18.0.3.954559732");
    expect(releaseUrlVersion("18.0.3.954559732-beta-x86_64")).toBe("18.0.3.954559732");
  });

  it("leaves versions APKMirror keeps whole", () => {
    expect(releaseUrlVersion("21.16.256")).toBe("21.16.256");
    expect(releaseUrlVersion("12.29.1-prod.01")).toBe("12.29.1-prod.01");
  });
});

describe("finding releases beyond the first page", () => {
  const listing = fixture("listing-x.html");

  it("learns the release prefix from the most common link, not the first", () => {
    expect(releasePrefix(listing, "x-corp/twitter")).toBe("x");
  });

  it("copes with hyphenated prefixes", () => {
    const html = '<a href="/apk/google-inc/youtube-music/youtube-music-9-15-51-release/">x</a>';
    expect(releasePrefix(html, "google-inc/youtube-music")).toBe("youtube-music");
  });

  it("returns undefined without release links", () => {
    expect(releasePrefix("<html></html>", "x-corp/twitter")).toBeUndefined();
  });

  it("guesses the release URL from prefix and version", () => {
    expect(guessReleasePath("x-corp/twitter", "x", "12.29.1-prod.01")).toBe(
      "/apk/x-corp/twitter/x-12-29-1-prod-01-release/",
    );
  });

  it("guesses a split build's release URL without its channel and architecture", () => {
    expect(
      guessReleasePath(
        "google-inc/gboard",
        "gboard-the-google-keyboard",
        "18.0.3.954559732-release-arm64-v8a",
      ),
    ).toBe("/apk/google-inc/gboard/gboard-the-google-keyboard-18-0-3-954559732-release/");
  });

  it("finds the uploads category and builds paginated paths", () => {
    const html = '<a class="fontBlack" href="/uploads/?appcategory=youtube">more</a>';
    expect(findUploadsCategory(html)).toBe("youtube");
    expect(uploadsPath("youtube", 1)).toBe("/uploads/?appcategory=youtube");
    expect(uploadsPath("youtube", 3)).toBe("/uploads/page/3/?appcategory=youtube");
    expect(findUploadsCategory("<html></html>")).toBeUndefined();
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

  it("reads the version each row belongs to", () => {
    expect(variants.map((v) => v.version)).toEqual([
      "21.16.256",
      "21.16.256",
      "21.16.256",
      "21.16.256",
    ]);
  });
});

describe("Gboard split builds", () => {
  const variants = parseVariants(fixture("release-gboard-18.0.3.954559732.html"));
  const version = "18.0.3.954559732-release-arm64-v8a";

  it("keeps the channel and architecture in each row's version", () => {
    expect(variants.map((v) => v.version)).toEqual([
      version,
      version,
      "18.0.3.954559732-lite_release-arm64-v8a",
      "18.0.3.954559732-beta-arm64-v8a",
      "18.0.3.954559732-beta-arm64-v8a",
      "18.0.3.954559732-lite_beta-arm64-v8a",
    ]);
  });

  it("picks the patched build even when beta and lite builds come first", () => {
    const picked = pickVariant([...variants].reverse(), {
      arch: "arm64-v8a",
      apkFileType: null,
      version,
    });

    expect(picked?.kind).toBe("apk");
    expect(picked?.href).toContain("-release-arm64-v8a-4-android-apk-download/");
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

  it("never leaves HTML-escaped ampersands in links", () => {
    const html = '<a id="download-link" href="/d.php?id=1&amp;key=2">x</a>';
    expect(findDownloadLink(html)).toBe("/d.php?id=1&key=2");
  });

  it("recognises a Cloudflare challenge page", () => {
    expect(isChallenge("<html><head><title>Just a moment...</title>")).toBe(true);
    expect(isChallenge(fixture("listing-x.html"))).toBe(false);
  });
});
