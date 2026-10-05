import { Effect, FileSystem } from "effect";
import { VerificationError } from "../domain/errors.ts";
import { extractBaseApk, signingCertSha256 } from "./signature.ts";
import type { ApkFile } from "./source.ts";

export interface StockVerification {
  /** SHA-256 of the certificate that signed the downloaded app. */
  readonly certSha256: string;
  /** True when it matched a known-good fingerprint; false when there was nothing to compare against. */
  readonly verified: boolean;
}

const asVerificationError = (cause: unknown) =>
  cause instanceof VerificationError
    ? cause
    : new VerificationError({ kind: "certificate", message: String(cause) });

/**
 * Check that a downloaded stock APK was signed by the original publisher. With no known fingerprints
 * (some patch lists omit them) the certificate is reported but cannot be vouched for.
 */
export const verifyStockApk = Effect.fn("verifyStockApk")(function* (
  apk: ApkFile,
  expected: ReadonlyArray<string>,
) {
  const fs = yield* FileSystem.FileSystem;

  const bytes = yield* fs
    .readFile(apk.path)
    .pipe(Effect.mapError((error) => asVerificationError(error.message)));

  const certSha256 = yield* Effect.try({
    try: () => signingCertSha256(apk.kind === "bundle" ? extractBaseApk(bytes) : bytes),
    catch: asVerificationError,
  });

  const known = expected.map((fingerprint) => fingerprint.toLowerCase());

  if (known.length === 0) return { certSha256, verified: false } satisfies StockVerification;

  if (!known.includes(certSha256)) {
    return yield* new VerificationError({
      kind: "certificate",
      message: `${apk.source} APK is signed by ${certSha256}, which is not one of the original publisher's certificates (${known.join(", ")})`,
    });
  }

  return { certSha256, verified: true } satisfies StockVerification;
});
