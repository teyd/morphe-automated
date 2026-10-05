import { Console, Context, Effect, Layer, Schema, Stream } from "effect";
import { ChildProcess, ChildProcessSpawner } from "effect/process";

export class ShellError extends Schema.TaggedError<ShellError>()("ShellError", {
  command: Schema.String,
  message: Schema.String,
  exitCode: Schema.optional(Schema.Int),
}) {}

export interface RunOptions {
  /** Extra environment variables, merged over the current environment. */
  readonly env?: Readonly<Record<string, string>>;
  /** Print each output line as it arrives (still captured). */
  readonly echo?: boolean;
  readonly cwd?: string;
}

export interface RunResult {
  readonly stdout: string;
  readonly stderr: string;
}

export interface ShellClient {
  /** Run a command to completion. Fails with the captured stderr on a non-zero exit code. */
  readonly run: (
    command: string,
    args: ReadonlyArray<string>,
    options?: RunOptions,
  ) => Effect.Effect<RunResult, ShellError>;
}

export class Shell extends Context.Service<Shell, ShellClient>()("morphe-automated/Shell") {
  static readonly layer = Layer.effect(
    Shell,
    Effect.gen(function* () {
      const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;

      const run = Effect.fn("Shell.run")(function* (
        command: string,
        args: ReadonlyArray<string>,
        options: RunOptions = {},
      ) {
        const label = [command, ...args.slice(0, 2)].join(" ");
        const failed = (cause: { readonly message: string }) =>
          new ShellError({ command: label, message: cause.message });

        const lines = (stream: Stream.Stream<Uint8Array, { readonly message: string }>) =>
          stream.pipe(
            Stream.decodeText(),
            Stream.splitLines,
            Stream.tap((line) => (options.echo ? Console.log(line) : Effect.void)),
            Stream.runCollect,
            Effect.map((collected) => collected.join("\n")),
          );

        return yield* Effect.scoped(
          Effect.gen(function* () {
            const handle = yield* spawner.spawn(
              ChildProcess.make(command, [...args], {
                extendEnv: true,
                ...(options.env === undefined ? {} : { env: { ...options.env } }),
                ...(options.cwd === undefined ? {} : { cwd: options.cwd }),
              }),
            );
            const [stdout, stderr, exitCode] = yield* Effect.all(
              [lines(handle.stdout), lines(handle.stderr), handle.exitCode],
              { concurrency: "unbounded" },
            );
            if (exitCode !== 0) {
              return yield* new ShellError({
                command: label,
                exitCode,
                message: `exited with code ${exitCode}: ${(stderr || stdout).split("\n").slice(-8).join("\n")}`,
              });
            }
            return { stdout, stderr } satisfies RunResult;
          }),
        ).pipe(Effect.mapError((error) => (error instanceof ShellError ? error : failed(error))));
      });

      return Shell.of({ run });
    }),
  );
}
