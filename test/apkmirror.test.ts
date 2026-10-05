import { readFileSync } from "node:fs";
import { assert, describe, it } from "@effect/vitest";
import { Effect } from "effect";
import { apkMirrorSource } from "../src/apk/apkmirror.ts";
import type { ApkRequest } from "../src/apk/source.ts";
import { WebError } from "../src/domain/errors.ts";
import type { WebClient } from "../src/services/Web.ts";

const fixture = (name: string) =>
  readFileSync(new URL(`./fixtures/apkmirror/${name}`, import.meta.url), "utf8");

const BASE = "https://www.apkmirror.com";
const RELEASE = "/apk/google-inc/youtube/youtube-21-16-256-release/";
const VARIANT = `${RELEASE}youtube-21-16-256-3-android-apk-download/`;
const BUTTON = `${VARIANT}download/?key=6cd9e7c91b146a4e052075d88c75ee84ca752924&forcebaseapk=true`;
const FILE =
  "/wp-content/themes/APKMirror/download.php?id=13517428&key=69957b1cd3a8561fa32b79cdc596bf459f4137b3&forcebaseapk=true";

const pages: Record<string, string> = {
  "/apk/google-inc/youtube/": `<a href="${RELEASE}">21.16.256</a>`,
  [RELEASE]: fixture("release-youtube-21.16.256.html"),
  [VARIANT]: fixture("variant-youtube-21.16.256-apk.html"),
  [BUTTON]: fixture("download-youtube-21.16.256-apk.html"),
};

const fakeWeb = (
  overrides: Record<string, string> = {},
  head: Uint8Array = new Uint8Array([0x50, 0x4b, 0x03, 0x04]),
) => {
  const requested: string[] = [];
  const web: WebClient = {
    text: (url) => {
      const path = url.replace(BASE, "");
      requested.push(path);
      const body = overrides[path] ?? pages[path];
      return body === undefined
        ? Effect.fail(new WebError({ url, status: 404, message: "HTTP 404" }))
        : Effect.succeed(body);
    },
    json: () => Effect.die("unused"),
    download: (url) => {
      requested.push(url.replace(BASE, ""));
      return Effect.succeed({ sha256: "cafe", size: 1234, head });
    },
  };
  return { web, requested };
};

const request: ApkRequest = {
  packageName: "com.google.android.youtube",
  version: "21.16.256",
  arch: "arm64-v8a",
  apkFileType: "APK_REQUIRED",
  download: { apkmirror: "google-inc/youtube" },
  destination: "/tmp/work/youtube",
};

describe("apkMirrorSource", () => {
  it.effect("walks listing, release, variant and download pages", () =>
    Effect.gen(function* () {
      const { web, requested } = fakeWeb();
      const file = yield* apkMirrorSource(web).fetch(request);
      assert.deepStrictEqual(requested, [
        "/apk/google-inc/youtube/",
        RELEASE,
        VARIANT,
        BUTTON,
        FILE,
      ]);
      assert.strictEqual(file.kind, "apk");
      assert.strictEqual(file.path, "/tmp/work/youtube.apk");
      assert.strictEqual(file.sha256, "cafe");
    }),
  );

  it.effect("reports a Cloudflare challenge as blocked", () =>
    Effect.gen(function* () {
      const { web } = fakeWeb({ "/apk/google-inc/youtube/": "<title>Just a moment...</title>" });
      const error = yield* Effect.flip(apkMirrorSource(web).fetch(request));
      assert.strictEqual(error._tag, "SourceBlocked");
    }),
  );

  it.effect("reports a version missing from every listing page as not found", () =>
    Effect.gen(function* () {
      const { web } = fakeWeb({
        "/apk/google-inc/youtube/page/2/": "<html></html>",
        "/apk/google-inc/youtube/page/3/": "<html></html>",
        "/apk/google-inc/youtube/page/4/": "<html></html>",
      });
      const error = yield* Effect.flip(
        apkMirrorSource(web).fetch({ ...request, version: "9.9.9" }),
      );
      assert.strictEqual(error._tag, "ApkNotFound");
    }),
  );

  it.effect("refuses a download that is not an archive", () =>
    Effect.gen(function* () {
      const { web } = fakeWeb({}, new TextEncoder().encode("<htm"));
      const error = yield* Effect.flip(apkMirrorSource(web).fetch(request));
      assert.strictEqual(error._tag, "SourceBlocked");
    }),
  );

  it.effect("fails fast when no APKMirror path is configured", () =>
    Effect.gen(function* () {
      const { web, requested } = fakeWeb();
      const error = yield* Effect.flip(apkMirrorSource(web).fetch({ ...request, download: {} }));
      assert.strictEqual(error._tag, "ApkNotFound");
      assert.strictEqual(requested.length, 0);
    }),
  );
});
