import { Console, Effect } from "effect";
import { Argument, Command, Flag } from "effect/cli";
import { takedownApp } from "../release/takedown.ts";
import { configDirectory, thisRepo } from "./common.ts";

export const takedown = Command.make(
  "takedown",
  {
    config: configDirectory,
    app: Argument.String("app").pipe(Argument.withDescription("App slug, e.g. x")),
    repo: Flag.String("repo").pipe(
      Flag.withDescription("owner/name of this repository (default: $GITHUB_REPOSITORY)"),
      Flag.optional,
    ),
  },
  Effect.fn("takedown")(function* ({ config, app, repo }) {
    const slug = yield* thisRepo(repo);

    if (slug === undefined) {
      return yield* Effect.fail(
        new Error("pass --repo owner/name; no GITHUB_REPOSITORY or origin remote"),
      );
    }

    const result = yield* takedownApp(slug, app, config);
    yield* Console.log(
      `Deleted ${result.deleted.length} release(s) of ${app}${result.deleted.map((tag) => `\n  - ${tag}`).join("")}`,
    );
    yield* Console.log(
      `\nDisabled ${app} in ${result.configFile}. Commit and push it so the daily run does not rebuild it.`,
    );
  }),
).pipe(
  Command.withDescription("Delete all releases of an app and disable it (for a copyright notice)"),
);
