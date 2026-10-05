import { randomBytes } from "node:crypto";
import { Console, Effect, FileSystem, Path, Redacted } from "effect";
import { KeystoreError } from "../domain/errors.ts";
import { generateKeystore, keystoreCertSha256 } from "./keytool.ts";

export interface InitOptions {
  readonly out: string;
  readonly alias: string;
  readonly commonName: string;
  readonly configDirectory: string;
  /** GitHub environment the secrets will live in. */
  readonly environment: string;
}

const fail = (message: string) => new KeystoreError({ message });

export const initKeystore = Effect.fn("keystore.init")(function* (options: InitOptions) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const passwordFile = `${options.out}.password`;
  const signingFile = path.join(options.configDirectory, "signing.toml");

  const taken = yield* Effect.forEach([options.out, passwordFile, signingFile], (file) =>
    fs.exists(file).pipe(Effect.map((exists) => (exists ? [file] : []))),
  ).pipe(
    Effect.map((found) => found.flat()),
    Effect.mapError((e) => fail(e.message)),
  );

  if (taken.length > 0) {
    return yield* fail(
      `refusing to overwrite ${taken.join(", ")}. Replacing your key invalidates every app you have installed.`,
    );
  }

  const password = Redacted.make(randomBytes(24).toString("base64url"));
  yield* generateKeystore({
    path: options.out,
    alias: options.alias,
    password,
    distinguishedName: `CN=${options.commonName}`,
  });
  const certSha256 = yield* keystoreCertSha256(options.out, options.alias, password);

  yield* fs
    .writeFileString(passwordFile, `${Redacted.value(password)}\n`, { mode: 0o600 })
    .pipe(Effect.mapError((e) => fail(e.message)));
  yield* fs
    .writeFileString(signingFile, `cert_sha256 = "${certSha256}"\n`)
    .pipe(Effect.mapError((e) => fail(e.message)));

  const env = options.environment;
  yield* Console.log(`
Created ${options.out} (certificate SHA-256 ${certSha256})
Wrote   ${signingFile}  <- commit this file, it only contains the public fingerprint

Next, store the key as GitHub secrets (Settings -> Environments -> New environment "${env}" first):

  base64 -w0 ${options.out} | gh secret set KEYSTORE_BASE64 --env ${env}
  gh secret set KEYSTORE_PASSWORD --env ${env} < ${passwordFile}
  gh secret set KEY_ALIAS --env ${env} --body ${options.alias}

Then BACK UP ${options.out} and ${passwordFile} somewhere offline (password manager, encrypted drive)
and delete the local copies. If you lose them you can never update installed apps: every user would
have to uninstall and reinstall. Never commit them.
`);
});
