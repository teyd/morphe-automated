import { Console, Effect } from "effect";
import { Argument, Command, Flag } from "effect/cli";
import { loadConfig } from "../config/load.ts";
import { buildApp } from "../pipeline/build.ts";
import { planApp } from "../pipeline/plan.ts";
import { configDirectory, repository } from "./common.ts";

export const build = Command.make(
  "build",
  {
    config: configDirectory,
    app: Argument.String("app").pipe(Argument.withDescription("App slug, e.g. youtube")),
    publish: Flag.Boolean("publish").pipe(
      Flag.withDescription("Create the GitHub release (needs gh and GITHUB_REPOSITORY)"),
      Flag.withDefault(false),
    ),
    workDir: Flag.String("work-dir").pipe(
      Flag.withDefault(".work"),
      Flag.withDescription("Scratch directory for downloads and output"),
    ),
  },
  Effect.fn("build")(function* ({ config, app, publish, workDir }) {
    const loaded = yield* loadConfig(config);
    const found = loaded.apps.find((candidate) => candidate.slug === app);

    if (found === undefined) {
      return yield* Effect.fail(
        new Error(`unknown app "${app}". Known: ${loaded.apps.map((a) => a.slug).join(", ")}`),
      );
    }

    if (!found.config.enabled) {
      return yield* Effect.fail(new Error(`${app} is disabled in config/apps/${app}.toml`));
    }

    const repo = yield* repository;
    const plan = yield* planApp(found, loaded, { now: Date.now(), repo, force: true });

    const output = yield* buildApp(plan, {
      config: loaded,
      configRoot: config,
      workRoot: workDir,
      publish,
      repo,
    });

    yield* Console.log(`\nBuilt ${output}`);
  }),
).pipe(
  Command.withDescription("Build one app (always builds; `check` decides which apps need it)"),
);
