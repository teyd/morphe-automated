import { Effect, FileSystem, Path } from "effect";
import { VerificationError } from "../domain/errors.ts";
import { Shell } from "./Shell.ts";

const fail = (message: string) => new VerificationError({ kind: "signature", message });

/**
 * Verify `file` against its detached ASCII-armored `signature` using only the given public key.
 * A private temporary keyring is used, so nothing about the machine's own keys can influence the result.
 */
export const gpgVerify = Effect.fn("gpgVerify")(function* (
  file: string,
  signature: string,
  publicKey: string,
) {
  const shell = yield* Shell;
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;

  yield* Effect.scoped(
    Effect.gen(function* () {
      const home = yield* fs.makeTempDirectoryScoped({ prefix: "morphe-automated-gpg-" });
      const env = { GNUPGHOME: home };
      yield* fs.chmod(home, 0o700);
      yield* shell.run("gpg", ["--batch", "--import", publicKey], { env });

      const result = yield* shell.run(
        "gpg",
        ["--batch", "--status-fd", "1", "--verify", signature, file],
        { env },
      );

      if (!/^\[GNUPG:\] VALIDSIG /m.test(result.stdout)) {
        return yield* fail(`${path.basename(file)}: no valid signature from the configured key`);
      }
    }),
  ).pipe(
    Effect.mapError((error) =>
      error instanceof VerificationError
        ? error
        : fail(`${path.basename(file)}: signature check failed: ${error.message}`),
    ),
  );
});
