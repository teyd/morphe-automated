import { Config, Effect, FileSystem, Path, Redacted } from "effect";
import { KeystoreError } from "../domain/errors.ts";
import { keystoreCertSha256 } from "./keytool.ts";

export interface SigningKey {
  readonly path: string;
  readonly alias: string;
  /** Used for both the keystore and the key (PKCS12 has a single password). */
  readonly password: Redacted.Redacted<string>;
  readonly certSha256: string;
}

const SECRETS = Config.all({
  keystore: Config.Redacted("KEYSTORE_BASE64"),
  password: Config.Redacted("KEYSTORE_PASSWORD"),
  alias: Config.withDefault(Config.String("KEY_ALIAS"), "morphe-automated"),
});

const decodeBase64 = (text: string) => new Uint8Array(Buffer.from(text.trim(), "base64"));

/**
 * Run `use` with your signing key available as a file. The keystore is decoded from the
 * `KEYSTORE_BASE64` secret into a private (0600) temp directory, preferring RAM-backed `/dev/shm`,
 * checked against the certificate fingerprint committed in `config/signing.toml`, and always deleted
 * when `use` finishes, however it finishes.
 */
export const withSigningKey = <A, E, R>(
  expectedCertSha256: string,
  use: (key: SigningKey) => Effect.Effect<A, E, R>,
) =>
  Effect.scoped(
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const secrets = yield* SECRETS.pipe(
        Effect.mapError(
          () =>
            new KeystoreError({
              message:
                "signing secrets are missing: set KEYSTORE_BASE64, KEYSTORE_PASSWORD and optionally KEY_ALIAS",
            }),
        ),
      );

      const inMemory = yield* fs.exists("/dev/shm").pipe(Effect.orElseSucceed(() => false));
      const directory = yield* fs
        .makeTempDirectoryScoped({
          prefix: "morphe-automated-key-",
          ...(inMemory ? { directory: "/dev/shm" } : {}),
        })
        .pipe(Effect.mapError((error) => new KeystoreError({ message: error.message })));

      const file = path.join(directory, "release.p12");
      yield* fs
        .writeFile(file, decodeBase64(Redacted.value(secrets.keystore)), { mode: 0o600 })
        .pipe(Effect.mapError((error) => new KeystoreError({ message: error.message })));

      const certSha256 = yield* keystoreCertSha256(file, secrets.alias, secrets.password);
      if (certSha256 !== expectedCertSha256.toLowerCase()) {
        return yield* new KeystoreError({
          message: `the keystore secret has certificate ${certSha256}, but config/signing.toml expects ${expectedCertSha256}`,
        });
      }

      return yield* use({
        path: file,
        alias: secrets.alias,
        password: secrets.password,
        certSha256,
      });
    }),
  );
