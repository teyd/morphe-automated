import { Config, Console, Effect, FileSystem, Option, Result } from "effect";
import { Command, Flag } from "effect/cli";
import { loadConfig } from "../config/load.ts";
import { planApp, type AppPlan } from "../pipeline/plan.ts";
import { annotate, configDirectory, repository } from "./common.ts";

interface BuildItem {
  readonly slug: string;
  readonly name: string;
  readonly reason: string;
}

interface ErrorItem {
  readonly slug: string;
  readonly message: string;
}

const describe = (plan: AppPlan) =>
  `${plan.app.slug}: ${plan.decision.build ? "BUILD" : "ok   "} ${plan.inputs.appVersion} + ${plan.bundles
    .map((b) => `${b.source} ${b.tag}`)
    .join(", ")} (${plan.decision.reason})`;

export const check = Command.make(
  "check",
  {
    config: configDirectory,
    app: Flag.String("app").pipe(
      Flag.withDescription("Only check this app (default: every enabled app)"),
      Flag.optional,
    ),
    force: Flag.Boolean("force").pipe(
      Flag.withDescription("Report every app as needing a build"),
      Flag.withDefault(false),
    ),
    githubOutput: Flag.Boolean("github-output").pipe(
      Flag.withDescription("Write `matrix` and `errors` to $GITHUB_OUTPUT for the workflow"),
      Flag.withDefault(false),
    ),
  },
  Effect.fn("check")(function* ({ config, app, force, githubOutput }) {
    const loaded = yield* loadConfig(config);
    const repo = yield* repository;
    const wanted = Option.getOrUndefined(app);

    const apps = loaded.apps.filter(
      (candidate) =>
        candidate.config.enabled && (wanted === undefined || candidate.slug === wanted),
    );

    if (wanted !== undefined && apps.length === 0) {
      return yield* Effect.fail(new Error(`no enabled app named "${wanted}"`));
    }

    const now = Date.now();

    const toBuild: BuildItem[] = [];
    const failed: ErrorItem[] = [];

    for (const candidate of apps) {
      const result = yield* Effect.result(planApp(candidate, loaded, { now, repo, force }));

      if (Result.isFailure(result)) {
        const message =
          result.failure instanceof Error ? result.failure.message : String(result.failure);

        failed.push({ slug: candidate.slug, message });
        yield* annotate("error", candidate.slug, message);
        continue;
      }

      yield* Console.log(describe(result.success));

      if (result.success.decision.build) {
        toBuild.push({
          slug: candidate.slug,
          name: candidate.config.name,
          reason: result.success.decision.reason,
        });
      }
    }

    yield* Console.log(
      `\n${toBuild.length} to build, ${apps.length - toBuild.length - failed.length} up to date, ${failed.length} failed`,
    );

    if (githubOutput) {
      const path = yield* Config.String("GITHUB_OUTPUT");
      const fs = yield* FileSystem.FileSystem;
      yield* fs.writeFileString(
        path,
        `matrix=${JSON.stringify({ include: toBuild })}\nerrors=${failed.length}\n`,
        { flag: "a" },
      );
    }
  }),
).pipe(Command.withDescription("Decide which apps need a new build (needs no secrets)"));
