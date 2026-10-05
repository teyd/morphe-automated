import { readFileSync } from "node:fs";
import { assert, describe, it } from "@effect/vitest";
import { Effect } from "effect";
import type { ApkRequest } from "../src/apk/source.ts";
import { parseDownloadPage, parseVersions, uptodownSource } from "../src/apk/uptodown.ts";
import type { WebClient } from "../src/services/Web.ts";

const fixture = (name: string) =>
  readFileSync(new URL(`./fixtures/uptodown/${name}`, import.meta.url), "utf8");

const request: ApkRequest = {
  packageName: "com.instagram.android",
  version: "451.0.0.0.46",
  arch: "arm64-v8a",
  apkFileType: "APKM",
  download: { uptodown: "instagram" },
  destination: "/tmp/work/instagram",
};

const web = (pages: Record<string, string>): WebClient => ({
  text: (url) => {
    const body = pages[url];
    return body === undefined ? Effect.die(new Error(`unexpected ${url}`)) : Effect.succeed(body);
  },
  json: () => Effect.die("unused"),
  download: () =>
    Effect.succeed({ sha256: "aa", size: 1, head: new Uint8Array([0x50, 0x4b, 0x03, 0x04]) }),
});

const base = "https://instagram.en.uptodown.com/android";

describe("uptodown parsing", () => {
  it("reads version rows", () => {
    const versions = parseVersions(fixture("versions-instagram.html"));
    assert.strictEqual(versions.length, 4);
    assert.deepStrictEqual(versions[0], { id: "1223565707", version: "451.0.0.0.46", kind: "apk" });
  });

  it("detects the captcha gate", () => {
    assert.deepStrictEqual(parseDownloadPage(fixture("download-instagram.html")), {
      _tag: "Captcha",
    });
  });

  it("uses a direct token when the page exposes one", () => {
    const html = '<button id="detail-download-button" data-url="abc/def"></button>';
    assert.deepStrictEqual(parseDownloadPage(html), { _tag: "Direct", path: "abc/def" });
  });
});

describe("uptodownSource", () => {
  it.effect("reports the captcha as blocked so the next source can be tried", () =>
    Effect.gen(function* () {
      const source = uptodownSource(
        web({
          [`${base}/versions`]: fixture("versions-instagram.html"),
          [`${base}/download/1223565707`]: fixture("download-instagram.html"),
        }),
      );
      const error = yield* Effect.flip(source.fetch(request));
      assert.strictEqual(error._tag, "SourceBlocked");
      assert.include(error.message, "captcha");
    }),
  );

  it.effect("downloads when a direct token is available", () =>
    Effect.gen(function* () {
      const source = uptodownSource(
        web({
          [`${base}/versions`]: fixture("versions-instagram.html"),
          [`${base}/download/1223565707`]:
            '<button id="detail-download-button" data-url="tok/en"></button>',
        }),
      );
      const file = yield* source.fetch(request);
      assert.strictEqual(file.kind, "apk");
      assert.strictEqual(file.path, "/tmp/work/instagram.apk");
    }),
  );

  it.effect("reports an unknown version as not found", () =>
    Effect.gen(function* () {
      const source = uptodownSource(
        web({ [`${base}/versions`]: fixture("versions-instagram.html") }),
      );
      const error = yield* Effect.flip(source.fetch({ ...request, version: "1.0.0" }));
      assert.strictEqual(error._tag, "ApkNotFound");
    }),
  );
});
