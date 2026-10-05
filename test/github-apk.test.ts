import { describe, expect, it } from "vite-plus/test";
import { pickStockAsset } from "../src/apk/github-apk.ts";
import type { ReleaseAsset } from "../src/domain/github.ts";

const asset = (name: string): ReleaseAsset => ({
  id: 1,
  name,
  size: 1,
  digest: "sha256:aa",
  browser_download_url: "https://example.test/a",
});

const assets = [
  asset("com.instagram.android-439.0.0.37.89-universal.apkm"),
  asset("com.instagram.android-439.0.0.37.89-arm64-v8a.apkm"),
  asset("com.instagram.android-447.0.0.55.81-arm64-v8a.apkm"),
  asset("notes.txt"),
];

describe("pickStockAsset", () => {
  it("prefers the file for this architecture", () => {
    expect(pickStockAsset(assets, "439.0.0.37.89", "arm64-v8a")?.name).toContain("arm64-v8a");
  });

  it("falls back to any file of that version", () => {
    expect(pickStockAsset(assets, "439.0.0.37.89", "x86_64")?.name).toContain("universal");
  });

  it("returns undefined when the version is not hosted", () => {
    expect(pickStockAsset(assets, "1.0.0", "arm64-v8a")).toBeUndefined();
  });
});
