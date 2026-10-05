import { createHash } from "node:crypto";
import { Effect, Redacted } from "effect";
import { KeystoreError } from "../domain/errors.ts";
import { Shell } from "../services/Shell.ts";

const PASSWORD_ENV = "MORPHE_AUTOMATED_KEYSTORE_PASSWORD";

/** DER bytes of the first PEM certificate in `pem`. */
export const pemToDer = (pem: string): Uint8Array => {
  const body = /-----BEGIN CERTIFICATE-----([\s\S]*?)-----END CERTIFICATE-----/.exec(pem)?.[1];

  if (body === undefined) throw new KeystoreError({ message: "keytool printed no certificate" });

  return new Uint8Array(Buffer.from(body.replace(/\s+/g, ""), "base64"));
};

export const certificateSha256 = (pem: string): string =>
  createHash("sha256").update(pemToDer(pem)).digest("hex");

export interface NewKeystore {
  readonly path: string;
  readonly alias: string;
  readonly password: Redacted.Redacted<string>;
  /** Certificate subject, e.g. `CN=Alice Morphe Automated`. */
  readonly distinguishedName: string;
}

/** Create a PKCS12 keystore with a fresh 4096-bit RSA key valid for ~27 years. */
export const generateKeystore = Effect.fn("keytool.generate")(function* (keystore: NewKeystore) {
  const shell = yield* Shell;
  yield* shell
    .run(
      "keytool",
      [
        "-genkeypair",
        "-keystore",
        keystore.path,
        "-storetype",
        "PKCS12",
        "-alias",
        keystore.alias,
        "-keyalg",
        "RSA",
        "-keysize",
        "4096",
        "-sigalg",
        "SHA256withRSA",
        "-validity",
        "10000",
        "-dname",
        keystore.distinguishedName,
        `-storepass:env`,
        PASSWORD_ENV,
      ],
      { env: { [PASSWORD_ENV]: Redacted.value(keystore.password) } },
    )
    .pipe(Effect.mapError((error) => new KeystoreError({ message: `keytool: ${error.message}` })));
});

/** SHA-256 fingerprint of the certificate stored under `alias`. */
export const keystoreCertSha256 = Effect.fn("keytool.certSha256")(function* (
  path: string,
  alias: string,
  password: Redacted.Redacted<string>,
) {
  const shell = yield* Shell;

  const { stdout } = yield* shell
    .run(
      "keytool",
      ["-exportcert", "-rfc", "-keystore", path, "-alias", alias, `-storepass:env`, PASSWORD_ENV],
      { env: { [PASSWORD_ENV]: Redacted.value(password) } },
    )
    .pipe(
      Effect.mapError(
        (error) => new KeystoreError({ message: `cannot read the keystore: ${error.message}` }),
      ),
    );

  return yield* Effect.try({
    try: () => certificateSha256(stdout),
    catch: (cause) =>
      cause instanceof KeystoreError ? cause : new KeystoreError({ message: String(cause) }),
  });
});
