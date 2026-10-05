import { Effect, FileSystem, Redacted } from "effect";
import type { AppConfig } from "../config/schema.ts";
import { PatchError } from "../domain/errors.ts";
import type { SigningKey } from "../signing/keystore.ts";
import { Shell } from "../services/Shell.ts";

export interface PatchJob {
  readonly cliJar: string;
  /** `.mpp` files, in application order. */
  readonly bundles: ReadonlyArray<string>;
  /** `.apk`, or an `.apkm`/`.xapk` bundle the CLI will merge. */
  readonly input: string;
  readonly output: string;
  readonly scratch: string;
  readonly arch: string;
  readonly patches: AppConfig["patches"];
  readonly key: SigningKey;
}

/**
 * Arguments for `morphe-desktop patch`. Name-based selections (`-e`, `-d`, `-O`) bind to the `-p`
 * bundle they follow, so the app's selections go after the first bundle.
 */
export const patchArgs = (job: PatchJob): string[] => {
  const [first, ...rest] = job.bundles;

  if (first === undefined) throw new PatchError({ message: "no patch bundles to apply" });

  const password = Redacted.value(job.key.password);

  return [
    "-jar",
    job.cliJar,
    "patch",
    "-p",
    first,
    ...(job.patches.exclusive ? ["--exclusive"] : []),
    ...job.patches.enable.flatMap((name) => ["-e", name]),
    ...job.patches.disable.flatMap((name) => ["-d", name]),
    ...Object.entries(job.patches.options).map(([key, value]) => `-O${key}=${String(value)}`),
    ...rest.flatMap((bundle) => ["-p", bundle]),
    "--keystore",
    job.key.path,
    "--keystore-password",
    password,
    "--keystore-entry-alias",
    job.key.alias,
    "--keystore-entry-password",
    password,
    "--striplibs",
    job.arch,
    "-t",
    job.scratch,
    "-o",
    job.output,
    job.input,
  ];
};

/** Patch and sign the app. Fails if the CLI fails or produces no output. */
export const runPatch = Effect.fn("morphe.patch")(function* (job: PatchJob) {
  const shell = yield* Shell;
  const fs = yield* FileSystem.FileSystem;

  yield* Effect.try({
    try: () => patchArgs(job),
    catch: (cause) =>
      cause instanceof PatchError ? cause : new PatchError({ message: String(cause) }),
  }).pipe(
    Effect.flatMap((args) => shell.run("java", args, { echo: true })),
    Effect.mapError((error) => new PatchError({ message: error.message })),
  );

  const exists = yield* fs.exists(job.output).pipe(Effect.orElseSucceed(() => false));

  if (!exists)
    return yield* new PatchError({ message: `the CLI finished but wrote no ${job.output}` });
});
