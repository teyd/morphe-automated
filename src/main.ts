import { BunRuntime } from "@effect/platform-bun";
import { Console, Effect } from "effect";
import { Command } from "effect/cli";
import { build } from "./cli/build.ts";
import { check } from "./cli/check.ts";
import { runtimeLayer } from "./cli/common.ts";
import { keystore } from "./cli/keystore.ts";
import { obtainium } from "./cli/obtainium.ts";
import { takedown } from "./cli/takedown.ts";

const root = Command.make("apk-forge").pipe(
  Command.withDescription("Build Morphe-patched Android apps and publish them for Obtainium"),
  Command.withSubcommands([check, build, obtainium, takedown, keystore]),
);

const describeError = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

root.pipe(
  Command.run({ version: "0.1.0" }),
  Effect.provide(runtimeLayer),
  Effect.tapError((error) => Console.error(`error: ${describeError(error)}`)),
  BunRuntime.runMain({ disableErrorReporting: true }),
);
