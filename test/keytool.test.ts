import { createHash } from "node:crypto";
import { describe, expect, it } from "vite-plus/test";
import { certificateSha256, pemToDer } from "../src/signing/keytool.ts";

const der = Uint8Array.from({ length: 200 }, (_, i) => (i * 13) % 256);
const pem = (body: string) =>
  `Certificate stored in file\n-----BEGIN CERTIFICATE-----\n${body}\n-----END CERTIFICATE-----\n`;
const wrapped = Buffer.from(der)
  .toString("base64")
  .replace(/(.{64})/g, "$1\n");

describe("pemToDer", () => {
  it("decodes a wrapped PEM certificate", () => {
    expect(pemToDer(pem(wrapped))).toEqual(der);
  });

  it("rejects output without a certificate", () => {
    expect(() => pemToDer("keytool error")).toThrow(/no certificate/);
  });
});

describe("certificateSha256", () => {
  it("hashes the DER bytes, not the PEM text", () => {
    expect(certificateSha256(pem(wrapped))).toBe(createHash("sha256").update(der).digest("hex"));
  });
});
