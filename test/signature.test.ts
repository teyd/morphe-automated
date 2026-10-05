import { createHash } from "node:crypto";
import { describe, expect, it } from "vite-plus/test";
import { extractBaseApk, signingCertSha256 } from "../src/apk/signature.ts";
import { signedApk, zip } from "./helpers/zip.ts";

const certificate = Uint8Array.from({ length: 300 }, (_, i) => (i * 7) % 251);
const sha256 = (data: Uint8Array) => createHash("sha256").update(data).digest("hex");

describe("signingCertSha256", () => {
  it("hashes the first certificate of a v2 signature", () => {
    expect(signingCertSha256(signedApk(certificate))).toBe(sha256(certificate));
  });

  it("also understands v3 signatures", () => {
    expect(signingCertSha256(signedApk(certificate, 0xf05368c0))).toBe(sha256(certificate));
  });

  it("rejects an APK without a signing block", () => {
    const unsigned = zip([{ name: "AndroidManifest.xml", data: Uint8Array.of(1) }]);
    expect(() => signingCertSha256(unsigned)).toThrow(/no APK signing block/);
  });

  it("rejects a signing block with no v2/v3 scheme", () => {
    expect(() => signingCertSha256(signedApk(certificate, 0x12345678))).toThrow(/no v2\/v3/);
  });

  it("rejects data that is not a ZIP", () => {
    expect(() => signingCertSha256(new TextEncoder().encode("<html>blocked</html>"))).toThrow(
      /not a ZIP/,
    );
  });
});

describe("extractBaseApk", () => {
  const base = signedApk(certificate);

  it("reads a stored base.apk", () => {
    const bundle = zip([
      { name: "info.json", data: Uint8Array.of(123) },
      { name: "base.apk", data: base },
    ]);
    expect(extractBaseApk(bundle)).toEqual(base);
  });

  it("inflates a compressed base.apk", () => {
    const bundle = zip([{ name: "base.apk", data: base, deflate: true }]);
    expect(extractBaseApk(bundle)).toEqual(base);
  });

  it("feeds the signature check end to end", () => {
    const bundle = zip([{ name: "base.apk", data: base, deflate: true }]);
    expect(signingCertSha256(extractBaseApk(bundle))).toBe(sha256(certificate));
  });

  it("fails when the bundle has no base.apk", () => {
    expect(() => extractBaseApk(zip([{ name: "split_config.apk", data: base }]))).toThrow(
      /no base\.apk/,
    );
  });
});
